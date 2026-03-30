export const DUMP_ENTRY_TYPES = ["ingredient", "item", "product"] as const;

export type DumpEntryType = (typeof DUMP_ENTRY_TYPES)[number];

export type DumpIngredientImpact = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lossAmount: number;
};
