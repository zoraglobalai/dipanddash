import type { ApiSuccess } from "@/types/api";
import type { CreateStaffPayload, Staff, UpdateStaffPayload } from "@/types/staff";
import { apiClient } from "@/lib/api-client";

export const staffService = {
  list: async (search?: string) => {
    const response = await apiClient.get<ApiSuccess<{ staff: Staff[] }>>("/staff", {
      params: search ? { search } : undefined
    });
    return response.data;
  },
  create: async (payload: CreateStaffPayload) => {
    const response = await apiClient.post<ApiSuccess<{ staff: Staff }>>("/staff", payload);
    return response.data;
  },
  update: async (id: string, payload: UpdateStaffPayload) => {
    const response = await apiClient.patch<ApiSuccess<{ staff: Staff }>>(`/staff/${id}`, payload);
    return response.data;
  },
  updateStatus: async (id: string, isActive: boolean) => {
    const response = await apiClient.patch<ApiSuccess<{ staff: Staff }>>(`/staff/${id}/status`, {
      isActive
    });
    return response.data;
  },
  resetPassword: async (id: string, password: string) => {
    const response = await apiClient.patch<ApiSuccess<{ staff: Staff }>>(`/staff/${id}/reset-password`, {
      password
    });
    return response.data;
  }
};
