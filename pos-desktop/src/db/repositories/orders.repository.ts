import {
  invoicesService,
  type DesktopInvoiceDetailsResponse,
  type DesktopInvoiceListRow
} from "@/services/invoices.service";
import type {
  CartAddOnSelection,
  CartLine,
  CustomerRecord,
  PendingBillSummary,
  PosOrder,
  RecentBillSummary
} from "@/types/pos";

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const INVOICE_API_MAX_LIMIT = 200;

type InvoiceListParams = Parameters<typeof invoicesService.list>[0];

const listInvoiceRows = async (params: Omit<InvoiceListParams, "page" | "limit">, requestedLimit: number) => {
  const target = Math.max(1, Math.floor(requestedLimit));
  const rows: DesktopInvoiceListRow[] = [];
  let page = 1;

  while (rows.length < target) {
    const remaining = target - rows.length;
    const response = await invoicesService.list({
      ...params,
      page,
      limit: Math.min(INVOICE_API_MAX_LIMIT, remaining)
    });
    const nextRows = response.data.invoices ?? [];
    rows.push(...nextRows);

    const pagination = response.data.pagination;
    if (!nextRows.length || page >= Math.max(1, pagination?.totalPages ?? page)) {
      break;
    }
    page += 1;
  }

  return rows.slice(0, target);
};

const parseAddOns = (meta: Record<string, unknown> | null | undefined): CartAddOnSelection[] => {
  if (!meta || typeof meta !== "object" || !Array.isArray(meta.addOns)) {
    return [];
  }

  return meta.addOns
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const row = entry as Record<string, unknown>;
      const addOnId = typeof row.addOnId === "string" ? row.addOnId.trim() : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!addOnId || !name) {
        return null;
      }
      return {
        addOnId,
        name,
        unitPrice: toNumber(row.unitPrice),
        gstPercentage: toNumber(row.gstPercentage),
        quantity: Math.max(1, Math.floor(toNumber(row.quantity, 1)))
      } satisfies CartAddOnSelection;
    })
    .filter((entry): entry is CartAddOnSelection => Boolean(entry));
};

const buildCustomer = (
  row: DesktopInvoiceListRow,
  details: DesktopInvoiceDetailsResponse | null
): CustomerRecord | null => {
  const name = details?.invoice.customer?.name?.trim() || row.customerName?.trim() || "";
  const phone = details?.invoice.customer?.phone?.trim() || row.customerPhone?.trim() || "";
  if (!name && !phone) {
    return null;
  }
  const now = row.updatedAt ?? row.createdAt ?? new Date().toISOString();
  return {
    localId: `server-customer-${row.id}`,
    serverId: null,
    name: name || "Walk-in",
    phone: phone || "-",
    email: null,
    notes: null,
    createdAt: row.createdAt ?? now,
    updatedAt: now,
    syncStatus: "synced"
  };
};

const mapDetailsToOrder = (row: DesktopInvoiceListRow, details: DesktopInvoiceDetailsResponse): PosOrder => {
  const invoice = details.invoice;
  const localOrderId = invoice.orderReference?.trim() || row.orderReference?.trim() || `server-invoice-${row.id}`;
  const lines: CartLine[] = details.lines.map((line, index) => ({
    lineId: line.id || `${localOrderId}-line-${index + 1}`,
    lineType:
      line.lineType === "item" || line.lineType === "add_on" || line.lineType === "combo" || line.lineType === "product"
        ? line.lineType
        : "product",
    refId: line.referenceId ?? line.id ?? `line-${index + 1}`,
    name: line.nameSnapshot,
    quantity: Math.max(1, toNumber(line.quantity, 1)),
    unitPrice: toNumber(line.unitPrice),
    gstPercentage: toNumber(line.gstPercentage),
    addOns: parseAddOns(line.meta ?? null),
    notes: null
  }));
  const linesSnapshot = invoice.linesSnapshot;
  const appliedOffer =
    linesSnapshot && typeof linesSnapshot === "object" && "appliedOffer" in linesSnapshot
      ? (linesSnapshot as Record<string, unknown>).appliedOffer as PosOrder["appliedOffer"]
      : null;

  return {
    localOrderId,
    serverInvoiceId: row.id,
    invoiceNumber: invoice.invoiceNumber || row.invoiceNumber,
    orderType: invoice.orderType,
    orderChannel:
      invoice.orderType === "takeaway"
        ? "take-away"
        : invoice.orderType === "dine_in"
          ? "dine-in"
          : invoice.orderType === "snooker"
            ? "snooker"
            : null,
    tableLabel: invoice.tableLabel ?? row.tableLabel,
    kitchenStatus: invoice.kitchenStatus ?? row.kitchenStatus ?? "not_sent",
    status: invoice.status === "refunded" ? "cancelled" : invoice.status,
    paymentMode: invoice.paymentMode ?? row.paymentMode ?? null,
    customer: buildCustomer(row, details),
    lines,
    appliedOffer,
    manualDiscountAmount: toNumber(invoice.manualDiscountAmount),
    notes: invoice.notes ?? null,
    totals: {
      subtotal: toNumber(invoice.subtotal),
      itemDiscountAmount: toNumber(invoice.itemDiscountAmount),
      couponDiscountAmount: toNumber(invoice.couponDiscountAmount),
      manualDiscountAmount: toNumber(invoice.manualDiscountAmount),
      taxAmount: toNumber(invoice.taxAmount),
      totalAmount: toNumber(invoice.totalAmount)
    },
    createdAt: invoice.sourceCreatedAt ?? invoice.createdAt ?? row.sourceCreatedAt ?? row.createdAt,
    updatedAt: invoice.updatedAt ?? row.updatedAt,
    syncStatus: "synced"
  };
};

