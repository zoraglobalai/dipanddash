import { ordersRepository } from "@/db/repositories/orders.repository";
import {
  invoicesService,
  type DesktopInvoiceDetailsResponse,
  type DesktopInvoiceListRow
} from "@/services/invoices.service";
import type { CartAddOnSelection, CartLine, CustomerRecord, KitchenStatus, PaymentMode, PosOrder, SyncStatus } from "@/types/pos";

const SERVER_PULL_INTERVAL_MS = 8000;
const INVOICE_PAGE_LIMIT = 150;
const REMOTE_STATUSES = "pending,paid,cancelled,refunded";
const UNSYNCED_STATUSES = new Set<SyncStatus>(["pending", "syncing", "failed", "needs_attention"]);
const VALID_PAYMENT_MODES = new Set<PaymentMode>(["cash", "card", "upi", "mixed"]);
const VALID_KITCHEN_STATUSES = new Set<KitchenStatus>(["not_sent", "queued", "preparing", "ready", "served"]);

let lastServerPullAt = 0;
let activePull: Promise<void> | null = null;

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePaymentMode = (value: unknown, fallback: PaymentMode | null = null): PaymentMode | null => {
  if (typeof value === "string" && VALID_PAYMENT_MODES.has(value as PaymentMode)) {
    return value as PaymentMode;
  }
  return fallback;
};

const normalizeKitchenStatus = (value: unknown, fallback: KitchenStatus = "not_sent"): KitchenStatus => {
  if (typeof value === "string" && VALID_KITCHEN_STATUSES.has(value as KitchenStatus)) {
    return value as KitchenStatus;
  }
  return fallback;
};

const normalizeRemoteStatus = (status: DesktopInvoiceListRow["status"] | string | null | undefined): PosOrder["status"] => {
  if (status === "pending" || status === "paid" || status === "cancelled") {
    return status;
  }
  return "cancelled";
};

const normalizeLineType = (value: string): CartLine["lineType"] => {
  if (value === "item" || value === "add_on" || value === "combo" || value === "product") {
    return value;
  }
  return "product";
};

