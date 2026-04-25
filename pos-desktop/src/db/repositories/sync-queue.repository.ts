import { posStorage } from "@/db/sqlite";
import type { SyncQueueRow } from "@/types/pos";

export const syncQueueRepository = {
  enqueue: (row: SyncQueueRow) => posStorage.enqueueSyncEvent(row),
  listPending: (limit?: number) => posStorage.listSyncQueue(limit),
  listUnresolvedInvoiceNumbers: () => posStorage.listUnresolvedInvoiceNumbers(),
  listUnresolvedGamingBookingNumbers: () => posStorage.listUnresolvedGamingBookingNumbers(),
  updateStatus: (input: {
    id: string;
    status: SyncQueueRow["status"];
    retryCount: number;
    lastError: string | null;
    nextRetryAt: string | null;
  }) => posStorage.updateSyncQueueStatus(input),
  remove: (id: string) => posStorage.removeSyncQueue(id),
  getStats: () => posStorage.getQueueStats()
};
