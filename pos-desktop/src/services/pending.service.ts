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
  async listCustomers(params?: { search?: string; page?: number; limit?: number }) {
    const response = await apiClient.get<ApiSuccess<PendingCustomersResponse>>("/pending/customers", { params });
    return response.data;
  },

  async getCustomerDetails(params: { phone?: string; name?: string }) {
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

