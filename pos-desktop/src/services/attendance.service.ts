import { apiClient } from "@/lib/api-client";
import type { AttendanceListData } from "@/types/attendance";

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

type AttendanceQuery = {
  date?: string;
  page?: number;
  limit?: number;
};

type PunchPayload = {
  username: string;
  password: string;
};

export const attendanceService = {
  async punchIn(payload: PunchPayload) {
    const response = await apiClient.post<ApiSuccess<{ record: unknown }>>("/attendance/punch-in", payload);
    return response.data;
  },

  async punchOut(payload: PunchPayload) {
    const response = await apiClient.post<ApiSuccess<{ record: unknown }>>("/attendance/punch-out", payload);
    return response.data;
  },

  async getMyRecords(query: AttendanceQuery): Promise<{ data: AttendanceListData; fromCache: boolean }> {
    const response = await apiClient.get<ApiSuccess<AttendanceListData>>("/attendance/my-records", {
      params: query
    });

    return {
      data: response.data.data,
      fromCache: false
    };
  }
};
