import { apiClient } from "@/lib/api-client";
import type { CatalogSnapshot } from "@/types/pos";

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

type SnapshotResponse = {
  snapshot: CatalogSnapshot;
};

let runtimeSnapshot: CatalogSnapshot | null = null;

export const catalogService = {
  async getLocalSnapshot() {
    return runtimeSnapshot;
  },

  async pullSnapshot(input?: { sinceVersion?: string; allocationDate?: string }) {
    const response = await apiClient.get<ApiSuccess<SnapshotResponse>>("/pos-catalog/snapshot", {
      params: input
    });
    const snapshot = response.data.data.snapshot;
    runtimeSnapshot = snapshot;
    return snapshot;
  },

  async ensureSnapshot() {
    try {
      return await this.pullSnapshot({
        sinceVersion: undefined,
        allocationDate: new Date().toISOString().slice(0, 10)
      });
    } catch {
      return runtimeSnapshot;
    }
  }
};
