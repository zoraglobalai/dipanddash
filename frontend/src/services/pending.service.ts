import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  PendingCollectResponse,
  PendingCustomerDetails,
  PendingCustomersResponse,
  PendingSourceType
} from "@/types/pending";

export const pendingService = {
  listCustomers: async (params?: { search?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiSuccess<PendingCustomersResponse>>("/pending/customers", { params });
    return response.data;
  },

  getCustomerDetails: async (params: { phone?: string; name?: string }) => {
    const response = await apiClient.get<ApiSuccess<PendingCustomerDetails>>("/pending/customer-details", { params });
    return response.data;
  },

  collectAmount: async (payload: {
    sourceType: PendingSourceType;
    sourceId: string;
    paymentMode: "cash" | "card" | "upi";
    amount?: number;
    referenceNo?: string;
    note?: string;
  }) => {
    const response = await apiClient.post<ApiSuccess<PendingCollectResponse>>("/pending/collect", payload);
    return response.data;
  }
};

