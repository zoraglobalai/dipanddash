import { syncQueueRepository } from "@/db/repositories/sync-queue.repository";
import { posSyncApiService } from "@/services/pos-sync-api.service";
import type { SyncQueueRow } from "@/types/pos";

type SyncListener = (state: {
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}) => void;

const MAX_RETRY_BEFORE_ATTENTION = 6;

class SyncEngine {
  private timer: number | null = null;
  private isRunning = false;
  private isSyncing = false;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private listeners = new Set<SyncListener>();

  private emit = async () => {
    const stats = await syncQueueRepository.getStats();
    for (const listener of this.listeners) {
      listener({
        isSyncing: this.isSyncing,
        pendingCount: stats.pending,
        failedCount: stats.failed,
        lastSyncedAt: this.lastSyncedAt,
        lastError: this.lastError
      });
    }
  };

  subscribe(listener: SyncListener) {
    this.listeners.add(listener);
    void this.emit();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private computeNextRetry = (retryCount: number) => {
    const seconds = Math.min(300, Math.max(5, Math.pow(2, retryCount)));
    return new Date(Date.now() + seconds * 1000).toISOString();
  };

  private async markBatchStatus(
    rows: SyncQueueRow[],
    status: SyncQueueRow["status"],
    overrides?: Partial<Pick<SyncQueueRow, "lastError" | "nextRetryAt">>
  ) {
    for (const row of rows) {
      await syncQueueRepository.updateStatus({
        id: row.id,
        status,
        retryCount: row.retryCount,
        lastError: overrides?.lastError ?? row.lastError,
        nextRetryAt: overrides?.nextRetryAt ?? row.nextRetryAt
      });
    }
  }

  async syncNow() {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    await this.emit();

    try {
      const queueRows = await syncQueueRepository.listPending(40);
      if (!queueRows.length) {
        this.lastError = null;
        this.lastSyncedAt = new Date().toISOString();
        return;
      }

      await this.markBatchStatus(queueRows, "syncing", { lastError: null, nextRetryAt: null });
      const response = await posSyncApiService.syncBatch(queueRows.map((row) => row.payload));

      for (const result of response.results) {
        const row = queueRows.find((entry) => entry.idempotencyKey === result.idempotencyKey);
        if (!row) {
          continue;
        }

        if (result.success) {
          await syncQueueRepository.remove(row.id);
          continue;
        }

        const nextRetryCount = row.retryCount + 1;
        const needsAttention = nextRetryCount >= MAX_RETRY_BEFORE_ATTENTION;
        await syncQueueRepository.updateStatus({
          id: row.id,
          status: needsAttention ? "needs_attention" : "failed",
          retryCount: nextRetryCount,
          lastError: result.message || "Sync failed",
          nextRetryAt: needsAttention ? null : this.computeNextRetry(nextRetryCount)
        });
      }

      this.lastError = null;
      this.lastSyncedAt = new Date().toISOString();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sync right now";
      this.lastError = message;

      const queueRows = await syncQueueRepository.listPending(40);
      for (const row of queueRows) {
        const nextRetryCount = row.retryCount + 1;
        const needsAttention = nextRetryCount >= MAX_RETRY_BEFORE_ATTENTION;
        await syncQueueRepository.updateStatus({
          id: row.id,
          status: needsAttention ? "needs_attention" : "failed",
          retryCount: nextRetryCount,
          lastError: message,
          nextRetryAt: needsAttention ? null : this.computeNextRetry(nextRetryCount)
        });
      }
    } finally {
      this.isSyncing = false;
      await this.emit();
    }
  }

  start(intervalMs = 8000) {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    void this.syncNow();
    this.timer = window.setInterval(() => {
      void this.syncNow();
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }
}

export const syncEngine = new SyncEngine();

