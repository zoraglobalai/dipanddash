export type CatalogCategory = {
  id: string;
  name: string;
  isActive: boolean;
};

export type CatalogItem = {
  id: string;
  name: string;
  categoryId: string;
  sellingPrice: number;
  gstPercentage: number;
  isActive: boolean;
};

export type CatalogAddOn = {
  id: string;
  name: string;
  sellingPrice: number;
  gstPercentage: number;
  isActive: boolean;
};

export type CatalogCombo = {
  id: string;
  name: string;
  sellingPrice: number;
  gstPercentage: number;
  isActive: boolean;
};

export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  unit: string;
  sellingPrice: number;
  purchaseUnitPrice: number;
  targetSection: "dip_and_dash" | "gaming" | "both";
  currentStock: number;
  isActive: boolean;
};

export type CatalogRecipe = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientBaseUnit: string;
  quantity: number;
  unit: string;
  normalizedQuantity: number;
  costContribution: number;
};

export type CatalogItemRecipe = CatalogRecipe & {
  itemId: string;
};

export type CatalogAddOnRecipe = CatalogRecipe & {
  addOnId: string;
};

export type CatalogComboItem = {
  id: string;
  comboId: string;
  itemId: string;
  itemName: string;
  quantity: number;
};

export type CatalogOffer = {
  id: string;
  couponCode: string;
  discountType: "percentage" | "fixed_amount" | "free_item";
  discountValue: number | null;
  minimumOrderAmount: number | null;
  maximumDiscountAmount: number | null;
  maxUses: number | null;
  firstTimeUserOnly: boolean;
  validFrom: string;
  validUntil: string;
  freeItemCategoryId: string | null;
  freeItemId: string | null;
  isActive: boolean;
};

export type CatalogAllocation = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  date: string;
  allocatedQuantity: number;
  usedQuantity: number;
  remainingQuantity: number;
  updatedAt: string;
};

export type CatalogIngredientStock = {
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  availableQuantity: number;
  updatedAt: string;
};

export type CatalogSnapshot = {
  version: string;
  generatedAt: string;
  categories: CatalogCategory[];
  items: CatalogItem[];
  itemRecipes: CatalogItemRecipe[];
  addOns: CatalogAddOn[];
  addOnRecipes: CatalogAddOnRecipe[];
  combos: CatalogCombo[];
  comboItems: CatalogComboItem[];
  products: CatalogProduct[];
  offers: CatalogOffer[];
  ingredientStocks: CatalogIngredientStock[];
  allocations: CatalogAllocation[];
  controls: {
    isBillingEnabled: boolean;
    enforceDailyAllocation: boolean;
    enforceIngredientStock: boolean;
    reason: string | null;
    updatedAt: string | null;
  };
};
