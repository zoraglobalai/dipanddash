import { apiClient } from "@/lib/api-client";
import type { SyncQueueEvent, SyncQueueRow } from "@/types/pos";

type ApiSuccess<T> = {
  success: boolean;
  message: string;
  data: T;
};

type GamingListRow = {
  id: string;
  bookingNumber: string;
};

type GamingListResponse = {
  bookings: GamingListRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const findServerBookingIdByNumber = async (bookingNumber: string) => {
  const normalized = bookingNumber.trim();
  if (!normalized) {
    return null;
  }
  const response = await apiClient.get<ApiSuccess<GamingListResponse>>("/gaming/bookings", {
    params: {
      search: normalized,
      page: 1,
      limit: 20
    }
  });

  const exact = response.data.data.bookings.find((row) => row.bookingNumber === normalized);
  return exact?.id ?? null;
};

const dispatchGamingBookingEvent = async (event: Extract<SyncQueueEvent, { eventType: "gaming_booking_upsert" }>) => {
  const payload = event.payload;
  const serverBookingId = await findServerBookingIdByNumber(payload.bookingNumber);

  if (!serverBookingId) {
    const isCompleted = payload.status === "completed";
    await apiClient.post("/gaming/bookings", {
      bookingNumber: payload.bookingNumber,
      bookingType: payload.bookingType,
      resourceCode: payload.resourceCode,
      resourceCodes: payload.resourceCodes,
      playerCount: payload.playerCount,
      checkInAt: payload.checkInAt,
      checkOutAt: payload.checkOutAt,
      hourlyRate: payload.hourlyRate,
      customers: payload.customers,
      bookingChannel: payload.bookingChannel,
      note: payload.note,
      sourceDeviceId: payload.sourceDeviceId,
      status: payload.status,
      paymentStatus: payload.paymentStatus,
      paymentMode: payload.paymentMode,
      paymentReference: payload.paymentReference,
      paymentBreakdown: payload.paymentBreakdown,
      ...(isCompleted
        ? {
            finalAmount: payload.finalAmount,
            systemCalculatedAmount: payload.systemCalculatedAmount,
            extraMemberCount: payload.extraMemberCount,
            extraMemberCharge: payload.extraMemberCharge,
            amountOverrideReason: payload.amountOverrideReason
          }
        : {}),
      foodOrderReference: payload.foodOrderReference,
      foodInvoiceNumber: payload.foodInvoiceNumber,
      foodInvoiceStatus: payload.foodInvoiceStatus,
      foodAndBeverageAmount: payload.foodAndBeverageAmount,
      staffId: payload.staffId
    });
    return;
  }

  if (payload.status === "completed") {
    await apiClient.patch(`/gaming/bookings/${serverBookingId}/checkout`, {
      checkOutAt: payload.checkOutAt,
      finalAmount: payload.finalAmount,
      systemCalculatedAmount: payload.systemCalculatedAmount,
      extraMemberCount: payload.extraMemberCount,
      extraMemberCharge: payload.extraMemberCharge,
      amountOverrideReason: payload.amountOverrideReason,
      paymentStatus: payload.paymentStatus,
      paymentMode: payload.paymentMode,
      paymentReference: payload.paymentReference,
      paymentBreakdown: payload.paymentBreakdown
    });
    return;
  }

  await apiClient.patch(`/gaming/bookings/${serverBookingId}`, {
    customers: payload.customers,
    playerCount: payload.playerCount,
    paymentStatus: payload.paymentStatus,
    paymentMode: payload.paymentMode,
    paymentReference: payload.paymentReference,
    paymentBreakdown: payload.paymentBreakdown,
    foodOrderReference: payload.foodOrderReference,
    foodInvoiceNumber: payload.foodInvoiceNumber,
    foodInvoiceStatus: payload.foodInvoiceStatus,
    foodAndBeverageAmount: payload.foodAndBeverageAmount
  });
};

const dispatchEvent = async (event: SyncQueueEvent) => {
  if (event.eventType === "invoice_upsert") {
    await apiClient.post("/invoices/sync-upsert", event.payload);
    return;
  }

  if (event.eventType === "customer_upsert") {
    await apiClient.post("/customers", event.payload);
    return;
  }

  if (event.eventType === "gaming_booking_upsert") {
    await dispatchGamingBookingEvent(event);
    return;
  }

  throw new Error(`Unsupported sync event type: ${event.eventType}`);
};

const EMPTY_QUEUE: SyncQueueRow[] = [];
const EMPTY_INVOICES: string[] = [];
const EMPTY_BOOKINGS: string[] = [];

export const syncQueueRepository = {
  enqueue: async (row: SyncQueueRow) => {
    await dispatchEvent(row.payload);
  },
  listPending: async (_limit?: number): Promise<SyncQueueRow[]> => EMPTY_QUEUE,
  listUnresolvedInvoiceNumbers: async (): Promise<string[]> => EMPTY_INVOICES,
  listUnresolvedGamingBookingNumbers: async (): Promise<string[]> => EMPTY_BOOKINGS,
  updateStatus: async (_input: {
    id: string;
    status: SyncQueueRow["status"];
    retryCount: number;
    lastError: string | null;
    nextRetryAt: string | null;
  }) => undefined,
  remove: async (_id: string) => undefined,
  getStats: async () => ({ pending: 0, failed: 0 })
};
