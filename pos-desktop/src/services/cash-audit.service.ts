import { apiClient } from "@/lib/api-client";
import type { CashAuditEntry, CashAuditExpectedBreakdown, CashAuditLastInfo } from "@/types/pos";

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export const cashAuditService = {
  async getLastAuditInfo() {
    const response = await apiClient.get<ApiSuccess<CashAuditLastInfo>>("/cash-audit/staff/last");
    return response.data.data;
  },

  async getExpectedBreakdown(params?: { auditDate?: string }) {
    const response = await apiClient.get<ApiSuccess<CashAuditExpectedBreakdown>>("/cash-audit/staff/expected", {
      params
    });
    return response.data.data;
  },

  async submitEntry(payload: {
    auditDate?: string;
    denominationCounts: Record<string, number>;
    staffCashTakenAmount: number;
    note?: string;
    adminPassword: string;
  }) {
    const response = await apiClient.post<ApiSuccess<{ entry: CashAuditEntry }>>("/cash-audit/entries", payload);
    return response.data;
  }
};
