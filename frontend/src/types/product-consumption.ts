import type { PaginationData } from "./ingredient";

export type ProductConsumptionRecord = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  status: "pending" | "paid" | "cancelled" | "refunded";
  paymentMode: "cash" | "card" | "upi" | "mixed" | "pending";
  customerName: string;
  productId: string;
  productName: string;
  currentStock: number;
  quantity: number;
  rate: number;
  totalAmount: number;
  cashAmount: number;
  gpayAmount: number;
  pendingAmount: number;
};

export type ProductConsumptionListResponse = {
  consumptions: ProductConsumptionRecord[];
  pagination: PaginationData;
};

export type ProductConsumptionRowDetail = {
  id?: string;
  rowNumber: number;
  status: "inserted" | "skipped_duplicate" | "failed";
  date?: string;
  customerName?: string;
  itemName?: string;
  quantity?: number | null;
  rate?: number | null;
  totalAmount?: number | null;
  cashAmount?: number | null;
  gpayAmount?: number | null;
  pendingAmount?: number | null;
  invoiceNumber?: string;
  reason?: string;
};

export type ProductConsumptionImportResult = {
  id?: string;
  importId?: string;
  fileName?: string;
  createdAt?: string;
  importedAt?: string;
  totalRows: number;
  parsedRows: number;
  insertedRows: number;
  skippedDuplicateRows: number;
  failedRows: number;
  createdProducts: number;
  updatedProducts: number;
  createdCustomers: number;
  createdInvoices: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    customerName: string;
    itemName: string;
    quantity: number;
    totalAmount: number;
    pendingAmount: number;
  }>;
  rowDetails: ProductConsumptionRowDetail[];
};

export type ProductConsumptionImportHistoryItem = ProductConsumptionImportResult & {
  id: string;
  fileName: string;
  createdByUserId: string | null;
  createdAt: string;
};

export type ProductConsumptionImportHistoryResponse = {
  imports: ProductConsumptionImportHistoryItem[];
  pagination: PaginationData;
};

export type CreateProductConsumptionInput = {
  date?: string;
  customerName?: string;
  productId?: string;
  productName?: string;
  rate: number;
  quantity: number;
  totalAmount?: number;
  cashAmount?: number;
  gpayAmount?: number;
  remarks?: string;
  finalRemarks?: string;
  status?: string;
};
