import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  PendingCollectResponse,
  PendingCustomerDetails,
  PendingCustomersResponse,
  PendingCollectPaymentMode,
  PendingSourceType,
  PendingScope
} from "@/types/pending";

export const pendingService = {
  listCustomers: async (params?: { search?: string; page?: number; limit?: number; scope?: PendingScope }) => {
    const response = await apiClient.get<ApiSuccess<PendingCustomersResponse>>("/pending/customers", { params });
    return response.data;
  },

  getCustomerDetails: async (params: { phone?: string; name?: string; scope?: PendingScope }) => {
    const response = await apiClient.get<ApiSuccess<PendingCustomerDetails>>("/pending/customer-details", { params });
    return response.data;
  },

  collectAmount: async (payload: {
    sourceType: PendingSourceType;
    sourceId: string;
    paymentMode: PendingCollectPaymentMode;
    amount?: number;
    referenceNo?: string;
    cardReferenceNo?: string;
    upiReferenceNo?: string;
    paymentBreakdown?: {
      cash?: number;
      card?: number;
      upi?: number;
    };
    note?: string;
  }) => {
    const response = await apiClient.post<ApiSuccess<PendingCollectResponse>>("/pending/collect", payload);
    return response.data;
  }
};
