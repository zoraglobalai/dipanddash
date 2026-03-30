export const COUPON_DISCOUNT_TYPES = ["percentage", "fixed_amount", "free_item"] as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

export const COUPON_DERIVED_STATUSES = ["active", "disabled", "scheduled", "expired"] as const;
export type CouponDerivedStatus = (typeof COUPON_DERIVED_STATUSES)[number];

