import "reflect-metadata";
import { DataSource } from "typeorm";

import { env } from "../config/env";
import { User } from "../modules/users/user.entity";
import { AttendanceRecord } from "../modules/attendance/attendance.entity";
import { IngredientCategory } from "../modules/ingredients/ingredient-category.entity";
import { Ingredient } from "../modules/ingredients/ingredient.entity";
import { IngredientStock } from "../modules/ingredients/ingredient-stock.entity";
import { IngredientStockLog } from "../modules/ingredients/ingredient-stock-log.entity";
import { DailyAllocation } from "../modules/ingredients/daily-allocation.entity";
import { PosBillingControl } from "../modules/ingredients/pos-billing-control.entity";
import { StaffClosingReport } from "../modules/ingredients/staff-closing-report.entity";
import { ItemCategory } from "../modules/items/item-category.entity";
import { Item } from "../modules/items/item.entity";
import { ItemIngredient } from "../modules/items/item-ingredient.entity";
import { AddOn } from "../modules/items/add-on.entity";
import { AddOnIngredient } from "../modules/items/add-on-ingredient.entity";
import { Combo } from "../modules/items/combo.entity";
import { ComboItem } from "../modules/items/combo-item.entity";
import { Coupon } from "../modules/offers/coupon.entity";
import { CouponUsage } from "../modules/offers/coupon-usage.entity";
import { AuthSession } from "../modules/auth/auth-session.entity";
import { Customer } from "../modules/customers/customer.entity";
import { Invoice } from "../modules/invoices/invoice.entity";
import { InvoiceLine } from "../modules/invoices/invoice-line.entity";
import { InvoicePayment } from "../modules/invoices/invoice-payment.entity";
import { InvoiceActivity } from "../modules/invoices/invoice-activity.entity";
import { InvoiceUsageEvent } from "../modules/invoices/invoice-usage-event.entity";
import { SyncReceipt } from "../modules/pos-sync/sync-receipt.entity";
import { GamingBooking } from "../modules/gaming/gaming-booking.entity";
import { Supplier } from "../modules/procurement/supplier.entity";
import { Product } from "../modules/procurement/product.entity";
import { PurchaseOrder } from "../modules/procurement/purchase-order.entity";
import { PurchaseOrderLine } from "../modules/procurement/purchase-order-line.entity";
import { CashAudit } from "../modules/cash-audit/cash-audit.entity";
import { DumpEntry } from "../modules/dump/dump.entity";
import { Outlet } from "../modules/outlets/outlet.entity";
import { OutletTransfer } from "../modules/outlet-transfers/outlet-transfer.entity";
import { OutletIngredientStock } from "../modules/outlet-transfers/outlet-ingredient-stock.entity";
import { OutletProductStock } from "../modules/outlet-transfers/outlet-product-stock.entity";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: env.DATABASE_HOST,
  port: env.DATABASE_PORT,
  username: env.DATABASE_USERNAME,
  password: env.DATABASE_PASSWORD,
  database: env.DATABASE_NAME,
  synchronize: env.NODE_ENV !== "production",
  logging: false,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  entities: [
    User,
    AttendanceRecord,
    IngredientCategory,
    Ingredient,
    IngredientStock,
    IngredientStockLog,
    DailyAllocation,
    PosBillingControl,
    StaffClosingReport,
    ItemCategory,
    Item,
    ItemIngredient,
    AddOn,
    AddOnIngredient,
    Combo,
    ComboItem,
    Coupon,
    CouponUsage,
    AuthSession,
    Customer,
    Invoice,
    InvoiceLine,
    InvoicePayment,
    InvoiceActivity,
    InvoiceUsageEvent,
    SyncReceipt,
    GamingBooking,
    Supplier,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    CashAudit,
    DumpEntry,
    Outlet,
    OutletTransfer,
    OutletIngredientStock,
    OutletProductStock
  ],
  migrations: ["src/database/migrations/*.ts"]
});
