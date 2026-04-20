import { EntityManager, In } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { DailyAllocation } from "../ingredients/daily-allocation.entity";
import { IngredientCategory } from "../ingredients/ingredient-category.entity";
import { Ingredient } from "../ingredients/ingredient.entity";
import { IngredientStockLogType } from "../ingredients/ingredients.constants";
import { IngredientStockLog } from "../ingredients/ingredient-stock-log.entity";
import { IngredientStock } from "../ingredients/ingredient-stock.entity";
import { InvoiceLine } from "../invoices/invoice-line.entity";
import { Product } from "./product.entity";
import {
  PRODUCT_TARGET_SECTIONS,
  PRODUCT_UNITS,
  PURCHASE_LINE_TYPES,
  PURCHASE_ORDER_TYPES,
  PURCHASE_SECTIONS,
  type PurchaseLineType,
  type ProductTargetSection,
  type ProductUnit,
  type PurchaseOrderType,
  type PurchaseSection
} from "./procurement.constants";
import { PurchaseOrderLine } from "./purchase-order-line.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import { Supplier } from "./supplier.entity";
import {
  convertPurchaseQuantityToBase,
  getCompatibleIngredientUnits,
  getCompatibleProductUnits
} from "./procurement.units";
import { getLatestIngredientPurchasePriceMap } from "./ingredient-costing";

type PaginationFilters = {
  page: number;
  limit: number;
};

type SupplierListFilters = PaginationFilters & {
  search?: string;
  includeInactive?: boolean;
};

type ProductListFilters = PaginationFilters & {
  search?: string;
  category?: string;
  supplierId?: string;
  targetSection?: ProductTargetSection;
  includeInactive?: boolean;
};

type ProductDayLedgerFilters = PaginationFilters & {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
  search?: string;
  targetSection?: ProductTargetSection;
};

type PurchaseOrderListFilters = PaginationFilters & {
  search?: string;
  supplierId?: string;
  purchaseType?: PurchaseOrderType;
  dateFrom?: string;
  dateTo?: string;
};

type ProcurementMetaFilters = {
  date?: string;
  ingredientCategoryId?: string;
  ingredientSearch?: string;
  productSearch?: string;
};

type ProcurementStatsFilters = {
  dateFrom?: string;
  dateTo?: string;
};

type CreateSupplierPayload = {
  name: string;
  storeName?: string;
  phone: string;
  address?: string;
  isActive?: boolean;
};

type UpdateSupplierPayload = Partial<CreateSupplierPayload>;

type CreateProductPayload = {
  name: string;
  category: string;
  sku?: string;
  packSize?: string;
  unit: ProductUnit;
  minStock: number;
  sellingPrice: number;
  targetSection: ProductTargetSection;
  dipAndDashAssignedStock?: number;
  gamingAssignedStock?: number;
  defaultSupplierId?: string | null;
  isActive?: boolean;
};

type UpdateProductPayload = Partial<CreateProductPayload>;

type PurchaseOrderLinePayload = {
  lineType: PurchaseLineType;
  ingredientId?: string;
  productId?: string;
  quantity: number;
  quantityUnit?: string;
  unitPrice: number;
  expiryDate?: string;
  note?: string;
};

type CreatePurchaseOrderPayload = {
  supplierId: string;
  purchaseDate?: string;
  purchaseSection?: PurchaseSection;
  note?: string;
  invoiceImageUrl?: string;
  lines: PurchaseOrderLinePayload[];
};

type PurchaseBulkCsvRow = {
  rowNumber: number;
  supplierName: string;
  purchaseDate: string;
  purchaseNote: string;
  lineType: PurchaseLineType;
  itemName: string;
  quantity: number;
  quantityUnit?: string;
  unitPrice: number;
  expiryDate?: string;
  lineNote?: string;
};

const PURCHASE_BULK_TEMPLATE_HEADERS = [
  "supplier_name",
  "purchase_date",
  "purchase_note",
  "line_type",
  "item_name",
  "quantity",
  "quantity_unit",
  "unit_price",
  "expiry_date",
  "line_note"
] as const;

const MAX_PURCHASE_BULK_INVALID_DETAILS = 30;

type ProductBulkCsvRow = {
  rowNumber: number;
  productName: string;
  category: string;
  sku: string | null;
  packSize: string | null;
  unit: ProductUnit;
  defaultSupplierName: string | null;
  minStock: number;
  sellingPrice: number;
  targetSection: ProductTargetSection;
  isActive: boolean;
};

const PRODUCT_BULK_TEMPLATE_HEADERS = [
  "product_name",
  "category",
  "sku",
  "pack_size",
  "unit",
  "default_supplier_name",
  "min_stock",
  "selling_price",
  "target_section",
  "is_active"
] as const;

const VALID_PRODUCT_UNIT_SET = new Set<string>(PRODUCT_UNITS.map((unit) => unit.toLowerCase()));
const VALID_PRODUCT_TARGET_SECTION_SET = new Set<string>(PRODUCT_TARGET_SECTIONS.map((section) => section.toLowerCase()));
const MAX_PRODUCT_BULK_INVALID_DETAILS = 40;

const toNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toFixedQuantity = (value: number) => Number(value.toFixed(3));
const toFixedPrice = (value: number) => Number(value.toFixed(2));
const toYmd = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return trimmed;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value ?? "");
};

const resolveDayRangeInUtc = (date: string) => {
  const start = new Date(`${date}T00:00:00.000+05:30`);
  if (Number.isNaN(start.getTime())) {
    throw new AppError(422, "Date must be in YYYY-MM-DD format.");
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
};

const normalizeProductSectionStocks = (input: {
  targetSection: ProductTargetSection;
  currentStock: number;
  dipAndDashStock: number;
  gamingStock: number;
}) => {
  const currentStock = toFixedQuantity(Math.max(0, toNumber(input.currentStock)));
  const rawDip = toFixedQuantity(Math.max(0, toNumber(input.dipAndDashStock)));
  const rawGaming = toFixedQuantity(Math.max(0, toNumber(input.gamingStock)));

  if (input.targetSection === "dip_and_dash") {
    return {
      currentStock,
      dipAndDashStock: currentStock,
      gamingStock: 0
    };
  }

  if (input.targetSection === "gaming") {
    return {
      currentStock,
      dipAndDashStock: 0,
      gamingStock: currentStock
    };
  }

  const assignedTotal = toFixedQuantity(rawDip + rawGaming);
  if (Math.abs(assignedTotal - currentStock) <= 0.001) {
    return {
      currentStock,
      dipAndDashStock: rawDip,
      gamingStock: rawGaming
    };
  }

  if (currentStock <= 0) {
    return {
      currentStock: 0,
      dipAndDashStock: 0,
      gamingStock: 0
    };
  }

  if (assignedTotal > 0) {
    const ratio = rawDip / assignedTotal;
    const dipAndDashStock = toFixedQuantity(currentStock * ratio);
    return {
      currentStock,
      dipAndDashStock,
      gamingStock: toFixedQuantity(currentStock - dipAndDashStock)
    };
  }

  return {
    currentStock,
    dipAndDashStock: currentStock,
    gamingStock: 0
  };
};

const applyProductPurchaseSplit = (product: Product, stockAdded: number) => {
  const added = toFixedQuantity(Math.max(0, toNumber(stockAdded)));
  const existing = normalizeProductSectionStocks({
    targetSection: product.targetSection,
    currentStock: toNumber(product.currentStock),
    dipAndDashStock: toNumber(product.dipAndDashStock),
    gamingStock: toNumber(product.gamingStock)
  });

  let dipAndDashAdded = 0;
  let gamingAdded = 0;

  if (product.targetSection === "dip_and_dash") {
    dipAndDashAdded = added;
  } else if (product.targetSection === "gaming") {
    gamingAdded = added;
  } else {
    const baseTotal = toFixedQuantity(existing.dipAndDashStock + existing.gamingStock);
    const ratio = baseTotal > 0 ? existing.dipAndDashStock / baseTotal : 0.5;
    dipAndDashAdded = toFixedQuantity(added * ratio);
    gamingAdded = toFixedQuantity(added - dipAndDashAdded);
  }

  const nextDipAndDash = toFixedQuantity(existing.dipAndDashStock + dipAndDashAdded);
  const nextGaming = toFixedQuantity(existing.gamingStock + gamingAdded);
  product.dipAndDashStock = nextDipAndDash;
  product.gamingStock = nextGaming;
  product.currentStock = toFixedQuantity(nextDipAndDash + nextGaming);

  return {
    dipAndDashAdded,
    gamingAdded
  };
};

const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDayDifference = (fromYmd: string, toYmd: string) => {
  const [fromYear, fromMonth, fromDay] = fromYmd.split("-").map((value) => Number(value));
  const [toYear, toMonth, toDay] = toYmd.split("-").map((value) => Number(value));
  if (
    !Number.isFinite(fromYear) ||
    !Number.isFinite(fromMonth) ||
    !Number.isFinite(fromDay) ||
    !Number.isFinite(toYear) ||
    !Number.isFinite(toMonth) ||
    !Number.isFinite(toDay)
  ) {
    return 0;
  }

  const fromUtc = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toUtc = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
};

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const getStockStatus = (currentStock: number, minStock: number) =>
  currentStock <= minStock ? "LOW_STOCK" : "HEALTHY";

const normalizeText = (value: string) => value.trim();
const normalizeLookupKey = (value: string) => normalizeText(value).toLowerCase();
const normalizeHeaderKey = (value: string) => value.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

const escapeCsvValue = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
};

const parseCsvRows = (content: string) => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (char === "\"") {
      const nextChar = content[index + 1];
      if (inQuotes && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && content[index + 1] === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
};

const parseDateLikeToYmd = (value: string, rowNumber: number, fieldLabel: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() + 1 !== month ||
      parsed.getDate() !== day
    ) {
      throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} must be a valid date.`);
    }
    return trimmed;
  }

  const dmyMatch = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() + 1 !== month ||
      parsed.getDate() !== day
    ) {
      throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} must be a valid date.`);
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} must be in YYYY-MM-DD or DD-MM-YYYY format.`);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parsePositiveNumber = (value: string, rowNumber: number, fieldLabel: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} must be greater than zero.`);
  }
  return parsed;
};

