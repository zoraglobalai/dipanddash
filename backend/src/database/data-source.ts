import "reflect-metadata";
import path from "node:path";
import { DataSource } from "typeorm";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";

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
import { ItemSauce } from "../modules/items/item-sauce.entity";
import { AddOn } from "../modules/items/add-on.entity";
import { AddOnIngredient } from "../modules/items/add-on-ingredient.entity";
import { AddOnSauce } from "../modules/items/add-on-sauce.entity";
import { Combo } from "../modules/items/combo.entity";
import { ComboItem } from "../modules/items/combo-item.entity";
import { SauceRecipe } from "../modules/items/sauce-recipe.entity";
import { SauceRecipeIngredient } from "../modules/items/sauce-recipe-ingredient.entity";
import { SauceBatch } from "../modules/items/sauce-batch.entity";
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
import { ProductDayLedgerAdjustment } from "../modules/procurement/product-day-ledger-adjustment.entity";
import { PurchaseBulkImport } from "../modules/procurement/purchase-bulk-import.entity";
import { PurchaseOrder } from "../modules/procurement/purchase-order.entity";
import { PurchaseOrderLine } from "../modules/procurement/purchase-order-line.entity";
import { ProductConsumptionImport } from "../modules/product-consumption/product-consumption-import.entity";
import { CashAudit } from "../modules/cash-audit/cash-audit.entity";
import { DumpEntry } from "../modules/dump/dump.entity";
import { Outlet } from "../modules/outlets/outlet.entity";
import { OutletTransfer } from "../modules/outlet-transfers/outlet-transfer.entity";
import { OutletIngredientStock } from "../modules/outlet-transfers/outlet-ingredient-stock.entity";
import { OutletProductStock } from "../modules/outlet-transfers/outlet-product-stock.entity";
import { PendingPaymentHistory } from "../modules/pending/pending-payment-history.entity";
import { Asset } from "../modules/assets/asset.entity";

const entities = [
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
  ItemSauce,
  AddOn,
  AddOnIngredient,
  AddOnSauce,
  Combo,
  ComboItem,
  SauceRecipe,
  SauceRecipeIngredient,
  SauceBatch,
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
  ProductDayLedgerAdjustment,
  PurchaseBulkImport,
  ProductConsumptionImport,
  PurchaseOrder,
  PurchaseOrderLine,
  CashAudit,
  DumpEntry,
  Outlet,
  OutletTransfer,
  OutletIngredientStock,
  OutletProductStock,
  PendingPaymentHistory,
  Asset
];

const migrations = [
  path.join(__dirname, "migrations", "*.ts"),
  path.join(__dirname, "migrations", "*.js")
];

const baseDataSourceOptions: Omit<
  PostgresConnectionOptions,
  "type" | "url" | "host" | "port" | "username" | "password" | "database"
> = {
  synchronize: env.DB_SYNCHRONIZE,
  logging: env.DB_LOGGING,
  ssl: env.DATABASE_SSL
    ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED }
    : false,
  entities,
  migrations,
  migrationsTableName: "typeorm_migrations"
};

export const AppDataSource = env.DATABASE_URL
  ? new DataSource({
      type: "postgres",
      ...baseDataSourceOptions,
      url: env.DATABASE_URL
    })
  : new DataSource({
      type: "postgres",
      ...baseDataSourceOptions,
      host: env.DATABASE_HOST!,
      port: env.DATABASE_PORT,
      username: env.DATABASE_USERNAME!,
      password: env.DATABASE_PASSWORD!,
      database: env.DATABASE_NAME!
    });
