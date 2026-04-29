import { EntityManager } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { UserRole } from "../../constants/roles";
import { AppError } from "../../errors/app-error";
import { InvoicePayment } from "../invoices/invoice-payment.entity";
import { Invoice } from "../invoices/invoice.entity";
import { GamingBooking } from "../gaming/gaming-booking.entity";
import { PendingPaymentHistory, type PendingSourceType } from "./pending-payment-history.entity";

type PendingCustomerFilters = {
  search?: string;
  scope?: PendingScope;
  page: number;
  limit: number;
};

type CustomerDetailsFilter = {
  phone?: string;
  name?: string;
  scope?: PendingScope;
};

type CollectPendingInput = {
  sourceType: PendingSourceType;
  sourceId: string;
  paymentMode: "cash" | "card" | "upi" | "mixed";
  amount?: number;
  referenceNo?: string;
  cardReferenceNo?: string;
  upiReferenceNo?: string;
  paymentBreakdown?: {
    cash?: number;
    card?: number;
    upi?: number;
  };
  note?: string;
};

type PendingScope = "all" | "dip_and_dash" | "snooker";

type PendingContextUser = {
  userId: string;
  role: UserRole;
  clientType: "desktop" | "web" | "unknown";
};

type PendingDocumentRow = {
  sourceType: PendingSourceType;
  sourceId: string;
  sourceNumber: string;
  customerName: string;
  customerPhone: string;
  status: string;
  paymentStatus: string;
  paymentMode: string | null;
  totalAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  documentDate: Date;
  updatedAt: Date;
};

type PendingSummaryRow = {
  customerKey: string;
  customerName: string;
  customerPhone: string;
  totalPendingAmount: number;
  pendingDocuments: number;
  pendingInvoices: number;
  pendingGamingBookings: number;
  lastUpdatedAt: Date;
};

const toMoney = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number(Number.isFinite(parsed) ? parsed.toFixed(2) : 0);
};

const normalizePhone = (value?: string | null) => (value ?? "").replace(/[^\d+]/g, "").trim();

const cleanOptionalText = (value?: string | null) => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const buildCustomerKey = (input: { customerName: string; customerPhone: string }) => {
  const normalizedPhone = normalizePhone(input.customerPhone);
  if (normalizedPhone.length) {
    return `phone:${normalizedPhone}`;
  }
  return `name:${input.customerName.trim().toLowerCase()}`;
};

const toDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return new Date(0);
  }
  return value instanceof Date ? value : new Date(value);
};

type RawInvoicePendingRow = {
  sourceId: string;
  sourceNumber: string;
  customerName: string;
  customerPhone: string;
  status: string;
  paymentMode: string;
  totalAmount: string;
  collectedAmount: string;
  documentDate: Date;
  updatedAt: Date;
};

type RawGamingPendingRow = {
  sourceId: string;
  sourceNumber: string;
  customerName: string;
  customerPhone: string;
  status: string;
  paymentStatus: string;
  paymentMode: string | null;
  totalAmount: string;
  collectedAmount: string;
  documentDate: Date;
  updatedAt: Date;
};

type RawAmountRow = { amount: string };
type PendingCollectionMode = "cash" | "card" | "upi";
type PendingCollectionStep = {
  mode: PendingCollectionMode;
  amount: number;
  referenceNo: string | null;
};

export class PendingService {
  private readonly invoiceRepository = AppDataSource.getRepository(Invoice);
  private readonly invoicePaymentRepository = AppDataSource.getRepository(InvoicePayment);
  private readonly gamingBookingRepository = AppDataSource.getRepository(GamingBooking);
  private readonly pendingHistoryRepository = AppDataSource.getRepository(PendingPaymentHistory);

  private resolveScopeByRole(
    role: UserRole,
    requestedScope?: PendingScope,
    clientType: PendingContextUser["clientType"] = "unknown"
  ): PendingScope {
    if (role === UserRole.SNOOKER_STAFF) {
      return "snooker";
    }
    if (role === UserRole.STAFF) {
      return "dip_and_dash";
    }
    // Desktop POS must always stay outlet-scoped:
    // - snooker_staff -> snooker (handled above)
    // - all other desktop roles -> dip_and_dash
    if (clientType === "desktop") {
      return "dip_and_dash";
    }
    return requestedScope ?? "all";
  }

