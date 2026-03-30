import axios from "axios";

import type { ApiErrorResponse } from "@/types/api";

export const extractErrorMessage = (error: unknown, fallback = "Unable to complete the request.") => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiErrorResponse | undefined;
    if (data?.message) {
      return data.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

export const extractFieldErrors = (error: unknown): Record<string, string[]> => {
  if (axios.isAxiosError(error)) {
    const errors = (error.response?.data as ApiErrorResponse | undefined)?.errors;
    if (errors && typeof errors === "object" && !Array.isArray(errors)) {
      return errors as Record<string, string[]>;
    }
  }

  return {};
};

