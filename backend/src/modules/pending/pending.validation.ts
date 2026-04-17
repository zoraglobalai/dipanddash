import { z } from "zod";

import { PENDING_SOURCE_TYPES } from "./pending-payment-history.entity";

const paymentModeSchema = z.enum(["cash", "card", "upi"]);

export const pendingCustomersListSchema = z.object({
  query: z.object({
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional()
});

export const pendingCustomerDetailsSchema = z.object({
  query: z
    .object({
      phone: z.string().trim().max(24).optional(),
      name: z.string().trim().max(120).optional()
    })
    .superRefine((value, ctx) => {
      if (!value.phone?.trim() && !value.name?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phone"],
          message: "Either customer phone or name is required."
        });
      }
    }),
  params: z.object({}).optional(),
  body: z.object({}).optional()
});

export const collectPendingAmountSchema = z.object({
  body: z
    .object({
      sourceType: z.enum(PENDING_SOURCE_TYPES),
      sourceId: z.string().uuid("Invalid source id"),
      paymentMode: paymentModeSchema,
      amount: z.coerce.number().positive("Amount should be greater than zero").optional(),
      referenceNo: z.string().trim().max(120).optional(),
      note: z.string().trim().max(400).optional()
    })
    .superRefine((value, ctx) => {
      if ((value.paymentMode === "card" || value.paymentMode === "upi") && !value.referenceNo?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["referenceNo"],
          message: "Reference ID is required for Card and UPI payments."
        });
      }
    }),
  query: z.object({}).optional(),
  params: z.object({}).optional()
});

