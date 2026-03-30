export type CouponDiscountType = "percentage" | "fixed_amount" | "free_item";
export type CouponDerivedStatus = "active" | "disabled" | "scheduled" | "expired";

export type OfferPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type OfferItemCategoryMeta = {
  id: string;
  name: string;
};

export type OfferItemMeta = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  sellingPrice: number;
};

export type CouponListItem = {
  id: string;
  couponCode: string;
  title: string | null;
  description: string | null;
  discountType: CouponDiscountType;
  discountValue: number | null;
  minimumOrderAmount: number | null;
  maximumDiscountAmount: number | null;
  maxUses: number | null;
  usagePerUserLimit: number | null;
  firstTimeUserOnly: boolean;
  isActive: boolean;
  validFrom: string;
  validUntil: string;
  freeItemCategoryId: string | null;
  freeItemCategoryName: string | null;
  freeItemId: string | null;
  freeItemName: string | null;
  rewardPreview: string;
  derivedStatus: CouponDerivedStatus;
  currentUsageCount: number;
  remainingUses: number | null;
  usagePercentage: number | null;
  internalNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CouponDetail = CouponListItem;

export type CouponUsageRow = {
  id: string;
  userId: string | null;
  userName: string;
  username: string;
  email: string | null;
  couponCode: string;
  orderReference: string;
  discountAmountApplied: number | null;
  freeItemId: string | null;
  freeItemName: string | null;
  benefitText: string;
  usedAt: string;
  createdAt: string;
};

export type CouponUsageSummary = {
  couponId: string;
  couponCode: string;
  maxUses: number | null;
  currentUsageCount: number;
  remainingUses: number | null;
  usagePercentage: number | null;
};

export type OfferStats = {
  totalCoupons: number;
  activeCoupons: number;
  expiredCoupons: number;
  scheduledCoupons: number;
  disabledCoupons: number;
  totalCouponUsages: number;
  freeItemCoupons: number;
};