const findInvoiceRow = async (referenceOrInvoiceNumber: string) => {
  const token = referenceOrInvoiceNumber.trim();
  if (!token) {
    return null;
  }
  const response = await invoicesService.list({
    search: token,
    statuses: "pending,paid,cancelled,refunded",
    page: 1,
    limit: 20
  });
  return (
    response.data.invoices.find(
      (row) => row.id === token || row.orderReference === token || row.invoiceNumber === token
    ) ?? null
  );
};

const getOrderFromRow = async (row: DesktopInvoiceListRow) => {
  const detailsResponse = await invoicesService.getById(row.id);
  return mapDetailsToOrder(row, detailsResponse.data);
};

const toPendingBill = (row: DesktopInvoiceListRow): PendingBillSummary => ({
  localOrderId: row.orderReference?.trim() || `server-invoice-${row.id}`,
  invoiceNumber: row.invoiceNumber,
  customerName: row.customerName?.trim() || "Walk-in",
  customerPhone: row.customerPhone?.trim() || "-",
  orderType: row.orderType,
  orderChannel:
    row.orderType === "takeaway"
      ? "take-away"
      : row.orderType === "dine_in"
        ? "dine-in"
        : row.orderType === "snooker"
          ? "snooker"
          : null,
  tableLabel: row.tableLabel,
  kitchenStatus: row.kitchenStatus,
  totalAmount: row.totalAmount,
  lineCount: 0,
  updatedAt: row.updatedAt
});

const toRecentBill = (row: DesktopInvoiceListRow): RecentBillSummary => ({
  ...toPendingBill(row),
  status: row.status === "refunded" ? "cancelled" : row.status,
  paymentMode: row.paymentMode,
  totalAmount: row.totalAmount,
  lineCount: 0
});

export const ordersRepository = {
  save: async (_order: PosOrder) => undefined,
  getById: async (localOrderId: string) => {
    const row = await findInvoiceRow(localOrderId);
    return row ? getOrderFromRow(row) : null;
  },
  getByInvoiceNumber: async (invoiceNumber: string) => {
    const row = await findInvoiceRow(invoiceNumber);
    return row ? getOrderFromRow(row) : null;
  },
  listForSync: async (_limit?: number): Promise<PosOrder[]> => [],
  removeByIds: async (_localOrderIds: string[]) => undefined,
  listPendingBills: async () => {
    const rows = await listInvoiceRows({ status: "pending" }, 500);
    return rows.map(toPendingBill);
  },
  listRecentBills: async (limit = 5) => {
    const rows = await listInvoiceRows({ statuses: "pending,paid" }, limit);
    return rows.map(toRecentBill);
  },
  listCompletedBills: async (limit = 500) => {
    const rows = await listInvoiceRows({ status: "paid" }, limit);
    return rows.map(toRecentBill);
  },
  listKitchenOrders: async (limit = 500) => {
    const rows = await listInvoiceRows({ status: "pending" }, limit);
    const kitchenRows = rows.filter((row) => ["queued", "preparing", "ready"].includes(row.kitchenStatus));
    return Promise.all(kitchenRows.map(getOrderFromRow));
  },
  upsertPendingBill: async (_bill: PendingBillSummary) => undefined,
  removePendingBill: async (_localOrderId: string) => undefined
};
