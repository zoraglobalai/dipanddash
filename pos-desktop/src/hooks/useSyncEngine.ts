export const useSyncEngine = () => {
  return {
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    lastSyncedAt: null as string | null,
    lastError: null as string | null,
    syncNow: async () => undefined
  };
};
