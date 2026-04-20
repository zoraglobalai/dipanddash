import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type { CatalogSnapshot } from "@/types/pos-catalog";

export const posCatalogService = {
  getSnapshot: async (params?: { sinceVersion?: string; allocationDate?: string }) => {
    const response = await apiClient.get<ApiSuccess<{ snapshot: CatalogSnapshot }>>("/pos-catalog/snapshot", {
      params
    });
    return response.data;
  }
};
