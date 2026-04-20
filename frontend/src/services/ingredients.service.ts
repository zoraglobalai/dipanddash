import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  BulkIngredientImportSummary,
  IngredientAllocationStats,
  IngredientCategory,
  IngredientListItem,
  IngredientStockDetails,
  IngredientStockLog,
  IngredientCategoryKind,
  PosBillingControl,
  IngredientUnit,
  PaginationData,
  StockAuditData
} from "@/types/ingredient";

type CategoryListResponse = {
  categories: IngredientCategory[];
  pagination: PaginationData;
};

type IngredientListResponse = {
  ingredients: IngredientListItem[];
  pagination: PaginationData;
};

type StockResponse = {
  stock: IngredientStockDetails;
  logs: IngredientStockLog[];
  pagination: PaginationData;
};

type AllocationStatsResponse = IngredientAllocationStats;
type StockAuditResponse = StockAuditData;
type BulkImportResponse = BulkIngredientImportSummary;

export const ingredientsService = {
  getCategories: async (params?: {
    search?: string;
    kind?: IngredientCategoryKind;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<CategoryListResponse>>("/ingredients/categories", { params });
    return response.data;
  },
  createCategory: async (payload: { name: string; description?: string; kind?: IngredientCategoryKind }) => {
    const response = await apiClient.post<ApiSuccess<{ category: IngredientCategory }>>(
      "/ingredients/categories",
      payload
    );
    return response.data;
  },
  updateCategory: async (
    id: string,
    payload: { name?: string; description?: string; kind?: IngredientCategoryKind; isActive?: boolean }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ category: IngredientCategory }>>(
      `/ingredients/categories/${id}`,
      payload
    );
    return response.data;
  },
  deleteCategory: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ category: IngredientCategory }>>(
      `/ingredients/categories/${id}`
    );
    return response.data;
  },
  getIngredients: async (params?: {
    search?: string;
    categoryId?: string;
    categoryKind?: IngredientCategoryKind;
    includeInactive?: boolean;
    withMovementStats?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<IngredientListResponse>>("/ingredients", { params });
    return response.data;
  },
  createIngredient: async (payload: {
    name: string;
    categoryId: string;
    unit: IngredientUnit;
    perUnitPrice?: number;
    minStock: number;
    currentStock?: number;
  }) => {
    const response = await apiClient.post<ApiSuccess<{ ingredient: IngredientListItem }>>("/ingredients", payload);
    return response.data;
  },
  updateIngredient: async (
    id: string,
    payload: {
      name?: string;
      categoryId?: string;
      unit?: IngredientUnit;
      perUnitPrice?: number;
      minStock?: number;
      currentStock?: number;
      isActive?: boolean;
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ ingredient: IngredientListItem }>>(
      `/ingredients/${id}`,
      payload
    );
    return response.data;
  },
  deleteIngredient: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ ingredient: IngredientListItem }>>(`/ingredients/${id}`);
    return response.data;
  },
  getIngredientStock: async (ingredientId: string, params?: { page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiSuccess<StockResponse>>(`/ingredients/${ingredientId}/stock`, { params });
    return response.data;
  },
  addStock: async (ingredientId: string, payload: { quantity: number; note?: string }) => {
    const response = await apiClient.post<ApiSuccess<{ stock: IngredientStockDetails }>>(
      `/ingredients/${ingredientId}/stock/add`,
      payload
    );
    return response.data;
  },
  adjustStock: async (ingredientId: string, payload: { quantity: number; note?: string }) => {
    const response = await apiClient.post<ApiSuccess<{ stock: IngredientStockDetails }>>(
      `/ingredients/${ingredientId}/stock/adjust`,
      payload
    );
    return response.data;
  },
  getAllocationStats: async (params: {
    date?: string;
    search?: string;
    categoryId?: string;
    categoryKind?: IngredientCategoryKind;
  }) => {
    const response = await apiClient.get<ApiSuccess<AllocationStatsResponse>>("/ingredients/allocations/stats", {
      params
    });
    return response.data;
  },
  getStockAudit: async (params: { dateFrom?: string; dateTo?: string; staffId?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiSuccess<StockAuditResponse>>("/ingredients/stock-audit", { params });
    return response.data;
  },
  getPosBillingControl: async () => {
    const response = await apiClient.get<ApiSuccess<PosBillingControl>>("/ingredients/pos-billing-control");
    return response.data;
  },
  updatePosBillingControl: async (payload: {
    isBillingEnabled?: boolean;
    enforceDailyAllocation?: boolean;
    enforceIngredientStock?: boolean;
    reason?: string;
  }) => {
    const response = await apiClient.patch<ApiSuccess<PosBillingControl>>("/ingredients/pos-billing-control", payload);
    return response.data;
  },
  reopenClosingReport: async (reportId: string) => {
    const response = await apiClient.post<
      ApiSuccess<{
        reopened: {
          id: string;
          staffId: string;
          reportDate: string;
          reopenedByUserId: string;
        };
      }>
    >(`/ingredients/closing/reports/${reportId}/reopen`);
    return response.data;
  },
  downloadBulkTemplate: async (kind?: IngredientCategoryKind) => {
    return apiClient.get<Blob>("/ingredients/bulk/template", {
      params: kind ? { kind } : undefined,
      responseType: "blob"
    });
  },
  bulkImportIngredients: async (file: File, kind?: IngredientCategoryKind) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.post<ApiSuccess<BulkImportResponse>>("/ingredients/bulk/import", formData, {
      params: kind ? { kind } : undefined,
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });
    return response.data;
  }
};
