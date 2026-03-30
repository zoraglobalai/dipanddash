import { apiClient } from "@/lib/api-client";
import { settingsRepository } from "@/db/repositories/settings.repository";
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

const ATTENDANCE_CACHE_KEY = "attendance_cache_latest";

const makeCacheKey = (query: AttendanceQuery) =>
  `${ATTENDANCE_CACHE_KEY}_${query.date ?? "any"}_${query.page ?? 1}_${query.limit ?? 5}`;

const saveCache = async (key: string, data: AttendanceListData) => {
  await settingsRepository.set(key, JSON.stringify(data));
};

const getCache = async (key: string): Promise<AttendanceListData | null> => {
  const raw = await settingsRepository.get(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AttendanceListData;
  } catch {
    return null;
  }
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
    const cacheKey = makeCacheKey(query);
    try {
      const response = await apiClient.get<ApiSuccess<AttendanceListData>>("/attendance/my-records", {
        params: query
      });
      await saveCache(cacheKey, response.data.data);
      return {
        data: response.data.data,
        fromCache: false
      };
    } catch (error) {
      const cached = await getCache(cacheKey);
      if (!cached) {
        throw error;
      }
      return {
        data: cached,
        fromCache: true
      };
    }
  }
};

