import type { PaginationData } from "./ingredient";

export type AssetUnit =
  | "pcs"
  | "unit"
  | "set"
  | "nos"
  | "kg"
  | "g"
  | "l"
  | "ml"
  | "custom";

export type AssetListItem = {
  id: string;
  name: string;
  section: "dip_and_dash" | "gaming";
  quantity: number;
  unit: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AssetListResponse = {
  assets: AssetListItem[];
  pagination: PaginationData;
  stats: {
    totalAssets: number;
    activeAssets: number;
    inactiveAssets: number;
    totalQuantity: number;
  };
};
