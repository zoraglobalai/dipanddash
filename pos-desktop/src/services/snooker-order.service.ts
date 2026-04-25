import { env } from "@/config/env";
import { ordersRepository } from "@/db/repositories/orders.repository";
import { syncQueueRepository } from "@/db/repositories/sync-queue.repository";
import { gamingBookingsService } from "@/services/gaming-bookings.service";
import { posBillingService } from "@/services/invoice-builder.service";
import type {
  CartLine,
  CatalogSnapshot,
  CustomerRecord,
  GamingBooking,
  PaymentMode,
  PosOrder
} from "@/types/pos";
import { makeId, makeInvoiceNumber } from "@/utils/idempotency";
import { roundMoney } from "@/utils/currency";

type PaymentSplitChannel = Extract<PaymentMode, "cash" | "upi" | "card">;
type PaymentBreakdownInput = Partial<Record<PaymentSplitChannel, number>>;

type UpsertSnookerFoodOrderInput = {
  booking: GamingBooking;
  snapshot: CatalogSnapshot;
  lines: Array<{
    lineType: "item" | "combo" | "product";
    refId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    gstPercentage?: number;
  }>;
  notes?: string;
};

type CreateSnookerDirectProductSaleInput = {
  snapshot: CatalogSnapshot;
  lines: Array<{
    productId: string;
    quantity: number;
  }>;
  paymentMode: Extract<PaymentMode, "cash" | "upi" | "card">;
  paymentReferenceNo?: string;
  manualDiscountAmount?: number;
  notes?: string;
};

const PAYMENT_SPLIT_THRESHOLD = 0.01;
const PAYMENT_SPLIT_CHANNELS: PaymentSplitChannel[] = ["cash", "upi", "card"];

const buildCustomerSnapshot = (booking: GamingBooking): CustomerRecord => {
  const now = new Date().toISOString();
  return {
    localId: `gaming-${booking.localBookingId}`,
    serverId: null,
    name: booking.primaryCustomerName,
    phone: booking.primaryCustomerPhone,
    email: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending"
  };
};

const toCartLine = (line: UpsertSnookerFoodOrderInput["lines"][number]): CartLine => ({
  lineId: makeId(),
  lineType: line.lineType,
  refId: line.refId,
  name: line.name,
  quantity: Math.max(1, Math.round(line.quantity)),
  unitPrice: Number(line.unitPrice) || 0,
  gstPercentage: Number(line.gstPercentage ?? 0),
  addOns: [],
  notes: null
});

const buildNewPendingOrder = (
  booking: GamingBooking,
  lines: CartLine[],
  notes: string | null
): PosOrder => {
  const now = new Date().toISOString();
  const order: PosOrder = {
    localOrderId: makeId(),
    serverInvoiceId: null,
    invoiceNumber: makeInvoiceNumber(),
    orderType: "snooker",
    orderChannel: "snooker",
    tableLabel: booking.resourceLabel,
    kitchenStatus: "served",
    status: "pending",
    paymentMode: null,
    customer: buildCustomerSnapshot(booking),
    lines,
    appliedOffer: null,
    manualDiscountAmount: 0,
    notes,
    totals: {
      subtotal: 0,
      itemDiscountAmount: 0,
      couponDiscountAmount: 0,
      manualDiscountAmount: 0,
      taxAmount: 0,
      totalAmount: 0
    },
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending"
  };

  order.totals = posBillingService.computeTotals({
    lines: order.lines,
    manualDiscountAmount: 0,
    couponDiscountAmount: 0
  });
  return order;
};

const normalizePaymentBreakdown = (input?: PaymentBreakdownInput) => {
  const normalized: Record<PaymentSplitChannel, number> = {
    cash: 0,
    upi: 0,
    card: 0
  };
  if (!input) {
    return normalized;
  }
  PAYMENT_SPLIT_CHANNELS.forEach((channel) => {
    const parsed = Number(input[channel] ?? 0);
    normalized[channel] = Number.isFinite(parsed) ? roundMoney(Math.max(0, parsed)) : 0;
  });
  return normalized;
};

const getPaymentBreakdownTotal = (breakdown: Record<PaymentSplitChannel, number>) =>
  roundMoney(breakdown.cash + breakdown.upi + breakdown.card);

