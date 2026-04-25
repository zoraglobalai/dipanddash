import { z } from "zod";

import { PENDING_SOURCE_TYPES } from "./pending-payment-history.entity";

const paymentModeSchema = z.enum(["cash", "card", "upi", "mixed"]);
const pendingScopeSchema = z.enum(["all", "dip_and_dash", "snooker"]);
const splitPaymentSchema = z.object({
  cash: z.coerce.number().min(0).optional(),
  card: z.coerce.number().min(0).optional(),
  upi: z.coerce.number().min(0).optional()
});

export const pendingCustomersListSchema = z.object({
  query: z.object({
    search: z.string().trim().max(120).optional(),
    scope: pendingScopeSchema.optional(),
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
      name: z.string().trim().max(120).optional(),
      scope: pendingScopeSchema.optional()
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
      cardReferenceNo: z.string().trim().max(120).optional(),
      upiReferenceNo: z.string().trim().max(120).optional(),
      paymentBreakdown: splitPaymentSchema.optional(),
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

      if (value.paymentMode !== "mixed") {
        return;
      }

      const breakdown = value.paymentBreakdown;
      if (!breakdown) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paymentBreakdown"],
          message: "Split amounts are required for mixed payment."
        });
        return;
      }

      const cashAmount = Number(breakdown.cash ?? 0);
      const cardAmount = Number(breakdown.card ?? 0);
      const upiAmount = Number(breakdown.upi ?? 0);
      const segments = [
        cashAmount > 0 ? "cash" : null,
        cardAmount > 0 ? "card" : null,
        upiAmount > 0 ? "upi" : null
      ].filter(Boolean);

      if (segments.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paymentBreakdown"],
          message: "Mixed payment should include at least two payment methods."
        });
      }

      const splitTotal = cashAmount + cardAmount + upiAmount;
      if (splitTotal <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paymentBreakdown"],
          message: "Split total should be greater than zero."
        });
      }

      if (value.amount !== undefined && Math.abs(splitTotal - value.amount) > 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "Amount should match the mixed split total."
        });
      }

      if (cardAmount > 0 && !value.cardReferenceNo?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cardReferenceNo"],
          message: "Card reference ID is required when card amount is included."
        });
      }

      if (upiAmount > 0 && !value.upiReferenceNo?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["upiReferenceNo"],
          message: "UPI reference ID is required when UPI amount is included."
        });
      }
    }),
  query: z.object({}).optional(),
  params: z.object({}).optional()
});
