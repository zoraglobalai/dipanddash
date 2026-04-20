import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  GamingBookingRow,
  GamingCreateBookingPayload,
  GamingPagination,
  GamingPaymentMode,
  GamingPaymentStatus,
  GamingStats,
  GamingBookingStatus,
  GamingBookingType,
  GamingResourceAvailability,
  GamingUpdateBookingPayload
} from "@/types/gaming";

type GamingListResponse = {
  bookings: GamingBookingRow[];
  pagination: GamingPagination;
};

type GamingResourcesResponse = {
  resources: GamingResourceAvailability[];
};

export const gamingService = {
  getBookings: async (params?: {
    search?: string;
    customerPhone?: string;
    bookingType?: GamingBookingType;
    status?: GamingBookingStatus;
    paymentStatus?: GamingPaymentStatus;
    resourceCode?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<GamingListResponse>>("/gaming/bookings", { params });
    return response.data;
  },

  createBooking: async (payload: GamingCreateBookingPayload) => {
    const response = await apiClient.post<ApiSuccess<{ booking: GamingBookingRow }>>("/gaming/bookings", payload);
    return response.data;
  },

  updateBooking: async (id: string, payload: GamingUpdateBookingPayload) => {
    const response = await apiClient.patch<ApiSuccess<{ booking: GamingBookingRow }>>(`/gaming/bookings/${id}`, payload);
    return response.data;
  },

  deleteBooking: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ id: string }>>(`/gaming/bookings/${id}`);
    return response.data;
  },

  getStats: async (params?: { dateFrom?: string; dateTo?: string }) => {
    const response = await apiClient.get<ApiSuccess<GamingStats>>("/gaming/stats", { params });
    return response.data;
  },

  getResources: async () => {
    const response = await apiClient.get<ApiSuccess<GamingResourcesResponse>>("/gaming/resources");
    return response.data;
  },

  checkoutBooking: async (
    id: string,
    payload?: {
      checkOutAt?: string;
      finalAmount?: number;
      paymentStatus?: "pending" | "paid";
      paymentMode?: GamingPaymentMode;
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ booking: GamingBookingRow }>>(
      `/gaming/bookings/${id}/checkout`,
      payload ?? {}
    );
    return response.data;
  },

  updatePaymentStatus: async (id: string, paymentStatus: "pending" | "paid", paymentMode?: GamingPaymentMode) => {
    const response = await apiClient.patch<ApiSuccess<{ booking: GamingBookingRow }>>(
      `/gaming/bookings/${id}/payment-status`,
      { paymentStatus, paymentMode }
    );
    return response.data;
  }
};
