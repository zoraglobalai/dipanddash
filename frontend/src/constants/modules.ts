import type { AppSelectOption } from "@/components/ui/select";
import { APP_ROUTES } from "./routes";

export const ADMIN_MODULE_KEYS = [
  "dashboard",
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

export type AdminModuleKey = (typeof ADMIN_MODULE_KEYS)[number];

export const STAFF_ASSIGNABLE_MODULE_OPTIONS: AppSelectOption[] = [
  { label: "Sales Statics", value: "sales-statics", description: "Allow access to sales analytics dashboard." },
  { label: "Orders", value: "orders", description: "Allow access to admin orders view." },
  { label: "Invoices", value: "invoices", description: "Allow access to invoice management." },
  { label: "Dump Wastage", value: "dump-wastage", description: "Allow access to dump/wastage records." },
  { label: "Cash Audit", value: "cash-audit", description: "Allow access to cash audit admin screens." },
  { label: "Stock Audit", value: "stock-audit", description: "Allow access to stock audit reports." },
  { label: "Reports", value: "reports", description: "Allow access to reports module." },
  { label: "Gaming", value: "gaming", description: "Allow access to gaming management." },
  { label: "Suppliers", value: "suppliers", description: "Allow access to supplier management." },
  { label: "Purchase", value: "purchase", description: "Allow access to purchase module." },
  { label: "Ingredient Entry", value: "ingredient-entry", description: "Allow access to ingredient entry module." },
  { label: "Items Entry", value: "items-entry", description: "Allow access to item/add-on/combo entry module." },
  { label: "Offers", value: "offers", description: "Allow access to offers and coupons module." },
  { label: "Customer Data", value: "customer-data", description: "Allow access to customer data module." },
  { label: "Assets Entry", value: "assets-entry", description: "Allow access to product/assets entry module." },
  { label: "Outlets", value: "outlets", description: "Allow access to outlets management module." },
  { label: "Attendance", value: "attendance", description: "Allow access to attendance admin records." },
  { label: "Staff Management", value: "staff-management", description: "Allow access to staff management module." }
];

export const ADMIN_MODULE_ROUTE_MAP: Record<AdminModuleKey, string> = {
  dashboard: APP_ROUTES.ADMIN_DASHBOARD,
  "sales-statics": "/sales-statics",
  orders: APP_ROUTES.ORDERS,
  invoices: APP_ROUTES.INVOICES,
  "dump-wastage": APP_ROUTES.DUMP_WASTAGE,
  "cash-audit": APP_ROUTES.CASH_AUDIT,
  "stock-audit": APP_ROUTES.STOCK_AUDIT,
  reports: APP_ROUTES.REPORTS,
  gaming: APP_ROUTES.GAMING,
  suppliers: APP_ROUTES.SUPPLIERS,
  purchase: APP_ROUTES.PURCHASE,
  "ingredient-entry": APP_ROUTES.INGREDIENT_ENTRY,
  "items-entry": APP_ROUTES.ITEMS_ENTRY,
  offers: APP_ROUTES.OFFERS,
  "customer-data": "/customer-data",
  "assets-entry": APP_ROUTES.ASSETS_ENTRY,
  outlets: APP_ROUTES.OUTLETS,
  attendance: APP_ROUTES.ATTENDANCE,
  "staff-management": APP_ROUTES.STAFF_MANAGEMENT
};
