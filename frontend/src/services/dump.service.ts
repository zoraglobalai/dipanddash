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
  },
  updateAdminRecord: async (
    id: string,
    payload: {
      entryDate?: string;
      entryType: "ingredient" | "item" | "product";
      sourceId: string;
      quantity: number;
      quantityUnit?: string;
      note?: string;
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ entry: DumpRecordsResponse["records"][number] }>>(
      `/dump/admin/records/${id}`,
      payload
    );
    return response.data;
  },
  deleteAdminRecord: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ id: string; deleted: boolean }>>(`/dump/admin/records/${id}`);
    return response.data;
  }
};