  private isSnookerInvoice(invoice?: Pick<Invoice, "orderType" | "invoiceNumber" | "orderReference" | "tableLabel"> & {
    staff?: { role?: UserRole | null } | null;
  }) {
    if (!invoice) {
      return false;
    }

    const invoiceNumber = (invoice.invoiceNumber ?? "").toUpperCase();
    const orderReference = (invoice.orderReference ?? "").toLowerCase();
    const tableLabel = (invoice.tableLabel ?? "").toLowerCase();

    return (
      invoice.orderType === "snooker" ||
      invoice.staff?.role === UserRole.SNOOKER_STAFF ||
      invoiceNumber.startsWith("SNK-") ||
      invoiceNumber.startsWith("INV-LEGACY-SNK-") ||
      orderReference.startsWith("legacy_snk_") ||
      tableLabel.includes("snooker")
    );
  }

  private assertScopeCanAccessSource(scope: PendingScope, sourceType: PendingSourceType, invoice?: Invoice) {
    if (scope === "all") {
      return;
    }
    if (scope === "dip_and_dash") {
      if (sourceType === "gaming_booking") {
        throw new AppError(403, "Gaming pending records are not available in Dip & Dash staff view.");
      }
      if (this.isSnookerInvoice(invoice)) {
        throw new AppError(403, "Snooker pending invoices are not available in Dip & Dash staff view.");
      }
      return;
    }
    // scope === "snooker"
    if (sourceType === "invoice" && invoice && !this.isSnookerInvoice(invoice)) {
      throw new AppError(403, "Dip & Dash pending invoices are not available in Snooker staff view.");
    }
  }

  private async fetchInvoicePendingRows(search: string | undefined, scope: PendingScope): Promise<PendingDocumentRow[]> {
    const snookerScopeCondition = `(
      invoice."orderType" = :snookerOrderType
      OR staff.role = :snookerStaffRole
      OR invoice."invoiceNumber" ILIKE :snookerInvoicePrefix
      OR invoice."invoiceNumber" ILIKE :snookerLegacyInvoicePrefix
      OR COALESCE(invoice."orderReference", '') ILIKE :snookerOrderReferencePrefix
      OR COALESCE(invoice."tableLabel", '') ILIKE :snookerTableLabelHint
    )`;

    const query = this.invoiceRepository
      .createQueryBuilder("invoice")
      .leftJoin("invoice.customer", "customer")
      .leftJoin("invoice.staff", "staff")
      .leftJoin(
        InvoicePayment,
        "payment",
        "payment.\"invoiceId\" = invoice.id AND payment.status = 'success'"
      )
      .where("invoice.status = :status", { status: "pending" })
      .andWhere(
        `(
          invoice."kitchenStatus" = :collectionReadyKitchenStatus
          OR invoice."paymentMode" = :pendingInvoicePaymentMode
          OR EXISTS (
            SELECT 1
            FROM invoice_payments payment_exists
            WHERE payment_exists."invoiceId" = invoice.id
              AND payment_exists.status = 'success'
              AND payment_exists.amount > 0
          )
        )`
      )
      .setParameters({
        collectionReadyKitchenStatus: "served",
        pendingInvoicePaymentMode: "pending",
        snookerOrderType: "snooker",
        snookerStaffRole: UserRole.SNOOKER_STAFF,
        snookerInvoicePrefix: "SNK-%",
        snookerLegacyInvoicePrefix: "INV-LEGACY-SNK-%",
        snookerOrderReferencePrefix: "legacy_snk_%",
        snookerTableLabelHint: "%snooker%"
      });

    if (scope === "dip_and_dash") {
      query.andWhere(`NOT ${snookerScopeCondition}`);
    } else if (scope === "snooker") {
      query.andWhere(snookerScopeCondition);
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query.andWhere(
        `(
          invoice."invoiceNumber" ILIKE :term
          OR COALESCE(NULLIF(customer.name, ''), NULLIF(invoice."customerSnapshot"->>'name', '')) ILIKE :term
          OR COALESCE(NULLIF(customer.phone, ''), NULLIF(invoice."customerSnapshot"->>'phone', '')) ILIKE :term
        )`,
        { term }
      );
    }

    query
      .select("invoice.id", "sourceId")
      .addSelect("invoice.\"invoiceNumber\"", "sourceNumber")
      .addSelect(
        `COALESCE(NULLIF(customer.name, ''), NULLIF(invoice."customerSnapshot"->>'name', ''), 'Walk-in')`,
        "customerName"
      )
      .addSelect(
        `COALESCE(NULLIF(customer.phone, ''), NULLIF(invoice."customerSnapshot"->>'phone', ''), '')`,
        "customerPhone"
      )
      .addSelect("invoice.status", "status")
      .addSelect("invoice.\"paymentMode\"", "paymentMode")
      .addSelect("invoice.\"totalAmount\"", "totalAmount")
      .addSelect("COALESCE(SUM(payment.amount), 0)", "collectedAmount")
      .addSelect("invoice.\"createdAt\"", "documentDate")
      .addSelect("invoice.\"updatedAt\"", "updatedAt")
      .groupBy("invoice.id")
      .addGroupBy("customer.id")
      .orderBy("invoice.\"updatedAt\"", "DESC");

    const rows = await query.getRawMany<RawInvoicePendingRow>();
    return rows
      .map((row) => {
        const totalAmount = toMoney(row.totalAmount);
        const collectedAmount = toMoney(row.collectedAmount);
        const pendingAmount = toMoney(Math.max(totalAmount - collectedAmount, 0));
        return {
          sourceType: "invoice" as const,
          sourceId: row.sourceId,
          sourceNumber: row.sourceNumber,
          customerName: row.customerName || "Walk-in",
          customerPhone: row.customerPhone || "",
          status: row.status,
          paymentStatus: row.status,
          paymentMode: row.paymentMode ?? null,
          totalAmount,
          collectedAmount,
          pendingAmount,
          documentDate: toDate(row.documentDate),
          updatedAt: toDate(row.updatedAt)
        } satisfies PendingDocumentRow;
      })
      .filter((row) => row.pendingAmount > 0.001);
  }

