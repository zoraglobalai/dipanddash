import { apiClient } from "@/lib/api-client";
import type {
  OutletTransferLineType,
  OutletTransferListResponse,
  OutletTransferOptions,
  OutletTransferRecord
} from "@/types/pos";

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export const outletTransferService = {
  async getOptions(fromOutletId?: string) {
    const response = await apiClient.get<ApiSuccess<OutletTransferOptions>>("/outlet-transfers/options", {
      params: {
        fromOutletId: fromOutletId || undefined
      }
    });
    return response.data.data;
  },

  async getRecords(params?: {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    outletId?: string;
    fromOutletId?: string;
    toOutletId?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiSuccess<OutletTransferListResponse>>("/outlet-transfers/records", {
      params
    });
    return response.data.data;
  },

  async createTransfer(payload: {
    transferDate?: string;
    fromOutletId: string;
    toOutletId: string;
    note?: string;
    lines: Array<{
      lineType: OutletTransferLineType;
      sourceId: string;
      quantity: number;
    }>;
  }) {
    const response = await apiClient.post<ApiSuccess<{ transfer: OutletTransferRecord }>>("/outlet-transfers", payload);
    return response.data;
  }
};
