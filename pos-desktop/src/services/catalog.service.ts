import { catalogRepository } from "@/db/repositories/catalog.repository";
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

export const catalogService = {
  async getLocalSnapshot() {
    return catalogRepository.getSnapshot();
  },

  async pullSnapshot(input?: { sinceVersion?: string; allocationDate?: string }) {
    const response = await apiClient.get<ApiSuccess<SnapshotResponse>>("/pos-catalog/snapshot", {
      params: input
    });
    const snapshot = response.data.data.snapshot;
    await catalogRepository.saveSnapshot(snapshot);
    return snapshot;
  },

  async ensureSnapshot() {
    const local = await catalogRepository.getSnapshot();
    try {
      const fresh = await this.pullSnapshot({
        sinceVersion: undefined,
        allocationDate: new Date().toISOString().slice(0, 10)
      });
      return fresh;
    } catch {
      return local;
    }
  }
};
