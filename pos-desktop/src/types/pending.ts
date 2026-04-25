export type PendingSourceType = "invoice" | "gaming_booking";
export type PendingCollectPaymentMode = "cash" | "card" | "upi" | "mixed";

export type PendingCustomerSummary = {
  customerKey: string;
  customerName: string;
  customerPhone: string;
  totalPendingAmount: number;
  pendingDocuments: number;
  pendingInvoices: number;
  pendingGamingBookings: number;
  lastUpdatedAt: string;
};

export type PendingCustomersResponse = {
  customers: PendingCustomerSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  totals: {
    pendingCustomers: number;
    pendingDocuments: number;
    pendingAmount: number;
  };
};

export type PendingDocument = {
  sourceType: PendingSourceType;
  sourceId: string;
  sourceNumber: string;
  status: string;
  paymentStatus: string;
  paymentMode: string | null;
  totalAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  documentDate: string;
  updatedAt: string;
};

export type PendingPaymentHistoryEntry = {
  id: string;
  sourceType: PendingSourceType;
  sourceId: string;
  sourceNumber: string;
  customerName: string;
  customerPhone: string;
  paymentMode: "cash" | "card" | "upi";
  referenceNo: string | null;
  amount: number;
  remainingAmount: number;
  note: string | null;
  collectedByUserId: string | null;
  collectedByName: string | null;
  createdAt: string;
};

export type PendingCustomerDetails = {
  summary: {
    customerName: string;
    customerPhone: string;
    totalPendingAmount: number;
    pendingDocuments: number;
  };
  pendingDocuments: PendingDocument[];
  paymentHistory: PendingPaymentHistoryEntry[];
};

export type PendingCollectResponse = {
  sourceType: PendingSourceType;
  sourceId: string;
  sourceNumber: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  collectedAmount: number;
  remainingAmount: number;
  settled: boolean;
  paymentBreakdown?: {
    cash: number;
    card: number;
    upi: number;
  };
};
