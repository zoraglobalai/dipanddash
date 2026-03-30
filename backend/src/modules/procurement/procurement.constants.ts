export const PURCHASE_LINE_TYPES = ["ingredient", "product"] as const;
export const PURCHASE_ORDER_TYPES = ["ingredient", "product", "mixed"] as const;

export type PurchaseLineType = (typeof PURCHASE_LINE_TYPES)[number];
export type PurchaseOrderType = (typeof PURCHASE_ORDER_TYPES)[number];

export const PRODUCT_UNITS = [
  "pcs",
  "unit",
  "count",
  "pack",
  "packet",
  "box",
  "tin",
  "bottle",
  "can",
  "jar",
  "tray",
  "bag",
  "carton",
  "crate",
  "g",
  "kg",
  "ml",
  "l",
  "custom"
] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];
