import type { ApiSuccess } from "@/types/api";
import type { AdminDashboardData, StaffDashboardData } from "@/types/dashboard";
import type { SalesStatsResponse } from "@/types/sales-stats";
import { apiClient } from "@/lib/api-client";

export const dashboardService = {
  getAdminDashboard: async () => {
    const response = await apiClient.get<ApiSuccess<AdminDashboardData>>("/dashboard/admin");
    return response.data;
  },
  getStaffDashboard: async () => {
    const response = await apiClient.get<ApiSuccess<StaffDashboardData>>("/dashboard/staff");
    return response.data;
  },
  getSalesStats: async (params?: { dateFrom?: string; dateTo?: string }) => {
    const response = await apiClient.get<ApiSuccess<SalesStatsResponse>>("/dashboard/sales-stats", {
      params
    });
    return response.data;
  }
};
