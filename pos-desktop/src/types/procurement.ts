export type PurchaseLineType = "ingredient" | "product";
export type PurchaseOrderType = "ingredient" | "product" | "mixed";

export type SupplierListItem = {
  id: string;
  name: string;
  storeName: string | null;
  phone: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProcurementMetaIngredientCategory = {
  id: string;
  name: string;
  description: string | null;
};

export type ProcurementMetaIngredient = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  unitOptions: string[];
  perUnitPrice: number;
  currentStock: number;
};

export type ProcurementMetaProduct = {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitOptions: string[];
  purchaseUnitPrice: number;
  currentStock: number;
};

export type ProcurementMetaResponse = {
  date: string;
  suppliers: SupplierListItem[];
  ingredientCategories: ProcurementMetaIngredientCategory[];
  ingredients: ProcurementMetaIngredient[];
  products: ProcurementMetaProduct[];
};

export type PurchaseOrderSummary = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  purchaseType: PurchaseOrderType;
  supplierId: string;
  supplierName: string;
  lineCount: number;
  ingredientLineCount: number;
  productLineCount: number;
  totalAmount: number;
  note: string | null;
  createdByUserId: string | null;
  createdByUserName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderLine = {
  id: string;
  lineType: PurchaseLineType;
  ingredientId: string | null;
  productId: string | null;
  itemNameSnapshot: string;
  categoryNameSnapshot: string | null;
  unit: string;
  stockAdded: number;
  enteredQuantity: number | null;
  enteredUnit: string | null;
  unitPrice: number;
  lineTotal: number;
  unitPriceUpdated: boolean;
};

export type PurchaseOrderDetail = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  purchaseType: PurchaseOrderType;
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  note: string | null;
  invoiceImageUrl: string | null;
  totalAmount: number;
  createdByUserId: string | null;
  createdByUserName: string | null;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLine[];
};

export type PaginationData = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PurchaseOrderListResponse = {
  orders: PurchaseOrderSummary[];
  pagination: PaginationData;
  stats: {
    totalOrders: number;
    totalAmount: number;
  };
};

export type ProcurementStatsResponse = {
  summary: {
    totalSuppliers: number;
    totalProducts: number;
    totalPurchaseOrders: number;
    totalPurchaseAmount: number;
    totalProductPurchasedQuantity: number;
    totalProductPurchasedAmount: number;
  };
  recentPurchases: Array<{
    id: string;
    purchaseNumber: string;
    purchaseDate: string;
    purchaseType: PurchaseOrderType;
    supplierName: string;
    totalAmount: number;
    createdByUserName: string | null;
    createdAt: string;
  }>;
};

export type CreatePurchaseLineInput = {
  lineType: PurchaseLineType;
  ingredientId?: string;
  productId?: string;
  quantity: number;
  quantityUnit?: string;
  unitPrice: number;
  updateUnitPrice?: boolean;
};

export type CreatePurchaseOrderInput = {
  supplierId: string;
  purchaseDate?: string;
  note?: string;
  invoiceImageUrl?: string;
  lines: CreatePurchaseLineInput[];
};
