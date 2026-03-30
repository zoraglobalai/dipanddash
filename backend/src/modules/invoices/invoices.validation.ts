import { z } from "zod";

import {
  INVOICE_LINE_TYPES,
  INVOICE_ORDER_TYPES,
  INVOICE_STATUSES,
  KITCHEN_STATUSES,
  PAYMENT_MODES,
  PAYMENT_STATUSES
} from "./invoices.constants";

const optionalNumeric = z.coerce.number().optional();

export const invoiceListSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    status: z.enum(INVOICE_STATUSES).optional(),
    kitchenStatus: z.enum(KITCHEN_STATUSES).optional(),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
    staffId: z.string().uuid().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(10)
  }),
  body: z.object({}).optional(),
  params: z.object({}).optional()
});

export const invoiceStatsSchema = z.object({
  query: z.object({
    staffId: z.string().uuid().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional()
  }),
  body: z.object({}).optional(),
  params: z.object({}).optional()
});

export const invoiceIdSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid invoice id")
  }),
  query: z.object({}).optional(),
  body: z.object({}).optional()
});

export const cancelInvoiceSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid invoice id")
  }),
  body: z.object({
    reason: z.string().trim().max(400).optional()
  }),
  query: z.object({}).optional()
});

export const refundInvoiceSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid invoice id")
  }),
  body: z.object({
    reason: z.string().trim().max(400).optional()
  }),
  query: z.object({}).optional()
});

export const updateKitchenStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid invoice id")
  }),
  body: z.object({
    kitchenStatus: z.enum(KITCHEN_STATUSES)
  }),
  query: z.object({}).optional()
});

const invoiceLineSchema = z.object({
  lineType: z.enum(INVOICE_LINE_TYPES),
  referenceId: z.string().uuid().optional().nullable(),
  nameSnapshot: z.string().trim().min(1).max(180),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discountAmount: optionalNumeric,
  gstPercentage: optionalNumeric,
  lineTotal: z.coerce.number().min(0),
  meta: z.record(z.unknown()).optional().nullable()
});

const invoicePaymentSchema = z.object({
  mode: z.enum(PAYMENT_MODES),
  status: z.enum(PAYMENT_STATUSES).optional(),
  amount: z.coerce.number().min(0),
  receivedAmount: optionalNumeric.nullable().optional(),
  changeAmount: optionalNumeric.nullable().optional(),
  referenceNo: z.string().trim().max(120).optional().nullable(),
  paidAt: z.string().datetime().optional()
});

const usageEventSchema = z.object({
  idempotencyKey: z.string().trim().max(120).optional(),
  ingredientId: z.string().uuid().optional().nullable(),
  ingredientNameSnapshot: z.string().trim().min(1).max(180),
  consumedQuantity: z.coerce.number().min(0),
  baseUnit: z.string().trim().min(1).max(24),
  allocatedQuantity: z.coerce.number().min(0).optional(),
  overusedQuantity: z.coerce.number().min(0).optional(),
  usageDate: z.string().date(),
  deviceId: z.string().trim().max(80).optional().nullable(),
  meta: z.record(z.unknown()).optional().nullable()
});

export const createInvoiceFromSyncSchema = z.object({
  body: z.object({
    idempotencyKey: z.string().trim().min(8).max(120),
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
    paymentMode: z.enum(PAYMENT_MODES).default("cash"),
    subtotal: z.coerce.number().min(0),
    itemDiscountAmount: optionalNumeric,
    couponDiscountAmount: optionalNumeric,
    manualDiscountAmount: optionalNumeric,
    taxAmount: optionalNumeric,
    totalAmount: z.coerce.number().min(0),
    couponCode: z.string().trim().max(60).optional().nullable(),
    notes: z.string().trim().max(800).optional().nullable(),
    customerSnapshot: z.record(z.unknown()).optional().nullable(),
    totalsSnapshot: z.record(z.unknown()).optional().nullable(),
    linesSnapshot: z.record(z.unknown()).optional().nullable(),
    sourceCreatedAt: z.string().datetime().optional(),
    lines: z.array(invoiceLineSchema).default([]),
    payments: z.array(invoicePaymentSchema).default([]),
    usageEvents: z.array(usageEventSchema).default([])
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});
