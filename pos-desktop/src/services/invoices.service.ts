import { apiClient } from "@/lib/api-client";

type ApiSuccess<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type DesktopInvoiceListRow = {
  id: string;
  invoiceNumber: string;
  orderReference: string | null;
  customerName: string | null;
  customerPhone: string | null;
  staffName: string;
  staffId: string;
  orderType: "takeaway" | "dine_in" | "delivery" | "snooker";
  tableLabel: string | null;
  kitchenStatus: "not_sent" | "queued" | "preparing" | "ready" | "served";
  status: "pending" | "paid" | "cancelled" | "refunded";
  paymentMode: "cash" | "card" | "upi" | "mixed";
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  syncedFromPos: boolean;
  sourceCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DesktopInvoiceListResponse = {
  invoices: DesktopInvoiceListRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type DesktopInvoiceDetailsResponse = {
  invoice: {
    id: string;
    invoiceNumber: string;
    orderType: "takeaway" | "dine_in" | "delivery" | "snooker";
    tableLabel: string | null;
    status: "pending" | "paid" | "cancelled" | "refunded";
    paymentMode: "cash" | "card" | "upi" | "mixed";
    subtotal: number;
    itemDiscountAmount: number;
    couponDiscountAmount: number;
    manualDiscountAmount: number;
    taxAmount: number;
    totalAmount: number;
    notes: string | null;
    customerSnapshot: Record<string, unknown> | null;
    sourceCreatedAt: string | null;
    createdAt: string;
    updatedAt: string;
    customer?: {
      name?: string | null;
      phone?: string | null;
    } | null;
  };
  lines: Array<{
    id: string;
    lineType: "item" | "add_on" | "combo" | "product" | "custom";
    referenceId: string | null;
    nameSnapshot: string;
    quantity: number;
    unitPrice: number;
    gstPercentage: number;
    lineTotal: number;
    meta?: Record<string, unknown> | null;
  }>;
  payments: Array<{
    id: string;
    mode: "cash" | "card" | "upi" | "mixed";
    status: "success" | "failed" | "refunded";
    amount: number;
    receivedAmount: number | null;
    changeAmount: number | null;
    referenceNo: string | null;
    paidAt: string;
  }>;
};

export const invoicesService = {
  async list(params: {
    search?: string;
    status?: "pending" | "paid" | "cancelled" | "refunded";
    paymentMode?: "cash" | "card" | "upi" | "mixed";
    orderType?: "takeaway" | "dine_in" | "delivery" | "snooker";
    excludeOrderType?: "takeaway" | "dine_in" | "delivery" | "snooker";
    dateFrom?: string;
    dateTo?: string;
    page: number;
    limit: number;
  }) {
    const response = await apiClient.get<ApiSuccess<DesktopInvoiceListResponse>>("/invoices", { params });
    return response.data;
  },

  async getById(id: string) {
    const response = await apiClient.get<ApiSuccess<DesktopInvoiceDetailsResponse>>(`/invoices/${id}`);
    return response.data;
  }
};

