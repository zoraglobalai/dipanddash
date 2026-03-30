import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  InvoiceActivityRow,
  InvoiceDetail,
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

export const invoicesService = {
  getStats: async (params?: { staffId?: string; dateFrom?: string; dateTo?: string }) => {
    const response = await apiClient.get<ApiSuccess<InvoiceStats>>("/invoices/stats", { params });
    return response.data;
  },

  getInvoices: async (params?: {
    search?: string;
    status?: InvoiceStatus;
    kitchenStatus?: InvoiceKitchenStatus;
    paymentMode?: InvoicePaymentMode;
    staffId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<InvoiceListResponse>>("/invoices", { params });
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
  }
};
