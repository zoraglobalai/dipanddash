import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  CouponDetail,
  CouponDiscountType,
  CouponListItem,
  CouponUsageRow,
  CouponUsageSummary,
  OfferItemCategoryMeta,
  OfferItemMeta,
  OfferPagination,
  OfferStats
} from "@/types/offer";

type CouponListResponse = {
  coupons: CouponListItem[];
  pagination: OfferPagination;
};

type CouponUsageResponse = {
  summary: CouponUsageSummary;
  usages: CouponUsageRow[];
  pagination: OfferPagination;
};

export const offersService = {
  getCoupons: async (params?: {
    search?: string;
    discountType?: CouponDiscountType;
    status?: "active" | "disabled" | "scheduled" | "expired";
    firstTimeUserOnly?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<CouponListResponse>>("/offers/coupons", { params });
    return response.data;
  },

  getCoupon: async (id: string) => {
    const response = await apiClient.get<ApiSuccess<{ coupon: CouponDetail }>>(`/offers/coupons/${id}`);
    return response.data;
  },

  createCoupon: async (payload: {
    couponCode: string;
    title?: string;
    description?: string;
    discountType: CouponDiscountType;
    discountValue?: number | null;
    minimumOrderAmount?: number | null;
    maximumDiscountAmount?: number | null;
    maxUses?: number | null;
    usagePerUserLimit?: number | null;
    firstTimeUserOnly?: boolean;
    isActive?: boolean;
    validFrom: string;
    validUntil: string;
    freeItemCategoryId?: string | null;
    freeItemId?: string | null;
    internalNote?: string;
  }) => {
    const response = await apiClient.post<ApiSuccess<{ coupon: CouponDetail }>>("/offers/coupons", payload);
    return response.data;
  },

  updateCoupon: async (
    id: string,
    payload: {
      couponCode?: string;
      title?: string;
      description?: string;
      discountType?: CouponDiscountType;
      discountValue?: number | null;
      minimumOrderAmount?: number | null;
      maximumDiscountAmount?: number | null;
      maxUses?: number | null;
      usagePerUserLimit?: number | null;
      firstTimeUserOnly?: boolean;
      isActive?: boolean;
      validFrom?: string;
      validUntil?: string;
      freeItemCategoryId?: string | null;
      freeItemId?: string | null;
      internalNote?: string;
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ coupon: CouponDetail }>>(`/offers/coupons/${id}`, payload);
    return response.data;
  },

  updateCouponStatus: async (id: string, isActive: boolean) => {
    const response = await apiClient.patch<ApiSuccess<{ coupon: CouponDetail }>>(
      `/offers/coupons/${id}/status`,
      { isActive }
    );
    return response.data;
  },

  deleteCoupon: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ coupon: { id: string; couponCode: string } }>>(
      `/offers/coupons/${id}`
    );
    return response.data;
  },

  getCouponUsages: async (couponId: string, params?: { page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiSuccess<CouponUsageResponse>>(`/offers/coupons/${couponId}/usages`, {
      params
    });
    return response.data;
  },

  getStats: async () => {
    const response = await apiClient.get<ApiSuccess<{ stats: OfferStats }>>("/offers/stats");
    return response.data;
  },

  getItemCategoriesMeta: async () => {
    const response = await apiClient.get<ApiSuccess<{ itemCategories: OfferItemCategoryMeta[] }>>(
      "/offers/meta/item-categories"
    );
    return response.data;
  },

  getItemsMeta: async (params?: { categoryId?: string }) => {
    const response = await apiClient.get<ApiSuccess<{ items: OfferItemMeta[] }>>("/offers/meta/items", {
      params
    });
    return response.data;
  }
};

