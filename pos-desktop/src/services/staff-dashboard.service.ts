import { apiClient } from "@/lib/api-client";
import type { StaffDashboardData } from "@/types/dashboard";

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export const staffDashboardService = {
  async getDashboard(): Promise<{ data: StaffDashboardData; fromCache: boolean }> {
    const response = await apiClient.get<ApiSuccess<StaffDashboardData>>("/dashboard/staff");
    return {
      data: response.data.data,
      fromCache: false
    };
  }
};
