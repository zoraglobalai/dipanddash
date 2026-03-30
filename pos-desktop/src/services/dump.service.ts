import { apiClient } from "@/lib/api-client";
import type { DumpEntryOptions, DumpEntryRecord, DumpEntryType } from "@/types/pos";

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export const dumpService = {
  async getEntryOptions() {
    const response = await apiClient.get<ApiSuccess<DumpEntryOptions>>("/dump/options");
    return response.data.data;
  },

  async submitEntry(payload: {
    entryDate?: string;
    entryType: DumpEntryType;
    sourceId: string;
    quantity: number;
    quantityUnit?: string;
    note?: string;
  }) {
    const response = await apiClient.post<ApiSuccess<{ entry: DumpEntryRecord }>>("/dump/entries", payload);
    return response.data;
  }
};
