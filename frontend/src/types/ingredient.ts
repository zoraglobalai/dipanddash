export type IngredientUnit =
  | "mcg"
  | "mg"
  | "g"
  | "kg"
  | "quintal"
  | "ton"
  | "ml"
  | "cl"
  | "dl"
  | "l"
  | "gallon"
  | "pcs"
  | "piece"
  | "count"
  | "unit"
  | "units"
  | "pair"
  | "dozen"
  | "tray"
  | "plate"
  | "pack"
  | "packet"
  | "box"
  | "bottle"
  | "can"
  | "jar"
  | "tub"
  | "pouch"
  | "roll"
  | "bag"
  | "sack"
  | "bundle"
  | "carton"
  | "crate"
  | "loaf"
  | "block"
  | "cup"
  | "tablespoon"
  | "teaspoon"
  | "custom";

export type IngredientStockStatus = "LOW_STOCK" | "OK";

export type IngredientCategory = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  ingredientCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type IngredientListItem = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unit: IngredientUnit;
  perUnitPrice: number;
  minStock: number;
  totalStock: number;
  staffUsedQuantity?: number;
  dumpQuantity?: number;
  isActive: boolean;
  status: IngredientStockStatus;
  createdAt: string;
  updatedAt: string;
};

export type IngredientStockLogType = "ADD" | "ALLOCATE" | "USE" | "ADJUST";

export type IngredientStockLog = {
  id: string;
  type: IngredientStockLogType;
  quantity: number;
  note: string | null;
  createdAt: string;
};

export type IngredientStockDetails = {
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  perUnitPrice: number;
  totalValuation: number;
  totalStock: number;
  minStock: number;
  status: IngredientStockStatus;
  lastUpdatedAt: string;
};

export type PaginationData = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type IngredientAllocationStats = {
  date: string;
  totals: {
    totalIngredients: number;
    allocatedIngredients: number;
    missingAllocationIngredients: number;
    lowStockIngredients: number;
    healthyStockIngredients: number;
  };
  quantities: {
    totalStock: number;
    totalAllocated: number;
    totalUsed: number;
    totalRemaining: number;
    totalValuation: number;
    totalOverused: number;
  };
  insights: {
    highestValuationIngredient: {
      ingredientId: string;
      ingredientName: string;
      unit: IngredientUnit;
      valuation: number;
      totalStock: number;
    } | null;
    mostUsedIngredient: {
      ingredientId: string;
      ingredientName: string;
      unit: IngredientUnit;
      usedQuantity: number;
    } | null;
    recentAllocationUpdates: Array<{
      allocationId: string;
      ingredientId: string;
      ingredientName: string;
      categoryName: string;
      unit: IngredientUnit;
      allocatedQuantity: number;
      usedQuantity: number;
      remainingQuantity: number;
      updatedAt: string;
    }>;
    staffUsageSummary: Array<{
      staffId: string;
      staffName: string;
      ingredientCount: number;
      consumedQuantity: number;
    }>;
  };
  charts: {
    statusBreakdown: Array<{ label: string; value: number }>;
    stockByCategory: Array<{
      categoryName: string;
      totalStock: number;
      allocated: number;
      used: number;
      remaining: number;
    }>;
    topUsedIngredients: Array<{
      ingredientId: string;
      ingredientName: string;
      unit: IngredientUnit;
      usedQuantity: number;
    }>;
  };
};

export type PosBillingControl = {
  isBillingEnabled: boolean;
  enforceDailyAllocation: boolean;
  reason: string | null;
  updatedAt: string;
  updatedByUserId?: string | null;
  updatedByName?: string | null;
};

export type StockAuditReport = {
  id: string;
  staffId: string;
  staffName: string;
  reportDate: string;
  closingSlot: number;
  isCarryForwardClosing: boolean;
  totalIngredients: number;
  mismatchRows?: number;
  matchedRows?: number;
  totalExpectedRemaining: number;
  totalReportedRemaining: number;
  totalVariance: number;
  note: string | null;
  submittedAt: string;
};

export type StockAuditItemRow = {
  reportItemId?: string;
  reportId: string;
  reportDate: string;
  staffId: string;
  staffName: string;
  submittedAt: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  openingStockQuantity?: number;
  purchaseStockQuantity?: number;
  transferredInQuantity?: number;
  transferredOutQuantity?: number;
  consumptionQuantity?: number;
  dumpQuantity?: number;
  expectedStockQuantity?: number;
  enteredStockQuantity?: number;
  allocatedQuantity: number;
  usedQuantity: number;
  expectedRemainingQuantity: number;
  reportedRemainingQuantity: number;
  varianceQuantity: number;
  isMismatch: boolean;
};

export type StockAuditData = {
  dateFrom: string;
  dateTo: string;
  stats: {
    totalReports: number;
    staffSubmitted: number;
    totalIngredients: number;
    mismatchedIngredients: number;
    matchedIngredients: number;
    totalPurchaseStock?: number;
    totalTransferInStock?: number;
    totalTransferOutStock?: number;
    totalConsumptionStock?: number;
    totalDumpStock?: number;
    totalUnallocatedStock?: number;
    ingredientsWithUnallocated?: number;
    totalExpectedRemaining: number;
    totalReportedRemaining: number;
    totalVarianceAbs: number;
  };
  posBillingControl: PosBillingControl;
  reports: StockAuditReport[];
  items: {
    rows: StockAuditItemRow[];
    pagination: PaginationData;
  };
};
