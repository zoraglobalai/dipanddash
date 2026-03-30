import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  GamingBookingRow,
  GamingPagination,
  GamingPaymentMode,
  GamingPaymentStatus,
  GamingStats,
  GamingBookingStatus,
  GamingBookingType,
  GamingResourceAvailability
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
