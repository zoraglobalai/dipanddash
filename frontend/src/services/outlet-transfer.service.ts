import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type { OutletTransferListResponse } from "@/types/outlet-transfer";

export const outletTransferService = {
  getRecords: async (params?: {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    outletId?: string;
    fromOutletId?: string;
    toOutletId?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<OutletTransferListResponse>>("/outlet-transfers/records", { params });
    return response.data;
  }
};
