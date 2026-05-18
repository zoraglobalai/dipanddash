import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  CreateProductConsumptionInput,
  ProductConsumptionImportHistoryResponse,
  ProductConsumptionImportResult,
  ProductConsumptionListResponse
} from "@/types/product-consumption";

export const productConsumptionService = {
  getConsumptions: async (params?: {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<ProductConsumptionListResponse>>("/product-consumption", {
      params
    });
    return response.data;
  },

  createConsumption: async (payload: CreateProductConsumptionInput) => {
    const response = await apiClient.post<ApiSuccess<{ invoice: { id: string; invoiceNumber: string } }>>(
      "/product-consumption",
      payload
    );
    return response.data;
  },

  downloadTemplate: async () => {
    return apiClient.get<Blob>("/product-consumption/bulk/template", {
      responseType: "blob"
    });
  },

  importFile: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.post<ApiSuccess<ProductConsumptionImportResult>>(
      "/product-consumption/bulk/import",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      }
    );
    return response.data;
  },

  getImportHistory: async (params?: { page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiSuccess<ProductConsumptionImportHistoryResponse>>(
      "/product-consumption/bulk/history",
      { params }
    );
    return response.data;
  },

  deleteImportHistory: async (id: string) => {
    const response = await apiClient.delete<
      ApiSuccess<{
        importId: string;
        deletedInvoices: number;
        deletedLines: number;
        restoredStockQuantity: number;
      }>
    >(`/product-consumption/bulk/history/${id}`);
    return response.data;
  }
};
