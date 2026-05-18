import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type { AssetListItem, AssetListResponse, AssetUnit } from "@/types/assets";

export const assetsService = {
  getAssets: async (params?: {
    search?: string;
    section?: "dip_and_dash" | "gaming";
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<AssetListResponse>>("/assets", { params });
    return response.data;
  },

  createAsset: async (payload: {
    name: string;
    section?: "dip_and_dash" | "gaming";
    quantity: number;
    unit: AssetUnit;
    isActive?: boolean;
  }) => {
    const response = await apiClient.post<ApiSuccess<{ asset: AssetListItem }>>("/assets", payload);
    return response.data;
  },

  updateAsset: async (
    id: string,
    payload: {
      name?: string;
      section?: "dip_and_dash" | "gaming";
      quantity?: number;
      unit?: AssetUnit;
      isActive?: boolean;
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ asset: AssetListItem }>>(`/assets/${id}`, payload);
    return response.data;
  },

  deleteAsset: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ asset: AssetListItem }>>(`/assets/${id}`);
    return response.data;
  }
};
