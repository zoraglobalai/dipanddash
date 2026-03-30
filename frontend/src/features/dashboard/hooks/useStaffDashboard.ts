import { useCallback, useEffect, useState } from "react";

import type { StaffDashboardData } from "@/types/dashboard";
import { dashboardService } from "@/services/dashboard.service";
import { extractErrorMessage } from "@/utils/api-error";

type UseStaffDashboard = {
  data: StaffDashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export const useStaffDashboard = (): UseStaffDashboard => {
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await dashboardService.getStaffDashboard();
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

