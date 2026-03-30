import { apiClient } from "@/lib/api-client";
import type { PosGeneratedReport, PosReportCatalogItem } from "@/types/report";

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

type ReportCatalogResponse = {
  reports: PosReportCatalogItem[];
};

type GenerateReportParams = {
  reportKey: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export const reportsService = {
  async getCatalog() {
    const response = await apiClient.get<ApiSuccess<ReportCatalogResponse>>("/reports/catalog");
    return response.data;
  },
  async generate(params: GenerateReportParams) {
    const response = await apiClient.get<ApiSuccess<PosGeneratedReport>>("/reports/generate", {
      params
    });
    return response.data;
  }
};

