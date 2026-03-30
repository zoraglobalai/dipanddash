import type { ApiSuccess } from "@/types/api";
import type { AuthUser, LoginPayload } from "@/types/auth";
import { apiClient } from "@/lib/api-client";

export const authService = {
  login: async (payload: LoginPayload) => {
    const response = await apiClient.post<ApiSuccess<{ user: AuthUser }>>(
      "/auth/login",
      payload,
      {
        headers: {
          "X-Skip-Auth-Handler": "true",
          "X-Skip-Auth-Refresh": "true"
        }
      }
    );
    return response.data;
  },
  refresh: async () => {
    const response = await apiClient.post<ApiSuccess<{ user: AuthUser }>>(
      "/auth/refresh",
      {},
      {
        headers: {
          "X-Skip-Auth-Refresh": "true",
          "X-Skip-Auth-Handler": "true"
        }
      }
    );
    return response.data;
  },
  logout: async () => {
    const response = await apiClient.post<ApiSuccess<null>>(
      "/auth/logout",
      {},
      {
        headers: {
          "X-Skip-Auth-Handler": "true",
          "X-Skip-Auth-Refresh": "true"
        }
      }
    );
    return response.data;
  },
  logoutAll: async () => {
    const response = await apiClient.post<ApiSuccess<null>>(
      "/auth/logout-all",
      {},
      {
        headers: {
          "X-Skip-Auth-Handler": "true"
        }
      }
    );
    return response.data;
  },
  me: async () => {
    const response = await apiClient.get<ApiSuccess<{ user: AuthUser }>>("/auth/me");
    return response.data;
  }
};
