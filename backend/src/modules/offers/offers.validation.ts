import { z } from "zod";

import { COUPON_DERIVED_STATUSES, COUPON_DISCOUNT_TYPES } from "./offers.constants";

const discountTypeSchema = z.enum(COUPON_DISCOUNT_TYPES);
const statusSchema = z.enum(COUPON_DERIVED_STATUSES);

const nullableAmountSchema = z.preprocess((value) => {
  if (value === "" || value === undefined) {
    return null;
  }
  return value;
}, z.coerce.number().min(0).nullable());

const nullablePositiveIntSchema = z.preprocess((value) => {
  if (value === "" || value === undefined) {
    return null;
  }
  return value;
}, z.coerce.number().int().positive().nullable());

const couponBodySchema = z.object({
  couponCode: z.string().trim().min(2, "Please enter a coupon code").max(60),
  title: z.string().trim().max(140).optional(),
  description: z.string().trim().max(600).optional(),
  discountType: discountTypeSchema,
  discountValue: nullableAmountSchema.optional(),
  minimumOrderAmount: nullableAmountSchema.optional(),
  maximumDiscountAmount: nullableAmountSchema.optional(),
  maxUses: nullablePositiveIntSchema.optional(),
  usagePerUserLimit: nullablePositiveIntSchema.optional(),
  firstTimeUserOnly: z.boolean().optional(),
  isActive: z.boolean().optional(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
  freeItemCategoryId: z.string().uuid("Invalid free item category").nullable().optional(),
  freeItemId: z.string().uuid("Invalid free item").nullable().optional(),
  internalNote: z.string().trim().max(500).optional()
});

export const listCouponsSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    discountType: discountTypeSchema.optional(),
    status: statusSchema.optional(),
    firstTimeUserOnly: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10)
  })
});

export const getCouponSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid coupon id")
  })
});

export const createCouponSchema = z.object({
  body: couponBodySchema
});

export const updateCouponSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid coupon id")
  }),
  body: couponBodySchema
    .partial()
    .refine((value) => Object.keys(value).length > 0, "At least one field must be provided")
});

export const updateCouponStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid coupon id")
  }),
  body: z.object({
    isActive: z.boolean()
  })
});

export const deleteCouponSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid coupon id")
  })
});

export const listCouponUsagesSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid coupon id")
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10)
  })
});

export const getMetaItemsSchema = z.object({
  query: z.object({
    categoryId: z.string().uuid("Invalid item category").optional()
  })
});

