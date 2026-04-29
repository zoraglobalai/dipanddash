import { syncQueueRepository } from "@/db/repositories/sync-queue.repository";
import { ordersSyncService } from "@/services/orders-sync.service";

type SyncListener = (state: {
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}) => void;

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

  private async pullServerOrdersSafe() {
    try {
      await ordersSyncService.pullFromServer(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh server orders";
      this.lastError = message;
    }
  }

  async syncNow() {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    await this.emit();

    try {
      // Centralized API mode: queue rows are dispatched directly at enqueue time.
      await this.pullServerOrdersSafe();
      this.lastError = null;
      this.lastSyncedAt = new Date().toISOString();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sync right now";
      this.lastError = message;
    } finally {
      this.isSyncing = false;
      await this.emit();
    }
  }

  start() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    void this.syncNow();
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
