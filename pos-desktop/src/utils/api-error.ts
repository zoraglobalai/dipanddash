import axios from "axios";

type ApiErrorShape = {
  message?: string;
  errors?: unknown;
};

export const extractApiErrorMessage = (error: unknown, fallback = "Unable to complete this request.") => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiErrorShape | undefined;
    if (data?.message && typeof data.message === "string") {
      return data.message;
    }

    if (typeof data?.errors === "string" && data.errors.trim()) {
      return data.errors;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

