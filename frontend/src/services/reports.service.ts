import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type { GeneratedReportResponse, ReportCatalogResponse } from "@/types/report";

type GenerateReportParams = {
  reportKey: string;
  businessScope?: "snooker" | "dip_and_dash";
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  outletId?: string;
  customerId?: string;
  page?: number;
  limit?: number;
};

type StockConsumptionExportParams = {
  businessScope?: "snooker" | "dip_and_dash";
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  outletId?: string;
  format: "excel" | "pdf";
};

export const reportsService = {
  async getCatalog() {
    const response = await apiClient.get<ApiSuccess<ReportCatalogResponse>>("/reports/catalog");
    return response.data;
  },
  async generate(params: GenerateReportParams) {
    const response = await apiClient.get<ApiSuccess<GeneratedReportResponse>>("/reports/generate", {
      params
    });
    return response.data;
  },
  async exportStockConsumption(params: StockConsumptionExportParams) {
    return apiClient.get<Blob>("/reports/stock-consumption/export", {
      params,
      responseType: "blob"
    });
  }
};
