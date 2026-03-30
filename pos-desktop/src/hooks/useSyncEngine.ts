import { useEffect, useState } from "react";

import { syncEngine } from "@/sync/sync-engine";

type SyncState = {
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
};

const initialState: SyncState = {
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  lastSyncedAt: null,
  lastError: null
};

export const useSyncEngine = () => {
  const [state, setState] = useState<SyncState>(initialState);

  useEffect(() => {
    syncEngine.start();
    const unsubscribe = syncEngine.subscribe((nextState) => {
      setState(nextState);
    });

    return () => {
      unsubscribe();
      syncEngine.stop();
    };
  }, []);

  return {
    ...state,
    syncNow: () => syncEngine.syncNow()
  };
};

