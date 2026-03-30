export const REPORT_KEYS = [
  "daily_sales_report",
  "product_wise_sales_report",
  "payment_method_report",
  "discount_report",
  "cancelled_void_report",
  "kot_report",
  "customer_report",
  "purchase_report",
  "supplier_wise_report",
  "stock_report",
  "low_stock_report",
  "ingredient_report",
  "menu_report",
  "staff_attendance_report",
  "staff_login_report",
  "gst_report",
  "expense_report",
  "delivery_report",
  "dine_in_report",
  "online_report",
  "combo_report",
  "peak_sales_time_report",
  "stock_consumption_report",
  "gaming_report",
  "cash_audit_report"
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];

export type ReportCatalogItem = {
  key: ReportKey;
  title: string;
  description: string;
  category: "Sales" | "Operations" | "Inventory" | "Staff" | "Finance" | "Gaming";
};

export const REPORT_CATALOG: ReportCatalogItem[] = [
  {
    key: "daily_sales_report",
    title: "Daily Sales Report",
    description: "Day-wise billed sales, order count, tax and discount summary.",
    category: "Sales"
  },
  {
    key: "product_wise_sales_report",
    title: "Product Wise Sales Report",
    description: "Item/add-on/combo level quantities and billed amount.",
    category: "Sales"
  },
  {
    key: "payment_method_report",
    title: "Payment Method Report",
    description: "Cash, UPI, card and mixed payment split.",
    category: "Finance"
  },
  {
    key: "discount_report",
    title: "Discount Report",
    description: "Coupon, manual and item discount totals with day-wise trend.",
    category: "Finance"
  },
  {
    key: "cancelled_void_report",
    title: "Cancelled / Void Report",
    description: "Cancelled and refunded invoices with reason tracking.",
    category: "Operations"
  },
  {
    key: "kot_report",
    title: "KOT Report",
    description: "Kitchen ticket flow by status with pending queue visibility.",
    category: "Operations"
  },
  {
    key: "customer_report",
    title: "Customer Report",
    description: "Customer-wise visit count and billed amount.",
    category: "Sales"
  },
  {
    key: "purchase_report",
    title: "Purchase Report",
    description: "Purchase orders and procurement totals by period.",
    category: "Inventory"
  },
  {
    key: "supplier_wise_report",
    title: "Supplier Wise Report",
    description: "Supplier contribution and purchase amount split.",
    category: "Inventory"
  },
  {
    key: "stock_report",
    title: "Stock Report (Date Range)",
    description: "Ingredient stock, allocation and consumption summary.",
    category: "Inventory"
  },
  {
    key: "low_stock_report",
    title: "Low Stock Report",
    description: "Ingredients and products below minimum stock.",
    category: "Inventory"
  },
  {
    key: "ingredient_report",
    title: "Ingredient Report",
    description: "Ingredient valuation, pricing and stock health.",
    category: "Inventory"
  },
  {
    key: "menu_report",
    title: "Menu Report",
    description: "Items, add-ons and combos with status and pricing.",
    category: "Sales"
  },
  {
    key: "staff_attendance_report",
    title: "Staff Attendance Report",
    description: "Punch-in, punch-out and worked hours summary.",
    category: "Staff"
  },
  {
    key: "staff_login_report",
    title: "Staff Login Report",
    description: "Shift login count and latest login activity by staff.",
    category: "Staff"
  },
  {
    key: "gst_report",
    title: "GST Report",
    description: "Tax collection summary from paid invoices.",
    category: "Finance"
  },
  {
    key: "expense_report",
    title: "Expense Report",
    description: "Purchase and refund impact summary (expense proxy).",
    category: "Finance"
  },
  {
    key: "delivery_report",
    title: "Delivery Report",
    description: "Delivery order count and billed totals.",
    category: "Sales"
  },
  {
    key: "dine_in_report",
    title: "Dine In Report",
    description: "Dine-in order trend and revenue.",
    category: "Sales"
  },
  {
    key: "online_report",
    title: "Online Report (Swiggy/Zomato)",
    description: "Online channel orders inferred from invoice metadata.",
    category: "Sales"
  },
  {
    key: "combo_report",
    title: "Combo Report",
    description: "Combo sales quantity and billed value.",
    category: "Sales"
  },
  {
    key: "peak_sales_time_report",
    title: "Peak Sales Time Report",
    description: "Hourly order and revenue distribution.",
    category: "Sales"
  },
  {
    key: "stock_consumption_report",
    title: "Stock Consumption Report",
    description: "Day-wise opening stock, purchase, dump, consumption, transfer in/out and remaining stock.",
    category: "Inventory"
  },
  {
    key: "gaming_report",
    title: "Gaming Report",
    description: "Snooker/console sessions, revenue and payment status.",
    category: "Gaming"
  },
  {
    key: "cash_audit_report",
    title: "Cash Audit Report",
    description: "Cash count trail, staff cash taken and audit variance.",
    category: "Finance"
  }
];
