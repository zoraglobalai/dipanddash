export const INVOICE_ORDER_TYPES = ["takeaway", "dine_in", "delivery", "snooker"] as const;
export type InvoiceOrderType = (typeof INVOICE_ORDER_TYPES)[number];

export const INVOICE_STATUSES = ["pending", "paid", "cancelled", "refunded"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const KITCHEN_STATUSES = ["not_sent", "queued", "preparing", "ready", "served"] as const;
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

export const PAYMENT_MODES = ["cash", "card", "upi", "mixed"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_STATUSES = ["success", "failed", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const INVOICE_LINE_TYPES = ["item", "add_on", "combo", "product", "custom"] as const;
export type InvoiceLineType = (typeof INVOICE_LINE_TYPES)[number];

export const INVOICE_ACTIVITY_TYPES = [
  "created",
  "synced",
  "cancelled",
  "refunded",
  "updated"
] as const;
export type InvoiceActivityType = (typeof INVOICE_ACTIVITY_TYPES)[number];