const parseAddOns = (meta: Record<string, unknown> | null | undefined): CartAddOnSelection[] => {
  if (!meta || typeof meta !== "object") {
    return [];
  }
  const raw = (meta as Record<string, unknown>).addOns;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const row = entry as Record<string, unknown>;
      const addOnId = typeof row.addOnId === "string" && row.addOnId.trim().length > 0 ? row.addOnId.trim() : "";
      const name = typeof row.name === "string" && row.name.trim().length > 0 ? row.name.trim() : "";
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

const buildRemoteLocalOrderId = (
  remote: DesktopInvoiceListRow,
  details: DesktopInvoiceDetailsResponse | null,
  existingLocalOrderIds: Set<string>
) => {
  const preferredIds = [
    details?.invoice.orderReference?.trim(),
    remote.orderReference?.trim()
  ].filter((value): value is string => Boolean(value && value.length));

  for (const candidate of preferredIds) {
    if (!existingLocalOrderIds.has(candidate)) {
      return candidate;
    }
  }

  const base = `server-invoice-${remote.id}`;
  if (!existingLocalOrderIds.has(base)) {
    return base;
  }
  let suffix = 1;
  while (existingLocalOrderIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
};

const buildCustomerSnapshot = (
  remote: DesktopInvoiceListRow,
  details: DesktopInvoiceDetailsResponse | null,
  existingCustomer: PosOrder["customer"] | null,
  createdAt: string,
  updatedAt: string
): CustomerRecord | null => {
  const detailsCustomer = details?.invoice.customer;
  const name = detailsCustomer?.name?.trim() || remote.customerName?.trim() || existingCustomer?.name || "";
  const phone = detailsCustomer?.phone?.trim() || remote.customerPhone?.trim() || existingCustomer?.phone || "";
  if (!name && !phone) {
    return null;
  }

  const customerSnapshot = details?.invoice.customerSnapshot;
  let snapshotServerId: string | null = null;
  if (customerSnapshot && typeof customerSnapshot === "object") {
    const rawServerId = (customerSnapshot as Record<string, unknown>).id;
    if (typeof rawServerId === "string" && rawServerId.trim().length > 0) {
      snapshotServerId = rawServerId.trim();
    }
  }

  return {
    localId: existingCustomer?.localId ?? `remote-customer-${remote.id}`,
    serverId: snapshotServerId ?? existingCustomer?.serverId ?? null,
    name: name || "Walk-in",
    phone: phone || "-",
    email: existingCustomer?.email ?? null,
    notes: existingCustomer?.notes ?? null,
    syncStatus: "synced",
    createdAt: existingCustomer?.createdAt ?? createdAt,
    updatedAt
  };
};

const buildOrderFromSummary = (
  remote: DesktopInvoiceListRow,
  existing: PosOrder | null,
  localOrderId: string
): PosOrder => {
  const createdAt = remote.sourceCreatedAt ?? remote.createdAt ?? existing?.createdAt ?? new Date().toISOString();
  const updatedAt = remote.updatedAt ?? existing?.updatedAt ?? createdAt;
  const remoteDiscountAmount = toNumber(remote.discountAmount);
  const existingDiscountTotal =
    toNumber(existing?.totals.itemDiscountAmount) +
    toNumber(existing?.totals.couponDiscountAmount) +
    toNumber(existing?.totals.manualDiscountAmount);
  const shouldRebalanceDiscount = !existing || Math.abs(existingDiscountTotal - remoteDiscountAmount) > 0.01;

  return {
    localOrderId,
    serverInvoiceId: remote.id,
    invoiceNumber: remote.invoiceNumber,
    orderType: remote.orderType,
    orderChannel: existing?.orderChannel ?? null,
    tableLabel: remote.tableLabel,
    kitchenStatus: normalizeKitchenStatus(remote.kitchenStatus, existing?.kitchenStatus ?? "not_sent"),
    status: normalizeRemoteStatus(remote.status),
    paymentMode: normalizePaymentMode(remote.paymentMode, existing?.paymentMode ?? null),
    customer: existing?.customer
      ? {
          ...existing.customer,
          name: remote.customerName?.trim() || existing.customer.name,
          phone: remote.customerPhone?.trim() || existing.customer.phone,
          updatedAt
        }
      : (remote.customerName?.trim() || remote.customerPhone?.trim()
          ? {
              localId: `remote-customer-${remote.id}`,
              serverId: null,
              name: remote.customerName?.trim() || "Walk-in",
              phone: remote.customerPhone?.trim() || "-",
              email: null,
              notes: null,
              syncStatus: "synced",
              createdAt,
              updatedAt
            }
          : null),
    lines: existing?.lines ?? [],
    appliedOffer: existing?.appliedOffer ?? null,
    manualDiscountAmount: existing?.manualDiscountAmount ?? 0,
    notes: existing?.notes ?? null,
    totals: {
      subtotal: toNumber(remote.subtotal, existing?.totals.subtotal ?? 0),
      itemDiscountAmount: shouldRebalanceDiscount
        ? remoteDiscountAmount
        : toNumber(existing?.totals.itemDiscountAmount, remoteDiscountAmount),
      couponDiscountAmount: shouldRebalanceDiscount
        ? 0
        : toNumber(existing?.totals.couponDiscountAmount),
      manualDiscountAmount: shouldRebalanceDiscount
        ? 0
        : toNumber(existing?.totals.manualDiscountAmount),
      taxAmount: toNumber(remote.taxAmount, existing?.totals.taxAmount ?? 0),
      totalAmount: toNumber(remote.totalAmount, existing?.totals.totalAmount ?? 0)
    },
    createdAt,
    updatedAt,
    syncStatus: "synced"
  };
};

const buildOrderFromDetails = (
  remote: DesktopInvoiceListRow,
  details: DesktopInvoiceDetailsResponse,
  existing: PosOrder | null,
  localOrderId: string
): PosOrder => {
  const invoice = details.invoice;
  const createdAt =
    invoice.sourceCreatedAt ??
    invoice.createdAt ??
    remote.sourceCreatedAt ??
    remote.createdAt ??
    existing?.createdAt ??
    new Date().toISOString();
  const updatedAt = invoice.updatedAt ?? remote.updatedAt ?? existing?.updatedAt ?? createdAt;
  const lines: CartLine[] = (details.lines ?? []).map((line, index) => ({
    lineId: line.id || `${localOrderId}-line-${index + 1}`,
    lineType: normalizeLineType(line.lineType),
    refId: line.referenceId ?? line.id ?? `line-${index + 1}`,
    name: line.nameSnapshot,
    quantity: Math.max(1, toNumber(line.quantity, 1)),
    unitPrice: toNumber(line.unitPrice),
    gstPercentage: toNumber(line.gstPercentage),
    addOns: parseAddOns(line.meta ?? null),
    notes: null
  }));

  const linesSnapshot = invoice.linesSnapshot;
  const rawAppliedOffer =
    linesSnapshot && typeof linesSnapshot === "object"
      ? (linesSnapshot as Record<string, unknown>).appliedOffer
      : null;
  const appliedOffer =
    rawAppliedOffer && typeof rawAppliedOffer === "object"
      ? (rawAppliedOffer as PosOrder["appliedOffer"])
      : null;

  return {
    localOrderId,
    serverInvoiceId: remote.id,
    invoiceNumber: invoice.invoiceNumber || remote.invoiceNumber,
    orderType: invoice.orderType,
    orderChannel: existing?.orderChannel ?? null,
    tableLabel: invoice.tableLabel ?? remote.tableLabel,
    kitchenStatus: normalizeKitchenStatus(invoice.kitchenStatus, normalizeKitchenStatus(remote.kitchenStatus, "not_sent")),
    status: normalizeRemoteStatus(invoice.status),
    paymentMode: normalizePaymentMode(invoice.paymentMode, normalizePaymentMode(remote.paymentMode, null)),
    customer: buildCustomerSnapshot(remote, details, existing?.customer ?? null, createdAt, updatedAt),
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
    createdAt,
    updatedAt,
    syncStatus: "synced"
  };
};

const hasMeaningfulOrderDiff = (current: PosOrder, next: PosOrder) => {
  if (current.serverInvoiceId !== next.serverInvoiceId) return true;
  if (current.invoiceNumber !== next.invoiceNumber) return true;
  if (current.status !== next.status) return true;
  if (current.orderType !== next.orderType) return true;
  if (current.orderChannel !== next.orderChannel) return true;
  if (current.tableLabel !== next.tableLabel) return true;
  if (current.kitchenStatus !== next.kitchenStatus) return true;
  if (current.paymentMode !== next.paymentMode) return true;
  if (current.syncStatus !== next.syncStatus) return true;
  if (current.updatedAt !== next.updatedAt) return true;
  if (current.notes !== next.notes) return true;
  if (current.totals.subtotal !== next.totals.subtotal) return true;
  if (current.totals.taxAmount !== next.totals.taxAmount) return true;
  if (current.totals.totalAmount !== next.totals.totalAmount) return true;
  if (current.totals.itemDiscountAmount !== next.totals.itemDiscountAmount) return true;
  if (current.totals.couponDiscountAmount !== next.totals.couponDiscountAmount) return true;
  if (current.totals.manualDiscountAmount !== next.totals.manualDiscountAmount) return true;
  if ((current.customer?.name ?? null) !== (next.customer?.name ?? null)) return true;
  if ((current.customer?.phone ?? null) !== (next.customer?.phone ?? null)) return true;
  if (current.lines.length !== next.lines.length) return true;
  return false;
};

const fetchRemoteInvoices = async () => {
  const remoteByInvoiceNumber = new Map<string, DesktopInvoiceListRow>();
  let page = 1;

  while (true) {
    const response = await invoicesService.list({
      statuses: REMOTE_STATUSES,
      page,
      limit: INVOICE_PAGE_LIMIT
    });
    const payload = response.data;
    const invoices = payload.invoices ?? [];
    for (const row of invoices) {
      if (typeof row.invoiceNumber === "string" && row.invoiceNumber.trim().length > 0) {
        remoteByInvoiceNumber.set(row.invoiceNumber.trim(), row);
      }
    }

    const totalPages = Math.max(payload.pagination?.totalPages ?? page, 1);
    if (page >= totalPages) {
      break;
    }
    page += 1;
  }

  return remoteByInvoiceNumber;
};

const runPull = async () => {
  const localRows = await ordersRepository.listForSync(5000);
  const localByInvoiceNumber = new Map(
    localRows
      .filter((row) => typeof row.invoiceNumber === "string" && row.invoiceNumber.trim().length > 0)
      .map((row) => [row.invoiceNumber.trim(), row])
  );
  const existingLocalOrderIds = new Set(localRows.map((row) => row.localOrderId));
  const remoteByInvoiceNumber = await fetchRemoteInvoices();
  const staleSyncedOrderIds: string[] = [];
  const detailsCache = new Map<string, DesktopInvoiceDetailsResponse>();

  for (const row of localRows) {
    if (UNSYNCED_STATUSES.has(row.syncStatus) || row.status === "draft") {
      continue;
    }
    if (!remoteByInvoiceNumber.has(row.invoiceNumber.trim())) {
      staleSyncedOrderIds.push(row.localOrderId);
    }
  }

  if (staleSyncedOrderIds.length) {
    await ordersRepository.removeByIds(staleSyncedOrderIds);
    for (const localOrderId of staleSyncedOrderIds) {
      existingLocalOrderIds.delete(localOrderId);
    }
  }

  for (const remote of remoteByInvoiceNumber.values()) {
    const invoiceNumber = remote.invoiceNumber.trim();
    if (!invoiceNumber) {
      continue;
    }

    const localRow = localByInvoiceNumber.get(invoiceNumber);
    if (localRow && (UNSYNCED_STATUSES.has(localRow.syncStatus) || localRow.status === "draft")) {
      continue;
    }

    const needsUpdate =
      !localRow ||
      localRow.serverInvoiceId !== remote.id ||
      localRow.updatedAt !== remote.updatedAt ||
      localRow.syncStatus !== "synced";

    if (!needsUpdate) {
      continue;
    }

    const existing = localRow ? await ordersRepository.getById(localRow.localOrderId) : null;
    let details: DesktopInvoiceDetailsResponse | null = null;

    try {
      if (!detailsCache.has(remote.id)) {
        const detailsResponse = await invoicesService.getById(remote.id);
        detailsCache.set(remote.id, detailsResponse.data);
      }
      details = detailsCache.get(remote.id) ?? null;
    } catch {
      details = null;
    }

    const localOrderId =
      existing?.localOrderId ??
      buildRemoteLocalOrderId(remote, details, existingLocalOrderIds);
    existingLocalOrderIds.add(localOrderId);

    const nextOrder = details
      ? buildOrderFromDetails(remote, details, existing, localOrderId)
      : buildOrderFromSummary(remote, existing, localOrderId);

    if (!existing || hasMeaningfulOrderDiff(existing, nextOrder)) {
      await ordersRepository.save(nextOrder);
    }
  }

  lastServerPullAt = Date.now();
};

export const ordersSyncService = {
  async pullFromServer(force = false) {
    const now = Date.now();
    if (!force && now - lastServerPullAt < SERVER_PULL_INTERVAL_MS) {
      return;
    }
    if (activePull) {
      return activePull;
    }
    activePull = runPull().finally(() => {
      activePull = null;
    });
    return activePull;
  }
};

