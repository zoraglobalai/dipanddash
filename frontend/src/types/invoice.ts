export type InvoiceStatus = "pending" | "paid" | "cancelled" | "refunded";
export type InvoiceOrderType = "takeaway" | "dine_in" | "delivery" | "snooker";
export type InvoiceKitchenStatus = "not_sent" | "queued" | "preparing" | "ready" | "served";
export type InvoicePaymentMode = "cash" | "card" | "upi" | "mixed";
export type InvoicePaymentStatus = "success" | "failed" | "refunded";
export type InvoiceLineType = "item" | "add_on" | "combo" | "product" | "custom";

export type InvoicePagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type InvoiceListRow = {
  id: string;
  invoiceNumber: string;
  orderReference: string | null;
  customerName: string | null;
  customerPhone: string | null;
  staffName: string;
  staffId: string;
  orderType: InvoiceOrderType;
  tableLabel: string | null;
  kitchenStatus: InvoiceKitchenStatus;
  status: InvoiceStatus;
  paymentMode: InvoicePaymentMode;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  syncedFromPos: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceDetailCustomer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
} | null;

export type InvoiceDetailStaff = {
  id: string;
  fullName: string;
  username: string;
  role: string;
};

export type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  idempotencyKey: string | null;
  orderReference: string | null;
  customerId: string | null;
  staffId: string;
  branchId: string | null;
  deviceId: string | null;
  orderType: InvoiceOrderType;
  tableLabel: string | null;
  kitchenStatus: InvoiceKitchenStatus;
  status: InvoiceStatus;
  paymentMode: InvoicePaymentMode;
  subtotal: number;
  itemDiscountAmount: number;
  couponDiscountAmount: number;
  manualDiscountAmount: number;
  taxAmount: number;
  totalAmount: number;
  couponCode: string | null;
  notes: string | null;
  syncedFromPos: boolean;
  sourceCreatedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  refundedAt: string | null;
  refundedReason: string | null;
  createdAt: string;
  updatedAt: string;
  customer: InvoiceDetailCustomer;
  staff: InvoiceDetailStaff;
};

export type InvoiceLineRow = {
  id: string;
  invoiceId: string;
  lineType: InvoiceLineType;
  referenceId: string | null;
  nameSnapshot: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  gstPercentage: number;
  lineTotal: number;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type InvoicePaymentRow = {
  id: string;
  invoiceId: string;
  mode: InvoicePaymentMode;
  status: InvoicePaymentStatus;
  amount: number;
  receivedAmount: number | null;
  changeAmount: number | null;
  referenceNo: string | null;
  paidAt: string;
  createdAt: string;
};

export type InvoiceActivityRow = {
  id: string;
  invoiceId: string;
  actionType: "created" | "synced" | "cancelled" | "refunded" | "updated";
  reason: string | null;
  performedByUserId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export type InvoiceUsageEventRow = {
  id: string;
  idempotencyKey: string | null;
  invoiceId: string | null;
  ingredientId: string | null;
  ingredientNameSnapshot: string;
  consumedQuantity: number;
  baseUnit: string;
  allocatedQuantity: number;
  overusedQuantity: number;
  usageDate: string;
  deviceId: string | null;
  staffId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type InvoiceStats = {
  totalInvoices: number;
  statusBreakdown: {
    paid: number;
    pending: number;
    cancelled: number;
    refunded: number;
  };
  paymentModeBreakdown: {
    cash: number;
    card: number;
    upi: number;
    mixed: number;
  };
  totals: {
    grossAmount: number;
    discountAmount: number;
    taxAmount: number;
  };
};
