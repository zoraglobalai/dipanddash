import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type { CashAuditRecordsResponse, CashAuditStatsResponse } from "@/types/cash-audit";

export const cashAuditService = {
  getAdminStats: async (params?: { dateFrom?: string; dateTo?: string; section?: "dip_and_dash" | "gaming" }) => {
    const response = await apiClient.get<ApiSuccess<CashAuditStatsResponse>>("/cash-audit/admin/stats", { params });
    return response.data;
  },

  getAdminRecords: async (params?: {
    dateFrom?: string;
    dateTo?: string;
    section?: "dip_and_dash" | "gaming";
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<CashAuditRecordsResponse>>("/cash-audit/admin/records", {
      params
    });
    return response.data;
  }
};
