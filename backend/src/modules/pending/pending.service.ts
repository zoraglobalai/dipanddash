import { EntityManager } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { InvoicePayment } from "../invoices/invoice-payment.entity";
import { Invoice } from "../invoices/invoice.entity";
import { GamingBooking } from "../gaming/gaming-booking.entity";
import { PendingPaymentHistory, type PendingSourceType } from "./pending-payment-history.entity";

type PendingCustomerFilters = {
  search?: string;
  page: number;
  limit: number;
};

type CustomerDetailsFilter = {
  phone?: string;
  name?: string;
};

type CollectPendingInput = {
  sourceType: PendingSourceType;
  sourceId: string;
  paymentMode: "cash" | "card" | "upi";
  amount?: number;
  referenceNo?: string;
  note?: string;
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

export class PendingService {
  private readonly invoiceRepository = AppDataSource.getRepository(Invoice);
  private readonly invoicePaymentRepository = AppDataSource.getRepository(InvoicePayment);
  private readonly gamingBookingRepository = AppDataSource.getRepository(GamingBooking);
  private readonly pendingHistoryRepository = AppDataSource.getRepository(PendingPaymentHistory);

  private async fetchInvoicePendingRows(search?: string): Promise<PendingDocumentRow[]> {
    const query = this.invoiceRepository
      .createQueryBuilder("invoice")
      .leftJoin("invoice.customer", "customer")
      .leftJoin(
        InvoicePayment,
        "payment",
        "payment.\"invoiceId\" = invoice.id AND payment.status = 'success'"
      )
      .where("invoice.status = :status", { status: "pending" })
      .andWhere("invoice.orderType != :snookerType", { snookerType: "snooker" });

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

  private async fetchGamingPendingRows(search?: string): Promise<PendingDocumentRow[]> {
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

  private async fetchPendingDocuments(search?: string) {
    const [invoiceRows, gamingRows] = await Promise.all([
      this.fetchInvoicePendingRows(search),
      this.fetchGamingPendingRows(search)
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

  async listPendingCustomers(filters: PendingCustomerFilters) {
    const rows = await this.fetchPendingDocuments(filters.search);
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

  async getCustomerPendingDetails(filter: CustomerDetailsFilter) {
    const identity = this.resolveCustomerIdentity(filter);
    const rows = await this.fetchPendingDocuments();
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
      paymentHistory: histories.map((history) => ({
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
      relations: { customer: true }
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

  async collectPendingAmount(input: CollectPendingInput, contextUserId: string) {
    if ((input.paymentMode === "card" || input.paymentMode === "upi") && !cleanOptionalText(input.referenceNo)) {
      throw new AppError(422, "Reference ID is required for Card and UPI payments.");
    }

    return AppDataSource.transaction(async (manager) => {
      if (input.sourceType === "invoice") {
        const state = await this.resolveInvoicePendingState(input.sourceId, manager);
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

        const amount = toMoney(input.amount ?? state.pendingAmount);
        if (amount <= 0) {
          throw new AppError(422, "Amount should be greater than zero.");
        }
        if (amount - state.pendingAmount > 0.001) {
          throw new AppError(422, `Amount cannot exceed pending due (${state.pendingAmount.toFixed(2)}).`);
        }

        const remainingAmount = toMoney(Math.max(state.pendingAmount - amount, 0));
        await manager.save(
          InvoicePayment,
          manager.create(InvoicePayment, {
            invoiceId: state.invoice.id,
            mode: input.paymentMode,
            status: "success",
            amount,
            receivedAmount: amount,
            changeAmount: 0,
            referenceNo: cleanOptionalText(input.referenceNo),
            paidAt: new Date()
          })
        );

        if (remainingAmount <= 0.001 && state.invoice.status !== "paid") {
          state.invoice.status = "paid";
          state.invoice.paymentMode = input.paymentMode;
          await manager.save(Invoice, state.invoice);
        }

        await manager.save(
          PendingPaymentHistory,
          manager.create(PendingPaymentHistory, {
            sourceType: "invoice",
            sourceId: state.invoice.id,
            sourceNumber: state.invoice.invoiceNumber,
            customerName: state.customerName,
            customerPhone: state.customerPhone,
            mode: input.paymentMode,
            amount,
            remainingAmount,
            referenceNo: cleanOptionalText(input.referenceNo),
            note: cleanOptionalText(input.note),
            collectedByUserId: contextUserId
          })
        );

        return {
          sourceType: "invoice" as const,
          sourceId: state.invoice.id,
          sourceNumber: state.invoice.invoiceNumber,
          customerName: state.customerName,
          customerPhone: state.customerPhone,
          totalAmount: state.totalAmount,
          collectedAmount: amount,
          remainingAmount,
          settled: remainingAmount <= 0.001
        };
      }

      const state = await this.resolveGamingPendingState(input.sourceId, manager);
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

      const amount = toMoney(input.amount ?? state.pendingAmount);
      if (amount <= 0) {
        throw new AppError(422, "Amount should be greater than zero.");
      }
      if (amount - state.pendingAmount > 0.001) {
        throw new AppError(422, `Amount cannot exceed pending due (${state.pendingAmount.toFixed(2)}).`);
      }

      const remainingAmount = toMoney(Math.max(state.pendingAmount - amount, 0));
      await manager.save(
        PendingPaymentHistory,
        manager.create(PendingPaymentHistory, {
          sourceType: "gaming_booking",
          sourceId: state.booking.id,
          sourceNumber: state.booking.bookingNumber,
          customerName: state.customerName,
          customerPhone: state.customerPhone,
          mode: input.paymentMode,
          amount,
          remainingAmount,
          referenceNo: cleanOptionalText(input.referenceNo),
          note: cleanOptionalText(input.note),
          collectedByUserId: contextUserId
        })
      );

      if (remainingAmount <= 0.001) {
        state.booking.paymentStatus = "paid";
        state.booking.paymentMode = input.paymentMode;
        await manager.save(GamingBooking, state.booking);
      }

      return {
        sourceType: "gaming_booking" as const,
        sourceId: state.booking.id,
        sourceNumber: state.booking.bookingNumber,
        customerName: state.customerName,
        customerPhone: state.customerPhone,
        totalAmount: state.totalAmount,
        collectedAmount: amount,
        remainingAmount,
        settled: remainingAmount <= 0.001
      };
    });
  }
}
