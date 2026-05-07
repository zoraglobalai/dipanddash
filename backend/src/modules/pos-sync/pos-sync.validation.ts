import { z } from "zod";

import {
  INVOICE_PAYMENT_MODES,
  INVOICE_LINE_TYPES,
  INVOICE_ORDER_TYPES,
  INVOICE_STATUSES,
  KITCHEN_STATUSES,
  PAYMENT_MODES
} from "../invoices/invoices.constants";

const nonNegativeOptionalNumber = z.coerce.number().optional().transform((value) => {
  if (value === undefined) {
    return undefined;
  }
  return Math.max(value, 0);
});

const optionalCustomerPhoneSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().trim().min(8, "Customer phone should be at least 8 digits").max(20).optional()
);

const optionalCustomerNameSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().trim().max(120).optional()
);

const syncCustomerGroupMemberSchema = z.object({
  name: optionalCustomerNameSchema,
  phone: optionalCustomerPhoneSchema
});

const customerUpsertEventSchema = z.object({
  eventType: z.literal("customer_upsert"),
  idempotencyKey: z.string().trim().min(8).max(120),
  deviceId: z.string().trim().max(80).optional(),
  payload: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(8).max(20),
    email: z.string().trim().email().optional().or(z.literal("")),
    notes: z.string().trim().max(600).optional(),
    sourceDeviceId: z.string().trim().max(80).optional()
  })
});

const invoiceUpsertEventSchema = z.object({
  eventType: z.literal("invoice_upsert"),
  idempotencyKey: z.string().trim().min(8).max(120),
  deviceId: z.string().trim().max(80).optional(),
  payload: z.object({
    invoiceNumber: z.string().trim().min(2).max(40),
    orderReference: z.string().trim().max(80).optional().nullable(),
    customerId: z.string().uuid().optional().nullable(),
    customerPhone: z.string().trim().max(20).optional().nullable(),
    customerName: z.string().trim().max(120).optional().nullable(),
    branchId: z.string().trim().max(64).optional().nullable(),
    deviceId: z.string().trim().max(80).optional().nullable(),
    orderType: z.enum(INVOICE_ORDER_TYPES).default("takeaway"),
    tableLabel: z.string().trim().max(40).optional().nullable(),
    kitchenStatus: z.enum(KITCHEN_STATUSES).optional(),
    status: z.enum(INVOICE_STATUSES).default("paid"),
    paymentMode: z.enum(INVOICE_PAYMENT_MODES).default("cash"),
    subtotal: z.coerce.number().min(0),
    itemDiscountAmount: z.coerce.number().optional(),
    couponDiscountAmount: z.coerce.number().optional(),
    manualDiscountAmount: z.coerce.number().optional(),
    taxAmount: z.coerce.number().optional(),
    totalAmount: z.coerce.number().min(0),
    couponCode: z.string().trim().max(60).optional().nullable(),
    notes: z.string().trim().max(800).optional().nullable(),
    customerSnapshot: z.record(z.unknown()).optional().nullable(),
    totalsSnapshot: z.record(z.unknown()).optional().nullable(),
    linesSnapshot: z.record(z.unknown()).optional().nullable(),
    sourceCreatedAt: z.string().datetime().optional(),
    lines: z
      .array(
        z.object({
          lineType: z.enum(INVOICE_LINE_TYPES),
          referenceId: z.string().uuid().optional().nullable(),
          nameSnapshot: z.string().trim().min(1).max(180),
          quantity: z.coerce.number().positive(),
          unitPrice: z.coerce.number().min(0),
          discountAmount: z.coerce.number().optional(),
          gstPercentage: z.coerce.number().optional(),
          lineTotal: z.coerce.number().min(0),
          meta: z.record(z.unknown()).optional().nullable()
        })
      )
      .default([]),
    payments: z
      .array(
        z.object({
          mode: z.enum(PAYMENT_MODES),
          status: z.enum(["success", "failed", "refunded"]).optional(),
          amount: z.coerce.number().min(0),
          receivedAmount: z.coerce.number().optional().nullable(),
          changeAmount: z.coerce.number().optional().nullable(),
          referenceNo: z.string().trim().max(120).optional().nullable(),
          paidAt: z.string().datetime().optional()
        })
      )
      .default([])
      .superRefine((payments, ctx) => {
        payments.forEach((payment, index) => {
          const needsReference = payment.mode === "card" || payment.mode === "upi";
          const hasReference = typeof payment.referenceNo === "string" && payment.referenceNo.trim().length > 0;
          if (needsReference && !hasReference) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, "referenceNo"],
              message: "Reference ID is required for Card and UPI payments."
            });
          }
        });
      }),
    usageEvents: z
      .array(
        z.object({
          idempotencyKey: z.string().trim().max(120).optional(),
          ingredientId: z.string().uuid().optional().nullable(),
          ingredientNameSnapshot: z.string().trim().min(1).max(180),
          consumedQuantity: z.coerce.number().min(0),
          baseUnit: z.string().trim().min(1).max(24),
          allocatedQuantity: nonNegativeOptionalNumber,
          overusedQuantity: nonNegativeOptionalNumber,
          usageDate: z.string().date(),
          deviceId: z.string().trim().max(80).optional().nullable(),
          meta: z.record(z.unknown()).optional().nullable()
        })
      )
      .default([])
  })
});

