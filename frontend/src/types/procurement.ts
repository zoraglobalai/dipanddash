import type { IngredientCategoryKind, IngredientUnit, PaginationData } from "./ingredient";

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
export type PurchaseSection = "dip_and_dash" | "gaming";
export type StockHealth = "LOW_STOCK" | "HEALTHY";
export type ProductExpiryStatus = "NO_EXPIRY" | "FRESH" | "EXPIRING_SOON" | "EXPIRED";
export type ProductTargetSection = "dip_and_dash" | "gaming" | "both";

export type SupplierListItem = {
  id: string;
  name: string;
  storeName: string | null;
  phone: string;
  section: PurchaseSection;
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
  dipAndDashAssignedStock: number;
  gamingAssignedStock: number;
  minStock: number;
  purchaseUnitPrice: number;
  sellingPrice: number;
  targetSection: ProductTargetSection;
  defaultSupplierId: string | null;
  defaultSupplierName: string | null;
  isActive: boolean;
  stockStatus: StockHealth;
  valuation: number;
  purchasedQuantity: number;
  purchaseOrdersCount: number;
  totalPurchasedAmount: number;
  recentPurchaseDate: string | null;
  soldQuantity: number;
  soldAmount: number;
  estimatedProfit: number;
  nextExpiryDate: string | null;
  latestExpiryDate: string | null;
  expiryStatus: ProductExpiryStatus;
  ageingDays: number | null;
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
    totalSoldQuantity: number;
    totalSoldAmount: number;
    totalEstimatedProfit: number;
    topPurchasedProducts: Array<{
      productId: string;
      name: string;
      unit: ProductUnit;
      quantity: number;
    }>;
    topSoldProducts: Array<{
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
  kind: IngredientCategoryKind;
};

export type ProcurementMetaIngredient = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryKind: IngredientCategoryKind;
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
  sellingPrice: number;
  targetSection: ProductTargetSection;
  dipAndDashAssignedStock: number;
  gamingAssignedStock: number;
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
  purchaseSection: PurchaseSection;
  supplierId: string;
  supplierName: string;
  lineCount: number;
  ingredientLineCount: number;
  productLineCount: number;
  totalAmount: number;
  note: string | null;
  vendorInvoiceNumber: string | null;
  projectName: string | null;
  purchaseMonth: string | null;
  receivedDate: string | null;
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
  dipAndDashStockAdded: number | null;
  gamingStockAdded: number | null;
  unitPrice: number;
  gstPercentage: number | null;
  sourceAmount: number | null;
  gstValue: number;
  sourceGrandTotal: number | null;
  lineTotal: number;
  packSizeSnapshot: string | null;
  sourceRowNumber: number | null;
  unitPriceUpdated: boolean;
  expiryDate: string | null;
  createdAt: string;
};

export type ProductDayLedgerRow = {
  id: string;
  date: string;
  productId: string;
  productName: string;
  category: string;
  unit: ProductUnit;
  targetSection: ProductTargetSection;
  openingStock: number;
  purchased: number;
  consumption: number;
  dipAndDashConsumption: number;
  snookerConsumption: number;
  closingStock: number;
  dipAndDashAssignedStock: number;
  gamingAssignedStock: number;
  stockHealth: StockHealth;
  isAdjusted?: boolean;
  adjustmentNote?: string | null;
};

export type ProductDayLedgerResponse = {
  date: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  rows: ProductDayLedgerRow[];
  pagination: PaginationData;
  stats: {
    totalProducts: number;
    totalOpeningStock: number;
    totalPurchased: number;
    totalConsumption: number;
    totalClosingStock: number;
    dipAndDashConsumption: number;
    snookerConsumption: number;
  };
};

