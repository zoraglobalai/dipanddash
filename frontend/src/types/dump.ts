export type DumpEntryType = "ingredient" | "item" | "product";

export type DumpIngredientImpact = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lossAmount: number;
};

export type DumpRecord = {
  id: string;
  entryDate: string;
  entryType: DumpEntryType;
  sourceName: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  baseUnit: string;
  lossAmount: number;
  ingredientImpacts: DumpIngredientImpact[];
  note: string | null;
  createdByUserId: string;
  createdByUserName: string;
  createdByUsername: string;
  createdAt: string;
  updatedAt: string;
};

export type DumpRecordsResponse = {
  records: DumpRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type DumpStatsResponse = {
  totalEntries: number;
  totalLossAmount: number;
  totalQuantity: number;
  ingredientEntryCount: number;
  itemEntryCount: number;
  productEntryCount: number;
  uniqueStaffCount: number;
  totalIngredientImpactRows: number;
  latestEntryAt: string | null;
  topLossSources: Array<{
    sourceName: string;
    lossAmount: number;
    entryCount: number;
  }>;
};

export type DumpEntryOptionsResponse = {
  ingredients: Array<{
    id: string;
    name: string;
    unit: string;
    baseUnit: string;
    unitOptions: string[];
    currentStock: number;
    perUnitPrice: number;
  }>;
  items: Array<{
    id: string;
    name: string;
    baseUnit: string;
    unitOptions: string[];
    estimatedIngredientCost: number;
  }>;
  products: Array<{
    id: string;
    name: string;
    unit: string;
    baseUnit: string;
    unitOptions: string[];
    currentStock: number;
    purchaseUnitPrice: number;
  }>;
};