const usageEventSchema = z.object({
  eventType: z.literal("usage_event"),
  idempotencyKey: z.string().trim().min(8).max(120),
  deviceId: z.string().trim().max(80).optional(),
  payload: z.object({
    invoiceId: z.string().uuid().optional().nullable(),
    ingredientId: z.string().uuid().optional().nullable(),
    ingredientNameSnapshot: z.string().trim().min(1).max(180),
    consumedQuantity: z.coerce.number().min(0),
    baseUnit: z.string().trim().min(1).max(24),
    allocatedQuantity: nonNegativeOptionalNumber,
    overusedQuantity: nonNegativeOptionalNumber,
    usageDate: z.string().date(),
    deviceId: z.string().trim().max(80).optional().nullable(),
    meta: z.record(z.unknown()).optional().nullable()
  })
});

const gamingBookingUpsertSchema = z.object({
  eventType: z.literal("gaming_booking_upsert"),
  idempotencyKey: z.string().trim().min(8).max(120),
  deviceId: z.string().trim().max(80).optional(),
  payload: z
    .object({
      bookingNumber: z.string().trim().min(2).max(64),
      bookingType: z.enum(["snooker", "console"]),
      resourceCode: z.string().trim().toLowerCase().min(2).max(40),
      resourceCodes: z.array(z.string().trim().toLowerCase().min(2).max(40)).min(1).optional(),
      playerCount: z.coerce.number().int().min(1).optional(),
      checkInAt: z.string().datetime().optional(),
      checkOutAt: z.string().datetime().optional(),
      hourlyRate: z.coerce.number().min(0),
      customers: z.array(syncCustomerGroupMemberSchema).min(1, "At least one customer is required"),
      bookingChannel: z.string().trim().max(40).optional(),
      note: z.string().trim().max(1200).optional(),
      sourceDeviceId: z.string().trim().max(80).optional(),
      status: z.enum(["upcoming", "ongoing", "completed", "cancelled"]).optional(),
      paymentStatus: z.enum(["pending", "paid", "refunded"]).optional(),
      paymentMode: z.enum(["cash", "upi", "card", "mixed"]).optional(),
      paymentReference: z.string().trim().max(120).optional(),
      paymentBreakdown: z
        .object({
          cash: z.coerce.number().min(0).optional(),
          card: z.coerce.number().min(0).optional(),
          upi: z.coerce.number().min(0).optional()
        })
        .optional(),
      finalAmount: z.coerce.number().min(0).optional(),
      systemCalculatedAmount: z.coerce.number().min(0).optional(),
      extraMemberCount: z.coerce.number().int().min(0).optional(),
      extraMemberCharge: z.coerce.number().min(0).optional(),
      amountOverrideReason: z.string().trim().max(500).optional(),
      foodOrderReference: z.string().trim().max(80).optional(),
      foodInvoiceNumber: z.string().trim().max(64).optional(),
      foodInvoiceStatus: z.enum(["none", "pending", "paid", "cancelled"]).optional(),
      foodAndBeverageAmount: z.coerce.number().min(0).optional(),
      staffId: z.string().uuid().optional()
    })
    .superRefine((payload, ctx) => {
      const hasPrimaryContact = payload.customers.some(
        (member) => (member.name?.trim().length ?? 0) > 0 && (member.phone?.trim().length ?? 0) >= 8
      );
      if (!hasPrimaryContact) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one customer name and phone number is required.",
          path: ["customers"]
        });
      }
    })
});

export const syncBatchSchema = z.object({
  body: z.object({
    events: z
      .array(
        z.discriminatedUnion("eventType", [
          customerUpsertEventSchema,
          invoiceUpsertEventSchema,
          usageEventSchema,
          gamingBookingUpsertSchema
        ])
      )
      .min(1)
      .max(200)
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});

export const syncStatusSchema = z.object({
  query: z.object({
    deviceId: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  }),
  body: z.object({}).optional(),
  params: z.object({}).optional()
});
