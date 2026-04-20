import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  InvoiceActivityRow,
  InvoiceDetail,
  InvoiceOrderType,
  InvoiceLineRow,
  InvoiceListRow,
  InvoicePagination,
  InvoicePaymentMode,
  InvoiceKitchenStatus,
  InvoicePaymentRow,
  InvoiceStats,
  InvoiceStatus,
  InvoiceUsageEventRow
} from "@/types/invoice";

type InvoiceListResponse = {
  invoices: InvoiceListRow[];
  pagination: InvoicePagination;
};

type InvoiceDetailsResponse = {
  invoice: InvoiceDetail;
  lines: InvoiceLineRow[];
  payments: InvoicePaymentRow[];
  activities: InvoiceActivityRow[];
  usageEvents: InvoiceUsageEventRow[];
};

type InvoiceSyncLineInput = {
  lineType: "item" | "add_on" | "combo" | "product" | "custom";
  referenceId?: string | null;
  nameSnapshot: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  gstPercentage?: number;
  lineTotal: number;
  meta?: Record<string, unknown> | null;
};

type InvoiceSyncPaymentInput = {
  mode: "cash" | "card" | "upi" | "mixed";
  status?: "success" | "failed" | "refunded";
  amount: number;
  receivedAmount?: number | null;
  changeAmount?: number | null;
  referenceNo?: string | null;
  paidAt?: string;
};

type InvoiceSyncUsageInput = {
  idempotencyKey?: string;
  ingredientId?: string | null;
  ingredientNameSnapshot: string;
  consumedQuantity: number;
  baseUnit: string;
  allocatedQuantity?: number;
  overusedQuantity?: number;
  usageDate: string;
  deviceId?: string | null;
  meta?: Record<string, unknown> | null;
};

export const invoicesService = {
  syncUpsert: async (payload: {
    idempotencyKey: string;
    invoiceNumber: string;
    orderReference?: string | null;
    customerId?: string | null;
    customerPhone?: string | null;
    customerName?: string | null;
    branchId?: string | null;
    deviceId?: string | null;
    orderType: "takeaway" | "dine_in" | "delivery" | "snooker";
    tableLabel?: string | null;
    kitchenStatus?: "not_sent" | "queued" | "preparing" | "ready" | "served";
    status?: "pending" | "paid" | "cancelled" | "refunded";
    paymentMode?: "cash" | "card" | "upi" | "mixed";
    subtotal: number;
    itemDiscountAmount?: number;
    couponDiscountAmount?: number;
    manualDiscountAmount?: number;
    taxAmount?: number;
    totalAmount: number;
    couponCode?: string | null;
    notes?: string | null;
    customerSnapshot?: Record<string, unknown> | null;
    totalsSnapshot?: Record<string, unknown> | null;
    linesSnapshot?: Record<string, unknown> | null;
    sourceCreatedAt?: string;
    lines: InvoiceSyncLineInput[];
    payments?: InvoiceSyncPaymentInput[];
    usageEvents?: InvoiceSyncUsageInput[];
  }) => {
    const response = await apiClient.post<ApiSuccess<{ invoice: InvoiceDetail; created: boolean }>>(
      "/invoices/sync-upsert",
      payload
    );
    return response.data;
  },

  getStats: async (params?: {
    staffId?: string;
    orderType?: InvoiceOrderType;
    excludeOrderType?: InvoiceOrderType;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const response = await apiClient.get<ApiSuccess<InvoiceStats>>("/invoices/stats", { params });
    return response.data;
  },

  getInvoices: async (params?: {
    search?: string;
    status?: InvoiceStatus;
    statuses?: InvoiceStatus[];
    kitchenStatus?: InvoiceKitchenStatus;
    paymentMode?: InvoicePaymentMode;
    orderType?: InvoiceOrderType;
    excludeOrderType?: InvoiceOrderType;
    staffId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<InvoiceListResponse>>("/invoices", {
      params: {
        ...params,
        statuses: params?.statuses?.length ? params.statuses.join(",") : undefined
      }
    });
    return response.data;
  },

  getInvoice: async (id: string) => {
    const response = await apiClient.get<ApiSuccess<InvoiceDetailsResponse>>(`/invoices/${id}`);
    return response.data;
  },

  cancelInvoice: async (id: string, reason?: string) => {
    const response = await apiClient.post<ApiSuccess<{ invoice: InvoiceDetail }>>(
      `/invoices/${id}/cancel`,
      { reason }
    );
    return response.data;
  },

  refundInvoice: async (id: string, reason?: string) => {
    const response = await apiClient.post<ApiSuccess<{ invoice: InvoiceDetail }>>(
      `/invoices/${id}/refund`,
      { reason }
    );
    return response.data;
  },

  updateKitchenStatus: async (id: string, kitchenStatus: "not_sent" | "queued" | "preparing" | "ready" | "served") => {
    const response = await apiClient.post<ApiSuccess<{ invoice: InvoiceDetail }>>(
      `/invoices/${id}/kitchen-status`,
      { kitchenStatus }
    );
    return response.data;
  },

  deleteInvoice: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ id: string; invoiceNumber: string }>>(`/invoices/${id}`);
    return response.data;
  }
};
