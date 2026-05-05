import { z } from "zod";

import {
  ALL_GAMING_RESOURCES,
  GAMING_BOOKING_STATUSES,
  GAMING_BOOKING_TYPES,
  GAMING_DISCOUNT_TYPES,
  GAMING_PAYMENT_MODES,
  GAMING_PAYMENT_STATUSES
} from "./gaming.constants";

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

const customerGroupMemberSchema = z.object({
  name: optionalCustomerNameSchema,
  phone: optionalCustomerPhoneSchema
});

const paymentBreakdownSchema = z.object({
  cash: z.coerce.number().min(0).optional(),
  card: z.coerce.number().min(0).optional(),
  upi: z.coerce.number().min(0).optional()
});

const hasPaymentBreakdownAmount = (value?: {
  cash?: number;
  card?: number;
  upi?: number;
}) => {
  if (!value) {
    return false;
  }
  const total = Number(value.cash ?? 0) + Number(value.card ?? 0) + Number(value.upi ?? 0);
  return total > 0.001;
};

export const gamingListSchema = z.object({
  query: z.object({
    search: z.string().trim().max(120).optional(),
    customerPhone: z.string().trim().min(8).max(20).optional(),
    bookingType: z.enum(GAMING_BOOKING_TYPES).optional(),
    status: z.enum(GAMING_BOOKING_STATUSES).optional(),
    paymentStatus: z.enum(GAMING_PAYMENT_STATUSES).optional(),
    resourceCode: z
      .string()
      .trim()
      .toLowerCase()
      .refine((value) => !value || ALL_GAMING_RESOURCES.includes(value as (typeof ALL_GAMING_RESOURCES)[number]), {
        message: "Invalid board/console selected."
      })
      .optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(10)
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional()
});

export const gamingStatsSchema = z.object({
  query: z.object({
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional()
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional()
});

export const gamingCreateSchema = z.object({
  body: z.object({
    bookingNumber: z.string().trim().max(64).optional(),
    bookingType: z.enum(GAMING_BOOKING_TYPES),
    resourceCode: z
      .string()
      .trim()
      .toLowerCase()
      .refine((value) => ALL_GAMING_RESOURCES.includes(value as (typeof ALL_GAMING_RESOURCES)[number]), {
        message: "Invalid board/console selected."
      }),
    resourceCodes: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .refine((value) => ALL_GAMING_RESOURCES.includes(value as (typeof ALL_GAMING_RESOURCES)[number]), {
            message: "Invalid board/console selected."
          })
      )
      .min(1)
      .optional(),
    checkInAt: z.string().datetime().optional(),
    checkOutAt: z.string().datetime().optional(),
    hourlyRate: z.coerce.number().min(0),
    playerCount: z.coerce.number().int().min(1).optional(),
    customers: z.array(customerGroupMemberSchema).min(1, "At least one customer is required"),
    bookingChannel: z.string().trim().max(40).optional(),
    note: z.string().trim().max(1200).optional(),
    sourceDeviceId: z.string().trim().max(80).optional(),
    status: z.enum(GAMING_BOOKING_STATUSES).optional(),
    paymentStatus: z.enum(GAMING_PAYMENT_STATUSES).optional(),
    paymentMode: z.enum(GAMING_PAYMENT_MODES).optional(),
    paymentBreakdown: paymentBreakdownSchema.optional(),
    finalAmount: z.coerce.number().min(0).optional(),
    systemCalculatedAmount: z.coerce.number().min(0).optional(),
    extraMemberCount: z.coerce.number().int().min(0).optional(),
    extraMemberCharge: z.coerce.number().min(0).optional(),
    discountType: z.enum(GAMING_DISCOUNT_TYPES).optional(),
    discountValue: z.coerce.number().min(0).optional(),
    discountAmount: z.coerce.number().min(0).optional(),
    amountOverrideReason: z.string().trim().max(500).optional(),
    foodOrderReference: z.string().trim().max(80).optional(),
    foodInvoiceNumber: z.string().trim().max(64).optional(),
    foodInvoiceStatus: z.enum(["none", "pending", "paid", "cancelled"]).optional(),
    foodAndBeverageAmount: z.coerce.number().min(0).optional(),
    staffId: z.string().uuid().optional()
  }).superRefine((body, ctx) => {
    const hasPrimaryContact = body.customers.some(
      (member) => (member.name?.trim().length ?? 0) > 0 && (member.phone?.trim().length ?? 0) >= 8
    );
    if (!hasPrimaryContact) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one customer name and phone number is required.",
        path: ["customers"]
      });
    }
    if (body.paymentStatus === "paid" && !body.paymentMode && !hasPaymentBreakdownAmount(body.paymentBreakdown)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment mode or split breakdown is required when payment status is paid.",
        path: ["paymentBreakdown"]
      });
    }
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});