export type ProductStockHistoryResponse = {
  product: {
    id: string;
    name: string;
    category: string;
    sku: string | null;
    unit: ProductUnit;
    targetSection: ProductTargetSection;
    currentStock: number;
  };
  dateFrom: string | null;
  dateTo: string | null;
  summary: {
    totalPurchasedQuantity: number;
    totalConsumptionQuantity: number;
    currentStock: number;
    purchaseEntries: number;
    consumptionEntries: number;
  };
  purchases: {
    rows: Array<{
      id: string;
      purchaseDate: string;
      purchaseOrderId: string;
      purchaseNumber: string;
      purchaseSection: PurchaseSection;
      supplierName: string;
      storeName: string | null;
      quantity: number;
      quantityUnit: string;
      baseQuantity: number;
      baseUnit: string;
      unitPrice: number;
      gstValue: number;
      lineTotal: number;
      expiryDate: string | null;
      createdAt: string;
    }>;
    pagination: PaginationData;
  };
  consumptions: {
    rows: Array<{
      id: string;
      consumptionDate: string;
      invoiceId: string;
      invoiceNumber: string;
      orderType: string;
      customerName: string;
      customerPhone: string;
      quantity: number;
      unit: ProductUnit;
      unitPrice: number;
      lineTotal: number;
      createdAt: string;
    }>;
    pagination: PaginationData;
  };
};

export type PurchaseOrderDetail = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  purchaseType: PurchaseOrderType;
  purchaseSection: PurchaseSection;
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  note: string | null;
  vendorInvoiceNumber: string | null;
  projectName: string | null;
  purchaseMonth: string | null;
  receivedDate: string | null;
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
    purchaseSection: PurchaseSection;
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

export type PurchaseBulkImportResult = {
  importId?: string;
  fileName?: string;
  importedAt?: string;
  totalRows: number;
  parsedRows: number;
  insertedRows: number;
  skippedDuplicateRows: number;
  failedRows: number;
  createdProducts: number;
  matchedProducts: number;
  createdOrders: Array<{
    id: string;
    purchaseNumber: string;
    purchaseDate: string;
    supplierName: string;
    lineCount: number;
    totalAmount: number;
  }>;
  invalidRowDetails: Array<{
    rowNumber: number;
    reason: string;
  }>;
  rowDetails: Array<{
    id?: string;
    rowNumber: number;
    status: "inserted" | "skipped_duplicate" | "failed";
    supplierName?: string;
    itemName?: string;
    packSize?: string | null;
    purchaseDate?: string;
    vendorInvoiceNumber?: string | null;
    quantity?: number | null;
    quantityUnit?: string | null;
    unitPrice?: number | null;
    amount?: number | null;
    gstAmount?: number | null;
    grandTotal?: number | null;
    purchaseNumber?: string;
    reason?: string;
  }>;
};

export type PurchaseBulkImportHistoryItem = PurchaseBulkImportResult & {
  id: string;
  fileName: string;
  purchaseSection: PurchaseSection;
  createdByUserId: string | null;
  createdAt: string;
};

export type PurchaseBulkImportHistoryResponse = {
  imports: PurchaseBulkImportHistoryItem[];
  pagination: PaginationData;
};

export type PurchaseBulkImportDeleteResponse = {
  id: string;
  fileName: string;
  deletedOrders: Array<{
    id: string;
    purchaseNumber: string;
    purchaseDate: string;
  }>;
  deletedOrderCount: number;
  missingOrderCount: number;
  stockRolledBack: boolean;
};

export type ProductBulkImportResult = {
  totalRows: number;
  parsedRows: number;
  insertedProducts: number;
  skippedExistingProducts: number;
  skippedDuplicateRows: number;
  invalidRows: number;
  invalidRowDetails: Array<{
    rowNumber: number;
    reason: string;
  }>;
};

export type CreatePurchaseLineInput = {
  lineType: PurchaseLineType;
  ingredientId?: string;
  productId?: string;
  productName?: string;
  productPackSize?: string;
  productCategory?: string;
  productUnit?: ProductUnit;
  quantity: number;
  quantityUnit?: string;
  unitPrice: number;
  gstPercentage?: number;
  gstValue?: number;
  sourceAmount?: number;
  sourceGrandTotal?: number;
  sourceRowNumber?: number;
  expiryDate?: string;
  note?: string;
};

export type CreatePurchaseOrderInput = {
  supplierId?: string;
  supplierName?: string;
  supplierPhone?: string;
  purchaseDate?: string;
  purchaseSection: PurchaseSection;
  note?: string;
  vendorInvoiceNumber?: string;
  projectName?: string;
  purchaseMonth?: string;
  receivedDate?: string;
  invoiceImageUrl?: string;
  lines: CreatePurchaseLineInput[];
};
