import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type { CustomerListRow, CustomerPagination, CustomerStats } from "@/types/customer";

type CustomerListResponse = {
  customers: CustomerListRow[];
  pagination: CustomerPagination;
};

export const customersService = {
  getStats: async () => {
    const response = await apiClient.get<ApiSuccess<CustomerStats>>("/customers/stats");
    return response.data;
  },

  getCustomers: async (params?: { search?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiSuccess<CustomerListResponse>>("/customers", { params });
    return response.data;
  }
};
