import type { IngredientUnit } from "./ingredient";

export type ItemPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ItemCategory = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type ItemMetaIngredient = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unit: IngredientUnit;
  perUnitPrice: number;
  minStock: number;
  totalStock: number;
};

export type ItemUnitMeta = {
  value: IngredientUnit;
  label: string;
  group: string;
};

export type ItemRecipeRow = {
  ingredientId: string;
  quantity: number;
  unit: IngredientUnit;
};

export type ItemRecipeDetailRow = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientCategoryId: string;
  ingredientCategoryName: string;
  ingredientBaseUnit: IngredientUnit;
  ingredientPerUnitPrice: number;
  quantity: number;
  unit: IngredientUnit;
  normalizedQuantity: number;
  costContribution: number;
};

export type ItemListItem = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  sellingPrice: number;
  gstPercentage: number;
  imageUrl: string | null;
  note: string | null;
  estimatedIngredientCost: number;
  ingredientCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ItemDetail = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  sellingPrice: number;
  gstPercentage: number;
  imageUrl: string | null;
  note: string | null;
  estimatedIngredientCost: number;
  estimatedMargin: number;
  isActive: boolean;
  ingredients: ItemRecipeDetailRow[];
  createdAt: string;
  updatedAt: string;
};

export type AddOnListItem = {
  id: string;
  name: string;
  sellingPrice: number;
  gstPercentage: number;
  imageUrl: string | null;
  note: string | null;
  estimatedIngredientCost: number;
  ingredientCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AddOnDetail = {
  id: string;
  name: string;
  sellingPrice: number;
  gstPercentage: number;
  imageUrl: string | null;
  note: string | null;
  estimatedIngredientCost: number;
  estimatedMargin: number;
  isActive: boolean;
  ingredients: ItemRecipeDetailRow[];
  createdAt: string;
  updatedAt: string;
};

export type ComboItemRow = {
  itemId: string;
  quantity: number;
};

export type ComboDetailItem = {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  itemSellingPrice: number;
  lineTotal: number;
};

export type ComboListItem = {
  id: string;
  name: string;
  sellingPrice: number;
  gstPercentage: number;
  imageUrl: string | null;
  note: string | null;
  includedItemsCount: number;
  includedItemsValue: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ComboDetail = {
  id: string;
  name: string;
  sellingPrice: number;
  gstPercentage: number;
  imageUrl: string | null;
  note: string | null;
  includedItemsValue: number;
  isActive: boolean;
  items: ComboDetailItem[];
  createdAt: string;
  updatedAt: string;
};