const parseNonNegativeNumber = (value: string, rowNumber: number, fieldLabel: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} cannot be negative.`);
  }
  return parsed;
};

const parseBooleanFlexible = (value: string, fallback = true) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["true", "1", "yes", "y", "active", "enabled"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n", "inactive", "disabled"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const chunkArray = <T>(values: T[], size = 500) => {
  if (size <= 0) {
    return [values];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

export class ProcurementService {
  private readonly supplierRepository = AppDataSource.getRepository(Supplier);
  private readonly productRepository = AppDataSource.getRepository(Product);
  private readonly ingredientRepository = AppDataSource.getRepository(Ingredient);
  private readonly ingredientCategoryRepository = AppDataSource.getRepository(IngredientCategory);
  private readonly ingredientStockRepository = AppDataSource.getRepository(IngredientStock);
  private readonly allocationRepository = AppDataSource.getRepository(DailyAllocation);
  private readonly purchaseOrderRepository = AppDataSource.getRepository(PurchaseOrder);
  private readonly purchaseOrderLineRepository = AppDataSource.getRepository(PurchaseOrderLine);
  private readonly invoiceLineRepository = AppDataSource.getRepository(InvoiceLine);

  private async getSupplierOrFail(id: string) {
    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) {
      throw new AppError(404, "Supplier not found");
    }
    return supplier;
  }

  private async getProductOrFail(id: string) {
    const product = await this.productRepository.findOne({ where: { id }, relations: { defaultSupplier: true } });
    if (!product) {
      throw new AppError(404, "Product not found");
    }
    return product;
  }

  private async ensureSupplierExists(supplierId: string | null | undefined) {
    if (!supplierId) {
      return null;
    }

    const supplier = await this.supplierRepository.findOne({
      where: { id: supplierId, isActive: true }
    });
    if (!supplier) {
      throw new AppError(404, "Default supplier not found or inactive");
    }

    return supplier;
  }

  private async ensureSupplierNameUnique(name: string, ignoreId?: string) {
    const query = this.supplierRepository
      .createQueryBuilder("supplier")
      .where("LOWER(supplier.name) = LOWER(:name)", { name });

    if (ignoreId) {
      query.andWhere("supplier.id != :ignoreId", { ignoreId });
    }

    const existing = await query.getOne();
    if (existing) {
      throw new AppError(409, "Supplier with this name already exists");
    }
  }

  private async ensureProductNameUnique(name: string, ignoreId?: string) {
    const query = this.productRepository
      .createQueryBuilder("product")
      .where("LOWER(product.name) = LOWER(:name)", { name });

    if (ignoreId) {
      query.andWhere("product.id != :ignoreId", { ignoreId });
    }

    const existing = await query.getOne();
    if (existing) {
      throw new AppError(409, "Product with this name already exists");
    }
  }

  private mapSupplierSummary(
    supplier: Supplier,
    metrics?: { purchaseOrdersCount?: number; totalPurchasedAmount?: number; lastPurchaseDate?: string | null }
  ) {
    return {
      id: supplier.id,
      name: supplier.name,
      storeName: supplier.storeName,
      phone: supplier.phone,
      address: supplier.address,
      isActive: supplier.isActive,
      purchaseOrdersCount: metrics?.purchaseOrdersCount ?? 0,
      totalPurchasedAmount: toFixedPrice(metrics?.totalPurchasedAmount ?? 0),
      lastPurchaseDate: metrics?.lastPurchaseDate ?? null,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt
    };
  }

  private mapProductSummary(
    product: Product,
    metrics?: {
      purchasedQuantity?: number;
      purchaseOrdersCount?: number;
      totalPurchasedAmount?: number;
      recentPurchaseDate?: string | null;
      nextExpiryDate?: string | null;
      latestExpiryDate?: string | null;
      soldQuantity?: number;
      soldAmount?: number;
    }
  ) {
    const normalizedSectionStocks = normalizeProductSectionStocks({
      targetSection: product.targetSection,
      currentStock: toNumber(product.currentStock),
      dipAndDashStock: toNumber(product.dipAndDashStock),
      gamingStock: toNumber(product.gamingStock)
    });
    const currentStock = normalizedSectionStocks.currentStock;
    const minStock = toFixedQuantity(toNumber(product.minStock));
    const todayYmd = getTodayDate();
    const nextExpiryDate = metrics?.nextExpiryDate ?? null;
    const latestExpiryDate = metrics?.latestExpiryDate ?? null;
    const isExpired =
      currentStock > 0 &&
      Boolean(latestExpiryDate) &&
      getDayDifference(latestExpiryDate as string, todayYmd) < 0;

    let expiryStatus: "NO_EXPIRY" | "FRESH" | "EXPIRING_SOON" | "EXPIRED" = "NO_EXPIRY";
    let ageingDays: number | null = null;
    const purchaseUnitPrice = toFixedPrice(toNumber(product.purchaseUnitPrice));
    const soldQuantity = toFixedQuantity(metrics?.soldQuantity ?? 0);
    const soldAmount = toFixedPrice(metrics?.soldAmount ?? 0);
    const estimatedProfit = toFixedPrice(soldAmount - soldQuantity * purchaseUnitPrice);

    if (isExpired) {
      expiryStatus = "EXPIRED";
      ageingDays = Math.abs(getDayDifference(latestExpiryDate as string, todayYmd));
    } else if (nextExpiryDate) {
      const daysToExpiry = getDayDifference(todayYmd, nextExpiryDate);
      ageingDays = daysToExpiry;
      expiryStatus = daysToExpiry <= 7 ? "EXPIRING_SOON" : "FRESH";
    }

    return {
      id: product.id,
      name: product.name,
      category: product.category,
      sku: product.sku,
      packSize: product.packSize,
      unit: product.unit,
      currentStock,
      dipAndDashAssignedStock: normalizedSectionStocks.dipAndDashStock,
      gamingAssignedStock: normalizedSectionStocks.gamingStock,
      minStock,
      purchaseUnitPrice,
      sellingPrice: toFixedPrice(toNumber(product.sellingPrice)),
      targetSection: product.targetSection,
      defaultSupplierId: product.defaultSupplierId,
      defaultSupplierName: product.defaultSupplier?.name ?? null,
      isActive: product.isActive,
      stockStatus: getStockStatus(currentStock, minStock),
      valuation: toFixedPrice(currentStock * toNumber(product.purchaseUnitPrice)),
      purchasedQuantity: toFixedQuantity(metrics?.purchasedQuantity ?? 0),
      purchaseOrdersCount: metrics?.purchaseOrdersCount ?? 0,
      totalPurchasedAmount: toFixedPrice(metrics?.totalPurchasedAmount ?? 0),
      recentPurchaseDate: metrics?.recentPurchaseDate ?? null,
      soldQuantity,
      soldAmount,
      estimatedProfit,
      nextExpiryDate,
      latestExpiryDate,
      expiryStatus,
      ageingDays,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };
  }

  private async generatePurchaseNumber(manager: EntityManager, date: string) {
    const compactDate = date.replaceAll("-", "");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
      const purchaseNumber = `PO-${compactDate}-${suffix}`;
      const existing = await manager.findOne(PurchaseOrder, { where: { purchaseNumber } });
      if (!existing) {
        return purchaseNumber;
      }
    }

    throw new AppError(500, "Unable to generate purchase number right now. Please try again.");
  }

  private resolvePurchaseType(lines: PurchaseOrderLinePayload[]): PurchaseOrderType {
    const hasIngredient = lines.some((line) => line.lineType === "ingredient");
    const hasProduct = lines.some((line) => line.lineType === "product");

    if (hasIngredient && hasProduct) {
      return PURCHASE_ORDER_TYPES[2];
    }
    if (hasIngredient) {
      return PURCHASE_ORDER_TYPES[0];
    }
    return PURCHASE_ORDER_TYPES[1];
  }

  private resolvePurchaseSection(input?: PurchaseSection): PurchaseSection {
    return PURCHASE_SECTIONS.includes(input as PurchaseSection) ? (input as PurchaseSection) : "dip_and_dash";
  }

  getPurchaseBulkImportTemplate() {
    const rows = [
      [...PURCHASE_BULK_TEMPLATE_HEADERS],
      ["Vamshi", "2026-04-10", "Morning purchase from market", "ingredient", "Tomato", "25", "kg", "28.5", "", ""],
      [
        "Vamshi",
        "2026-04-10",
        "Morning purchase from market",
        "ingredient",
        "Burger Box",
        "100",
        "pcs",
        "0",
        "",
        "Additional item / packaging stock"
      ],
      [
        "Vamshi",
        "2026-04-10",
        "Morning purchase from market",
        "product",
        "7up",
        "12",
        "bottle",
        "40",
        "2026-07-31",
        "Promo rate"
      ]
    ];

    const csv = rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\n");
    return {
      fileName: "purchase_bulk_template.csv",
      content: `\uFEFF${csv}`
    };
  }

  private parseBulkPurchaseRows(csvBuffer: Buffer) {
    const content = csvBuffer.toString("utf-8").replace(/^\uFEFF/, "").trim();
    if (!content) {
      throw new AppError(422, "Uploaded CSV file is empty.");
    }

    const parsedRows = parseCsvRows(content);
    if (!parsedRows.length) {
      throw new AppError(422, "Uploaded CSV file is empty.");
    }

    const headerRow = parsedRows[0].map((cell) => cell.trim());
    const headerAliases = new Map<string, string>([
      ["suppliername", "supplier_name"],
      ["supplier", "supplier_name"],
      ["purchasedate", "purchase_date"],
      ["date", "purchase_date"],
      ["purchasenote", "purchase_note"],
      ["linetype", "line_type"],
      ["type", "line_type"],
      ["itemname", "item_name"],
      ["item", "item_name"],
      ["quantity", "quantity"],
      ["quantityunit", "quantity_unit"],
      ["unit", "quantity_unit"],
      ["unitprice", "unit_price"],
      ["price", "unit_price"],
      ["expirydate", "expiry_date"],
      ["expdate", "expiry_date"],
      ["expiry", "expiry_date"],
      ["linenote", "line_note"],
      ["note", "line_note"]
    ]);

    const headerIndexMap = new Map<string, number>();
    headerRow.forEach((header, index) => {
      const alias = headerAliases.get(normalizeHeaderKey(header));
      if (alias) {
        headerIndexMap.set(alias, index);
      }
    });

    const requiredHeaders: Array<(typeof PURCHASE_BULK_TEMPLATE_HEADERS)[number]> = [
      "supplier_name",
      "line_type",
      "item_name",
      "quantity",
      "unit_price"
    ];
    const missingHeaders = requiredHeaders.filter((header) => !headerIndexMap.has(header));
    if (missingHeaders.length) {
      throw new AppError(
        422,
        `Missing required column(s): ${missingHeaders.join(", ")}. Please use the downloadable template.`
      );
    }

    const readValue = (row: string[], header: (typeof PURCHASE_BULK_TEMPLATE_HEADERS)[number]) => {
      const columnIndex = headerIndexMap.get(header);
      if (columnIndex === undefined) {
        return "";
      }
      return String(row[columnIndex] ?? "");
    };

    const nonEmptyRows = parsedRows
      .slice(1)
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(({ row }) => row.some((cell) => cell.trim().length > 0));

    if (!nonEmptyRows.length) {
      throw new AppError(422, "Uploaded CSV does not contain any purchase rows.");
    }

    const rows: PurchaseBulkCsvRow[] = [];
    const invalidRows: Array<{ rowNumber: number; reason: string }> = [];

    nonEmptyRows.forEach(({ row, rowNumber }) => {
      try {
        const supplierName = normalizeText(readValue(row, "supplier_name"));
        const purchaseDateRaw = readValue(row, "purchase_date");
        const purchaseNote = normalizeText(readValue(row, "purchase_note"));
        const lineTypeRaw = normalizeText(readValue(row, "line_type")).toLowerCase();
        const itemName = normalizeText(readValue(row, "item_name"));
        const quantityRaw = normalizeText(readValue(row, "quantity"));
        const quantityUnit = normalizeText(readValue(row, "quantity_unit")).toLowerCase();
        const unitPriceRaw = normalizeText(readValue(row, "unit_price"));
        const expiryDateRaw = normalizeText(readValue(row, "expiry_date"));
        const lineNote = normalizeText(readValue(row, "line_note"));

        if (!supplierName) {
          throw new AppError(422, `Row ${rowNumber}: Supplier name is required.`);
        }
        if (!PURCHASE_LINE_TYPES.includes(lineTypeRaw as PurchaseLineType)) {
          throw new AppError(422, `Row ${rowNumber}: Line type must be ingredient or product.`);
        }
        if (!itemName) {
          throw new AppError(422, `Row ${rowNumber}: Item name is required.`);
        }
        if (!quantityRaw) {
          throw new AppError(422, `Row ${rowNumber}: Quantity is required.`);
        }
        if (!unitPriceRaw) {
          throw new AppError(422, `Row ${rowNumber}: Unit price is required.`);
        }

        const purchaseDate = parseDateLikeToYmd(purchaseDateRaw, rowNumber, "Purchase date") || getTodayDate();
        const quantity = toFixedQuantity(parsePositiveNumber(quantityRaw, rowNumber, "Quantity"));
        const unitPrice = toFixedPrice(parseNonNegativeNumber(unitPriceRaw, rowNumber, "Unit price"));
        const expiryDate = parseDateLikeToYmd(expiryDateRaw, rowNumber, "Expiry date") || undefined;
        if (lineTypeRaw === "ingredient" && expiryDate) {
          throw new AppError(422, `Row ${rowNumber}: expiry_date is allowed only for product lines.`);
        }

        rows.push({
          rowNumber,
          supplierName,
          purchaseDate,
          purchaseNote,
          lineType: lineTypeRaw as PurchaseLineType,
          itemName,
          quantity,
          quantityUnit: quantityUnit || undefined,
          unitPrice,
          expiryDate: lineTypeRaw === "product" ? expiryDate : undefined,
          lineNote: lineNote || undefined
        });
      } catch (error) {
        const reason =
          error instanceof AppError ? error.message.replace(/^Row \d+:\s*/i, "") : "Row validation failed.";
        if (invalidRows.length < MAX_PURCHASE_BULK_INVALID_DETAILS) {
          invalidRows.push({ rowNumber, reason });
        }
      }
    });

    if (invalidRows.length) {
      const preview = invalidRows
        .slice(0, 3)
        .map((entry) => `Row ${entry.rowNumber}: ${entry.reason}`)
        .join(" | ");
      throw new AppError(
        422,
        `CSV validation failed for ${invalidRows.length} row(s). ${preview}`,
        invalidRows
      );
    }

    const firstRow = rows[0];
    const canonicalSupplier = normalizeLookupKey(firstRow.supplierName);
    const canonicalDate = firstRow.purchaseDate;
    const canonicalNote = firstRow.purchaseNote;

    rows.forEach((row) => {
      if (normalizeLookupKey(row.supplierName) !== canonicalSupplier) {
        throw new AppError(
          422,
          `Row ${row.rowNumber}: All rows in one upload must use the same supplier_name.`
        );
      }
      if (row.purchaseDate !== canonicalDate) {
        throw new AppError(
          422,
          `Row ${row.rowNumber}: All rows in one upload must use the same purchase_date.`
        );
      }
      if (row.purchaseNote !== canonicalNote) {
        throw new AppError(
          422,
          `Row ${row.rowNumber}: All rows in one upload must use the same purchase_note.`
        );
      }
    });

    return {
      rows,
      supplierName: firstRow.supplierName,
      purchaseDate: firstRow.purchaseDate,
      purchaseNote: firstRow.purchaseNote
    };
  }

  async bulkImportPurchaseOrderFromCsv(csvBuffer: Buffer, createdByUserId: string) {
    const parsed = this.parseBulkPurchaseRows(csvBuffer);

    const supplier = await this.supplierRepository
      .createQueryBuilder("supplier")
      .where("LOWER(supplier.name) = LOWER(:name)", { name: parsed.supplierName })
      .andWhere("supplier.isActive = true")
      .getOne();

    if (!supplier) {
      throw new AppError(404, `Active supplier not found: ${parsed.supplierName}`);
    }

    const ingredientNameKeys = Array.from(
      new Set(
        parsed.rows
          .filter((row) => row.lineType === "ingredient")
          .map((row) => normalizeLookupKey(row.itemName))
      )
    );
    const productNameKeys = Array.from(
      new Set(
        parsed.rows
          .filter((row) => row.lineType === "product")
          .map((row) => normalizeLookupKey(row.itemName))
      )
    );

    const [ingredients, products] = await Promise.all([
      ingredientNameKeys.length
        ? this.ingredientRepository
            .createQueryBuilder("ingredient")
            .where("LOWER(ingredient.name) IN (:...nameKeys)", { nameKeys: ingredientNameKeys })
            .andWhere("ingredient.isActive = true")
            .getMany()
        : Promise.resolve([]),
      productNameKeys.length
        ? this.productRepository
            .createQueryBuilder("product")
            .where("LOWER(product.name) IN (:...nameKeys)", { nameKeys: productNameKeys })
            .andWhere("product.isActive = true")
            .getMany()
        : Promise.resolve([])
    ]);

    const ingredientMap = new Map(ingredients.map((ingredient) => [normalizeLookupKey(ingredient.name), ingredient]));
    const productMap = new Map(products.map((product) => [normalizeLookupKey(product.name), product]));
    const missingRows: Array<{ rowNumber: number; reason: string }> = [];

    const lines: PurchaseOrderLinePayload[] = parsed.rows.map((row) => {
      if (row.lineType === "ingredient") {
        const ingredient = ingredientMap.get(normalizeLookupKey(row.itemName));
        if (!ingredient) {
          missingRows.push({
            rowNumber: row.rowNumber,
            reason: `Ingredient not found or inactive: ${row.itemName}`
          });
          return {
            lineType: "ingredient",
            quantity: row.quantity,
            quantityUnit: row.quantityUnit,
            unitPrice: row.unitPrice,
            expiryDate: undefined,
            note: row.lineNote
          };
        }
        return {
          lineType: "ingredient",
          ingredientId: ingredient.id,
          quantity: row.quantity,
          quantityUnit: row.quantityUnit,
          unitPrice: row.unitPrice,
          expiryDate: undefined,
          note: row.lineNote
        };
      }

      const product = productMap.get(normalizeLookupKey(row.itemName));
      if (!product) {
        missingRows.push({
          rowNumber: row.rowNumber,
          reason: `Product not found or inactive: ${row.itemName}`
        });
        return {
          lineType: "product",
          quantity: row.quantity,
          quantityUnit: row.quantityUnit,
          unitPrice: row.unitPrice,
          expiryDate: row.expiryDate,
          note: row.lineNote
        };
      }
      return {
        lineType: "product",
        productId: product.id,
        quantity: row.quantity,
        quantityUnit: row.quantityUnit,
        unitPrice: row.unitPrice,
        expiryDate: row.expiryDate,
        note: row.lineNote
      };
    });

    if (missingRows.length) {
      const preview = missingRows
        .slice(0, 3)
        .map((entry) => `Row ${entry.rowNumber}: ${entry.reason}`)
        .join(" | ");
      throw new AppError(422, `CSV has unknown items. ${preview}`, missingRows.slice(0, MAX_PURCHASE_BULK_INVALID_DETAILS));
    }

    const purchaseOrder = await this.createPurchaseOrder(
      {
        supplierId: supplier.id,
        purchaseDate: parsed.purchaseDate,
        note: parsed.purchaseNote || undefined,
        lines
      },
      createdByUserId
    );

    return {
      purchaseOrderId: purchaseOrder.id,
      purchaseNumber: purchaseOrder.purchaseNumber,
      purchaseDate: purchaseOrder.purchaseDate,
      supplierName: purchaseOrder.supplierName,
      lineCount: purchaseOrder.lines.length,
      ingredientLineCount: purchaseOrder.lines.filter((line) => line.lineType === "ingredient").length,
      productLineCount: purchaseOrder.lines.filter((line) => line.lineType === "product").length,
      totalAmount: purchaseOrder.totalAmount
    };
  }

  getProductBulkImportTemplate() {
    const rows = [
      [...PRODUCT_BULK_TEMPLATE_HEADERS],
      ["7up", "Soft Drinks", "7UP-250ML", "250ml Bottle", "bottle", "Vamshi", "10", "55", "dip_and_dash", "true"],
      ["Snooker Water", "Beverages", "SNK-WATER", "1L Bottle", "bottle", "", "5", "40", "gaming", "true"]
    ];

    const csv = rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\n");
    return {
      fileName: "product_bulk_template.csv",
      content: `\uFEFF${csv}`
    };
  }

  private parseBulkProductRows(csvBuffer: Buffer) {
    const content = csvBuffer.toString("utf-8").replace(/^\uFEFF/, "").trim();
    if (!content) {
      throw new AppError(422, "Uploaded CSV file is empty.");
    }

    const parsedRows = parseCsvRows(content);
    if (!parsedRows.length) {
      throw new AppError(422, "Uploaded CSV file is empty.");
    }

    const headerRow = parsedRows[0].map((cell) => cell.trim());
    const headerAliases = new Map<string, string>([
      ["productname", "product_name"],
      ["name", "product_name"],
      ["category", "category"],
      ["sku", "sku"],
      ["packsize", "pack_size"],
      ["unit", "unit"],
      ["defaultsuppliername", "default_supplier_name"],
      ["suppliername", "default_supplier_name"],
      ["currentstock", "current_stock"],
      ["minstock", "min_stock"],
      ["minimumstock", "min_stock"],
      ["sellingprice", "selling_price"],
      ["salesprice", "selling_price"],
      ["mrp", "selling_price"],
      ["productsection", "target_section"],
      ["section", "target_section"],
      ["targetsection", "target_section"],
      ["assignsection", "target_section"],
      ["purchaseunitprice", "purchase_unit_price"],
      ["unitprice", "purchase_unit_price"],
      ["price", "purchase_unit_price"],
      ["isactive", "is_active"],
      ["active", "is_active"]
    ]);

    const headerIndexMap = new Map<string, number>();
    headerRow.forEach((header, index) => {
      const alias = headerAliases.get(normalizeHeaderKey(header));
      if (alias) {
        headerIndexMap.set(alias, index);
      }
    });

    const requiredHeaders: Array<(typeof PRODUCT_BULK_TEMPLATE_HEADERS)[number]> = [
      "product_name",
      "category",
      "unit",
      "min_stock"
    ];
    const missingHeaders = requiredHeaders.filter((header) => !headerIndexMap.has(header));
    if (missingHeaders.length) {
      throw new AppError(
        422,
        `Missing required column(s): ${missingHeaders.join(", ")}. Please use the downloadable template.`
      );
    }

    const readValue = (row: string[], header: (typeof PRODUCT_BULK_TEMPLATE_HEADERS)[number]) => {
      const columnIndex = headerIndexMap.get(header);
      if (columnIndex === undefined) {
        return "";
      }
      return String(row[columnIndex] ?? "");
    };

    const nonEmptyRows = parsedRows
      .slice(1)
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(({ row }) => row.some((cell) => cell.trim().length > 0));

    const validRows: ProductBulkCsvRow[] = [];
    const invalidRowDetails: Array<{ rowNumber: number; reason: string }> = [];
    const seenProductNameKeys = new Set<string>();
    let skippedDuplicateRows = 0;

    nonEmptyRows.forEach(({ row, rowNumber }) => {
      try {
        const productName = normalizeText(readValue(row, "product_name"));
        const category = normalizeText(readValue(row, "category"));
        const sku = normalizeText(readValue(row, "sku"));
        const packSize = normalizeText(readValue(row, "pack_size"));
        const unitRaw = normalizeText(readValue(row, "unit")).toLowerCase();
        const defaultSupplierName = normalizeText(readValue(row, "default_supplier_name"));
        const minStockRaw = normalizeText(readValue(row, "min_stock"));
        const sellingPriceRaw = normalizeText(readValue(row, "selling_price"));
        const targetSectionRaw = normalizeText(readValue(row, "target_section")).toLowerCase();
        const isActiveRaw = normalizeText(readValue(row, "is_active"));

        if (productName.length < 2 || productName.length > 160) {
          throw new AppError(422, `Row ${rowNumber}: Product name must be between 2 and 160 characters.`);
        }
        if (category.length < 2 || category.length > 80) {
          throw new AppError(422, `Row ${rowNumber}: Category must be between 2 and 80 characters.`);
        }
        if (!VALID_PRODUCT_UNIT_SET.has(unitRaw)) {
          throw new AppError(422, `Row ${rowNumber}: Invalid unit.`);
        }
        if (!minStockRaw) {
          throw new AppError(422, `Row ${rowNumber}: min_stock is required.`);
        }

        const productNameKey = normalizeLookupKey(productName);
        if (seenProductNameKeys.has(productNameKey)) {
          skippedDuplicateRows += 1;
          return;
        }

        const minStock = toFixedQuantity(parseNonNegativeNumber(minStockRaw, rowNumber, "Minimum stock"));
        const sellingPrice = sellingPriceRaw
          ? toFixedPrice(parseNonNegativeNumber(sellingPriceRaw, rowNumber, "Selling price"))
          : 0;
        const targetSection = targetSectionRaw || "dip_and_dash";
        if (!VALID_PRODUCT_TARGET_SECTION_SET.has(targetSection)) {
          throw new AppError(
            422,
            `Row ${rowNumber}: target_section must be one of dip_and_dash, gaming, both.`
          );
        }

        seenProductNameKeys.add(productNameKey);
        validRows.push({
          rowNumber,
          productName,
          category,
          sku: sku ? sku.slice(0, 40) : null,
          packSize: packSize ? packSize.slice(0, 60) : null,
          unit: unitRaw as ProductUnit,
          defaultSupplierName: defaultSupplierName || null,
          minStock,
          sellingPrice,
          targetSection: targetSection as ProductTargetSection,
          isActive: parseBooleanFlexible(isActiveRaw, true)
        });
      } catch (error) {
        const reason =
          error instanceof AppError ? error.message.replace(/^Row \d+:\s*/i, "") : "Row validation failed.";
        if (invalidRowDetails.length < MAX_PRODUCT_BULK_INVALID_DETAILS) {
          invalidRowDetails.push({ rowNumber, reason });
        }
      }
    });

    return {
      totalRows: nonEmptyRows.length,
      validRows,
      skippedDuplicateRows,
      invalidRows: nonEmptyRows.length - validRows.length - skippedDuplicateRows,
      invalidRowDetails
    };
  }

  async bulkImportProductsFromCsv(csvBuffer: Buffer) {
    const parsed = this.parseBulkProductRows(csvBuffer);

    if (!parsed.validRows.length) {
      return {
        totalRows: parsed.totalRows,
        parsedRows: 0,
        insertedProducts: 0,
        skippedExistingProducts: 0,
        skippedDuplicateRows: parsed.skippedDuplicateRows,
        invalidRows: parsed.invalidRows,
        invalidRowDetails: parsed.invalidRowDetails
      };
    }

    return AppDataSource.transaction(async (manager) => {
      const supplierNameKeys = Array.from(
        new Set(
          parsed.validRows
            .map((row) => row.defaultSupplierName)
            .filter((name): name is string => Boolean(name))
            .map((name) => normalizeLookupKey(name))
        )
      );

      const supplierMap = new Map<string, Supplier>();
      if (supplierNameKeys.length) {
        for (const chunk of chunkArray(supplierNameKeys)) {
          const suppliers = await manager
            .getRepository(Supplier)
            .createQueryBuilder("supplier")
            .where("LOWER(supplier.name) IN (:...nameKeys)", { nameKeys: chunk })
            .andWhere("supplier.isActive = true")
            .getMany();
          suppliers.forEach((supplier) => supplierMap.set(normalizeLookupKey(supplier.name), supplier));
        }
      }

      const unresolvedSupplierRows = parsed.validRows.filter(
        (row) => row.defaultSupplierName && !supplierMap.has(normalizeLookupKey(row.defaultSupplierName))
      );

      if (unresolvedSupplierRows.length) {
        const details = unresolvedSupplierRows
          .slice(0, MAX_PRODUCT_BULK_INVALID_DETAILS)
          .map((row) => ({
            rowNumber: row.rowNumber,
            reason: `Default supplier not found or inactive: ${row.defaultSupplierName}`
          }));
        const preview = details
          .slice(0, 3)
          .map((entry) => `Row ${entry.rowNumber}: ${entry.reason}`)
          .join(" | ");
        throw new AppError(422, `CSV has unknown suppliers. ${preview}`, details);
      }

      const productNameKeys = Array.from(new Set(parsed.validRows.map((row) => normalizeLookupKey(row.productName))));
      const existingProductNameKeySet = new Set<string>();
      for (const chunk of chunkArray(productNameKeys)) {
        const existingRows = await manager
          .getRepository(Product)
          .createQueryBuilder("product")
          .select("product.name", "name")
          .where("LOWER(product.name) IN (:...nameKeys)", { nameKeys: chunk })
          .getRawMany<{ name: string }>();
        existingRows.forEach((entry) => existingProductNameKeySet.add(normalizeLookupKey(entry.name)));
      }

      const valuesToInsert: Array<{
        name: string;
        category: string;
        sku: string | null;
        packSize: string | null;
        unit: ProductUnit;
        defaultSupplierId: string | null;
        currentStock: number;
        minStock: number;
        purchaseUnitPrice: number;
        sellingPrice: number;
        targetSection: ProductTargetSection;
        isActive: boolean;
      }> = [];
      let skippedExistingProducts = 0;

      parsed.validRows.forEach((row) => {
        const key = normalizeLookupKey(row.productName);
        if (existingProductNameKeySet.has(key)) {
          skippedExistingProducts += 1;
          return;
        }

        const supplierId = row.defaultSupplierName
          ? supplierMap.get(normalizeLookupKey(row.defaultSupplierName))?.id ?? null
          : null;
        valuesToInsert.push({
          name: row.productName,
          category: row.category,
          sku: row.sku,
          packSize: row.packSize,
          unit: row.unit,
          defaultSupplierId: supplierId,
          currentStock: 0,
          minStock: row.minStock,
          purchaseUnitPrice: 0,
          sellingPrice: row.sellingPrice,
          targetSection: row.targetSection,
          isActive: row.isActive
        });
        existingProductNameKeySet.add(key);
      });

      if (!valuesToInsert.length) {
        return {
          totalRows: parsed.totalRows,
          parsedRows: parsed.validRows.length,
          insertedProducts: 0,
          skippedExistingProducts,
          skippedDuplicateRows: parsed.skippedDuplicateRows,
          invalidRows: parsed.invalidRows,
          invalidRowDetails: parsed.invalidRowDetails
        };
      }

      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(Product)
        .values(valuesToInsert)
        .orIgnore()
        .execute();

      const insertedProducts = insertResult.identifiers.length;
      const skippedByDbConflict = Math.max(valuesToInsert.length - insertedProducts, 0);

      return {
        totalRows: parsed.totalRows,
        parsedRows: parsed.validRows.length,
        insertedProducts,
        skippedExistingProducts: skippedExistingProducts + skippedByDbConflict,
        skippedDuplicateRows: parsed.skippedDuplicateRows,
        invalidRows: parsed.invalidRows,
        invalidRowDetails: parsed.invalidRowDetails
      };
    });
  }

  async listSuppliers(filters: SupplierListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.supplierRepository.createQueryBuilder("supplier").orderBy("supplier.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("supplier.isActive = true");
    }

    if (filters.search) {
      query.andWhere(
        "(LOWER(supplier.name) LIKE LOWER(:search) OR LOWER(COALESCE(supplier.storeName, '')) LIKE LOWER(:search) OR LOWER(supplier.phone) LIKE LOWER(:search) OR LOWER(COALESCE(supplier.address, '')) LIKE LOWER(:search))",
        { search: `%${filters.search}%` }
      );
    }

    const [suppliers, total] = await Promise.all([query.skip(offset).take(limit).getMany(), query.getCount()]);
    const supplierIds = suppliers.map((supplier) => supplier.id);

    const metricsRows = supplierIds.length
      ? await this.purchaseOrderRepository
          .createQueryBuilder("purchaseOrder")
          .select("purchaseOrder.supplierId", "supplierId")
          .addSelect("COUNT(*)", "orderCount")
          .addSelect("COALESCE(SUM(purchaseOrder.totalAmount), 0)", "totalAmount")
          .addSelect("MAX(purchaseOrder.purchaseDate)", "lastPurchaseDate")
          .where("purchaseOrder.supplierId IN (:...supplierIds)", { supplierIds })
          .groupBy("purchaseOrder.supplierId")
          .getRawMany<{
            supplierId: string;
            orderCount: string;
            totalAmount: string;
            lastPurchaseDate: string | null;
          }>()
      : [];

    const metricsMap = new Map(
      metricsRows.map((row) => [
        row.supplierId,
        {
          purchaseOrdersCount: Number(row.orderCount),
          totalPurchasedAmount: toNumber(row.totalAmount),
          lastPurchaseDate: row.lastPurchaseDate
        }
      ])
    );

    const [summaryRow, statusRows] = await Promise.all([
      this.purchaseOrderRepository
        .createQueryBuilder("purchaseOrder")
        .select("COUNT(*)", "count")
        .addSelect("COALESCE(SUM(purchaseOrder.totalAmount), 0)", "amount")
        .getRawOne<{ count: string; amount: string }>(),
      this.supplierRepository
        .createQueryBuilder("supplier")
        .select("supplier.isActive", "isActive")
        .addSelect("COUNT(*)", "count")
        .groupBy("supplier.isActive")
        .getRawMany<{ isActive: boolean; count: string }>()
    ]);

    const activeSuppliers = statusRows.find((row) => row.isActive === true);
    const inactiveSuppliers = statusRows.find((row) => row.isActive === false);

    return {
      suppliers: suppliers.map((supplier) => this.mapSupplierSummary(supplier, metricsMap.get(supplier.id))),
      pagination: getPaginationMeta(page, limit, total),
      stats: {
        totalSuppliers: total,
        activeSuppliers: Number(activeSuppliers?.count ?? 0),
        inactiveSuppliers: Number(inactiveSuppliers?.count ?? 0),
        totalPurchaseOrders: Number(summaryRow?.count ?? 0),
        totalPurchasedAmount: toFixedPrice(toNumber(summaryRow?.amount ?? 0))
      }
    };
  }

  async createSupplier(payload: CreateSupplierPayload) {
    const name = normalizeText(payload.name);
    await this.ensureSupplierNameUnique(name);

    const supplier = this.supplierRepository.create({
      name,
      storeName: payload.storeName ? normalizeText(payload.storeName) : null,
      phone: normalizeText(payload.phone),
      address: payload.address ? normalizeText(payload.address) : null,
      isActive: payload.isActive ?? true
    });

    const saved = await this.supplierRepository.save(supplier);
    return this.mapSupplierSummary(saved);
  }

  async updateSupplier(id: string, payload: UpdateSupplierPayload) {
    const supplier = await this.getSupplierOrFail(id);

    if (payload.name) {
      const name = normalizeText(payload.name);
      await this.ensureSupplierNameUnique(name, id);
      supplier.name = name;
    }

    if (payload.phone !== undefined) {
      supplier.phone = normalizeText(payload.phone);
    }

    if (payload.storeName !== undefined) {
      supplier.storeName = payload.storeName ? normalizeText(payload.storeName) : null;
    }

    if (payload.address !== undefined) {
      supplier.address = payload.address ? normalizeText(payload.address) : null;
    }

    if (payload.isActive !== undefined) {
      supplier.isActive = payload.isActive;
    }

    const saved = await this.supplierRepository.save(supplier);
    return this.mapSupplierSummary(saved);
  }

  async deleteSupplier(id: string) {
    const supplier = await this.getSupplierOrFail(id);
    const [purchaseOrderCount, defaultProductCount] = await Promise.all([
      this.purchaseOrderRepository.count({ where: { supplierId: id } }),
      this.productRepository.count({ where: { defaultSupplierId: id } })
    ]);

    if (purchaseOrderCount > 0) {
      throw new AppError(409, "Cannot delete supplier because purchase orders are linked to this supplier.");
    }

    if (defaultProductCount > 0) {
      throw new AppError(409, "Cannot delete supplier because products are using it as default supplier.");
    }

    await this.supplierRepository.remove(supplier);
    return this.mapSupplierSummary(supplier);
  }

  async listProducts(filters: ProductListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.defaultSupplier", "defaultSupplier")
      .orderBy("product.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("product.isActive = true");
    }

    if (filters.search) {
      query.andWhere(
        "(LOWER(product.name) LIKE LOWER(:search) OR LOWER(COALESCE(product.sku, '')) LIKE LOWER(:search) OR LOWER(COALESCE(product.packSize, '')) LIKE LOWER(:search))",
        { search: `%${filters.search}%` }
      );
    }

    if (filters.category) {
      query.andWhere("LOWER(product.category) LIKE LOWER(:category)", { category: `%${filters.category}%` });
    }

    if (filters.supplierId) {
      query.andWhere("product.defaultSupplierId = :supplierId", { supplierId: filters.supplierId });
    }

    if (filters.targetSection) {
      query.andWhere("product.targetSection = :targetSection", { targetSection: filters.targetSection });
    }

    const [products, total] = await Promise.all([query.skip(offset).take(limit).getMany(), query.getCount()]);
    const productIds = products.map((product) => product.id);

    const [metricsRows, expiryRows, salesRows] = productIds.length
      ? await Promise.all([
          this.purchaseOrderLineRepository
            .createQueryBuilder("line")
            .leftJoin("line.purchaseOrder", "purchaseOrder")
            .select("line.productId", "productId")
            .addSelect("COUNT(DISTINCT line.purchaseOrderId)", "ordersCount")
            .addSelect("COALESCE(SUM(line.stockAdded), 0)", "qty")
            .addSelect("COALESCE(SUM(line.lineTotal), 0)", "amount")
            .addSelect("MAX(purchaseOrder.purchaseDate)", "recentPurchaseDate")
            .where("line.lineType = :lineType", { lineType: "product" })
            .andWhere("line.productId IN (:...productIds)", { productIds })
            .groupBy("line.productId")
            .getRawMany<{
              productId: string;
              ordersCount: string;
              qty: string;
              amount: string;
              recentPurchaseDate: string | null;
            }>(),
          this.purchaseOrderLineRepository
            .createQueryBuilder("line")
            .select("line.productId", "productId")
            .addSelect("MIN(CASE WHEN line.expiryDate >= CURRENT_DATE THEN line.expiryDate END)", "nextExpiryDate")
            .addSelect("MAX(line.expiryDate)", "latestExpiryDate")
            .where("line.lineType = :lineType", { lineType: "product" })
            .andWhere("line.productId IN (:...productIds)", { productIds })
            .andWhere("line.expiryDate IS NOT NULL")
            .groupBy("line.productId")
            .getRawMany<{
              productId: string;
              nextExpiryDate: string | null;
              latestExpiryDate: string | null;
            }>(),
          this.invoiceLineRepository
            .createQueryBuilder("line")
            .leftJoin("line.invoice", "invoice")
            .select("line.\"referenceId\"", "productId")
            .addSelect("COALESCE(SUM(line.quantity), 0)", "soldQty")
            .addSelect("COALESCE(SUM(line.lineTotal), 0)", "soldAmount")
            .where("line.lineType = :lineType", { lineType: "product" })
            .andWhere("line.\"referenceId\"::text IN (:...productIds)", { productIds })
            .andWhere("invoice.status = :status", { status: "paid" })
            .groupBy("line.\"referenceId\"")
            .getRawMany<{
              productId: string;
              soldQty: string;
              soldAmount: string;
            }>()
        ])
      : [[], [], []];

    const expiryMap = new Map(
      expiryRows.map((row) => [
        row.productId,
        {
          nextExpiryDate: row.nextExpiryDate,
          latestExpiryDate: row.latestExpiryDate
        }
      ])
    );

    const salesMap = new Map(
      salesRows.map((row) => [
        row.productId,
        {
          soldQuantity: toNumber(row.soldQty),
          soldAmount: toNumber(row.soldAmount)
        }
      ])
    );

    const metricsMap = new Map(
      metricsRows.map((row) => [
        row.productId,
        {
          purchasedQuantity: toNumber(row.qty),
          purchaseOrdersCount: Number(row.ordersCount),
          totalPurchasedAmount: toNumber(row.amount),
          recentPurchaseDate: row.recentPurchaseDate,
          soldQuantity: salesMap.get(row.productId)?.soldQuantity ?? 0,
          soldAmount: salesMap.get(row.productId)?.soldAmount ?? 0,
          nextExpiryDate: expiryMap.get(row.productId)?.nextExpiryDate ?? null,
          latestExpiryDate: expiryMap.get(row.productId)?.latestExpiryDate ?? null
        }
      ])
    );

    expiryMap.forEach((expiryMetrics, productId) => {
      if (!metricsMap.has(productId)) {
        metricsMap.set(productId, {
          purchasedQuantity: 0,
          purchaseOrdersCount: 0,
          totalPurchasedAmount: 0,
          recentPurchaseDate: null,
          soldQuantity: salesMap.get(productId)?.soldQuantity ?? 0,
          soldAmount: salesMap.get(productId)?.soldAmount ?? 0,
          nextExpiryDate: expiryMetrics.nextExpiryDate ?? null,
          latestExpiryDate: expiryMetrics.latestExpiryDate ?? null
        });
      }
    });

    salesMap.forEach((salesMetrics, productId) => {
      if (!metricsMap.has(productId)) {
        metricsMap.set(productId, {
          purchasedQuantity: 0,
          purchaseOrdersCount: 0,
          totalPurchasedAmount: 0,
          recentPurchaseDate: null,
          soldQuantity: salesMetrics.soldQuantity,
          soldAmount: salesMetrics.soldAmount,
          nextExpiryDate: null,
          latestExpiryDate: null
        });
      }
    });

    const [countRows, valuationRow, topPurchasedRows, topSoldRows] = await Promise.all([
      this.productRepository
        .createQueryBuilder("product")
        .select("product.isActive", "isActive")
        .addSelect("COUNT(*)", "count")
        .groupBy("product.isActive")
        .getRawMany<{ isActive: boolean; count: string }>(),
      this.productRepository
        .createQueryBuilder("product")
        .select("COALESCE(SUM(product.currentStock * product.purchaseUnitPrice), 0)", "valuation")
        .addSelect("COUNT(*) FILTER (WHERE product.currentStock <= product.minStock)", "lowStock")
        .getRawOne<{ valuation: string; lowStock: string }>(),
      this.purchaseOrderLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.product", "product")
        .select("line.productId", "productId")
        .addSelect("product.name", "name")
        .addSelect("product.unit", "unit")
        .addSelect("COALESCE(SUM(line.stockAdded), 0)", "qty")
        .where("line.lineType = :lineType", { lineType: "product" })
        .groupBy("line.productId")
        .addGroupBy("product.name")
        .addGroupBy("product.unit")
        .orderBy("COALESCE(SUM(line.stockAdded), 0)", "DESC")
        .limit(5)
        .getRawMany<{ productId: string; name: string; unit: string; qty: string }>(),
      this.invoiceLineRepository
        .createQueryBuilder("line")
        .leftJoin(Product, "product", "product.id::text = line.\"referenceId\"::text")
        .leftJoin("line.invoice", "invoice")
        .select("line.\"referenceId\"", "productId")
        .addSelect("COALESCE(product.name, MAX(line.\"nameSnapshot\"))", "name")
        .addSelect("COALESCE(product.unit, 'unit')", "unit")
        .addSelect("COALESCE(SUM(line.quantity), 0)", "qty")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere("invoice.status = :status", { status: "paid" })
        .groupBy("line.\"referenceId\"")
        .addGroupBy("product.name")
        .addGroupBy("product.unit")
        .orderBy("COALESCE(SUM(line.quantity), 0)", "DESC")
        .limit(5)
        .getRawMany<{ productId: string; name: string; unit: string; qty: string }>()
    ]);

    const activeProducts = countRows.find((row) => row.isActive === true);
    const inactiveProducts = countRows.find((row) => row.isActive === false);

    const totalsFromMetrics = metricsRows.reduce(
      (acc, current) => {
        acc.purchasedQuantity += toNumber(current.qty);
        acc.totalPurchasedAmount += toNumber(current.amount);
        return acc;
      },
      { purchasedQuantity: 0, totalPurchasedAmount: 0 }
    );

    const totalsFromSales = salesRows.reduce(
      (acc, current) => {
        acc.soldQuantity += toNumber(current.soldQty);
        acc.soldAmount += toNumber(current.soldAmount);
        return acc;
      },
      { soldQuantity: 0, soldAmount: 0 }
    );

    const productSummaries = products.map((product) => this.mapProductSummary(product, metricsMap.get(product.id)));
    const totalEstimatedProfit = productSummaries.reduce(
      (acc, current) => acc + toNumber(current.estimatedProfit),
      0
    );

    return {
      products: productSummaries,
      pagination: getPaginationMeta(page, limit, total),
      stats: {
        totalProducts: total,
        activeProducts: Number(activeProducts?.count ?? 0),
        inactiveProducts: Number(inactiveProducts?.count ?? 0),
        lowStockProducts: Number(valuationRow?.lowStock ?? 0),
        stockValuation: toFixedPrice(toNumber(valuationRow?.valuation ?? 0)),
        totalPurchasedQuantity: toFixedQuantity(totalsFromMetrics.purchasedQuantity),
        totalPurchasedAmount: toFixedPrice(totalsFromMetrics.totalPurchasedAmount),
        totalSoldQuantity: toFixedQuantity(totalsFromSales.soldQuantity),
        totalSoldAmount: toFixedPrice(totalsFromSales.soldAmount),
        totalEstimatedProfit: toFixedPrice(totalEstimatedProfit),
        topPurchasedProducts: topPurchasedRows.map((row) => ({
          productId: row.productId,
          name: row.name,
          unit: row.unit,
          quantity: toFixedQuantity(toNumber(row.qty))
        })),
        topSoldProducts: topSoldRows.map((row) => ({
          productId: row.productId,
          name: row.name,
          unit: row.unit as ProductUnit,
          quantity: toFixedQuantity(toNumber(row.qty))
        }))
      }
    };
  }

  async getProductDayLedger(filters: ProductDayLedgerFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 12));
    const offset = (page - 1) * limit;
    const legacyDate = filters.date?.trim() || "";
    const dateFrom = (filters.dateFrom?.trim() || legacyDate || "") || undefined;
    const dateTo = (filters.dateTo?.trim() || legacyDate || "") || undefined;
    if (dateFrom) {
      resolveDayRangeInUtc(dateFrom);
    }
    if (dateTo) {
      resolveDayRangeInUtc(dateTo);
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new AppError(422, "Date to must be on or after date from.");
    }

    const query = this.productRepository
      .createQueryBuilder("product")
      .orderBy("product.name", "ASC");

    if (filters.search) {
      query.andWhere(
        "(LOWER(product.name) LIKE LOWER(:search) OR LOWER(COALESCE(product.sku, '')) LIKE LOWER(:search) OR LOWER(product.category) LIKE LOWER(:search))",
        { search: `%${filters.search}%` }
      );
    }

    if (filters.targetSection) {
      query.andWhere("product.targetSection = :targetSection", {
        targetSection: filters.targetSection
      });
    }

    if (filters.productId) {
      query.andWhere("product.id = :productId", { productId: filters.productId });
    }

    const products = await query.getMany();

    const productIds = products.map((product) => product.id);
    if (!productIds.length) {
      return {
        date: legacyDate || null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        rows: [],
        pagination: getPaginationMeta(page, limit, 0),
        stats: {
          totalProducts: 0,
          totalOpeningStock: 0,
          totalPurchased: 0,
          totalConsumption: 0,
          totalClosingStock: 0,
          dipAndDashConsumption: 0,
          snookerConsumption: 0
        }
      };
    }

    const [purchaseMovementRows, salesMovementRows, purchaseBeforeRows, salesBeforeRows] = await Promise.all([
      this.purchaseOrderLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.purchaseOrder", "purchaseOrder")
        .select("to_char(purchaseOrder.purchaseDate, 'YYYY-MM-DD')", "date")
        .addSelect("line.productId", "productId")
        .addSelect("COALESCE(SUM(line.stockAdded), 0)", "purchased")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere("line.productId IN (:...productIds)", { productIds })
        .andWhere(dateFrom ? "purchaseOrder.purchaseDate >= :dateFrom" : "1=1", { dateFrom })
        .andWhere(dateTo ? "purchaseOrder.purchaseDate <= :dateTo" : "1=1", { dateTo })
        .groupBy("purchaseOrder.purchaseDate")
        .addGroupBy("line.productId")
        .getRawMany<{ date: string; productId: string; purchased: string }>(),
      this.invoiceLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.invoice", "invoice")
        .select("to_char(timezone('Asia/Kolkata', invoice.\"createdAt\"), 'YYYY-MM-DD')", "date")
        .addSelect("line.\"referenceId\"", "productId")
        .addSelect("COALESCE(SUM(line.quantity), 0)", "consumption")
        .addSelect(
          "COALESCE(SUM(CASE WHEN invoice.\"orderType\" = :snookerOrderType THEN 0 ELSE line.quantity END), 0)",
          "dipAndDashConsumption"
        )
        .addSelect(
          "COALESCE(SUM(CASE WHEN invoice.\"orderType\" = :snookerOrderType THEN line.quantity ELSE 0 END), 0)",
          "snookerConsumption"
        )
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere("line.\"referenceId\"::text IN (:...productIds)", { productIds })
        .andWhere("invoice.status = :status", { status: "paid" })
        .andWhere(dateFrom ? "timezone('Asia/Kolkata', invoice.\"createdAt\")::date >= :dateFrom" : "1=1", { dateFrom })
        .andWhere(dateTo ? "timezone('Asia/Kolkata', invoice.\"createdAt\")::date <= :dateTo" : "1=1", { dateTo })
        .setParameter("snookerOrderType", "snooker")
        .groupBy("to_char(timezone('Asia/Kolkata', invoice.\"createdAt\"), 'YYYY-MM-DD')")
        .addGroupBy("line.\"referenceId\"")
        .getRawMany<{
          date: string;
          productId: string;
          consumption: string;
          dipAndDashConsumption: string;
          snookerConsumption: string;
        }>(),
      dateFrom
        ? this.purchaseOrderLineRepository
            .createQueryBuilder("line")
            .leftJoin("line.purchaseOrder", "purchaseOrder")
            .select("line.productId", "productId")
            .addSelect("COALESCE(SUM(line.stockAdded), 0)", "quantity")
            .where("line.lineType = :lineType", { lineType: "product" })
            .andWhere("line.productId IN (:...productIds)", { productIds })
            .andWhere("purchaseOrder.purchaseDate < :dateFrom", { dateFrom })
            .groupBy("line.productId")
            .getRawMany<{ productId: string; quantity: string }>()
        : Promise.resolve([] as Array<{ productId: string; quantity: string }>),
      dateFrom
        ? this.invoiceLineRepository
            .createQueryBuilder("line")
            .leftJoin("line.invoice", "invoice")
            .select("line.\"referenceId\"", "productId")
            .addSelect("COALESCE(SUM(line.quantity), 0)", "quantity")
            .where("line.lineType = :lineType", { lineType: "product" })
            .andWhere("line.\"referenceId\"::text IN (:...productIds)", { productIds })
            .andWhere("invoice.status = :status", { status: "paid" })
            .andWhere("timezone('Asia/Kolkata', invoice.\"createdAt\")::date < :dateFrom", { dateFrom })
            .groupBy("line.\"referenceId\"")
            .getRawMany<{ productId: string; quantity: string }>()
        : Promise.resolve([] as Array<{ productId: string; quantity: string }>)
    ]);

    const productMap = new Map(products.map((product) => [product.id, product]));
    const movementMap = new Map<
      string,
      {
        date: string;
        productId: string;
        purchased: number;
        consumption: number;
        dipAndDashConsumption: number;
        snookerConsumption: number;
      }
    >();
    const getMovement = (date: string, productId: string) => {
      const key = `${date}::${productId}`;
      const existing = movementMap.get(key);
      if (existing) {
        return existing;
      }
      const created = {
        date,
        productId,
        purchased: 0,
        consumption: 0,
        dipAndDashConsumption: 0,
        snookerConsumption: 0
      };
      movementMap.set(key, created);
      return created;
    };

    purchaseMovementRows.forEach((row) => {
      const movement = getMovement(toYmd(row.date), row.productId);
      movement.purchased = toFixedQuantity(toNumber(row.purchased));
    });
    salesMovementRows.forEach((row) => {
      const movement = getMovement(toYmd(row.date), row.productId);
      movement.consumption = toFixedQuantity(toNumber(row.consumption));
      movement.dipAndDashConsumption = toFixedQuantity(toNumber(row.dipAndDashConsumption));
      movement.snookerConsumption = toFixedQuantity(toNumber(row.snookerConsumption));
    });

    const purchaseBeforeMap = new Map(purchaseBeforeRows.map((row) => [row.productId, toFixedQuantity(toNumber(row.quantity))]));
    const salesBeforeMap = new Map(salesBeforeRows.map((row) => [row.productId, toFixedQuantity(toNumber(row.quantity))]));
    const runningStockByProduct = new Map(
      products.map((product) => [
        product.id,
        toFixedQuantity((purchaseBeforeMap.get(product.id) ?? 0) - (salesBeforeMap.get(product.id) ?? 0))
      ])
    );

    const rows = Array.from(movementMap.values())
      .sort((left, right) => {
        const dateDiff = toYmd(left.date).localeCompare(toYmd(right.date));
        if (dateDiff !== 0) {
          return dateDiff;
        }
        const leftName = productMap.get(left.productId)?.name ?? left.productId;
        const rightName = productMap.get(right.productId)?.name ?? right.productId;
        return leftName.localeCompare(rightName);
      })
      .map((movement) => {
        const product = productMap.get(movement.productId);
        if (!product) {
          return null;
        }
        const openingStock = toFixedQuantity(runningStockByProduct.get(product.id) ?? 0);
        const purchased = toFixedQuantity(movement.purchased);
        const consumption = toFixedQuantity(movement.consumption);
        const dipAndDashConsumption = toFixedQuantity(movement.dipAndDashConsumption);
        const snookerConsumption = toFixedQuantity(movement.snookerConsumption);
        const closingStock = toFixedQuantity(openingStock + purchased - consumption);
        runningStockByProduct.set(product.id, closingStock);
        return {
          id: `${movement.date}-${product.id}`,
          date: movement.date,
          productId: product.id,
          productName: product.name,
          category: product.category,
          unit: product.unit,
          targetSection: product.targetSection,
          openingStock,
          purchased,
          consumption,
          dipAndDashConsumption,
          snookerConsumption,
          closingStock,
          dipAndDashAssignedStock: toFixedQuantity(toNumber(product.dipAndDashStock)),
          gamingAssignedStock: toFixedQuantity(toNumber(product.gamingStock)),
          stockHealth: closingStock <= toNumber(product.minStock) ? "LOW_STOCK" : "HEALTHY"
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((left, right) => {
        const dateDiff = toYmd(right.date).localeCompare(toYmd(left.date));
        if (dateDiff !== 0) {
          return dateDiff;
        }
        return left.productName.localeCompare(right.productName);
      });

    const totalRows = rows.length;
    const pagedRows = rows.slice(offset, offset + limit);

    const stats = rows.reduce(
      (acc, current) => {
        acc.totalOpeningStock += current.openingStock;
        acc.totalPurchased += current.purchased;
        acc.totalConsumption += current.consumption;
        acc.totalClosingStock += current.closingStock;
        acc.dipAndDashConsumption += current.dipAndDashConsumption;
        acc.snookerConsumption += current.snookerConsumption;
        return acc;
      },
      {
        totalOpeningStock: 0,
        totalPurchased: 0,
        totalConsumption: 0,
        totalClosingStock: 0,
        dipAndDashConsumption: 0,
        snookerConsumption: 0
      }
    );

    return {
      date: legacyDate || null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      rows: pagedRows,
      pagination: getPaginationMeta(page, limit, totalRows),
      stats: {
        totalProducts: products.length,
        totalOpeningStock: toFixedQuantity(stats.totalOpeningStock),
        totalPurchased: toFixedQuantity(stats.totalPurchased),
        totalConsumption: toFixedQuantity(stats.totalConsumption),
        totalClosingStock: toFixedQuantity(stats.totalClosingStock),
        dipAndDashConsumption: toFixedQuantity(stats.dipAndDashConsumption),
        snookerConsumption: toFixedQuantity(stats.snookerConsumption)
      }
    };
  }

  async createProduct(payload: CreateProductPayload) {
    const name = normalizeText(payload.name);
    await this.ensureProductNameUnique(name);
    await this.ensureSupplierExists(payload.defaultSupplierId);

    const initialSectionStocks = normalizeProductSectionStocks({
      targetSection: payload.targetSection ?? "dip_and_dash",
      currentStock: 0,
      dipAndDashStock: payload.dipAndDashAssignedStock ?? 0,
      gamingStock: payload.gamingAssignedStock ?? 0
    });

    const product = this.productRepository.create({
      name,
      category: normalizeText(payload.category),
      sku: payload.sku ? normalizeText(payload.sku) : null,
      packSize: payload.packSize ? normalizeText(payload.packSize) : null,
      unit: payload.unit,
      currentStock: initialSectionStocks.currentStock,
      dipAndDashStock: initialSectionStocks.dipAndDashStock,
      gamingStock: initialSectionStocks.gamingStock,
      minStock: toFixedQuantity(payload.minStock ?? 0),
      purchaseUnitPrice: 0,
      sellingPrice: toFixedPrice(payload.sellingPrice ?? 0),
      targetSection: payload.targetSection ?? "dip_and_dash",
      defaultSupplierId: payload.defaultSupplierId ?? null,
      isActive: payload.isActive ?? true
    });

    const saved = await this.productRepository.save(product);
    const hydrated = await this.productRepository.findOne({
      where: { id: saved.id },
      relations: { defaultSupplier: true }
    });
    return this.mapProductSummary(hydrated ?? saved);
  }

  async updateProduct(id: string, payload: UpdateProductPayload) {
    const product = await this.getProductOrFail(id);
    let nextTargetSection = product.targetSection;

    if (payload.name) {
      const name = normalizeText(payload.name);
      await this.ensureProductNameUnique(name, id);
      product.name = name;
    }

    if (payload.category !== undefined) {
      product.category = normalizeText(payload.category);
    }

    if (payload.sku !== undefined) {
      product.sku = payload.sku ? normalizeText(payload.sku) : null;
    }

    if (payload.packSize !== undefined) {
      product.packSize = payload.packSize ? normalizeText(payload.packSize) : null;
    }

    if (payload.unit !== undefined) {
      product.unit = payload.unit;
    }

    if (payload.minStock !== undefined) {
      product.minStock = toFixedQuantity(payload.minStock);
    }

    if (payload.sellingPrice !== undefined) {
      product.sellingPrice = toFixedPrice(payload.sellingPrice);
    }

    if (payload.targetSection !== undefined) {
      nextTargetSection = payload.targetSection;
      product.targetSection = payload.targetSection;
    }

    if (payload.defaultSupplierId !== undefined) {
      await this.ensureSupplierExists(payload.defaultSupplierId);
      product.defaultSupplierId = payload.defaultSupplierId ?? null;
    }

    if (payload.isActive !== undefined) {
      product.isActive = payload.isActive;
    }

    if (nextTargetSection === "both") {
      const hasDipAssignment = payload.dipAndDashAssignedStock !== undefined;
      const hasGamingAssignment = payload.gamingAssignedStock !== undefined;
      if (hasDipAssignment || hasGamingAssignment) {
        const nextDip = toFixedQuantity(
          payload.dipAndDashAssignedStock !== undefined
            ? payload.dipAndDashAssignedStock
            : toNumber(product.dipAndDashStock)
        );
        const nextGaming = toFixedQuantity(
          payload.gamingAssignedStock !== undefined
            ? payload.gamingAssignedStock
            : toNumber(product.gamingStock)
        );
        if (nextDip < 0 || nextGaming < 0) {
          throw new AppError(422, "Assigned section stock cannot be negative.");
        }
        const expectedTotal = toFixedQuantity(toNumber(product.currentStock));
        const assignedTotal = toFixedQuantity(nextDip + nextGaming);
        if (Math.abs(expectedTotal - assignedTotal) > 0.001) {
          throw new AppError(
            422,
            `For shared products, Dip & Dash + Snooker assigned stock must equal total stock (${expectedTotal}).`
          );
        }
        product.dipAndDashStock = nextDip;
        product.gamingStock = nextGaming;
      } else {
        const normalized = normalizeProductSectionStocks({
          targetSection: "both",
          currentStock: toNumber(product.currentStock),
          dipAndDashStock: toNumber(product.dipAndDashStock),
          gamingStock: toNumber(product.gamingStock)
        });
        product.dipAndDashStock = normalized.dipAndDashStock;
        product.gamingStock = normalized.gamingStock;
      }
    } else {
      const normalized = normalizeProductSectionStocks({
        targetSection: nextTargetSection,
        currentStock: toNumber(product.currentStock),
        dipAndDashStock: toNumber(product.dipAndDashStock),
        gamingStock: toNumber(product.gamingStock)
      });
      product.currentStock = normalized.currentStock;
      product.dipAndDashStock = normalized.dipAndDashStock;
      product.gamingStock = normalized.gamingStock;
    }

    const saved = await this.productRepository.save(product);
    const hydrated = await this.productRepository.findOne({
      where: { id: saved.id },
      relations: { defaultSupplier: true }
    });
    return this.mapProductSummary(hydrated ?? saved);
  }

  async deleteProduct(id: string) {
    const product = await this.getProductOrFail(id);
    const linkedPurchases = await this.purchaseOrderLineRepository.count({ where: { productId: id } });

    if (linkedPurchases > 0) {
      throw new AppError(409, "Cannot delete product because purchase history exists for this product.");
    }

    await this.productRepository.remove(product);
    return this.mapProductSummary(product);
  }

  private async getOrCreateIngredientStock(manager: EntityManager, ingredientId: string) {
    const existingStock = await manager.findOne(IngredientStock, { where: { ingredientId } });
    if (existingStock) {
      return existingStock;
    }

    const created = manager.create(IngredientStock, {
      ingredientId,
      totalStock: 0,
      lastUpdatedAt: new Date()
    });
    return manager.save(IngredientStock, created);
  }

  private async applyPurchaseLines(
    manager: EntityManager,
    lines: PurchaseOrderLinePayload[],
    purchaseNumber: string,
    supplierName: string
  ) {
    const lineEntities: PurchaseOrderLine[] = [];
    const stockLogs: IngredientStockLog[] = [];
    let totalAmount = 0;

    const ingredientIds = Array.from(
      new Set(
        lines
          .filter((line) => line.lineType === "ingredient" && line.ingredientId)
          .map((line) => line.ingredientId as string)
      )
    );
    const productIds = Array.from(
      new Set(
        lines
          .filter((line) => line.lineType === "product" && line.productId)
          .map((line) => line.productId as string)
      )
    );

    const [ingredients, products, stocks] = await Promise.all([
      ingredientIds.length
        ? manager.find(Ingredient, {
            where: { id: In(ingredientIds), isActive: true },
            relations: { category: true }
          })
        : Promise.resolve([]),
      productIds.length
        ? manager.find(Product, {
            where: { id: In(productIds), isActive: true }
          })
        : Promise.resolve([]),
      ingredientIds.length
        ? manager.find(IngredientStock, {
            where: { ingredientId: In(ingredientIds) }
          })
        : Promise.resolve([])
    ]);

    const ingredientMap = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
    const productMap = new Map(products.map((product) => [product.id, product]));
    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, stock]));
    const touchedStocks = new Set<IngredientStock>();
    const touchedProducts = new Set<Product>();

    for (const line of lines) {
      const enteredQuantity = toFixedQuantity(line.quantity);
      const unitPrice = toFixedPrice(line.unitPrice);
      const lineTotal = toFixedPrice(enteredQuantity * unitPrice);

      if (line.lineType === "ingredient") {
        if (line.expiryDate) {
          throw new AppError(422, "Expiry date is only allowed for product purchase lines.");
        }
        const ingredientId = line.ingredientId;
        if (!ingredientId) {
          throw new AppError(422, "Ingredient is required for ingredient purchase line");
        }

        const ingredient = ingredientMap.get(ingredientId);
        if (!ingredient) {
          throw new AppError(404, "Ingredient not found or inactive");
        }

        const enteredUnit = (line.quantityUnit || ingredient.unit).trim().toLowerCase();
        const convertedAdded = convertPurchaseQuantityToBase(
          "ingredient",
          enteredQuantity,
          enteredUnit,
          ingredient.unit
        );
        if (convertedAdded === null) {
          throw new AppError(
            422,
            `Unit ${enteredUnit} is not compatible with ingredient base unit ${ingredient.unit}.`
          );
        }
        const stockAdded = toFixedQuantity(convertedAdded);

        const stock =
          stockMap.get(ingredient.id) ??
          manager.create(IngredientStock, {
            ingredientId: ingredient.id,
            totalStock: 0,
            lastUpdatedAt: new Date()
          });
        stockMap.set(ingredient.id, stock);

        const stockBefore = toFixedQuantity(toNumber(stock.totalStock));
        const stockAfter = toFixedQuantity(stockBefore + stockAdded);
        stock.totalStock = stockAfter;
        stock.lastUpdatedAt = new Date();
        touchedStocks.add(stock);

        const stockLog = manager.create(IngredientStockLog, {
          ingredientId: ingredient.id,
          type: IngredientStockLogType.ADD,
          quantity: stockAdded,
          note: line.note?.trim() || `Purchased via ${purchaseNumber} from ${supplierName}.`
        });
        stockLogs.push(stockLog);

        const lineEntity = manager.create(PurchaseOrderLine, {
          lineType: "ingredient",
          ingredientId: ingredient.id,
          productId: null,
          itemNameSnapshot: ingredient.name,
          categoryNameSnapshot: ingredient.category?.name ?? null,
          unit: ingredient.unit,
          stockBefore,
          stockAdded,
          enteredQuantity,
          enteredUnit,
          stockAfter,
          unitPrice,
          lineTotal,
          unitPriceUpdated: false,
          expiryDate: null
        });
        lineEntities.push(lineEntity);
        totalAmount += lineTotal;
        continue;
      }

      const productId = line.productId;
      if (!productId) {
        throw new AppError(422, "Product is required for product purchase line");
      }

      const product = productMap.get(productId);
      if (!product) {
        throw new AppError(404, "Product not found or inactive");
      }

      const enteredUnit = (line.quantityUnit || product.unit).trim().toLowerCase();
      const convertedAdded = convertPurchaseQuantityToBase("product", enteredQuantity, enteredUnit, product.unit);
      if (convertedAdded === null) {
        throw new AppError(422, `Unit ${enteredUnit} is not compatible with product base unit ${product.unit}.`);
      }
      const stockAdded = toFixedQuantity(convertedAdded);

      const stockBefore = toFixedQuantity(toNumber(product.currentStock));
      const sectionSplit = applyProductPurchaseSplit(product, stockAdded);
      const stockAfter = toFixedQuantity(toNumber(product.currentStock));
      product.purchaseUnitPrice = unitPrice;
      touchedProducts.add(product);

      const lineEntity = manager.create(PurchaseOrderLine, {
        lineType: "product",
        ingredientId: null,
        productId: product.id,
        itemNameSnapshot: product.name,
        categoryNameSnapshot: product.category,
        unit: product.unit,
        stockBefore,
        stockAdded,
        dipAndDashStockAdded: sectionSplit.dipAndDashAdded,
        gamingStockAdded: sectionSplit.gamingAdded,
        enteredQuantity,
        enteredUnit,
        stockAfter,
        unitPrice,
        lineTotal,
        unitPriceUpdated: false,
        expiryDate: line.expiryDate || null
      });
      lineEntities.push(lineEntity);
      totalAmount += lineTotal;
    }

    if (touchedStocks.size) {
      await manager.save(IngredientStock, Array.from(touchedStocks));
    }
    if (stockLogs.length) {
      await manager.save(IngredientStockLog, stockLogs);
    }
    if (touchedProducts.size) {
      await manager.save(Product, Array.from(touchedProducts));
    }

    return {
      lineEntities,
      totalAmount: toFixedPrice(totalAmount)
    };
  }

  private async rollbackPurchaseOrderLines(manager: EntityManager, lines: PurchaseOrderLine[], purchaseNumber: string) {
    for (const line of lines) {
      const rollbackQuantity = toFixedQuantity(toNumber(line.stockAdded));

      if (line.lineType === "ingredient" && line.ingredientId) {
        const ingredient = await manager.findOne(Ingredient, {
          where: { id: line.ingredientId }
        });
        if (!ingredient) {
          throw new AppError(404, `Ingredient not found for rollback: ${line.itemNameSnapshot}`);
        }

        const stock = await this.getOrCreateIngredientStock(manager, ingredient.id);
        const stockBefore = toFixedQuantity(toNumber(stock.totalStock));
        const stockAfter = toFixedQuantity(stockBefore - rollbackQuantity);

        if (stockAfter < 0) {
          throw new AppError(
            409,
            `Cannot edit purchase order ${purchaseNumber} because stock for ${line.itemNameSnapshot} is already consumed.`
          );
        }

        stock.totalStock = stockAfter;
        stock.lastUpdatedAt = new Date();
        await manager.save(IngredientStock, stock);

        const rollbackLog = manager.create(IngredientStockLog, {
          ingredientId: ingredient.id,
          type: IngredientStockLogType.ADJUST,
          quantity: toFixedQuantity(-rollbackQuantity),
          note: `Rollback from purchase edit ${purchaseNumber}`
        });
        await manager.save(IngredientStockLog, rollbackLog);

        continue;
      }

      if (line.lineType === "product" && line.productId) {
        const product = await manager.findOne(Product, {
          where: { id: line.productId }
        });
        if (!product) {
          throw new AppError(404, `Product not found for rollback: ${line.itemNameSnapshot}`);
        }

        const stockBefore = toFixedQuantity(toNumber(product.currentStock));
        const rollbackDip = toFixedQuantity(toNumber(line.dipAndDashStockAdded));
        const rollbackGaming = toFixedQuantity(toNumber(line.gamingStockAdded));
        const rollbackBySectionTotal = toFixedQuantity(rollbackDip + rollbackGaming);
        const effectiveRollbackQuantity =
          rollbackBySectionTotal > 0 ? rollbackBySectionTotal : rollbackQuantity;

        const stockAfter = toFixedQuantity(stockBefore - effectiveRollbackQuantity);
        if (stockAfter < 0) {
          throw new AppError(
            409,
            `Cannot edit purchase order ${purchaseNumber} because stock for ${line.itemNameSnapshot} is already consumed.`
          );
        }

        const normalized = normalizeProductSectionStocks({
          targetSection: product.targetSection,
          currentStock: toNumber(product.currentStock),
          dipAndDashStock: toNumber(product.dipAndDashStock),
          gamingStock: toNumber(product.gamingStock)
        });

        const nextDip = toFixedQuantity(
          normalized.dipAndDashStock - (rollbackBySectionTotal > 0 ? rollbackDip : effectiveRollbackQuantity)
        );
        const nextGaming = toFixedQuantity(
          normalized.gamingStock - (rollbackBySectionTotal > 0 ? rollbackGaming : 0)
        );

        if (nextDip < -0.001 || nextGaming < -0.001) {
          throw new AppError(
            409,
            `Cannot edit purchase order ${purchaseNumber} because section stock for ${line.itemNameSnapshot} is already consumed.`
          );
        }

        product.dipAndDashStock = toFixedQuantity(Math.max(nextDip, 0));
        product.gamingStock = toFixedQuantity(Math.max(nextGaming, 0));
        product.currentStock = toFixedQuantity(product.dipAndDashStock + product.gamingStock);
        await manager.save(Product, product);
      }
    }
  }

  async createPurchaseOrder(payload: CreatePurchaseOrderPayload, createdByUserId: string | null) {
    const purchaseDate = payload.purchaseDate || getTodayDate();
    const purchaseType = this.resolvePurchaseType(payload.lines);
    const purchaseSection = this.resolvePurchaseSection(payload.purchaseSection);

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const supplier = await queryRunner.manager.findOne(Supplier, {
        where: { id: payload.supplierId, isActive: true }
      });
      if (!supplier) {
        throw new AppError(404, "Supplier not found or inactive");
      }

      const purchaseNumber = await this.generatePurchaseNumber(queryRunner.manager, purchaseDate);
      const { lineEntities, totalAmount } = await this.applyPurchaseLines(
        queryRunner.manager,
        payload.lines,
        purchaseNumber,
        supplier.name
      );

      const order = queryRunner.manager.create(PurchaseOrder, {
        purchaseNumber,
        supplierId: payload.supplierId,
        purchaseDate,
        purchaseType,
        purchaseSection,
        totalAmount,
        note: payload.note?.trim() || null,
        invoiceImageUrl: payload.invoiceImageUrl?.trim() || null,
        createdByUserId
      });
      const savedOrder = await queryRunner.manager.save(PurchaseOrder, order);

      lineEntities.forEach((lineEntity) => {
        lineEntity.purchaseOrderId = savedOrder.id;
      });
      await queryRunner.manager.save(PurchaseOrderLine, lineEntities);

      await queryRunner.commitTransaction();
      return this.getPurchaseOrderById(savedOrder.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updatePurchaseOrder(id: string, payload: CreatePurchaseOrderPayload) {
    const purchaseDate = payload.purchaseDate || getTodayDate();
    const purchaseType = this.resolvePurchaseType(payload.lines);
    const purchaseSection = this.resolvePurchaseSection(payload.purchaseSection);

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingOrder = await queryRunner.manager.findOne(PurchaseOrder, {
        where: { id },
        relations: { lines: true }
      });
      if (!existingOrder) {
        throw new AppError(404, "Purchase order not found");
      }

      const supplier = await queryRunner.manager.findOne(Supplier, {
        where: { id: payload.supplierId, isActive: true }
      });
      if (!supplier) {
        throw new AppError(404, "Supplier not found or inactive");
      }

      await this.rollbackPurchaseOrderLines(queryRunner.manager, existingOrder.lines, existingOrder.purchaseNumber);

      await queryRunner.manager.delete(PurchaseOrderLine, { purchaseOrderId: existingOrder.id });

      const { lineEntities, totalAmount } = await this.applyPurchaseLines(
        queryRunner.manager,
        payload.lines,
        existingOrder.purchaseNumber,
        supplier.name
      );

      existingOrder.supplierId = payload.supplierId;
      existingOrder.purchaseDate = purchaseDate;
      existingOrder.purchaseType = purchaseType;
      existingOrder.purchaseSection = purchaseSection;
      existingOrder.totalAmount = totalAmount;
      existingOrder.note = payload.note?.trim() || null;
      existingOrder.invoiceImageUrl = payload.invoiceImageUrl?.trim() || null;

      const savedOrder = await queryRunner.manager.save(PurchaseOrder, existingOrder);

      lineEntities.forEach((lineEntity) => {
        lineEntity.purchaseOrderId = savedOrder.id;
      });
      await queryRunner.manager.save(PurchaseOrderLine, lineEntities);

      await queryRunner.commitTransaction();
      return this.getPurchaseOrderById(savedOrder.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async listPurchaseOrders(filters: PurchaseOrderListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.purchaseOrderRepository
      .createQueryBuilder("purchaseOrder")
      .leftJoinAndSelect("purchaseOrder.supplier", "supplier")
      .leftJoinAndSelect("purchaseOrder.createdByUser", "createdByUser")
      .orderBy("purchaseOrder.createdAt", "DESC");

    if (filters.search) {
      query.andWhere(
        "(LOWER(purchaseOrder.purchaseNumber) LIKE LOWER(:search) OR LOWER(supplier.name) LIKE LOWER(:search))",
        { search: `%${filters.search}%` }
      );
    }

    if (filters.supplierId) {
      query.andWhere("purchaseOrder.supplierId = :supplierId", { supplierId: filters.supplierId });
    }

    if (filters.purchaseType) {
      query.andWhere("purchaseOrder.purchaseType = :purchaseType", { purchaseType: filters.purchaseType });
    }

    if (filters.dateFrom) {
      query.andWhere("purchaseOrder.purchaseDate >= :dateFrom", { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      query.andWhere("purchaseOrder.purchaseDate <= :dateTo", { dateTo: filters.dateTo });
    }

    const [orders, total] = await Promise.all([query.skip(offset).take(limit).getMany(), query.getCount()]);

    const orderIds = orders.map((order) => order.id);
    const lineCountRows = orderIds.length
      ? await this.purchaseOrderLineRepository
          .createQueryBuilder("line")
          .select("line.purchaseOrderId", "purchaseOrderId")
          .addSelect("line.lineType", "lineType")
          .addSelect("COUNT(*)", "count")
          .where("line.purchaseOrderId IN (:...orderIds)", { orderIds })
          .groupBy("line.purchaseOrderId")
          .addGroupBy("line.lineType")
          .getRawMany<{ purchaseOrderId: string; lineType: string; count: string }>()
      : [];

    const lineCountMap = new Map<string, { total: number; ingredient: number; product: number }>();
    for (const row of lineCountRows) {
      const current = lineCountMap.get(row.purchaseOrderId) ?? { total: 0, ingredient: 0, product: 0 };
      const count = Number(row.count);
      current.total += count;
      if (row.lineType === "ingredient") {
        current.ingredient += count;
      } else if (row.lineType === "product") {
        current.product += count;
      }
      lineCountMap.set(row.purchaseOrderId, current);
    }

    const totalsQuery = this.purchaseOrderRepository
      .createQueryBuilder("purchaseOrder")
      .leftJoin("purchaseOrder.supplier", "supplier");

    if (filters.search) {
      totalsQuery.andWhere(
        "(LOWER(purchaseOrder.purchaseNumber) LIKE LOWER(:search) OR LOWER(supplier.name) LIKE LOWER(:search))",
        { search: `%${filters.search}%` }
      );
    }

    if (filters.supplierId) {
      totalsQuery.andWhere("purchaseOrder.supplierId = :supplierId", { supplierId: filters.supplierId });
    }

    if (filters.purchaseType) {
      totalsQuery.andWhere("purchaseOrder.purchaseType = :purchaseType", { purchaseType: filters.purchaseType });
    }

    if (filters.dateFrom) {
      totalsQuery.andWhere("purchaseOrder.purchaseDate >= :dateFrom", { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      totalsQuery.andWhere("purchaseOrder.purchaseDate <= :dateTo", { dateTo: filters.dateTo });
    }

    const totalsRow = await totalsQuery
      .select("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(purchaseOrder.totalAmount), 0)", "totalAmount")
      .getRawOne<{ count: string; totalAmount: string }>();

    return {
      orders: orders.map((order) => {
        const lineCounts = lineCountMap.get(order.id) ?? { total: 0, ingredient: 0, product: 0 };
        return {
          id: order.id,
          purchaseNumber: order.purchaseNumber,
          purchaseDate: order.purchaseDate,
          purchaseType: order.purchaseType,
          purchaseSection: order.purchaseSection,
          supplierId: order.supplierId,
          supplierName: order.supplier?.name ?? "-",
          lineCount: lineCounts.total,
          ingredientLineCount: lineCounts.ingredient,
          productLineCount: lineCounts.product,
          totalAmount: toFixedPrice(toNumber(order.totalAmount)),
          note: order.note,
          invoiceImageUrl: order.invoiceImageUrl,
          createdByUserId: order.createdByUserId,
          createdByUserName: order.createdByUser?.fullName ?? null,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        };
      }),
      pagination: getPaginationMeta(page, limit, total),
      stats: {
        totalOrders: Number(totalsRow?.count ?? 0),
        totalAmount: toFixedPrice(toNumber(totalsRow?.totalAmount ?? 0))
      }
    };
  }

  async getPurchaseOrderById(id: string) {
    const order = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: {
        supplier: true,
        createdByUser: true,
        lines: {
          ingredient: true,
          product: true
        }
      },
      order: {
        lines: {
          createdAt: "ASC"
        }
      }
    });

    if (!order) {
      throw new AppError(404, "Purchase order not found");
    }

    return {
      id: order.id,
      purchaseNumber: order.purchaseNumber,
      purchaseDate: order.purchaseDate,
      purchaseType: order.purchaseType,
      purchaseSection: order.purchaseSection,
      supplierId: order.supplierId,
      supplierName: order.supplier?.name ?? "-",
      supplierPhone: order.supplier?.phone ?? "-",
      note: order.note,
      invoiceImageUrl: order.invoiceImageUrl,
      totalAmount: toFixedPrice(toNumber(order.totalAmount)),
      createdByUserId: order.createdByUserId,
      createdByUserName: order.createdByUser?.fullName ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      lines: order.lines.map((line) => ({
        id: line.id,
        lineType: line.lineType,
        ingredientId: line.ingredientId,
        productId: line.productId,
        itemNameSnapshot: line.itemNameSnapshot,
        categoryNameSnapshot: line.categoryNameSnapshot,
        unit: line.unit,
        stockBefore: toFixedQuantity(toNumber(line.stockBefore)),
        stockAdded: toFixedQuantity(toNumber(line.stockAdded)),
        dipAndDashStockAdded:
          line.dipAndDashStockAdded === null || line.dipAndDashStockAdded === undefined
            ? null
            : toFixedQuantity(toNumber(line.dipAndDashStockAdded)),
        gamingStockAdded:
          line.gamingStockAdded === null || line.gamingStockAdded === undefined
            ? null
            : toFixedQuantity(toNumber(line.gamingStockAdded)),
        enteredQuantity:
          line.enteredQuantity === null || line.enteredQuantity === undefined
            ? null
            : toFixedQuantity(toNumber(line.enteredQuantity)),
        enteredUnit: line.enteredUnit,
        stockAfter: toFixedQuantity(toNumber(line.stockAfter)),
        unitPrice: toFixedPrice(toNumber(line.unitPrice)),
        lineTotal: toFixedPrice(toNumber(line.lineTotal)),
        unitPriceUpdated: line.unitPriceUpdated,
        expiryDate: line.expiryDate,
        createdAt: line.createdAt
      }))
    };
  }

  async getMeta(filters: ProcurementMetaFilters) {
    const date = filters.date || getTodayDate();

    const ingredientQuery = this.ingredientRepository
      .createQueryBuilder("ingredient")
      .leftJoinAndSelect("ingredient.category", "category")
      .where("ingredient.isActive = true")
      .orderBy("ingredient.name", "ASC");

    if (filters.ingredientCategoryId) {
      ingredientQuery.andWhere("ingredient.categoryId = :categoryId", { categoryId: filters.ingredientCategoryId });
    }

    if (filters.ingredientSearch) {
      ingredientQuery.andWhere(
        "(LOWER(ingredient.name) LIKE LOWER(:search) OR LOWER(category.name) LIKE LOWER(:search))",
        { search: `%${filters.ingredientSearch}%` }
      );
    }

    const productQuery = this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.defaultSupplier", "defaultSupplier")
      .where("product.isActive = true")
      .orderBy("product.name", "ASC");

    if (filters.productSearch) {
      productQuery.andWhere(
        "(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.category) LIKE LOWER(:search) OR LOWER(COALESCE(product.sku, '')) LIKE LOWER(:search))",
        { search: `%${filters.productSearch}%` }
      );
    }

    const [suppliers, categories, ingredients, products] = await Promise.all([
      this.supplierRepository
        .createQueryBuilder("supplier")
        .where("supplier.isActive = true")
        .orderBy("supplier.name", "ASC")
        .getMany(),
      this.ingredientCategoryRepository
        .createQueryBuilder("category")
        .where("category.isActive = true")
        .orderBy("category.name", "ASC")
        .getMany(),
      ingredientQuery.getMany(),
      productQuery.getMany()
    ]);

    const ingredientIds = ingredients.map((ingredient) => ingredient.id);
    const [stockRows, allocationRows] = await Promise.all([
      ingredientIds.length
        ? this.ingredientStockRepository.find({
            where: {
              ingredientId: In(ingredientIds)
            }
          })
        : [],
      ingredientIds.length
        ? this.allocationRepository.find({
            where: {
              ingredientId: In(ingredientIds),
              date
            }
          })
        : []
    ]);

    const stockMap = new Map(stockRows.map((stock) => [stock.ingredientId, toNumber(stock.totalStock)]));
    const allocationMap = new Map(allocationRows.map((allocation) => [allocation.ingredientId, allocation]));
    const fallbackIngredientPriceMap = new Map(
      ingredients.map((ingredient) => [ingredient.id, toNumber(ingredient.perUnitPrice)])
    );
    const latestIngredientPriceMap = await getLatestIngredientPurchasePriceMap(
      ingredientIds,
      fallbackIngredientPriceMap
    );

    return {
      date,
      suppliers: suppliers.map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        storeName: supplier.storeName,
        phone: supplier.phone,
        address: supplier.address
      })),
      ingredientCategories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        kind: category.kind
      })),
      ingredients: ingredients.map((ingredient) => {
        const allocation = allocationMap.get(ingredient.id);
        const currentStock = toFixedQuantity(stockMap.get(ingredient.id) ?? 0);
        const allocatedToday = toFixedQuantity(toNumber(allocation?.allocatedQuantity));
        const usedToday = toFixedQuantity(toNumber(allocation?.usedQuantity));
        const remainingToday = toFixedQuantity(toNumber(allocation?.remainingQuantity));

        return {
          id: ingredient.id,
          name: ingredient.name,
          categoryId: ingredient.categoryId,
          categoryName: ingredient.category?.name ?? "-",
          categoryKind: ingredient.category?.kind ?? "core",
          unit: ingredient.unit,
          unitOptions: getCompatibleIngredientUnits(ingredient.unit),
          perUnitPrice: toFixedPrice(
            latestIngredientPriceMap.get(ingredient.id) ?? toNumber(ingredient.perUnitPrice)
          ),
          currentStock,
          minStock: toFixedQuantity(toNumber(ingredient.minStock)),
          allocatedToday,
          usedToday,
          pendingToday: remainingToday,
          stockStatus: getStockStatus(currentStock, toNumber(ingredient.minStock))
        };
      }),
      products: products.map((product) => {
        const currentStock = toFixedQuantity(toNumber(product.currentStock));
        const minStock = toFixedQuantity(toNumber(product.minStock));

        return {
          id: product.id,
          name: product.name,
          category: product.category,
          sku: product.sku,
          packSize: product.packSize,
          unit: product.unit,
          unitOptions: getCompatibleProductUnits(product.unit),
          purchaseUnitPrice: toFixedPrice(toNumber(product.purchaseUnitPrice)),
          sellingPrice: toFixedPrice(toNumber(product.sellingPrice)),
          targetSection: product.targetSection,
          dipAndDashAssignedStock: toFixedQuantity(toNumber(product.dipAndDashStock)),
          gamingAssignedStock: toFixedQuantity(toNumber(product.gamingStock)),
          currentStock,
          minStock,
          stockStatus: getStockStatus(currentStock, minStock),
          defaultSupplierId: product.defaultSupplierId,
          defaultSupplierName: product.defaultSupplier?.name ?? null
        };
      })
    };
  }

  async getStats(filters: ProcurementStatsFilters) {
    const purchaseQuery = this.purchaseOrderRepository.createQueryBuilder("purchaseOrder");
    if (filters.dateFrom) {
      purchaseQuery.andWhere("purchaseOrder.purchaseDate >= :dateFrom", { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      purchaseQuery.andWhere("purchaseOrder.purchaseDate <= :dateTo", { dateTo: filters.dateTo });
    }

    const [supplierCount, productCount, purchaseSummary, productPurchaseSummary, recentPurchases] = await Promise.all([
      this.supplierRepository.count(),
      this.productRepository.count(),
      purchaseQuery
        .clone()
        .select("COUNT(*)", "count")
        .addSelect("COALESCE(SUM(purchaseOrder.totalAmount), 0)", "amount")
        .getRawOne<{ count: string; amount: string }>(),
      this.purchaseOrderLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.purchaseOrder", "purchaseOrder")
        .select("COALESCE(SUM(line.stockAdded), 0)", "qty")
        .addSelect("COALESCE(SUM(line.lineTotal), 0)", "amount")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere(filters.dateFrom ? "purchaseOrder.purchaseDate >= :dateFrom" : "1=1", { dateFrom: filters.dateFrom })
        .andWhere(filters.dateTo ? "purchaseOrder.purchaseDate <= :dateTo" : "1=1", { dateTo: filters.dateTo })
        .getRawOne<{ qty: string; amount: string }>(),
      this.purchaseOrderRepository.find({
        relations: { supplier: true, createdByUser: true },
        order: { createdAt: "DESC" },
        take: 6
      })
    ]);

    return {
      summary: {
        totalSuppliers: supplierCount,
        totalProducts: productCount,
        totalPurchaseOrders: Number(purchaseSummary?.count ?? 0),
        totalPurchaseAmount: toFixedPrice(toNumber(purchaseSummary?.amount ?? 0)),
        totalProductPurchasedQuantity: toFixedQuantity(toNumber(productPurchaseSummary?.qty ?? 0)),
        totalProductPurchasedAmount: toFixedPrice(toNumber(productPurchaseSummary?.amount ?? 0))
      },
      recentPurchases: recentPurchases.map((order) => ({
        id: order.id,
        purchaseNumber: order.purchaseNumber,
        purchaseDate: order.purchaseDate,
        purchaseType: order.purchaseType,
        purchaseSection: order.purchaseSection,
        supplierName: order.supplier?.name ?? "-",
        totalAmount: toFixedPrice(toNumber(order.totalAmount)),
        createdByUserName: order.createdByUser?.fullName ?? null,
        createdAt: order.createdAt
      }))
    };
  }
}
