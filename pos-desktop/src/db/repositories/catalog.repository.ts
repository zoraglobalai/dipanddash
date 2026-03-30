import { posStorage } from "@/db/sqlite";
import type { CatalogSnapshot } from "@/types/pos";

export const catalogRepository = {
  getSnapshot: () => posStorage.getCatalogSnapshot(),
  saveSnapshot: (snapshot: CatalogSnapshot) => posStorage.saveCatalogSnapshot(snapshot)
};

