import { apiClient } from "@/lib/api-client";
import { settingsRepository } from "@/db/repositories/settings.repository";
import type { StaffDashboardData } from "@/types/dashboard";

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

const DASHBOARD_CACHE_KEY = "staff_dashboard_cache";

export const staffDashboardService = {
  async getDashboard(): Promise<{ data: StaffDashboardData; fromCache: boolean }> {
    try {
      const response = await apiClient.get<ApiSuccess<StaffDashboardData>>("/dashboard/staff");
      await settingsRepository.set(DASHBOARD_CACHE_KEY, JSON.stringify(response.data.data));
      return {
        data: response.data.data,
        fromCache: false
      };
    } catch (error) {
      const cacheRaw = await settingsRepository.get(DASHBOARD_CACHE_KEY);
      if (!cacheRaw) {
        throw error;
      }

      try {
        return {
          data: JSON.parse(cacheRaw) as StaffDashboardData,
          fromCache: true
        };
      } catch {
        throw error;
      }
    }
  }
};

