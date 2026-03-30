import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type { DumpEntryOptionsResponse, DumpRecordsResponse, DumpStatsResponse } from "@/types/dump";

export const dumpService = {
  getEntryOptions: async () => {
    const response = await apiClient.get<ApiSuccess<DumpEntryOptionsResponse>>("/dump/options");
    return response.data;
  },
  getAdminRecords: async (params?: {
    dateFrom?: string;
    dateTo?: string;
    entryType?: "ingredient" | "item" | "product";
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<DumpRecordsResponse>>("/dump/admin/records", { params });
    return response.data;
  },
  getAdminStats: async (params?: {
    dateFrom?: string;
    dateTo?: string;
    entryType?: "ingredient" | "item" | "product";
    search?: string;
  }) => {
    const response = await apiClient.get<ApiSuccess<DumpStatsResponse>>("/dump/admin/stats", { params });
    return response.data;
  }
};
