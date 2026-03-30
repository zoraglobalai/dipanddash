import { EntityManager, MoreThan, QueryFailedError } from "typeorm";

import { UserRole } from "../../constants/roles";
import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { Customer } from "../customers/customer.entity";
import { DailyAllocation } from "../ingredients/daily-allocation.entity";
import { Ingredient } from "../ingredients/ingredient.entity";
import { IngredientStock } from "../ingredients/ingredient-stock.entity";
import { User } from "../users/user.entity";
import {
  type KitchenStatus,
  type InvoiceOrderType,
  type InvoiceStatus,
  type PaymentMode,
  type PaymentStatus
} from "./invoices.constants";
import { InvoiceActivity } from "./invoice-activity.entity";
import { InvoiceLine } from "./invoice-line.entity";
import { InvoicePayment } from "./invoice-payment.entity";
import { InvoiceUsageEvent } from "./invoice-usage-event.entity";
import { Invoice } from "./invoice.entity";

type InvoiceListFilters = {
  search?: string;
  status?: InvoiceStatus;
  kitchenStatus?: KitchenStatus;
  paymentMode?: PaymentMode;
  staffId?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
};

type InvoiceStatsFilters = {
  staffId?: string;
  dateFrom?: string;
  dateTo?: string;
};

type SyncInvoiceLinePayload = {
  lineType: "item" | "add_on" | "combo" | "product" | "custom";
  referenceId?: string | null;
  nameSnapshot: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  gstPercentage?: number;
  lineTotal: number;
  meta?: Record<string, unknown> | null;
};

type SyncInvoicePaymentPayload = {
  mode: PaymentMode;
  status?: PaymentStatus;
  amount: number;
  receivedAmount?: number | null;
  changeAmount?: number | null;
  referenceNo?: string | null;
  paidAt?: string;
};

type SyncUsageEventPayload = {
  idempotencyKey?: string;
  ingredientId?: string | null;
  ingredientNameSnapshot: string;
  consumedQuantity: number;
  baseUnit: string;
  allocatedQuantity?: number;
  overusedQuantity?: number;
  usageDate: string;
  deviceId?: string | null;
  meta?: Record<string, unknown> | null;
};

type SyncInvoicePayload = {
  idempotencyKey: string;
  invoiceNumber: string;
  orderReference?: string | null;
  customerId?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
  branchId?: string | null;
  deviceId?: string | null;
  orderType: InvoiceOrderType;
  tableLabel?: string | null;
  kitchenStatus?: KitchenStatus;
  status: InvoiceStatus;
  paymentMode: PaymentMode;
  subtotal: number;
  itemDiscountAmount?: number;
  couponDiscountAmount?: number;
  manualDiscountAmount?: number;
  taxAmount?: number;
  totalAmount: number;
  couponCode?: string | null;
  notes?: string | null;
  customerSnapshot?: Record<string, unknown> | null;
  totalsSnapshot?: Record<string, unknown> | null;
  linesSnapshot?: Record<string, unknown> | null;
  sourceCreatedAt?: string;
  lines: SyncInvoiceLinePayload[];
  payments: SyncInvoicePaymentPayload[];
  usageEvents: SyncUsageEventPayload[];
};

type ContextUser = {
  id: string;
  role: UserRole;
};

const toMoney = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number(Number.isFinite(parsed) ? parsed.toFixed(2) : 0);
};

const cleanOptionalText = (value?: string | null) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizePhone = (value: string) => value.replace(/[^\d+]/g, "").trim();
const toQty = (value: number) => Number(value.toFixed(3));

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const isAdminLikeRole = (role: UserRole) =>
  role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.ACCOUNTANT;

export class InvoicesService {
  private readonly invoiceRepository = AppDataSource.getRepository(Invoice);
  private readonly invoiceLineRepository = AppDataSource.getRepository(InvoiceLine);
  private readonly invoicePaymentRepository = AppDataSource.getRepository(InvoicePayment);
  private readonly invoiceActivityRepository = AppDataSource.getRepository(InvoiceActivity);
  private readonly invoiceUsageEventRepository = AppDataSource.getRepository(InvoiceUsageEvent);
  private readonly customerRepository = AppDataSource.getRepository(Customer);
  private readonly userRepository = AppDataSource.getRepository(User);
  private readonly ingredientRepository = AppDataSource.getRepository(Ingredient);

