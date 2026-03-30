import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type { OutletListItem, OutletListResponse } from "@/types/outlet";

export const outletService = {
  getOutlets: async (params?: {
    search?: string;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<OutletListResponse>>("/outlets", { params });
    return response.data;
  },

  createOutlet: async (payload: {
    outletName: string;
    location: string;
    managerName: string;
    managerPhone: string;
    isActive?: boolean;
  }) => {
    const response = await apiClient.post<ApiSuccess<{ outlet: OutletListItem }>>("/outlets", payload);
    return response.data;
  },

  updateOutlet: async (
    id: string,
    payload: {
      outletName?: string;
      location?: string;
      managerName?: string;
      managerPhone?: string;
      isActive?: boolean;
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ outlet: OutletListItem }>>(`/outlets/${id}`, payload);
    return response.data;
  }
};