  private async fetchGamingPendingRows(search: string | undefined, scope: PendingScope): Promise<PendingDocumentRow[]> {
    if (scope === "dip_and_dash") {
      return [];
    }

    const query = this.gamingBookingRepository
      .createQueryBuilder("booking")
      .leftJoin(
        PendingPaymentHistory,
        "history",
        `history."sourceType" = 'gaming_booking' AND history."sourceId" = booking.id`
      )
      .where("booking.\"paymentStatus\" = :paymentStatus", { paymentStatus: "pending" })
      .andWhere("booking.status != :cancelledStatus", { cancelledStatus: "cancelled" });

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query.andWhere(
        `(
          booking."bookingNumber" ILIKE :term
          OR booking."primaryCustomerName" ILIKE :term
          OR booking."primaryCustomerPhone" ILIKE :term
          OR booking."resourceLabel" ILIKE :term
        )`,
        { term }
      );
    }

    query
      .select("booking.id", "sourceId")
      .addSelect("booking.\"bookingNumber\"", "sourceNumber")
      .addSelect(`COALESCE(NULLIF(booking."primaryCustomerName", ''), 'Walk-in')`, "customerName")
      .addSelect(`COALESCE(NULLIF(booking."primaryCustomerPhone", ''), '')`, "customerPhone")
      .addSelect("booking.status", "status")
      .addSelect("booking.\"paymentStatus\"", "paymentStatus")
      .addSelect("booking.\"paymentMode\"", "paymentMode")
      .addSelect(
        `CASE
            WHEN booking.status = 'completed' AND booking."finalAmount" > 0 THEN booking."finalAmount"
            WHEN booking.status = 'completed' THEN booking."systemCalculatedAmount"
            ELSE booking."systemCalculatedAmount"
         END`,
        "totalAmount"
      )
      .addSelect("COALESCE(SUM(history.amount), 0)", "collectedAmount")
      .addSelect("booking.\"checkInAt\"", "documentDate")
      .addSelect("booking.\"updatedAt\"", "updatedAt")
      .groupBy("booking.id")
      .orderBy("booking.\"updatedAt\"", "DESC");