export const gamingUpdateSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid booking id")
  }),
  body: z.object({
    bookingType: z.enum(GAMING_BOOKING_TYPES).optional(),
    resourceCode: z
      .string()
      .trim()
      .toLowerCase()
      .refine((value) => ALL_GAMING_RESOURCES.includes(value as (typeof ALL_GAMING_RESOURCES)[number]), {
        message: "Invalid board/console selected."
      })
      .optional(),
    resourceCodes: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .refine((value) => ALL_GAMING_RESOURCES.includes(value as (typeof ALL_GAMING_RESOURCES)[number]), {
            message: "Invalid board/console selected."
          })
      )
      .min(1)
      .optional(),
    checkInAt: z.string().datetime().optional(),
    checkOutAt: z.string().datetime().optional(),
    hourlyRate: z.coerce.number().min(0).optional(),
    playerCount: z.coerce.number().int().min(1).optional(),
    customers: z.array(customerGroupMemberSchema).min(1, "At least one customer is required").optional(),
    bookingChannel: z.string().trim().max(40).optional(),
    note: z.string().trim().max(1200).optional(),
    status: z.enum(GAMING_BOOKING_STATUSES).optional(),
    paymentStatus: z.enum(GAMING_PAYMENT_STATUSES).optional(),
    paymentMode: z.enum(GAMING_PAYMENT_MODES).optional(),
    paymentBreakdown: paymentBreakdownSchema.optional(),
    finalAmount: z.coerce.number().min(0).optional(),
    systemCalculatedAmount: z.coerce.number().min(0).optional(),
    extraMemberCount: z.coerce.number().int().min(0).optional(),
    extraMemberCharge: z.coerce.number().min(0).optional(),
    discountType: z.enum(GAMING_DISCOUNT_TYPES).optional(),
    discountValue: z.coerce.number().min(0).optional(),
    discountAmount: z.coerce.number().min(0).optional(),
    amountOverrideReason: z.string().trim().max(500).optional(),
    foodOrderReference: z.string().trim().max(80).optional(),
    foodInvoiceNumber: z.string().trim().max(64).optional(),
    foodInvoiceStatus: z.enum(["none", "pending", "paid", "cancelled"]).optional(),
    foodAndBeverageAmount: z.coerce.number().min(0).optional()
  }).superRefine((body, ctx) => {
    const hasPrimaryContact = body.customers?.some(
      (member) => (member.name?.trim().length ?? 0) > 0 && (member.phone?.trim().length ?? 0) >= 8
    );
    if (body.customers && !hasPrimaryContact) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one customer name and phone number is required.",
        path: ["customers"]
      });
    }
    if (body.paymentStatus === "paid" && !body.paymentMode && !hasPaymentBreakdownAmount(body.paymentBreakdown)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment mode or split breakdown is required when payment status is paid.",
        path: ["paymentBreakdown"]
      });
    }
  }),
  query: z.object({}).optional()
});

export const gamingDeleteSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid booking id")
  }),
  query: z.object({}).optional(),
  body: z.object({}).optional()
});

export const gamingCheckoutSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid booking id")
  }),
  body: z.object({
    checkOutAt: z.string().datetime().optional(),
    finalAmount: z.coerce.number().min(0).optional(),
    systemCalculatedAmount: z.coerce.number().min(0).optional(),
    extraMemberCount: z.coerce.number().int().min(0).optional(),
    extraMemberCharge: z.coerce.number().min(0).optional(),
    discountType: z.enum(GAMING_DISCOUNT_TYPES).optional(),
    discountValue: z.coerce.number().min(0).optional(),
    discountAmount: z.coerce.number().min(0).optional(),
    amountOverrideReason: z.string().trim().max(500).optional(),
    paymentStatus: z.enum(["pending", "paid"]).default("pending"),
    paymentMode: z.enum(GAMING_PAYMENT_MODES).optional(),
    paymentBreakdown: paymentBreakdownSchema.optional()
  }).superRefine((body, ctx) => {
    if (body.paymentStatus === "paid" && !body.paymentMode && !hasPaymentBreakdownAmount(body.paymentBreakdown)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select payment mode or provide split breakdown when status is paid.",
        path: ["paymentBreakdown"]
      });
    }
  }),
  query: z.object({}).optional()
});

export const gamingPaymentSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid booking id")
  }),
  body: z.object({
    paymentStatus: z.enum(["pending", "paid"]),
    paymentMode: z.enum(GAMING_PAYMENT_MODES).optional(),
    paymentBreakdown: paymentBreakdownSchema.optional()
  }).superRefine((body, ctx) => {
    if (body.paymentStatus === "paid" && !body.paymentMode && !hasPaymentBreakdownAmount(body.paymentBreakdown)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select payment mode or provide split breakdown when status is paid.",
        path: ["paymentBreakdown"]
      });
    }
  }),
  query: z.object({}).optional()
});
