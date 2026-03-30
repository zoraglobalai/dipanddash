import { useCallback, useState } from "react";

import { staffService } from "@/services/staff.service";
import type { Staff, CreateStaffPayload, UpdateStaffPayload } from "@/types/staff";
import { extractErrorMessage } from "@/utils/api-error";

export const useStaffManagement = () => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await staffService.list(search);
      setStaff(response.data.staff);
      return response.message;
    } catch (err) {
      const message = extractErrorMessage(err, "Unable to fetch staff data right now.");
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createStaff = useCallback(async (payload: CreateStaffPayload) => {
    setMutationLoading(true);
    try {
      const response = await staffService.create(payload);
      setStaff((prev) => [response.data.staff, ...prev]);
      return response.message;
    } finally {
      setMutationLoading(false);
    }
  }, []);

  const updateStaff = useCallback(async (id: string, payload: UpdateStaffPayload) => {
    setMutationLoading(true);
    try {
      const response = await staffService.update(id, payload);
      setStaff((prev) => prev.map((member) => (member.id === id ? response.data.staff : member)));
      return response.message;
    } finally {
      setMutationLoading(false);
    }
  }, []);

  const updateStatus = useCallback(async (id: string, isActive: boolean) => {
    setMutationLoading(true);
    try {
      const response = await staffService.updateStatus(id, isActive);
      setStaff((prev) => prev.map((member) => (member.id === id ? response.data.staff : member)));
      return response.message;
    } finally {
      setMutationLoading(false);
    }
  }, []);

  const resetPassword = useCallback(async (id: string, password: string) => {
    setMutationLoading(true);
    try {
      const response = await staffService.resetPassword(id, password);
      setStaff((prev) => prev.map((member) => (member.id === id ? response.data.staff : member)));
      return response.message;
    } finally {
      setMutationLoading(false);
    }
  }, []);

  return {
    staff,
    loading,
    mutationLoading,
    error,
    fetchStaff,
    createStaff,
    updateStaff,
    updateStatus,
    resetPassword
  };
};