const scalePaymentBreakdown = (
  breakdown: Record<PaymentSplitChannel, number>,
  sourceTotal: number,
  targetTotal: number
) => {
  const normalizedTarget = roundMoney(Math.max(0, Number(targetTotal) || 0));
  const normalizedSource = roundMoney(Math.max(0, Number(sourceTotal) || 0));
  const breakdownTotal = getPaymentBreakdownTotal(breakdown);
  const sourceBase = normalizedSource > PAYMENT_SPLIT_THRESHOLD ? normalizedSource : breakdownTotal;
  if (sourceBase <= PAYMENT_SPLIT_THRESHOLD || normalizedTarget <= PAYMENT_SPLIT_THRESHOLD) {
    return null;
  }

  const scaled: Record<PaymentSplitChannel, number> = {
    cash: roundMoney((breakdown.cash / sourceBase) * normalizedTarget),
    upi: roundMoney((breakdown.upi / sourceBase) * normalizedTarget),
    card: roundMoney((breakdown.card / sourceBase) * normalizedTarget)
  };

  const activeChannels = PAYMENT_SPLIT_CHANNELS.filter(
    (channel) => breakdown[channel] > PAYMENT_SPLIT_THRESHOLD || scaled[channel] > PAYMENT_SPLIT_THRESHOLD
  );
  if (!activeChannels.length) {
    return null;
  }

  const scaledTotal = getPaymentBreakdownTotal(scaled);
  const delta = roundMoney(normalizedTarget - scaledTotal);
  if (Math.abs(delta) > 0) {
    const fallbackChannel = activeChannels[activeChannels.length - 1];
    scaled[fallbackChannel] = roundMoney(Math.max(0, scaled[fallbackChannel] + delta));
  }

  return scaled;
};

const buildPaidPayments = (
  orderTotalAmount: number,
  paymentInput?: {
    mode: PaymentMode;
    referenceNo?: string | null;
    paymentBreakdown?: PaymentBreakdownInput;
    paymentBreakdownTotal?: number;
  }
) => {
  const normalizedOrderAmount = roundMoney(Math.max(0, Number(orderTotalAmount) || 0));
  const paidAt = new Date().toISOString();
  const referenceNo = paymentInput?.referenceNo?.trim() || null;

  const breakdown = normalizePaymentBreakdown(paymentInput?.paymentBreakdown);
  const breakdownTotal = getPaymentBreakdownTotal(breakdown);
  if (breakdownTotal > PAYMENT_SPLIT_THRESHOLD) {
    const sourceTotal = roundMoney(Math.max(0, Number(paymentInput?.paymentBreakdownTotal ?? 0) || 0));
    const scaled = scalePaymentBreakdown(breakdown, sourceTotal, normalizedOrderAmount);
    if (scaled) {
      const splitPayments = PAYMENT_SPLIT_CHANNELS.filter(
        (channel) => scaled[channel] > PAYMENT_SPLIT_THRESHOLD
      ).map((channel) => ({
        mode: channel,
        amount: scaled[channel],
        receivedAmount: scaled[channel],
        changeAmount: 0,
        referenceNo: channel === "cash" ? null : referenceNo,
        paidAt
      }));
      if (splitPayments.length) {
        return splitPayments;
      }
    }
  }

  const mode = paymentInput?.mode ?? "cash";
  return [
    {
      mode,
      amount: normalizedOrderAmount,
      receivedAmount: normalizedOrderAmount,
      changeAmount: 0,
      referenceNo: mode === "cash" ? null : referenceNo,
      paidAt
    }
  ];
};

