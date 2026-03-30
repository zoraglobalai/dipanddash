export const OUTLET_TRANSFER_LINE_TYPES = ["ingredient", "product", "item"] as const;

export type OutletTransferLineType = (typeof OUTLET_TRANSFER_LINE_TYPES)[number];

export type OutletTransferLineImpact = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
};

export type OutletTransferLineSnapshot = {
  lineType: OutletTransferLineType;
  sourceId: string;
  sourceName: string;
  quantity: number;
  unit: string;
  lineValue: number;
  impacts?: OutletTransferLineImpact[];
};
