import { apiClient } from "@/lib/api-client";
import type { ClosingReportSummary, ClosingStatus } from "@/types/pos";

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

type ClosingReportListResponse = {
  reports: ClosingReportSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const closingService = {
  async getStatus() {
    const response = await apiClient.get<ApiSuccess<ClosingStatus>>("/ingredients/closing/status");
    return response.data.data;
  },

  async submitReport(payload: {
    reportDate?: string;
    note?: string;
    rows: Array<{ ingredientId: string; reportedRemainingQuantity: number }>;
  }) {
    const response = await apiClient.post<
      ApiSuccess<{
        report: ClosingReportSummary & { items: Array<Record<string, unknown>> };
        status: ClosingStatus;
      }>
    >("/ingredients/closing/reports", payload);
    return response.data.data;
  },

  async listReports(params?: { date?: string; page?: number; limit?: number }) {
    const response = await apiClient.get<ApiSuccess<ClosingReportListResponse>>("/ingredients/closing/reports", {
      params
    });
    return response.data.data;
  }
};

