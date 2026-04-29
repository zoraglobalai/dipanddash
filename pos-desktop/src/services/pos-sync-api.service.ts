import type { SyncQueueEvent } from "@/types/pos";

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
    // Legacy endpoint disabled in centralized API mode.
    return {
      summary: {
        total: events.length,
        successful: events.length,
        failed: 0,
        duplicates: 0
      },
      results: events.map((event) => ({
        eventType: event.eventType,
        idempotencyKey: event.idempotencyKey,
        success: true,
        duplicate: false,
        message: "Skipped /pos-sync/batch in centralized mode.",
        entityType: "none",
        entityId: null
      }))
    } satisfies SyncBatchResponse;
  },

  async getStatus(_deviceId?: string) {
    return {
      totalEvents: 0,
      processedEvents: 0,
      failedEvents: 0,
      lastProcessedAt: null
    };
  }
};
