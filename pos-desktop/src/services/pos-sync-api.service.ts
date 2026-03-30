import { apiClient } from "@/lib/api-client";
import type { SyncQueueEvent } from "@/types/pos";

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

type SyncBatchResponse = {
  summary: {
    total: number;
    successful: number;
    failed: number;
    duplicates: number;
  };
  results: Array<{
    eventType: SyncQueueEvent["eventType"];
    idempotencyKey: string;
    success: boolean;
    duplicate?: boolean;
    message: string;
    entityType?: string;
    entityId?: string | null;
  }>;
};

export const posSyncApiService = {
  async syncBatch(events: SyncQueueEvent[]) {
    const response = await apiClient.post<ApiSuccess<SyncBatchResponse>>("/pos-sync/batch", { events });
    return response.data.data;
  },

  async getStatus(deviceId?: string) {
    const response = await apiClient.get<
      ApiSuccess<{
        totalEvents: number;
        processedEvents: number;
        failedEvents: number;
        lastProcessedAt: string | null;
      }>
    >("/pos-sync/status", { params: { deviceId } });
    return response.data.data;
  }
};