const queueInvoiceSync = async (
  order: PosOrder,
  snapshot: CatalogSnapshot,
  mode: "pending" | "paid",
  paymentInput?: {
    mode: PaymentMode;
    referenceNo?: string | null;
    paymentBreakdown?: PaymentBreakdownInput;
    paymentBreakdownTotal?: number;
  }
) => {
  const payments = mode === "paid" ? buildPaidPayments(order.totals.totalAmount, paymentInput) : [];

  const payload = posBillingService.buildInvoiceSyncPayload({
    order,
    payments,
    snapshot,
    forceStatus: mode
  });

  const idempotencyKey = makeId();
  await syncQueueRepository.enqueue({
    id: makeId(),
    idempotencyKey,
    eventType: "invoice_upsert",
    payload: {
      eventType: "invoice_upsert",
      idempotencyKey,
      deviceId: env.deviceId,
      payload
    },
    status: "pending",
    retryCount: 0,
    lastError: null,
    nextRetryAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
};

export const snookerOrderService = {
  async getFoodOrderByReference(orderReference: string | null | undefined) {
    if (!orderReference) {
      return null;
    }
    return ordersRepository.getById(orderReference);
  },

  async upsertFoodOrder(input: UpsertSnookerFoodOrderInput) {
    if (!input.lines.length) {
      throw new Error("Add at least one product line before saving.");
    }
    const allowedProductIds = new Set(
      input.snapshot.products
        .filter((product) => product.targetSection === "gaming" || product.targetSection === "both")
        .map((product) => product.id)
    );
    const invalidProductLines = input.lines.filter(
      (line) => line.lineType === "product" && !allowedProductIds.has(line.refId)
    );
    if (invalidProductLines.length) {
      throw new Error("Only snooker-assigned products can be added in this order.");
    }

    const normalizedLines = input.lines.map(toCartLine);
    const notes = input.notes?.trim() || `Snooker booking ${input.booking.bookingNumber}`;
    const existing =
      input.booking.foodOrderReference
        ? await ordersRepository.getById(input.booking.foodOrderReference)
        : null;

    const now = new Date().toISOString();
    const order: PosOrder = existing
        ? {
            ...existing,
            orderType: "snooker",
            orderChannel: "snooker",
            tableLabel: input.booking.resourceLabel,
            customer: buildCustomerSnapshot(input.booking),
            kitchenStatus: "served",
            status: existing.status === "paid" ? "paid" : "pending",
            paymentMode: existing.status === "paid" ? existing.paymentMode : null,
            lines: normalizedLines,
            notes,
          manualDiscountAmount: 0,
          appliedOffer: null,
          updatedAt: now,
          syncStatus: "pending",
          totals: posBillingService.computeTotals({
            lines: normalizedLines,
            manualDiscountAmount: 0,
            couponDiscountAmount: 0
          })
        }
      : buildNewPendingOrder(input.booking, normalizedLines, notes);

    await ordersRepository.save(order);
    if (order.status !== "paid") {
      await ordersRepository.upsertPendingBill({
        localOrderId: order.localOrderId,
        invoiceNumber: order.invoiceNumber,
        customerName: order.customer?.name ?? input.booking.primaryCustomerName,
        customerPhone: order.customer?.phone ?? input.booking.primaryCustomerPhone,
        orderType: order.orderType,
        orderChannel: order.orderChannel,
        tableLabel: order.tableLabel,
        kitchenStatus: order.kitchenStatus,
        totalAmount: order.totals.totalAmount,
        lineCount: order.lines.length,
        updatedAt: order.updatedAt
      });
    }

    await queueInvoiceSync(order, input.snapshot, order.status === "paid" ? "paid" : "pending");
    await gamingBookingsService.updateFoodOrderLink(input.booking.localBookingId, {
      foodOrderReference: order.localOrderId,
      foodInvoiceNumber: order.invoiceNumber,
      foodInvoiceStatus: order.status === "paid" ? "paid" : "pending",
      foodAndBeverageAmount: order.totals.totalAmount
    });

    return order;
  },

  async markFoodOrderPaidForCheckout(input: {
    booking: GamingBooking;
    snapshot: CatalogSnapshot;
    paymentMode: PaymentMode;
    paymentBreakdown?: PaymentBreakdownInput;
    paymentBreakdownTotal?: number;
    referenceNo?: string | null;
  }) {
    if (!input.booking.foodOrderReference) {
      return null;
    }

    const order = await ordersRepository.getById(input.booking.foodOrderReference);
    if (!order) {
      return null;
    }

    if (order.status === "paid") {
      await gamingBookingsService.updateFoodOrderLink(input.booking.localBookingId, {
        foodInvoiceStatus: "paid",
        foodInvoiceNumber: order.invoiceNumber,
        foodAndBeverageAmount: order.totals.totalAmount
      });
      return order;
    }

    const paidOrder: PosOrder = {
      ...order,
      status: "paid",
      kitchenStatus: "served",
      paymentMode: input.paymentMode,
      updatedAt: new Date().toISOString(),
      syncStatus: "pending"
    };

    await ordersRepository.save(paidOrder);
    await ordersRepository.removePendingBill(paidOrder.localOrderId);
    await queueInvoiceSync(paidOrder, input.snapshot, "paid", {
      mode: input.paymentMode,
      paymentBreakdown: input.paymentBreakdown,
      paymentBreakdownTotal: input.paymentBreakdownTotal,
      referenceNo: input.referenceNo ?? null
    });
    await gamingBookingsService.updateFoodOrderLink(input.booking.localBookingId, {
      foodInvoiceStatus: "paid",
      foodInvoiceNumber: paidOrder.invoiceNumber,
      foodAndBeverageAmount: paidOrder.totals.totalAmount
    });

    return paidOrder;
  },

  async createDirectProductSale(input: CreateSnookerDirectProductSaleInput) {
    if (!input.lines.length) {
      throw new Error("Add at least one product line.");
    }

    const paymentMode = input.paymentMode;
    const paymentReference = input.paymentReferenceNo?.trim() ?? "";
    if ((paymentMode === "upi" || paymentMode === "card") && !paymentReference) {
      throw new Error("Reference ID is required for UPI and Card payments.");
    }

    const productMap = new Map(
      input.snapshot.products
        .filter((product) => product.targetSection === "gaming" || product.targetSection === "both")
        .map((product) => [product.id, product])
    );
    const normalizedLines: CartLine[] = [];
    const aggregateQuantityByProduct = new Map<string, number>();

    for (const line of input.lines) {
      const product = productMap.get(line.productId);
      if (!product) {
        continue;
      }

      const quantity = Math.max(1, Math.round(Number(line.quantity) || 0));
      const nextQty = (aggregateQuantityByProduct.get(product.id) ?? 0) + quantity;
      aggregateQuantityByProduct.set(product.id, nextQty);

      normalizedLines.push({
        lineId: makeId(),
        lineType: "product",
        refId: product.id,
        name: product.name,
        quantity,
        unitPrice: Number(product.sellingPrice) || 0,
        gstPercentage: 0,
        addOns: [],
        notes: null
      });
    }

    if (!normalizedLines.length) {
      throw new Error("No valid products selected for billing.");
    }

    const outOfStockNames: string[] = [];
    aggregateQuantityByProduct.forEach((requestedQty, productId) => {
      const product = productMap.get(productId);
      if (!product) {
        return;
      }
      if (requestedQty > Math.max(0, Number(product.currentStock ?? 0))) {
        outOfStockNames.push(product.name);
      }
    });
    if (outOfStockNames.length) {
      throw new Error(`Insufficient stock for: ${outOfStockNames.join(", ")}`);
    }

    const now = new Date().toISOString();
    const manualDiscountAmount = Math.max(0, roundMoney(Number(input.manualDiscountAmount) || 0));
    const orderBase: PosOrder = {
      localOrderId: makeId(),
      serverInvoiceId: null,
      invoiceNumber: makeInvoiceNumber(),
      orderType: "snooker",
      orderChannel: "snooker",
      tableLabel: "Counter",
      kitchenStatus: "served",
      status: "paid",
      paymentMode,
      customer: null,
      lines: normalizedLines,
      appliedOffer: null,
      manualDiscountAmount,
      notes: input.notes?.trim() || "Snooker product counter sale",
      totals: {
        subtotal: 0,
        itemDiscountAmount: 0,
        couponDiscountAmount: 0,
        manualDiscountAmount,
        taxAmount: 0,
        totalAmount: 0
      },
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending"
    };

    const order: PosOrder = {
      ...orderBase,
      totals: posBillingService.computeTotals({
        lines: orderBase.lines,
        manualDiscountAmount,
        couponDiscountAmount: 0
      })
    };

    await ordersRepository.save(order);
    await ordersRepository.removePendingBill(order.localOrderId);
    await queueInvoiceSync(order, input.snapshot, "paid", {
      mode: paymentMode,
      referenceNo: paymentReference || null
    });

    return order;
  }
};
