import { z } from "zod";

import {
  ALL_GAMING_RESOURCES,
  GAMING_BOOKING_STATUSES,
  GAMING_BOOKING_TYPES,
  GAMING_PAYMENT_MODES,
  GAMING_PAYMENT_STATUSES
} from "./gaming.constants";

const customerGroupMemberSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(120),
  phone: z.string().trim().min(8, "Customer phone is required").max(20)
});

export const gamingListSchema = z.object({
  query: z.object({
    search: z.string().trim().max(120).optional(),
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
    customers: z.array(customerGroupMemberSchema).min(1, "At least one customer is required"),
    bookingChannel: z.string().trim().max(40).optional(),
    note: z.string().trim().max(1200).optional(),
    sourceDeviceId: z.string().trim().max(80).optional(),
    status: z.enum(GAMING_BOOKING_STATUSES).optional(),
    paymentStatus: z.enum(GAMING_PAYMENT_STATUSES).optional(),
    paymentMode: z.enum(GAMING_PAYMENT_MODES).optional(),
    finalAmount: z.coerce.number().min(0).optional(),
    foodOrderReference: z.string().trim().max(80).optional(),
    foodInvoiceNumber: z.string().trim().max(64).optional(),
    foodInvoiceStatus: z.enum(["none", "pending", "paid", "cancelled"]).optional(),
    foodAndBeverageAmount: z.coerce.number().min(0).optional(),
    staffId: z.string().uuid().optional()
  }).superRefine((body, ctx) => {
    if (body.paymentStatus === "paid" && !body.paymentMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment mode is required when payment status is paid.",
        path: ["paymentMode"]
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
    hourlyRate: z.coerce.number().min(0).optional(),
    customers: z.array(customerGroupMemberSchema).min(1, "At least one customer is required").optional(),
    bookingChannel: z.string().trim().max(40).optional(),
    note: z.string().trim().max(1200).optional(),
    status: z.enum(["upcoming", "ongoing", "cancelled"]).optional(),
    paymentStatus: z.enum(["pending", "paid"]).optional(),
    paymentMode: z.enum(GAMING_PAYMENT_MODES).optional(),
    foodOrderReference: z.string().trim().max(80).optional(),
    foodInvoiceNumber: z.string().trim().max(64).optional(),
    foodInvoiceStatus: z.enum(["none", "pending", "paid", "cancelled"]).optional(),
    foodAndBeverageAmount: z.coerce.number().min(0).optional()
  }).superRefine((body, ctx) => {
    if (body.paymentStatus === "paid" && !body.paymentMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment mode is required when payment status is paid.",
        path: ["paymentMode"]
      });
    }
  }),
  query: z.object({}).optional()
});

export const gamingCheckoutSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid booking id")
  }),
  body: z.object({
    checkOutAt: z.string().datetime().optional(),
    finalAmount: z.coerce.number().min(0).optional(),
    paymentStatus: z.enum(["pending", "paid"]).default("pending"),
    paymentMode: z.enum(GAMING_PAYMENT_MODES).optional()
  }).superRefine((body, ctx) => {
    if (body.paymentStatus === "paid" && !body.paymentMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select payment mode when status is paid.",
        path: ["paymentMode"]
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
    paymentMode: z.enum(GAMING_PAYMENT_MODES).optional()
  }).superRefine((body, ctx) => {
    if (body.paymentStatus === "paid" && !body.paymentMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select payment mode when status is paid.",
        path: ["paymentMode"]
      });
    }
  }),
  query: z.object({}).optional()
});
