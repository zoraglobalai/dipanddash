import { apiClient } from "@/lib/api-client";
import type {
  PendingCollectResponse,
  PendingCustomerDetails,
  PendingCustomersResponse,
  PendingSourceType
} from "@/types/pending";

type ApiSuccess<T> = {
  success: boolean;
  message: string;
  data: T;
};

export const pendingService = {
  async listCustomers(params?: { search?: string; page?: number; limit?: number; scope?: "all" | "dip_and_dash" | "snooker" }) {
    const safePage = Math.max(1, Number(params?.page ?? 1) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(params?.limit ?? 10) || 10));
    const response = await apiClient.get<ApiSuccess<PendingCustomersResponse>>("/pending/customers", {
      params: {
        ...params,
        page: safePage,
        limit: safeLimit
      }
    });
    return response.data;
  },

  async getCustomerDetails(params: { phone?: string; name?: string; scope?: "all" | "dip_and_dash" | "snooker" }) {
    const response = await apiClient.get<ApiSuccess<PendingCustomerDetails>>("/pending/customer-details", { params });
    return response.data;
  },

  async collectAmount(payload: {
    sourceType: PendingSourceType;
    sourceId: string;
    paymentMode: "cash" | "card" | "upi";
    amount?: number;
    referenceNo?: string;
    note?: string;
  }) {
    const response = await apiClient.post<ApiSuccess<PendingCollectResponse>>("/pending/collect", payload);
    return response.data;
  }
};
