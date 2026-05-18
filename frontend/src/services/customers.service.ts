import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type { CustomerListRow, CustomerPagination, CustomerStats } from "@/types/customer";

type CustomerListResponse = {
  customers: CustomerListRow[];
  pagination: CustomerPagination;
};

export const customersService = {
  getStats: async (params?: {
    scope?: "all" | "dip_and_dash" | "snooker";
    topPage?: number;
    topLimit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<CustomerStats>>("/customers/stats", { params });
    return response.data;
  },

  getCustomers: async (params?: {
    search?: string;
    scope?: "all" | "dip_and_dash" | "snooker";
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<CustomerListResponse>>("/customers", { params });
    return response.data;
  }
};
