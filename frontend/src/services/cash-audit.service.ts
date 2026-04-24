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
  },

  updateAdminRecord: async (
    id: string,
    payload: {
      auditDate?: string;
      denominationCounts?: Record<string, number>;
      staffCashTakenAmount?: number;
      note?: string | null;
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ record: CashAuditRecordsResponse["records"][number] }>>(
      `/cash-audit/admin/records/${id}`,
      payload
    );
    return response.data;
  },

  deleteAdminRecord: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ deletedRecord: { id: string; auditDate: string } }>>(
      `/cash-audit/admin/records/${id}`
    );
    return response.data;
  }
};
