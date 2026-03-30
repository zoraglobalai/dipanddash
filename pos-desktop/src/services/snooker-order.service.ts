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
    kitchenStatus: "queued",
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

const queueInvoiceSync = async (
  order: PosOrder,
  snapshot: CatalogSnapshot,
  mode: "pending" | "paid",
  paymentMode?: PaymentMode
) => {
  const payments =
    mode === "paid"
      ? [
          {
            mode: paymentMode ?? "cash",
            amount: order.totals.totalAmount,
            receivedAmount: order.totals.totalAmount,
            changeAmount: 0,
            referenceNo: null,
            paidAt: new Date().toISOString()
          }
        ]
      : [];

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
  async upsertFoodOrder(input: UpsertSnookerFoodOrderInput) {
    if (!input.lines.length) {
      throw new Error("Add at least one food/product line before sending.");
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
            kitchenStatus: existing.kitchenStatus === "served" ? "queued" : existing.kitchenStatus,
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
    await queueInvoiceSync(paidOrder, input.snapshot, "paid", input.paymentMode);
    await gamingBookingsService.updateFoodOrderLink(input.booking.localBookingId, {
      foodInvoiceStatus: "paid",
      foodInvoiceNumber: paidOrder.invoiceNumber,
      foodAndBeverageAmount: paidOrder.totals.totalAmount
    });

    return paidOrder;
  }
};
