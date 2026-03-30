import type { ApiSuccess } from "@/types/api";
import type { AttendanceListData, AttendanceRecord, PunchPayload } from "@/types/attendance";
import { apiClient } from "@/lib/api-client";

type AttendanceQuery = {
  date?: string;
  name?: string;
  page?: number;
  limit?: number;
};

export const attendanceService = {
  punchIn: async (payload: PunchPayload) => {
    const response = await apiClient.post<ApiSuccess<{ record: AttendanceRecord }>>(
      "/attendance/punch-in",
      payload
    );
    return response.data;
  },
  punchOut: async (payload: PunchPayload) => {
    const response = await apiClient.post<ApiSuccess<{ record: AttendanceRecord }>>(
      "/attendance/punch-out",
      payload
    );
    return response.data;
  },
  getMyRecords: async (query: AttendanceQuery) => {
    const response = await apiClient.get<ApiSuccess<AttendanceListData>>("/attendance/my-records", {
      params: query
    });
    return response.data;
  },
  getAdminRecords: async (query: AttendanceQuery) => {
    const response = await apiClient.get<ApiSuccess<AttendanceListData>>("/attendance/admin-records", {
      params: query
    });
    return response.data;
  }
};
