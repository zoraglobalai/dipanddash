import type { IngredientUnit, PaginationData } from "./ingredient";

export type ProductUnit =
  | "pcs"
  | "unit"
  | "count"
  | "pack"
  | "packet"
  | "box"
  | "tin"
  | "bottle"
  | "can"
  | "jar"
  | "tray"
  | "bag"
  | "carton"
  | "crate"
  | "g"
  | "kg"
  | "ml"
  | "l"
  | "custom";

export type PurchaseLineType = "ingredient" | "product";
export type PurchaseOrderType = "ingredient" | "product" | "mixed";
export type StockHealth = "LOW_STOCK" | "HEALTHY";

export type SupplierListItem = {
  id: string;
  name: string;
  storeName: string | null;
  phone: string;
  address: string | null;
  isActive: boolean;
  purchaseOrdersCount: number;
  totalPurchasedAmount: number;
  lastPurchaseDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierListResponse = {
  suppliers: SupplierListItem[];
  pagination: PaginationData;
  stats: {
    totalSuppliers: number;
    activeSuppliers: number;
    inactiveSuppliers: number;
    totalPurchaseOrders: number;
    totalPurchasedAmount: number;
  };
};

export type ProductListItem = {
  id: string;
  name: string;
  category: string;
  sku: string | null;
  packSize: string | null;
  unit: ProductUnit;
  currentStock: number;
  minStock: number;
  purchaseUnitPrice: number;
  defaultSupplierId: string | null;
  defaultSupplierName: string | null;
  isActive: boolean;
  stockStatus: StockHealth;
  valuation: number;
  purchasedQuantity: number;
  purchaseOrdersCount: number;
  totalPurchasedAmount: number;
  recentPurchaseDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductListResponse = {
  products: ProductListItem[];
  pagination: PaginationData;
  stats: {
    totalProducts: number;
    activeProducts: number;
    inactiveProducts: number;
    lowStockProducts: number;
    stockValuation: number;
    totalPurchasedQuantity: number;
    totalPurchasedAmount: number;
    topPurchasedProducts: Array<{
      productId: string;
      name: string;
      unit: ProductUnit;
      quantity: number;
    }>;
  };
};

export type ProcurementMetaSupplier = {
  id: string;
  name: string;
  storeName: string | null;
  phone: string;
  address: string | null;
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
  unit: IngredientUnit;
  unitOptions: string[];
  perUnitPrice: number;
  currentStock: number;
  minStock: number;
  allocatedToday: number;
  usedToday: number;
  pendingToday: number;
  stockStatus: StockHealth;
};

export type ProcurementMetaProduct = {
  id: string;
  name: string;
  category: string;
  sku: string | null;
  packSize: string | null;
  unit: ProductUnit;
  unitOptions: string[];
  purchaseUnitPrice: number;
  currentStock: number;
  minStock: number;
  stockStatus: StockHealth;
  defaultSupplierId: string | null;
  defaultSupplierName: string | null;
};

export type ProcurementMetaResponse = {
  date: string;
  suppliers: ProcurementMetaSupplier[];
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
  invoiceImageUrl: string | null;
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
  stockBefore: number;
  stockAdded: number;
  enteredQuantity: number | null;
  enteredUnit: string | null;
  stockAfter: number;
  unitPrice: number;
  lineTotal: number;
  unitPriceUpdated: boolean;
  createdAt: string;
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

export type ProcurementUnitsResponse = {
  ingredientUnits: readonly IngredientUnit[];
  productUnits: readonly ProductUnit[];
};

export type CreatePurchaseLineInput = {
  lineType: PurchaseLineType;
  ingredientId?: string;
  productId?: string;
  quantity: number;
  quantityUnit?: string;
  unitPrice: number;
  note?: string;
};

export type CreatePurchaseOrderInput = {
  supplierId: string;
  purchaseDate?: string;
  note?: string;
  invoiceImageUrl?: string;
  lines: CreatePurchaseLineInput[];
};
