import { useCallback, useEffect, useState } from "react";

import type { AdminDashboardData } from "@/types/dashboard";
import { dashboardService } from "@/services/dashboard.service";
import { extractErrorMessage } from "@/utils/api-error";

type UseAdminDashboard = {
  data: AdminDashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export const useAdminDashboard = (): UseAdminDashboard => {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await dashboardService.getAdminDashboard();
      setData(response.data);
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to fetch dashboard data right now"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
};

