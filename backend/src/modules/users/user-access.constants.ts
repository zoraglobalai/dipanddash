export const STAFF_ASSIGNABLE_MODULE_KEYS = [
  "sales-statics",
  "orders",
  "invoices",
  "dump-wastage",
  "cash-audit",
  "stock-audit",
  "reports",
  "gaming",
  "suppliers",
  "purchase",
  "ingredient-entry",
  "items-entry",
  "offers",
  "customer-data",
  "assets-entry",
  "outlets",
  "attendance",
  "staff-management"
] as const;

export type StaffAssignableModuleKey = (typeof STAFF_ASSIGNABLE_MODULE_KEYS)[number];
