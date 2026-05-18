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
  "additional-entry",
  "items-entry",
  "offers",
  "customer-data",
  "pending",
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
  {
    label: "Additional Entry",
    value: "additional-entry",
    description: "Allow access to additional packaging/consumables inventory."
  },
  { label: "Items Entry", value: "items-entry", description: "Allow access to item/add-on/combo entry module." },
  { label: "Offers", value: "offers", description: "Allow access to offers and coupons module." },
  { label: "Customer Data", value: "customer-data", description: "Allow access to customer data module." },
  { label: "Pending", value: "pending", description: "Allow access to pending dues tracking and collection." },
  { label: "Assets Entry", value: "assets-entry", description: "Allow access to product/assets entry module." },
  { label: "Outlets", value: "outlets", description: "Allow access to outlets management module." },
  { label: "Attendance", value: "attendance", description: "Allow access to attendance admin records." },
  { label: "Staff Management", value: "staff-management", description: "Allow access to staff management module." }
];

export const ADMIN_MODULE_ROUTE_MAP: Record<AdminModuleKey, string> = {
  dashboard: `${APP_ROUTES.ADMIN_DASHBOARD}?business=dip_and_dash`,
  "sales-statics": "/sales-statics?business=dip_and_dash",
  orders: `${APP_ROUTES.ORDERS}?business=dip_and_dash`,
  invoices: `${APP_ROUTES.INVOICES}?business=dip_and_dash`,
  "dump-wastage": `${APP_ROUTES.DUMP_WASTAGE}?business=dip_and_dash`,
  "cash-audit": `${APP_ROUTES.CASH_AUDIT}?business=dip_and_dash`,
  "stock-audit": `${APP_ROUTES.STOCK_AUDIT}?business=dip_and_dash`,
  reports: `${APP_ROUTES.REPORTS}?business=dip_and_dash`,
  gaming: `${APP_ROUTES.GAMING}?business=snooker`,
  suppliers: `${APP_ROUTES.SUPPLIERS}?business=dip_and_dash`,
  purchase: `${APP_ROUTES.PURCHASE}?business=dip_and_dash`,
  "ingredient-entry": `${APP_ROUTES.INGREDIENT_ENTRY}?business=dip_and_dash`,
  "additional-entry": `${APP_ROUTES.ADDITIONAL_ENTRY}?business=dip_and_dash`,
  "items-entry": `${APP_ROUTES.ITEMS_ENTRY}?business=dip_and_dash`,
  offers: `${APP_ROUTES.OFFERS}?business=dip_and_dash`,
  "customer-data": "/customer-data?business=dip_and_dash",
  pending: `${APP_ROUTES.PENDING}?business=dip_and_dash`,
  "assets-entry": `${APP_ROUTES.ASSETS_ENTRY}?business=dip_and_dash`,
  outlets: `${APP_ROUTES.OUTLETS}?business=dip_and_dash`,
  attendance: `${APP_ROUTES.ATTENDANCE}?business=dip_and_dash`,
  "staff-management": APP_ROUTES.STAFF_MANAGEMENT
};
