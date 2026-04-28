import { apiClient } from "@/lib/api-client";
import { posSyncApiService } from "@/services/pos-sync-api.service";
import type { SyncQueueEvent, SyncQueueRow } from "@/types/pos";

const dispatchEvent = async (event: SyncQueueEvent) => {
  if (event.eventType === "invoice_upsert") {
    await apiClient.post("/invoices/sync-upsert", event.payload);
    return;
  }

  if (event.eventType === "customer_upsert") {
    await apiClient.post("/customers", event.payload);
    return;
  }

  await posSyncApiService.syncBatch([event]);
};

const EMPTY_QUEUE: SyncQueueRow[] = [];
const EMPTY_INVOICES: string[] = [];
const EMPTY_BOOKINGS: string[] = [];

export const syncQueueRepository = {
  enqueue: async (row: SyncQueueRow) => {
    await dispatchEvent(row.payload);
  },
  listPending: async (_limit?: number): Promise<SyncQueueRow[]> => EMPTY_QUEUE,
  listUnresolvedInvoiceNumbers: async (): Promise<string[]> => EMPTY_INVOICES,
  listUnresolvedGamingBookingNumbers: async (): Promise<string[]> => EMPTY_BOOKINGS,
  updateStatus: async (_input: {
    id: string;
    status: SyncQueueRow["status"];
    retryCount: number;
    lastError: string | null;
    nextRetryAt: string | null;
  }) => undefined,
  remove: async (_id: string) => undefined,
  getStats: async () => ({ pending: 0, failed: 0 })
};