  private async resolveInvoiceOrFail(id: string) {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: { customer: true, staff: true }
    });
    if (!invoice) {
      throw new AppError(404, "Invoice not found");
    }
    return invoice;
  }

  private assertInvoiceAccess(invoice: Invoice, contextUser: ContextUser) {
    if (isAdminLikeRole(contextUser.role)) {
      return;
    }
    if (invoice.staffId !== contextUser.id) {
      throw new AppError(403, "You are not allowed to view this invoice");
    }
  }

  private async resolveCustomerForSync(payload: SyncInvoicePayload, createdByUserId: string) {
    if (payload.customerId) {
      const byId = await this.customerRepository.findOne({ where: { id: payload.customerId } });
      if (byId) {
        return byId;
      }
    }

    const phone = cleanOptionalText(payload.customerPhone);
    if (!phone) {
      return null;
    }

    const normalizedPhone = normalizePhone(phone);
    const existing = await this.customerRepository.findOne({ where: { phone: normalizedPhone } });
    if (existing) {
      return existing;
    }

    const created = this.customerRepository.create({
      name: cleanOptionalText(payload.customerName) ?? "Walk-in Customer",
      phone: normalizedPhone,
      sourceDeviceId: cleanOptionalText(payload.deviceId) ?? null,
      createdByUserId,
      isActive: true
    });
    return this.customerRepository.save(created);
  }

  private async applyUsageToStockAndDailyAllocation(
    manager: EntityManager,
    usage: {
      ingredientId: string | null;
      ingredientNameSnapshot?: string;
      baseUnit?: string;
      usageDate: string;
      consumedQuantity: number;
    }
  ) {
    if (!usage.ingredientId) {
      return;
    }

    const consumedQuantity = toQty(Number(usage.consumedQuantity));
    if (!Number.isFinite(consumedQuantity) || consumedQuantity <= 0) {
      return;
    }

    const stock = await manager.findOne(IngredientStock, {
      where: { ingredientId: usage.ingredientId }
    });

    const availableStock = toQty(Number(stock?.totalStock ?? 0));
    if (availableStock + 0.000001 < consumedQuantity) {
      const ingredientLabel = usage.ingredientNameSnapshot?.trim() || "ingredient";
      const unitLabel = usage.baseUnit?.trim() || "unit";
      throw new AppError(
        409,
        `Insufficient stock for ${ingredientLabel}. Available ${availableStock} ${unitLabel}, required ${consumedQuantity} ${unitLabel}.`
      );
    }

    if (stock) {
      stock.totalStock = toQty(availableStock - consumedQuantity);
      stock.lastUpdatedAt = new Date();
      await manager.save(IngredientStock, stock);
    }

    const activeAllocations = await manager.find(DailyAllocation, {
      where: {
        ingredientId: usage.ingredientId,
        remainingQuantity: MoreThan(0)
      },
      order: {
        date: "ASC",
        updatedAt: "ASC"
      }
    });

    let remainingToApply = consumedQuantity;
    for (const allocation of activeAllocations) {
      if (remainingToApply <= 0) {
        break;
      }

      const available = toQty(Number(allocation.remainingQuantity));
      if (available <= 0) {
        continue;
      }

      const usedNow = toQty(Math.min(available, remainingToApply));
      allocation.usedQuantity = toQty(Number(allocation.usedQuantity) + usedNow);
      allocation.remainingQuantity = toQty(Math.max(Number(allocation.remainingQuantity) - usedNow, 0));
      await manager.save(DailyAllocation, allocation);
      remainingToApply = toQty(remainingToApply - usedNow);
    }

    if (remainingToApply <= 0) {
      return;
    }

    const sameDateAllocation = await manager.findOne(DailyAllocation, {
      where: {
        ingredientId: usage.ingredientId,
        date: usage.usageDate
      }
    });

    if (!sameDateAllocation) {
      const created = manager.create(DailyAllocation, {
        ingredientId: usage.ingredientId,
        date: usage.usageDate,
        allocatedQuantity: 0,
        usedQuantity: toQty(remainingToApply),
        remainingQuantity: 0
      });
      await manager.save(DailyAllocation, created);
      return;
    }

    const allocated = toQty(Number(sameDateAllocation.allocatedQuantity));
    const nextUsed = toQty(Number(sameDateAllocation.usedQuantity) + remainingToApply);
    sameDateAllocation.usedQuantity = nextUsed;
    sameDateAllocation.remainingQuantity = toQty(Math.max(allocated - nextUsed, 0));
    await manager.save(DailyAllocation, sameDateAllocation);
  }

  async listInvoices(filters: InvoiceListFilters, contextUser: ContextUser) {
    const query = this.invoiceRepository
      .createQueryBuilder("invoice")
      .leftJoinAndSelect("invoice.customer", "customer")
      .leftJoinAndSelect("invoice.staff", "staff")
      .orderBy("invoice.createdAt", "DESC")
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit);

    if (!isAdminLikeRole(contextUser.role)) {
      query.andWhere("invoice.staffId = :staffId", { staffId: contextUser.id });
    } else if (filters.staffId) {
      query.andWhere("invoice.staffId = :staffId", { staffId: filters.staffId });
    }

    if (filters.search?.trim()) {
      const search = `%${filters.search.trim()}%`;
      query.andWhere(
        "(invoice.invoiceNumber ILIKE :search OR invoice.orderReference ILIKE :search OR customer.name ILIKE :search OR customer.phone ILIKE :search OR staff.fullName ILIKE :search)",
        { search }
      );
    }

    if (filters.status) {
      query.andWhere("invoice.status = :status", { status: filters.status });
    }

    if (filters.kitchenStatus) {
      query.andWhere("invoice.kitchenStatus = :kitchenStatus", { kitchenStatus: filters.kitchenStatus });
    }

    if (filters.paymentMode) {
      query.andWhere("invoice.paymentMode = :paymentMode", { paymentMode: filters.paymentMode });
    }

    if (filters.dateFrom) {
      query.andWhere("invoice.createdAt >= :dateFrom", { dateFrom: new Date(filters.dateFrom) });
    }

    if (filters.dateTo) {
      query.andWhere("invoice.createdAt <= :dateTo", { dateTo: new Date(filters.dateTo) });
    }

    const [invoices, total] = await query.getManyAndCount();

    return {
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderReference: invoice.orderReference,
        customerName: invoice.customer?.name ?? null,
        customerPhone: invoice.customer?.phone ?? null,
        staffName: invoice.staff.fullName,
        staffId: invoice.staffId,
        orderType: invoice.orderType,
        tableLabel: invoice.tableLabel,
        kitchenStatus: invoice.kitchenStatus,
        status: invoice.status,
        paymentMode: invoice.paymentMode,
        subtotal: toMoney(invoice.subtotal),
        discountAmount: toMoney(
          toMoney(invoice.itemDiscountAmount) +
            toMoney(invoice.couponDiscountAmount) +
            toMoney(invoice.manualDiscountAmount)
        ),
        taxAmount: toMoney(invoice.taxAmount),
        totalAmount: toMoney(invoice.totalAmount),
        syncedFromPos: invoice.syncedFromPos,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt
      })),
      pagination: getPaginationMeta(filters.page, filters.limit, total)
    };
  }

  async getInvoiceStats(filters: InvoiceStatsFilters, contextUser: ContextUser) {
    const query = this.invoiceRepository.createQueryBuilder("invoice");

    if (!isAdminLikeRole(contextUser.role)) {
      query.andWhere("invoice.staffId = :staffId", { staffId: contextUser.id });
    } else if (filters.staffId) {
      query.andWhere("invoice.staffId = :staffId", { staffId: filters.staffId });
    }

    if (filters.dateFrom) {
      query.andWhere("invoice.createdAt >= :dateFrom", { dateFrom: new Date(filters.dateFrom) });
    }

    if (filters.dateTo) {
      query.andWhere("invoice.createdAt <= :dateTo", { dateTo: new Date(filters.dateTo) });
    }

    const [total, paid, pending, cancelled, refunded, cash, card, upi, mixed, totals] =
      await Promise.all([
        query.clone().getCount(),
        query.clone().andWhere("invoice.status = :status", { status: "paid" }).getCount(),
        query.clone().andWhere("invoice.status = :status", { status: "pending" }).getCount(),
        query.clone().andWhere("invoice.status = :status", { status: "cancelled" }).getCount(),
        query.clone().andWhere("invoice.status = :status", { status: "refunded" }).getCount(),
        query.clone().andWhere("invoice.paymentMode = :mode", { mode: "cash" }).getCount(),
        query.clone().andWhere("invoice.paymentMode = :mode", { mode: "card" }).getCount(),
        query.clone().andWhere("invoice.paymentMode = :mode", { mode: "upi" }).getCount(),
        query.clone().andWhere("invoice.paymentMode = :mode", { mode: "mixed" }).getCount(),
        query
          .clone()
          .select("COALESCE(SUM(invoice.totalAmount), 0)", "gross")
          .addSelect(
            "COALESCE(SUM(invoice.itemDiscountAmount + invoice.couponDiscountAmount + invoice.manualDiscountAmount), 0)",
            "discounts"
          )
          .addSelect("COALESCE(SUM(invoice.taxAmount), 0)", "taxes")
          .getRawOne<{
            gross: string;
            discounts: string;
            taxes: string;
          }>()
      ]);

    return {
      totalInvoices: total,
      statusBreakdown: {
        paid,
        pending,
        cancelled,
        refunded
      },
      paymentModeBreakdown: {
        cash,
        card,
        upi,
        mixed
      },
      totals: {
        grossAmount: toMoney(totals?.gross ?? 0),
        discountAmount: toMoney(totals?.discounts ?? 0),
        taxAmount: toMoney(totals?.taxes ?? 0)
      }
    };
  }

  async getInvoiceDetails(id: string, contextUser: ContextUser) {
    const invoice = await this.resolveInvoiceOrFail(id);
    this.assertInvoiceAccess(invoice, contextUser);

    const [lines, payments, activities, usageEvents] = await Promise.all([
      this.invoiceLineRepository.find({
        where: { invoiceId: id },
        order: { createdAt: "ASC" }
      }),
      this.invoicePaymentRepository.find({
        where: { invoiceId: id },
        order: { createdAt: "ASC" }
      }),
      this.invoiceActivityRepository.find({
        where: { invoiceId: id },
        order: { createdAt: "DESC" }
      }),
      this.invoiceUsageEventRepository.find({
        where: { invoiceId: id },
        order: { createdAt: "DESC" }
      })
    ]);

    return {
      invoice: {
        ...invoice,
        subtotal: toMoney(invoice.subtotal),
        itemDiscountAmount: toMoney(invoice.itemDiscountAmount),
        couponDiscountAmount: toMoney(invoice.couponDiscountAmount),
        manualDiscountAmount: toMoney(invoice.manualDiscountAmount),
        taxAmount: toMoney(invoice.taxAmount),
        totalAmount: toMoney(invoice.totalAmount)
      },
      lines: lines.map((line) => ({
        ...line,
        quantity: Number(line.quantity),
        unitPrice: toMoney(line.unitPrice),
        discountAmount: toMoney(line.discountAmount),
        gstPercentage: Number(line.gstPercentage),
        lineTotal: toMoney(line.lineTotal)
      })),
      payments: payments.map((payment) => ({
        ...payment,
        amount: toMoney(payment.amount),
        receivedAmount: payment.receivedAmount === null ? null : toMoney(payment.receivedAmount),
        changeAmount: payment.changeAmount === null ? null : toMoney(payment.changeAmount)
      })),
      activities,
      usageEvents: usageEvents.map((event) => ({
        ...event,
        consumedQuantity: Number(event.consumedQuantity),
        allocatedQuantity: Number(event.allocatedQuantity),
        overusedQuantity: Number(event.overusedQuantity)
      }))
    };
  }

  async createInvoiceFromSync(payload: SyncInvoicePayload, contextUser: ContextUser) {
    const existing = await this.invoiceRepository.findOne({
      where: { idempotencyKey: payload.idempotencyKey },
      relations: { customer: true, staff: true }
    });
    if (existing) {
      return {
        created: false,
        invoice: existing
      };
    }

    const existingByInvoiceNumber = await this.invoiceRepository.findOne({
      where: { invoiceNumber: payload.invoiceNumber.trim() },
      relations: { customer: true, staff: true }
    });

    if (existingByInvoiceNumber && existingByInvoiceNumber.status === "paid" && payload.status !== "paid") {
      return {
        created: false,
        invoice: existingByInvoiceNumber
      };
    }

    const staff = await this.userRepository.findOne({
      where: { id: contextUser.id }
    });
    if (!staff) {
      throw new AppError(404, "Staff user not found");
    }

    try {
      const result = await AppDataSource.manager.transaction(async (manager) => {
        const customer = await this.resolveCustomerForSync(payload, contextUser.id);
        const isUpdate = Boolean(existingByInvoiceNumber);
        const invoice =
          existingByInvoiceNumber ??
          manager.create(Invoice, {
            idempotencyKey: payload.idempotencyKey,
            invoiceNumber: payload.invoiceNumber.trim(),
            staffId: contextUser.id
          });

        const wasPaid = invoice.status === "paid";

        invoice.idempotencyKey = payload.idempotencyKey;
        invoice.invoiceNumber = payload.invoiceNumber.trim();
        invoice.orderReference = cleanOptionalText(payload.orderReference) ?? null;
        invoice.customerId = customer?.id ?? null;
        invoice.staffId = contextUser.id;
        invoice.branchId = cleanOptionalText(payload.branchId) ?? null;
        invoice.deviceId = cleanOptionalText(payload.deviceId) ?? null;
        invoice.orderType = payload.orderType;
        invoice.tableLabel = cleanOptionalText(payload.tableLabel) ?? null;
        invoice.kitchenStatus =
          payload.kitchenStatus ?? (payload.status === "paid" ? "served" : "queued");
        invoice.status = payload.status;
        invoice.paymentMode = payload.paymentMode;
        invoice.subtotal = toMoney(payload.subtotal);
        invoice.itemDiscountAmount = toMoney(payload.itemDiscountAmount);
        invoice.couponDiscountAmount = toMoney(payload.couponDiscountAmount);
        invoice.manualDiscountAmount = toMoney(payload.manualDiscountAmount);
        invoice.taxAmount = toMoney(payload.taxAmount);
        invoice.totalAmount = toMoney(payload.totalAmount);
        invoice.couponCode = cleanOptionalText(payload.couponCode) ?? null;
        invoice.notes = cleanOptionalText(payload.notes) ?? null;
        invoice.customerSnapshot = payload.customerSnapshot ?? null;
        invoice.totalsSnapshot = payload.totalsSnapshot ?? null;
        invoice.linesSnapshot = payload.linesSnapshot ?? null;
        invoice.syncedFromPos = true;
        invoice.sourceCreatedAt = payload.sourceCreatedAt ? new Date(payload.sourceCreatedAt) : null;

        const savedInvoice = await manager.save(invoice);

        if (isUpdate) {
          await manager.delete(InvoiceLine, { invoiceId: savedInvoice.id });
          await manager.delete(InvoicePayment, { invoiceId: savedInvoice.id });
        }

        const lines = payload.lines.map((line) =>
          manager.create(InvoiceLine, {
            invoiceId: savedInvoice.id,
            lineType: line.lineType,
            referenceId: cleanOptionalText(line.referenceId ?? undefined) ?? null,
            nameSnapshot: line.nameSnapshot.trim(),
            quantity: Number(line.quantity),
            unitPrice: toMoney(line.unitPrice),
            discountAmount: toMoney(line.discountAmount),
            gstPercentage: Number(line.gstPercentage ?? 0),
            lineTotal: toMoney(line.lineTotal),
            meta: line.meta ?? null
          })
        );
        if (lines.length) {
          await manager.save(InvoiceLine, lines);
        }

        const payments = payload.payments.map((payment) =>
          manager.create(InvoicePayment, {
            invoiceId: savedInvoice.id,
            mode: payment.mode,
            status: payment.status ?? "success",
            amount: toMoney(payment.amount),
            receivedAmount:
              payment.receivedAmount === null || payment.receivedAmount === undefined
                ? null
                : toMoney(payment.receivedAmount),
            changeAmount:
              payment.changeAmount === null || payment.changeAmount === undefined
                ? null
                : toMoney(payment.changeAmount),
            referenceNo: cleanOptionalText(payment.referenceNo ?? undefined) ?? null,
            paidAt: payment.paidAt ? new Date(payment.paidAt) : new Date()
          })
        );
        if (payments.length) {
          await manager.save(InvoicePayment, payments);
        }

        await manager.save(
          InvoiceActivity,
          manager.create(InvoiceActivity, {
            invoiceId: savedInvoice.id,
            actionType: isUpdate ? "updated" : "created",
            reason: isUpdate ? "Updated from POS sync" : "Created from POS sync",
            performedByUserId: contextUser.id,
            payload: {
              sync: true,
              deviceId: payload.deviceId ?? null
            }
          })
        );

        const shouldApplyUsage = payload.status === "paid" && !wasPaid;
        if (shouldApplyUsage && payload.usageEvents.length) {
          const usageRows: InvoiceUsageEvent[] = [];
          for (const event of payload.usageEvents) {
            let ingredientNameSnapshot = event.ingredientNameSnapshot.trim();
            if (event.ingredientId) {
              const ingredient = await manager.findOne(Ingredient, {
                where: { id: event.ingredientId }
              });
              if (ingredient) {
                ingredientNameSnapshot = ingredient.name;
              }
            }
            usageRows.push(
              manager.create(InvoiceUsageEvent, {
                idempotencyKey: cleanOptionalText(event.idempotencyKey) ?? null,
                invoiceId: savedInvoice.id,
                ingredientId: event.ingredientId ?? null,
                ingredientNameSnapshot,
                consumedQuantity: Number(event.consumedQuantity),
                baseUnit: event.baseUnit.trim(),
                allocatedQuantity: Number(event.allocatedQuantity ?? 0),
                overusedQuantity: Number(event.overusedQuantity ?? 0),
                usageDate: event.usageDate,
                deviceId: cleanOptionalText(event.deviceId) ?? null,
                staffId: contextUser.id,
                meta: event.meta ?? null
              })
            );

            await this.applyUsageToStockAndDailyAllocation(manager, {
              ingredientId: event.ingredientId ?? null,
              ingredientNameSnapshot,
              baseUnit: event.baseUnit,
              usageDate: event.usageDate,
              consumedQuantity: Number(event.consumedQuantity)
            });
          }

          await manager.save(InvoiceUsageEvent, usageRows);
        }

        return savedInvoice;
      });

      return {
        created: !existingByInvoiceNumber,
        invoice: result
      };
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const duplicate = await this.invoiceRepository.findOne({
          where: { idempotencyKey: payload.idempotencyKey },
          relations: { customer: true, staff: true }
        });
        if (duplicate) {
          return { created: false, invoice: duplicate };
        }
      }
      throw error;
    }
  }

  async cancelInvoice(id: string, reason: string | undefined, contextUser: ContextUser) {
    if (!isAdminLikeRole(contextUser.role)) {
      throw new AppError(403, "Only admin/manager roles can cancel invoices");
    }

    const invoice = await this.resolveInvoiceOrFail(id);
    if (invoice.status === "cancelled") {
      return invoice;
    }
    if (invoice.status === "refunded") {
      throw new AppError(422, "Refunded invoice cannot be cancelled");
    }

    invoice.status = "cancelled";
    invoice.cancelledAt = new Date();
    invoice.cancelledReason = cleanOptionalText(reason) ?? null;
    await this.invoiceRepository.save(invoice);

    await this.invoiceActivityRepository.save(
      this.invoiceActivityRepository.create({
        invoiceId: invoice.id,
        actionType: "cancelled",
        reason: cleanOptionalText(reason) ?? "Cancelled from admin",
        performedByUserId: contextUser.id
      })
    );

    return invoice;
  }

  async refundInvoice(id: string, reason: string | undefined, contextUser: ContextUser) {
    if (!isAdminLikeRole(contextUser.role)) {
      throw new AppError(403, "Only admin/manager roles can refund invoices");
    }

    const invoice = await this.resolveInvoiceOrFail(id);
    if (invoice.status === "refunded") {
      return invoice;
    }
    if (invoice.status !== "paid" && invoice.status !== "cancelled") {
      throw new AppError(422, "Only paid/cancelled invoices can be refunded");
    }

    invoice.status = "refunded";
    invoice.refundedAt = new Date();
    invoice.refundedReason = cleanOptionalText(reason) ?? null;
    await this.invoiceRepository.save(invoice);

    await this.invoiceActivityRepository.save(
      this.invoiceActivityRepository.create({
        invoiceId: invoice.id,
        actionType: "refunded",
        reason: cleanOptionalText(reason) ?? "Refunded from admin",
        performedByUserId: contextUser.id
      })
    );

    return invoice;
  }

  async updateKitchenStatus(id: string, kitchenStatus: KitchenStatus, contextUser: ContextUser) {
    if (!isAdminLikeRole(contextUser.role)) {
      throw new AppError(403, "Only admin/manager roles can update kitchen status");
    }

    const invoice = await this.resolveInvoiceOrFail(id);
    invoice.kitchenStatus = kitchenStatus;
    await this.invoiceRepository.save(invoice);

    await this.invoiceActivityRepository.save(
      this.invoiceActivityRepository.create({
        invoiceId: invoice.id,
        actionType: "updated",
        reason: `Kitchen status updated to ${kitchenStatus}`,
        performedByUserId: contextUser.id
      })
    );

    return invoice;
  }

  async recordUsageEvent(
    payload: SyncUsageEventPayload & {
      idempotencyKey: string;
      invoiceId?: string | null;
      deviceId?: string | null;
    },
    contextUser: ContextUser
  ) {
    const existing = await this.invoiceUsageEventRepository.findOne({
      where: { idempotencyKey: payload.idempotencyKey }
    });
    if (existing) {
      return existing;
    }

    let ingredientNameSnapshot = payload.ingredientNameSnapshot.trim();
    if (payload.ingredientId) {
      const ingredient = await this.ingredientRepository.findOne({
        where: { id: payload.ingredientId }
      });
      if (ingredient) {
        ingredientNameSnapshot = ingredient.name;
      }
    }

    const usageEvent = this.invoiceUsageEventRepository.create({
      idempotencyKey: payload.idempotencyKey,
      invoiceId: payload.invoiceId ?? null,
      ingredientId: payload.ingredientId ?? null,
      ingredientNameSnapshot,
      consumedQuantity: Number(payload.consumedQuantity),
      baseUnit: payload.baseUnit.trim(),
      allocatedQuantity: Number(payload.allocatedQuantity ?? 0),
      overusedQuantity: Number(payload.overusedQuantity ?? 0),
      usageDate: payload.usageDate,
      deviceId: cleanOptionalText(payload.deviceId) ?? null,
      staffId: contextUser.id,
      meta: payload.meta ?? null
    });

    return AppDataSource.transaction(async (manager) => {
      const saved = await manager.save(InvoiceUsageEvent, usageEvent);
      await this.applyUsageToStockAndDailyAllocation(manager, {
        ingredientId: payload.ingredientId ?? null,
        ingredientNameSnapshot,
        baseUnit: payload.baseUnit,
        usageDate: payload.usageDate,
        consumedQuantity: Number(payload.consumedQuantity)
      });
      return saved;
    });
  }
}