    const rows = await query.getRawMany<RawGamingPendingRow>();
    return rows
      .map((row) => {
        const totalAmount = toMoney(row.totalAmount);
        const collectedAmount = toMoney(row.collectedAmount);
        const pendingAmount = toMoney(Math.max(totalAmount - collectedAmount, 0));
        return {
          sourceType: "gaming_booking" as const,
          sourceId: row.sourceId,
          sourceNumber: row.sourceNumber,
          customerName: row.customerName || "Walk-in",
          customerPhone: row.customerPhone || "",
          status: row.status,
          paymentStatus: row.paymentStatus,
          paymentMode: row.paymentMode,
          totalAmount,
          collectedAmount,
          pendingAmount,
          documentDate: toDate(row.documentDate),
          updatedAt: toDate(row.updatedAt)
        } satisfies PendingDocumentRow;
      })
      .filter((row) => row.pendingAmount > 0.001);
  }

  private async fetchPendingDocuments(search: string | undefined, scope: PendingScope) {
    const [invoiceRows, gamingRows] = await Promise.all([
      this.fetchInvoicePendingRows(search, scope),
      this.fetchGamingPendingRows(search, scope)
    ]);

    return [...invoiceRows, ...gamingRows].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
    );
  }

  private buildSummaryRows(rows: PendingDocumentRow[]) {
    const map = new Map<string, PendingSummaryRow>();

    rows.forEach((row) => {
      const key = buildCustomerKey({
        customerName: row.customerName,
        customerPhone: row.customerPhone
      });
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          customerKey: key,
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          totalPendingAmount: toMoney(row.pendingAmount),
          pendingDocuments: 1,
          pendingInvoices: row.sourceType === "invoice" ? 1 : 0,
          pendingGamingBookings: row.sourceType === "gaming_booking" ? 1 : 0,
          lastUpdatedAt: row.updatedAt
        });
        return;
      }

      existing.totalPendingAmount = toMoney(existing.totalPendingAmount + row.pendingAmount);
      existing.pendingDocuments += 1;
      if (row.sourceType === "invoice") {
        existing.pendingInvoices += 1;
      } else {
        existing.pendingGamingBookings += 1;
      }
      if (row.updatedAt.getTime() > existing.lastUpdatedAt.getTime()) {
        existing.lastUpdatedAt = row.updatedAt;
      }
    });

    return [...map.values()].sort((left, right) => {
      if (right.lastUpdatedAt.getTime() !== left.lastUpdatedAt.getTime()) {
        return right.lastUpdatedAt.getTime() - left.lastUpdatedAt.getTime();
      }
      return right.totalPendingAmount - left.totalPendingAmount;
    });
  }

  private resolveCustomerIdentity(input: CustomerDetailsFilter) {
    const normalizedPhone = normalizePhone(input.phone);
    const normalizedName = input.name?.trim().toLowerCase() ?? "";
    if (!normalizedPhone && !normalizedName) {
      throw new AppError(422, "Either customer phone or name is required.");
    }
    const customerKey = normalizedPhone
      ? `phone:${normalizedPhone}`
      : `name:${normalizedName}`;
    return {
      normalizedPhone,
      normalizedName,
      customerKey
    };
  }

  async listPendingCustomers(filters: PendingCustomerFilters, contextUser: PendingContextUser) {
    const scope = this.resolveScopeByRole(contextUser.role, filters.scope, contextUser.clientType);
    const rows = await this.fetchPendingDocuments(filters.search, scope);
    const summaries = this.buildSummaryRows(rows);
    const total = summaries.length;
    const start = (filters.page - 1) * filters.limit;
    const customers = summaries.slice(start, start + filters.limit);

    return {
      customers: customers.map((row) => ({
        customerKey: row.customerKey,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        totalPendingAmount: row.totalPendingAmount,
        pendingDocuments: row.pendingDocuments,
        pendingInvoices: row.pendingInvoices,
        pendingGamingBookings: row.pendingGamingBookings,
        lastUpdatedAt: row.lastUpdatedAt
      })),
      pagination: getPaginationMeta(filters.page, filters.limit, total),
      totals: {
        pendingCustomers: total,
        pendingDocuments: summaries.reduce((sum, row) => sum + row.pendingDocuments, 0),
        pendingAmount: toMoney(summaries.reduce((sum, row) => sum + row.totalPendingAmount, 0))
      }
    };
  }

  async getCustomerPendingDetails(filter: CustomerDetailsFilter, contextUser: PendingContextUser) {
    const scope = this.resolveScopeByRole(contextUser.role, filter.scope, contextUser.clientType);
    const identity = this.resolveCustomerIdentity(filter);
    const rows = await this.fetchPendingDocuments(undefined, scope);
    const customerRows = rows.filter((row) => {
      const rowKey = buildCustomerKey({
        customerName: row.customerName,
        customerPhone: row.customerPhone
      });
      return rowKey === identity.customerKey;
    });

    const firstRow = customerRows[0];
    const summary = {
      customerName: firstRow?.customerName ?? (filter.name?.trim() || "Walk-in"),
      customerPhone: firstRow?.customerPhone ?? normalizePhone(filter.phone),
      totalPendingAmount: toMoney(customerRows.reduce((sum, row) => sum + row.pendingAmount, 0)),
      pendingDocuments: customerRows.length
    };

    const historyQuery = this.pendingHistoryRepository
      .createQueryBuilder("history")
      .leftJoinAndSelect("history.collectedBy", "collector")
      .orderBy("history.createdAt", "DESC");

    if (identity.normalizedPhone) {
      historyQuery.where("history.customerPhone = :customerPhone", {
        customerPhone: identity.normalizedPhone
      });
    } else {
      historyQuery.where("LOWER(history.customerName) = :customerName", {
        customerName: identity.normalizedName
      });
    }

    const histories = await historyQuery.take(300).getMany();
    const allowedSourceKeys = new Set(customerRows.map((row) => `${row.sourceType}:${row.sourceId}`));
    const scopedHistories = histories.filter((history) =>
      allowedSourceKeys.has(`${history.sourceType}:${history.sourceId}`)
    );

    return {
      summary,
      pendingDocuments: customerRows.map((row) => ({
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        sourceNumber: row.sourceNumber,
        status: row.status,
        paymentStatus: row.paymentStatus,
        paymentMode: row.paymentMode,
        totalAmount: row.totalAmount,
        collectedAmount: row.collectedAmount,
        pendingAmount: row.pendingAmount,
        documentDate: row.documentDate,
        updatedAt: row.updatedAt
      })),
      paymentHistory: scopedHistories.map((history) => ({
        id: history.id,
        sourceType: history.sourceType,
        sourceId: history.sourceId,
        sourceNumber: history.sourceNumber,
        customerName: history.customerName,
        customerPhone: history.customerPhone,
        paymentMode: history.mode,
        referenceNo: history.referenceNo,
        amount: toMoney(history.amount),
        remainingAmount: toMoney(history.remainingAmount),
        note: history.note,
        collectedByUserId: history.collectedByUserId,
        collectedByName: history.collectedBy?.fullName ?? null,
        createdAt: history.createdAt
      }))
    };
  }

  private async resolveInvoicePendingState(invoiceId: string, manager: EntityManager) {
    const invoiceRepository = manager.getRepository(Invoice);
    const paymentRepository = manager.getRepository(InvoicePayment);

    const invoice = await invoiceRepository.findOne({
      where: { id: invoiceId },
      relations: { customer: true, staff: true }
    });
    if (!invoice) {
      throw new AppError(404, "Invoice not found.");
    }

    if (invoice.status === "cancelled" || invoice.status === "refunded") {
      throw new AppError(422, "Cannot collect payment for cancelled/refunded invoice.");
    }

    const paidRow = await paymentRepository
      .createQueryBuilder("payment")
      .select("COALESCE(SUM(payment.amount), 0)", "amount")
      .where("payment.\"invoiceId\" = :invoiceId", { invoiceId })
      .andWhere("payment.status = :status", { status: "success" })
      .getRawOne<RawAmountRow>();

    const totalAmount = toMoney(invoice.totalAmount);
    const collectedAmount = toMoney(paidRow?.amount ?? 0);
    const pendingAmount = toMoney(Math.max(totalAmount - collectedAmount, 0));

    const snapshot = (invoice.customerSnapshot ?? {}) as Record<string, unknown>;
    const snapshotName = typeof snapshot.name === "string" ? snapshot.name.trim() : "";
    const snapshotPhone = typeof snapshot.phone === "string" ? snapshot.phone.trim() : "";

    return {
      invoice,
      totalAmount,
      collectedAmount,
      pendingAmount,
      customerName: invoice.customer?.name?.trim() || snapshotName || "Walk-in",
      customerPhone: normalizePhone(invoice.customer?.phone ?? snapshotPhone)
    };
  }

  private getGamingCollectibleAmount(booking: GamingBooking) {
    const systemAmount = toMoney(booking.systemCalculatedAmount);
    if (booking.status !== "completed") {
      return systemAmount;
    }
    const finalAmount = toMoney(booking.finalAmount);
    return finalAmount > 0 ? finalAmount : systemAmount;
  }

  private async resolveGamingPendingState(bookingId: string, manager: EntityManager) {
    const bookingRepository = manager.getRepository(GamingBooking);
    const historyRepository = manager.getRepository(PendingPaymentHistory);

    const booking = await bookingRepository.findOne({ where: { id: bookingId } });
    if (!booking) {
      throw new AppError(404, "Gaming booking not found.");
    }
    if (booking.status === "cancelled") {
      throw new AppError(422, "Cannot collect payment for cancelled booking.");
    }

    const collectedRow = await historyRepository
      .createQueryBuilder("history")
      .select("COALESCE(SUM(history.amount), 0)", "amount")
      .where("history.\"sourceType\" = :sourceType", { sourceType: "gaming_booking" })
      .andWhere("history.\"sourceId\" = :sourceId", { sourceId: booking.id })
      .getRawOne<RawAmountRow>();

    const totalAmount = this.getGamingCollectibleAmount(booking);
    const collectedAmount = toMoney(collectedRow?.amount ?? 0);
    const pendingAmount = toMoney(Math.max(totalAmount - collectedAmount, 0));

    return {
      booking,
      totalAmount,
      collectedAmount,
      pendingAmount,
      customerName: booking.primaryCustomerName?.trim() || "Walk-in",
      customerPhone: normalizePhone(booking.primaryCustomerPhone ?? "")
    };
  }

  private normalizeCollectionSteps(input: CollectPendingInput, maxAllowedAmount: number): PendingCollectionStep[] {
    const maxAmount = toMoney(maxAllowedAmount);
    if (maxAmount <= 0.001) {
      return [];
    }

    if (input.paymentMode !== "mixed") {
      if ((input.paymentMode === "card" || input.paymentMode === "upi") && !cleanOptionalText(input.referenceNo)) {
        throw new AppError(422, "Reference ID is required for Card and UPI payments.");
      }

      const amount = toMoney(input.amount ?? maxAmount);
      if (amount <= 0) {
        throw new AppError(422, "Amount should be greater than zero.");
      }
      if (amount - maxAmount > 0.001) {
        throw new AppError(422, `Amount cannot exceed pending due (${maxAmount.toFixed(2)}).`);
      }

      return [
        {
          mode: input.paymentMode,
          amount,
          referenceNo: cleanOptionalText(input.referenceNo)
        }
      ];
    }

    const split = input.paymentBreakdown;
    if (!split) {
      throw new AppError(422, "Split amounts are required for mixed payment.");
    }

    const normalizedSplit = {
      cash: toMoney(split.cash ?? 0),
      card: toMoney(split.card ?? 0),
      upi: toMoney(split.upi ?? 0)
    };
    const activeModes = Object.entries(normalizedSplit)
      .filter((entry) => entry[1] > 0.001)
      .map((entry) => entry[0] as PendingCollectionMode);

    if (activeModes.length < 2) {
      throw new AppError(422, "Mixed payment should include at least two payment methods.");
    }

    const splitTotal = toMoney(normalizedSplit.cash + normalizedSplit.card + normalizedSplit.upi);
    const amount = toMoney(input.amount ?? splitTotal);
    if (amount <= 0) {
      throw new AppError(422, "Amount should be greater than zero.");
    }
    if (Math.abs(splitTotal - amount) > 0.01) {
      throw new AppError(422, "Amount should match the mixed split total.");
    }
    if (amount - maxAmount > 0.001) {
      throw new AppError(422, `Amount cannot exceed pending due (${maxAmount.toFixed(2)}).`);
    }

    if (normalizedSplit.card > 0.001 && !cleanOptionalText(input.cardReferenceNo)) {
      throw new AppError(422, "Card reference ID is required for mixed payment.");
    }
    if (normalizedSplit.upi > 0.001 && !cleanOptionalText(input.upiReferenceNo)) {
      throw new AppError(422, "UPI reference ID is required for mixed payment.");
    }

    return activeModes.map((mode) => ({
      mode,
      amount: normalizedSplit[mode],
      referenceNo:
        mode === "card"
          ? cleanOptionalText(input.cardReferenceNo)
          : mode === "upi"
            ? cleanOptionalText(input.upiReferenceNo)
            : null
    }));
  }

  private async resolveInvoicePaymentMode(manager: EntityManager, invoiceId: string) {
    const rows = await manager
      .getRepository(InvoicePayment)
      .createQueryBuilder("payment")
      .select("payment.mode", "mode")
      .where("payment.\"invoiceId\" = :invoiceId", { invoiceId })
      .andWhere("payment.status = :status", { status: "success" })
      .andWhere("payment.amount > 0")
      .groupBy("payment.mode")
      .getRawMany<{ mode: string }>();

    const activeModes = rows
      .map((row) => row.mode)
      .filter((mode): mode is "cash" | "card" | "upi" => mode === "cash" || mode === "card" || mode === "upi");

    if (!activeModes.length) {
      return null;
    }
    if (activeModes.length === 1) {
      return activeModes[0];
    }
    return "mixed";
  }

  async collectPendingAmount(input: CollectPendingInput, contextUser: PendingContextUser) {
    return AppDataSource.transaction(async (manager) => {
      const scope = this.resolveScopeByRole(contextUser.role, undefined, contextUser.clientType);

      if (input.sourceType === "invoice") {
        const state = await this.resolveInvoicePendingState(input.sourceId, manager);
        this.assertScopeCanAccessSource(scope, "invoice", state.invoice);
        if (state.pendingAmount <= 0.001) {
          return {
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            sourceNumber: state.invoice.invoiceNumber,
            customerName: state.customerName,
            customerPhone: state.customerPhone,
            totalAmount: state.totalAmount,
            collectedAmount: 0,
            remainingAmount: 0,
            settled: true
          };
        }

        const steps = this.normalizeCollectionSteps(input, state.pendingAmount);
        const collectedAmount = toMoney(steps.reduce((sum, step) => sum + step.amount, 0));
        const remainingAmount = toMoney(Math.max(state.pendingAmount - collectedAmount, 0));
        const normalizedNote = cleanOptionalText(input.note);

        for (const step of steps) {
          await manager.save(
            InvoicePayment,
            manager.create(InvoicePayment, {
              invoiceId: state.invoice.id,
              mode: step.mode,
              status: "success",
              amount: step.amount,
              receivedAmount: step.amount,
              changeAmount: 0,
              referenceNo: step.referenceNo,
              paidAt: new Date()
            })
          );
        }

        let runningRemaining = state.pendingAmount;
        for (const step of steps) {
          runningRemaining = toMoney(Math.max(runningRemaining - step.amount, 0));
          await manager.save(
            PendingPaymentHistory,
            manager.create(PendingPaymentHistory, {
              sourceType: "invoice",
              sourceId: state.invoice.id,
              sourceNumber: state.invoice.invoiceNumber,
              customerName: state.customerName,
              customerPhone: state.customerPhone,
              mode: step.mode,
              amount: step.amount,
              remainingAmount: runningRemaining,
              referenceNo: step.referenceNo,
              note: normalizedNote,
              collectedByUserId: contextUser.userId
            })
          );
        }

        const derivedInvoicePaymentMode = await this.resolveInvoicePaymentMode(manager, state.invoice.id);
        state.invoice.paymentMode = derivedInvoicePaymentMode ?? state.invoice.paymentMode;
        if (remainingAmount <= 0.001) {
          state.invoice.status = "paid";
        } else if (state.invoice.status !== "paid") {
          state.invoice.status = "pending";
        }
        await manager.save(Invoice, state.invoice);

        return {
          sourceType: "invoice" as const,
          sourceId: state.invoice.id,
          sourceNumber: state.invoice.invoiceNumber,
          customerName: state.customerName,
          customerPhone: state.customerPhone,
          totalAmount: state.totalAmount,
          collectedAmount,
          remainingAmount,
          settled: remainingAmount <= 0.001,
          paymentBreakdown: {
            cash: toMoney(steps.filter((step) => step.mode === "cash").reduce((sum, step) => sum + step.amount, 0)),
            card: toMoney(steps.filter((step) => step.mode === "card").reduce((sum, step) => sum + step.amount, 0)),
            upi: toMoney(steps.filter((step) => step.mode === "upi").reduce((sum, step) => sum + step.amount, 0))
          }
        };
      }

      const state = await this.resolveGamingPendingState(input.sourceId, manager);
      this.assertScopeCanAccessSource(scope, "gaming_booking");
      if (state.pendingAmount <= 0.001) {
        return {
          sourceType: "gaming_booking" as const,
          sourceId: state.booking.id,
          sourceNumber: state.booking.bookingNumber,
          customerName: state.customerName,
          customerPhone: state.customerPhone,
          totalAmount: state.totalAmount,
          collectedAmount: 0,
          remainingAmount: 0,
          settled: true
        };
      }

      const steps = this.normalizeCollectionSteps(input, state.pendingAmount);
      const collectedAmount = toMoney(steps.reduce((sum, step) => sum + step.amount, 0));
      const remainingAmount = toMoney(Math.max(state.pendingAmount - collectedAmount, 0));
      const normalizedNote = cleanOptionalText(input.note);

      let runningRemaining = state.pendingAmount;
      for (const step of steps) {
        runningRemaining = toMoney(Math.max(runningRemaining - step.amount, 0));
        await manager.save(
          PendingPaymentHistory,
          manager.create(PendingPaymentHistory, {
            sourceType: "gaming_booking",
            sourceId: state.booking.id,
            sourceNumber: state.booking.bookingNumber,
            customerName: state.customerName,
            customerPhone: state.customerPhone,
            mode: step.mode,
            amount: step.amount,
            remainingAmount: runningRemaining,
            referenceNo: step.referenceNo,
            note: normalizedNote,
            collectedByUserId: contextUser.userId
          })
        );
      }

      state.booking.paidCashAmount = toMoney(
        toMoney(state.booking.paidCashAmount) +
          steps.filter((step) => step.mode === "cash").reduce((sum, step) => sum + step.amount, 0)
      );
      state.booking.paidCardAmount = toMoney(
        toMoney(state.booking.paidCardAmount) +
          steps.filter((step) => step.mode === "card").reduce((sum, step) => sum + step.amount, 0)
      );
      state.booking.paidUpiAmount = toMoney(
        toMoney(state.booking.paidUpiAmount) +
          steps.filter((step) => step.mode === "upi").reduce((sum, step) => sum + step.amount, 0)
      );

      const activeModes = [
        state.booking.paidCashAmount > 0.001 ? "cash" : null,
        state.booking.paidCardAmount > 0.001 ? "card" : null,
        state.booking.paidUpiAmount > 0.001 ? "upi" : null
      ].filter((mode): mode is "cash" | "card" | "upi" => Boolean(mode));
      const derivedPaymentMode = activeModes.length <= 1 ? (activeModes[0] ?? null) : "mixed";

      state.booking.paymentMode = derivedPaymentMode;
      if (remainingAmount <= 0.001) {
        state.booking.paymentStatus = "paid";
      }
      await manager.save(GamingBooking, state.booking);

      return {
        sourceType: "gaming_booking" as const,
        sourceId: state.booking.id,
        sourceNumber: state.booking.bookingNumber,
        customerName: state.customerName,
        customerPhone: state.customerPhone,
        totalAmount: state.totalAmount,
        collectedAmount,
        remainingAmount,
        settled: remainingAmount <= 0.001,
        paymentBreakdown: {
          cash: toMoney(steps.filter((step) => step.mode === "cash").reduce((sum, step) => sum + step.amount, 0)),
          card: toMoney(steps.filter((step) => step.mode === "card").reduce((sum, step) => sum + step.amount, 0)),
          upi: toMoney(steps.filter((step) => step.mode === "upi").reduce((sum, step) => sum + step.amount, 0))
        }
      };
    });
  }
}
