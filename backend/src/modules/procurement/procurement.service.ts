import { inflateRawSync } from "zlib";
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
import { ProductDayLedgerAdjustment } from "./product-day-ledger-adjustment.entity";
import { PurchaseBulkImport } from "./purchase-bulk-import.entity";
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
  section?: PurchaseSection;
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

type ProductStockHistoryFilters = {
  dateFrom?: string;
  dateTo?: string;
  purchasePage: number;
  purchaseLimit: number;
  consumptionPage: number;
  consumptionLimit: number;
};

type UpsertProductDayLedgerPayload = {
  productId?: string;
  date?: string;
  targetSection?: ProductTargetSection;
  stockHealth?: "LOW_STOCK" | "HEALTHY";
  openingStock: number;
  purchased: number;
  consumption: number;
  dipAndDashConsumption: number;
  snookerConsumption: number;
  note?: string;
};

type PurchaseOrderListFilters = PaginationFilters & {
  search?: string;
  supplierId?: string;
  purchaseType?: PurchaseOrderType;
  purchaseSection?: PurchaseSection;
  dateFrom?: string;
  dateTo?: string;
};

type PurchaseBulkImportHistoryFilters = PaginationFilters & {
  purchaseSection?: PurchaseSection;
};

type ProcurementMetaFilters = {
  date?: string;
  ingredientCategoryId?: string;
  ingredientSearch?: string;
  productSearch?: string;
  purchaseSection?: PurchaseSection;
};

type ProcurementStatsFilters = {
  dateFrom?: string;
  dateTo?: string;
  purchaseSection?: PurchaseSection;
};

type CreateSupplierPayload = {
  name: string;
  storeName?: string;
  phone: string;
  address?: string;
  section?: PurchaseSection;
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
  productName?: string;
  productCategory?: string;
  productPackSize?: string;
  productUnit?: ProductUnit;
  quantity: number;
  quantityUnit?: string;
  unitPrice: number;
  gstPercentage?: number;
  gstValue?: number;
  sourceAmount?: number;
  sourceGrandTotal?: number;
  sourceRowNumber?: number;
  expiryDate?: string;
  note?: string;
};

type CreatePurchaseOrderPayload = {
  supplierId?: string;
  supplierName?: string;
  supplierPhone?: string;
  purchaseDate?: string;
  purchaseSection?: PurchaseSection;
  vendorInvoiceNumber?: string;
  projectName?: string;
  purchaseMonth?: string;
  receivedDate?: string;
  note?: string;
  invoiceImageUrl?: string;
  lines: PurchaseOrderLinePayload[];
};

type PurchaseBulkCsvRow = {
  rowNumber: number;
  supplierName: string;
  purchaseDate: string;
  purchaseNote: string;
  phone?: string;
  vendorInvoiceNumber?: string;
  projectName?: string;
  month?: string;
  lineType: PurchaseLineType;
  itemName: string;
  packSize?: string;
  quantity: number;
  quantityUnit?: string;
  unitPrice: number;
  amount?: number;
  gstPercentage?: number;
  gstAmount?: number;
  grandTotal?: number;
  receivedDate?: string;
  expiryDate?: string;
  lineNote?: string;
};

type PurchaseBulkRowDetail = {
  rowNumber: number;
  status: "inserted" | "skipped_duplicate" | "failed";
  supplierName?: string;
  itemName?: string;
  packSize?: string | null;
  purchaseDate?: string;
  vendorInvoiceNumber?: string | null;
  quantity?: number | null;
  quantityUnit?: string | null;
  unitPrice?: number | null;
  amount?: number | null;
  gstAmount?: number | null;
  grandTotal?: number | null;
  purchaseNumber?: string;
  reason?: string;
};

const PURCHASE_BULK_TEMPLATE_HEADERS = [
  "vendor_name",
  "phone_number",
  "vendor_invoice_no",
  "purchase_date",
  "project_name",
  "month",
  "description",
  "alt_type",
  "purchase_qty",
  "unit_price",
  "amount",
  "gst_percentage",
  "gst_amount",
  "grand_total",
  "received_date"
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
const LEDGER_MOVE_SUPPRESS_PREFIX = "__ledger_move_suppress__:";
const LEDGER_ROW_DELETE_SUPPRESS_PREFIX = "__ledger_row_delete_suppress__:";
const PRODUCT_CONSUMPTION_SOURCE = "snooker_product_consumption";

const toNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toFixedQuantity = (value: number) => Number(value.toFixed(3));
const toFixedPrice = (value: number) => Number(value.toFixed(2));
const isLedgerSuppressionNote = (note: string | null | undefined) =>
  typeof note === "string" &&
  (note.startsWith(LEDGER_MOVE_SUPPRESS_PREFIX) || note.startsWith(LEDGER_ROW_DELETE_SUPPRESS_PREFIX));
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

const applyProductPurchaseSplit = (product: Product, stockAdded: number, purchaseSection?: PurchaseSection) => {
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
  } else if (purchaseSection === "dip_and_dash") {
    dipAndDashAdded = added;
  } else if (purchaseSection === "gaming") {
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

const getProductLedgerAdjustmentNet = (input: {
  openingDelta?: number | null;
  purchasedDelta?: number | null;
  consumptionDelta?: number | null;
}) =>
  toFixedQuantity(
    toNumber(input.openingDelta) + toNumber(input.purchasedDelta) - toNumber(input.consumptionDelta)
  );

const sumProductLedgerAdjustments = (rows: ProductDayLedgerAdjustment[]) => {
  const totals = {
    openingDelta: 0,
    purchasedDelta: 0,
    consumptionDelta: 0,
    dipAndDashConsumptionDelta: 0,
    snookerConsumptionDelta: 0
  };
  for (const row of rows) {
    totals.openingDelta = toFixedQuantity(totals.openingDelta + toNumber(row.openingDelta));
    totals.purchasedDelta = toFixedQuantity(totals.purchasedDelta + toNumber(row.purchasedDelta));
    totals.consumptionDelta = toFixedQuantity(totals.consumptionDelta + toNumber(row.consumptionDelta));
    totals.dipAndDashConsumptionDelta = toFixedQuantity(
      totals.dipAndDashConsumptionDelta + toNumber(row.dipAndDashConsumptionDelta)
    );
    totals.snookerConsumptionDelta = toFixedQuantity(
      totals.snookerConsumptionDelta + toNumber(row.snookerConsumptionDelta)
    );
  }
  return totals;
};

const applyProductLedgerNetDelta = (product: Product, netDelta: number) => {
  const delta = toFixedQuantity(toNumber(netDelta));
  if (Math.abs(delta) <= 0.0005) {
    return;
  }

  const existing = normalizeProductSectionStocks({
    targetSection: product.targetSection,
    currentStock: toNumber(product.currentStock),
    dipAndDashStock: toNumber(product.dipAndDashStock),
    gamingStock: toNumber(product.gamingStock)
  });

  const nextCurrentStock = toFixedQuantity(Math.max(0, existing.currentStock + delta));
  if (product.targetSection === "dip_and_dash") {
    product.currentStock = nextCurrentStock;
    product.dipAndDashStock = nextCurrentStock;
    product.gamingStock = 0;
    return;
  }

  if (product.targetSection === "gaming") {
    product.currentStock = nextCurrentStock;
    product.dipAndDashStock = 0;
    product.gamingStock = nextCurrentStock;
    return;
  }

  const baseTotal = toFixedQuantity(existing.dipAndDashStock + existing.gamingStock);
  const dipRatio = baseTotal > 0 ? existing.dipAndDashStock / baseTotal : 0.5;
  const nextDipAndDashStock = toFixedQuantity(nextCurrentStock * dipRatio);
  product.currentStock = nextCurrentStock;
  product.dipAndDashStock = nextDipAndDashStock;
  product.gamingStock = toFixedQuantity(nextCurrentStock - nextDipAndDashStock);
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
const normalizeProductMatchKey = (value: string) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(drink|beverage|juice|ice|cream|milkshake|chocolate|bar|flavour|flavor|pcs|qty|ml|g|gm|tin|box|veg)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

const resolveProductMatchKey = (name: string, packSize?: string | null) => {
  const base = normalizeProductMatchKey(name);
  const pack = normalizeProductMatchKey(packSize ?? "");
  return pack ? `${base} ${pack}`.trim() : base;
};

const normalizePhoneText = (value: string) => value.trim().replace(/\s+/g, " ");

const escapeCsvValue = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
};

const decodeXmlText = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const stripXmlTags = (value: string) => decodeXmlText(value.replace(/<[^>]*>/g, ""));

const columnLettersToIndex = (letters: string) => {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + char.charCodeAt(0) - 64;
  }
  return index - 1;
};

const readZipEntries = (buffer: Buffer) => {
  const entries = new Map<string, Buffer>();
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 66000);
  for (let index = buffer.length - 22; index >= minOffset; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new AppError(422, "Uploaded XLSX file is invalid.");
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new AppError(422, "Uploaded XLSX file has an invalid directory.");
    }
    const compressionMethod = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);
    const fileName = buffer
      .subarray(centralOffset + 46, centralOffset + 46 + fileNameLength)
      .toString("utf-8");

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new AppError(422, "Uploaded XLSX file has an invalid entry.");
    }
    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    if (compressionMethod === 0) {
      entries.set(fileName, compressed);
    } else if (compressionMethod === 8) {
      entries.set(fileName, inflateRawSync(compressed));
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

const parseXlsxRows = (buffer: Buffer) => {
  const entries = readZipEntries(buffer);
  const sharedStringsXml = entries.get("xl/sharedStrings.xml")?.toString("utf-8") ?? "";
  const sharedStrings = Array.from(sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)).map((match) =>
    normalizeText(stripXmlTags(match[1]).replace(/\s+/g, " "))
  );
  const sheetXml = entries.get("xl/worksheets/sheet1.xml")?.toString("utf-8");
  if (!sheetXml) {
    throw new AppError(422, "Uploaded XLSX file does not contain a first worksheet.");
  }

  return Array.from(sheetXml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)).map((rowMatch) => {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const ref = /r="([A-Z]+)\d+"/.exec(attributes)?.[1] ?? "";
      const columnIndex = ref ? columnLettersToIndex(ref) : cells.length;
      const type = /t="([^"]+)"/.exec(attributes)?.[1] ?? "";
      const rawValue = /<v[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      let value = "";
      if (type === "s") {
        value = sharedStrings[Number(rawValue)] ?? "";
      } else if (type === "inlineStr") {
        value = normalizeText(stripXmlTags(body).replace(/\s+/g, " "));
      } else {
        value = decodeXmlText(rawValue);
      }
      cells[columnIndex] = value;
    }
    return cells.map((cell) => cell ?? "");
  });
};

const parseTabularUploadRows = (buffer: Buffer, originalName?: string) => {
  const extension = (originalName ?? "").toLowerCase().split(".").pop();
  if (extension === "xlsx") {
    return parseXlsxRows(buffer);
  }

  const content = buffer.toString("utf-8").replace(/^\uFEFF/, "").trim();
  if (!content) {
    throw new AppError(422, "Uploaded file is empty.");
  }
  return parseCsvRows(content);
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

  const excelSerial = Number(trimmed);
  if (/^\d{4,6}(?:\.\d+)?$/.test(trimmed) && Number.isFinite(excelSerial) && excelSerial > 20000 && excelSerial < 70000) {
    const parsed = new Date(Date.UTC(1899, 11, 30 + Math.floor(excelSerial)));
    const year = parsed.getUTCFullYear();
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const day = String(parsed.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
  private readonly purchaseBulkImportRepository = AppDataSource.getRepository(PurchaseBulkImport);
  private readonly productDayLedgerAdjustmentRepository = AppDataSource.getRepository(ProductDayLedgerAdjustment);
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

  private async ensureSupplierExists(supplierId: string | null | undefined, section?: PurchaseSection) {
    if (!supplierId) {
      return null;
    }

    const query = this.supplierRepository
      .createQueryBuilder("supplier")
      .where("supplier.id = :supplierId", { supplierId })
      .andWhere("supplier.isActive = true");
    if (section) {
      query.andWhere("supplier.section = :section", { section });
    }
    const supplier = await query.getOne();
    if (!supplier) {
      throw new AppError(404, "Default supplier not found or inactive");
    }

    return supplier;
  }

  private async ensureSupplierNameUnique(name: string, section: PurchaseSection, ignoreId?: string) {
    const query = this.supplierRepository
      .createQueryBuilder("supplier")
      .where("LOWER(supplier.name) = LOWER(:name)", { name })
      .andWhere("supplier.section = :section", { section });

    if (ignoreId) {
      query.andWhere("supplier.id != :ignoreId", { ignoreId });
    }

    const existing = await query.getOne();
    if (existing) {
      throw new AppError(409, "Supplier with this name already exists in this business.");
    }
  }

  private async ensureProductNameUnique(name: string, targetSection: ProductTargetSection, ignoreId?: string) {
    const query = this.productRepository
      .createQueryBuilder("product")
      .where("LOWER(product.name) = LOWER(:name)", { name })
      .andWhere("product.targetSection = :targetSection", { targetSection });

    if (ignoreId) {
      query.andWhere("product.id != :ignoreId", { ignoreId });
    }

    const existing = await query.getOne();
    if (existing) {
      throw new AppError(409, "Product with this name already exists in this business.");
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
      section: supplier.section,
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
      [
        "S/N",
        "Vendor Name",
        "Phone Number",
        "Vendor Invoice No#",
        "Purchase Date",
        "Project Name",
        "Month",
        "Description",
        "Alt Type",
        "Purchase Qty",
        "Unit price",
        "Amount",
        "GST%",
        "Gst Amount",
        "Grand Total",
        "Received Date"
      ],
      [
        "1",
        "D Mart-Velachery",
        "044-22430134",
        "600504012-006959",
        "2026-04-28",
        "147-Snooker's",
        "April",
        "Coca-Cola Zero Sugar",
        "TIN-300 ml",
        "9",
        "35",
        "315",
        "0",
        "0",
        "315",
        ""
      ]
    ];

    const csv = rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\n");
    return {
      fileName: "snooker_purchase_bulk_template.csv",
      content: `\uFEFF${csv}`
    };
  }

  private parseBulkPurchaseRows(fileBuffer: Buffer, originalName?: string) {
    const parsedRows = parseTabularUploadRows(fileBuffer, originalName);
    if (!parsedRows.length) {
      throw new AppError(422, "Uploaded file is empty.");
    }

    const headerRowIndex = parsedRows.findIndex((row) =>
      row.some((cell) => ["vendorname", "suppliername", "description", "itemname"].includes(normalizeHeaderKey(cell)))
    );
    if (headerRowIndex < 0) {
      throw new AppError(422, "Could not find a valid purchase header row.");
    }

    const headerAliases = new Map<string, string>([
      ["vendorname", "vendor_name"],
      ["suppliername", "vendor_name"],
      ["supplier", "vendor_name"],
      ["phonenumber", "phone_number"],
      ["phone", "phone_number"],
      ["vendorinvoiceno", "vendor_invoice_no"],
      ["invoiceno", "vendor_invoice_no"],
      ["invoicenumber", "vendor_invoice_no"],
      ["purchasedate", "purchase_date"],
      ["date", "purchase_date"],
      ["projectname", "project_name"],
      ["project", "project_name"],
      ["month", "month"],
      ["description", "description"],
      ["productname", "description"],
      ["itemname", "description"],
      ["item", "description"],
      ["alttype", "alt_type"],
      ["packsize", "alt_type"],
      ["purchaseqty", "purchase_qty"],
      ["qty", "purchase_qty"],
      ["quantity", "purchase_qty"],
      ["quantityunit", "quantity_unit"],
      ["unit", "quantity_unit"],
      ["unitprice", "unit_price"],
      ["price", "unit_price"],
      ["amount", "amount"],
      ["gst", "gst_percentage"],
      ["gstpercentage", "gst_percentage"],
      ["gstamount", "gst_amount"],
      ["grandtotal", "grand_total"],
      ["receiveddate", "received_date"],
      ["purchasenote", "purchase_note"],
      ["linetype", "line_type"],
      ["type", "line_type"],
      ["expirydate", "expiry_date"],
      ["expdate", "expiry_date"],
      ["expiry", "expiry_date"],
      ["linenote", "line_note"],
      ["note", "line_note"]
    ]);

    const headerIndexMap = new Map<string, number>();
    parsedRows[headerRowIndex].forEach((header, index) => {
      const alias = headerAliases.get(normalizeHeaderKey(header));
      if (alias) {
        headerIndexMap.set(alias, index);
      }
    });

    const requiredHeaders = ["vendor_name", "purchase_date", "description", "purchase_qty", "unit_price"];
    const missingHeaders = requiredHeaders.filter((header) => !headerIndexMap.has(header));
    if (missingHeaders.length) {
      throw new AppError(
        422,
        `Missing required column(s): ${missingHeaders.join(", ")}. Please use the downloadable template.`
      );
    }

    const readValue = (row: string[], header: string) => {
      const columnIndex = headerIndexMap.get(header);
      return columnIndex === undefined ? "" : String(row[columnIndex] ?? "");
    };

    const nonEmptyRows = parsedRows
      .slice(headerRowIndex + 1)
      .map((row, index) => ({ row, rowNumber: headerRowIndex + index + 2 }))
      .filter(({ row }) => row.some((cell) => cell.trim().length > 0));

    const rows: PurchaseBulkCsvRow[] = [];
    const invalidRowDetails: PurchaseBulkRowDetail[] = [];
    let invalidRows = 0;

    nonEmptyRows.forEach(({ row, rowNumber }) => {
      const rowDetail: PurchaseBulkRowDetail = { rowNumber, status: "failed" };
      try {
        const supplierName = normalizeText(readValue(row, "vendor_name"));
        const phone = normalizePhoneText(readValue(row, "phone_number"));
        const vendorInvoiceNumber = normalizeText(readValue(row, "vendor_invoice_no"));
        const purchaseDateRaw = readValue(row, "purchase_date");
        const projectName = normalizeText(readValue(row, "project_name"));
        const month = normalizeText(readValue(row, "month"));
        const itemName = normalizeText(readValue(row, "description").replace(/\s+/g, " "));
        const packSize = normalizeText(readValue(row, "alt_type").replace(/\s+/g, " "));
        const quantityRaw = normalizeText(readValue(row, "purchase_qty"));
        const quantityUnit = normalizeText(readValue(row, "quantity_unit")).toLowerCase();
        const unitPriceRaw = normalizeText(readValue(row, "unit_price"));
        const amountRaw = normalizeText(readValue(row, "amount"));
        const gstPercentageRaw = normalizeText(readValue(row, "gst_percentage"));
        const gstAmountRaw = normalizeText(readValue(row, "gst_amount"));
        const grandTotalRaw = normalizeText(readValue(row, "grand_total"));
        const receivedDateRaw = readValue(row, "received_date");
        const purchaseNote = normalizeText(readValue(row, "purchase_note"));
        const lineTypeRaw = normalizeText(readValue(row, "line_type")).toLowerCase();
        const expiryDateRaw = normalizeText(readValue(row, "expiry_date"));
        const lineNote = normalizeText(readValue(row, "line_note"));

        rowDetail.supplierName = supplierName || undefined;
        rowDetail.itemName = itemName || undefined;
        rowDetail.packSize = packSize || null;
        rowDetail.purchaseDate = normalizeText(purchaseDateRaw) || undefined;
        rowDetail.vendorInvoiceNumber = vendorInvoiceNumber || null;
        rowDetail.quantity = quantityRaw ? Number(quantityRaw) : null;
        rowDetail.quantityUnit = quantityUnit || "pcs";
        rowDetail.unitPrice = unitPriceRaw ? Number(unitPriceRaw) : null;
        rowDetail.amount = amountRaw ? Number(amountRaw) : null;
        rowDetail.gstAmount = gstAmountRaw ? Number(gstAmountRaw) : null;
        rowDetail.grandTotal = grandTotalRaw ? Number(grandTotalRaw) : null;

        if (!itemName && /^total\b/i.test(normalizeText(row[0] ?? ""))) {
          return;
        }
        if (!supplierName) {
          throw new AppError(422, `Row ${rowNumber}: Vendor name is required.`);
        }
        if (!itemName) {
          throw new AppError(422, `Row ${rowNumber}: Description is required.`);
        }
        if (!quantityRaw) {
          throw new AppError(422, `Row ${rowNumber}: Purchase qty is required.`);
        }
        if (!unitPriceRaw) {
          throw new AppError(422, `Row ${rowNumber}: Unit price is required.`);
        }

        const lineType = lineTypeRaw
          ? PURCHASE_LINE_TYPES.includes(lineTypeRaw as PurchaseLineType)
            ? (lineTypeRaw as PurchaseLineType)
            : null
          : "product";
        if (!lineType) {
          throw new AppError(422, `Row ${rowNumber}: Line type must be ingredient or product.`);
        }

        const purchaseDate = parseDateLikeToYmd(purchaseDateRaw, rowNumber, "Purchase date") || getTodayDate();
        const quantity = toFixedQuantity(parsePositiveNumber(quantityRaw, rowNumber, "Purchase qty"));
        const unitPrice = toFixedPrice(parseNonNegativeNumber(unitPriceRaw, rowNumber, "Unit price"));
        const computedAmount = toFixedPrice(quantity * unitPrice);
        const amount = amountRaw ? toFixedPrice(parseNonNegativeNumber(amountRaw, rowNumber, "Amount")) : computedAmount;
        const gstPercentage = gstPercentageRaw
          ? Number(parseNonNegativeNumber(gstPercentageRaw, rowNumber, "GST%").toFixed(4))
          : undefined;
        const gstAmount = gstAmountRaw ? toFixedPrice(parseNonNegativeNumber(gstAmountRaw, rowNumber, "GST amount")) : 0;
        const computedGrandTotal = toFixedPrice(computedAmount + gstAmount);
        const grandTotal = grandTotalRaw
          ? toFixedPrice(parseNonNegativeNumber(grandTotalRaw, rowNumber, "Grand total"))
          : computedGrandTotal;
        const receivedDate = parseDateLikeToYmd(receivedDateRaw, rowNumber, "Received date") || undefined;
        const expiryDate = parseDateLikeToYmd(expiryDateRaw, rowNumber, "Expiry date") || undefined;

        rowDetail.purchaseDate = purchaseDate;
        rowDetail.quantity = quantity;
        rowDetail.unitPrice = unitPrice;
        rowDetail.amount = amount;
        rowDetail.gstAmount = gstAmount;
        rowDetail.grandTotal = grandTotal;

        if (lineType === "ingredient" && expiryDate) {
          throw new AppError(422, `Row ${rowNumber}: expiry_date is allowed only for product lines.`);
        }
        if (Math.abs(amount - computedAmount) > 0.05) {
          throw new AppError(422, `Row ${rowNumber}: Amount does not match Purchase Qty x Unit price.`);
        }
        if (Math.abs(grandTotal - computedGrandTotal) > 0.05) {
          throw new AppError(422, `Row ${rowNumber}: Grand Total does not match Amount + Gst Amount.`);
        }

        rows.push({
          rowNumber,
          supplierName,
          phone,
          vendorInvoiceNumber,
          purchaseDate,
          projectName,
          month,
          purchaseNote,
          lineType,
          itemName,
          packSize: packSize || undefined,
          quantity,
          quantityUnit: quantityUnit || "pcs",
          unitPrice,
          amount,
          gstPercentage,
          gstAmount,
          grandTotal,
          receivedDate,
          expiryDate: lineType === "product" ? expiryDate : undefined,
          lineNote: lineNote || undefined
        });
      } catch (error) {
        invalidRows += 1;
        const reason =
          error instanceof AppError ? error.message.replace(/^Row \d+:\s*/i, "") : "Row validation failed.";
        if (invalidRowDetails.length < MAX_PURCHASE_BULK_INVALID_DETAILS) {
          invalidRowDetails.push({ ...rowDetail, reason });
        }
      }
    });

    return {
      rows,
      supplierName: rows[0]?.supplierName ?? "",
      purchaseDate: rows[0]?.purchaseDate ?? getTodayDate(),
      purchaseNote: rows[0]?.purchaseNote ?? "",
      invalidRows,
      invalidRowDetails,
      totalRows: nonEmptyRows.length
    };
  }

  private buildPurchaseOrderNote(row: PurchaseBulkCsvRow) {
    const parts = [row.purchaseNote || "Imported purchase"];
    if (row.vendorInvoiceNumber) {
      parts.push(`Invoice: ${row.vendorInvoiceNumber}`);
    }
    if (row.projectName) {
      parts.push(`Project: ${row.projectName}`);
    }
    if (row.month) {
      parts.push(`Month: ${row.month}`);
    }
    if (row.receivedDate) {
      parts.push(`Received: ${row.receivedDate}`);
    }
    return parts.join(" | ");
  }

  private buildPurchaseDuplicateKey(input: {
    supplierName: string;
    purchaseDate: string;
    vendorInvoiceNumber?: string | null;
    productName: string;
    packSize?: string | null;
    quantity: number;
    unitPrice: number;
    gstAmount: number;
    grandTotal: number;
  }) {
    return [
      normalizeLookupKey(input.supplierName),
      input.purchaseDate,
      normalizeLookupKey(input.vendorInvoiceNumber ?? ""),
      resolveProductMatchKey(input.productName, input.packSize),
      toFixedQuantity(input.quantity).toFixed(3),
      toFixedPrice(input.unitPrice).toFixed(2),
      toFixedPrice(input.gstAmount).toFixed(2),
      toFixedPrice(input.grandTotal).toFixed(2)
    ].join("|");
  }

  private async ensureSupplierForPurchaseImport(
    manager: EntityManager,
    row: Pick<PurchaseBulkCsvRow, "supplierName" | "phone">,
    section: PurchaseSection = "gaming"
  ) {
    const supplierName = normalizeText(row.supplierName);
    const supplier = await manager
      .getRepository(Supplier)
      .createQueryBuilder("supplier")
      .where("LOWER(supplier.name) = LOWER(:name)", { name: supplierName })
      .andWhere("supplier.section = :section", { section })
      .getOne();

    if (supplier) {
      let changed = false;
      if (!supplier.isActive) {
        supplier.isActive = true;
        changed = true;
      }
      if (!supplier.phone?.trim() && row.phone) {
        supplier.phone = row.phone;
        changed = true;
      }
      return changed ? manager.save(Supplier, supplier) : supplier;
    }

    return manager.save(
      Supplier,
      manager.create(Supplier, {
        name: supplierName,
        storeName: supplierName,
        phone: row.phone || "-",
        address: "Auto-created from purchase import",
        section,
        isActive: true
      })
    );
  }

  async bulkImportPurchaseOrderFromCsv(csvBuffer: Buffer, createdByUserId: string, originalName?: string) {
    const parsed = this.parseBulkPurchaseRows(csvBuffer, originalName);

    const result = await AppDataSource.transaction(async (manager) => {
      const productRows = parsed.rows.filter((row) => row.lineType === "product");
      const rowsBySupplierDateInvoice = new Map<string, PurchaseBulkCsvRow[]>();
      for (const row of parsed.rows) {
        const key = [normalizeLookupKey(row.supplierName), row.purchaseDate, normalizeLookupKey(row.vendorInvoiceNumber ?? "")].join("|");
        const current = rowsBySupplierDateInvoice.get(key) ?? [];
        current.push(row);
        rowsBySupplierDateInvoice.set(key, current);
      }

      const suppliersByKey = new Map<string, Supplier>();
      for (const row of parsed.rows) {
        const key = normalizeLookupKey(row.supplierName);
        if (!suppliersByKey.has(key)) {
          suppliersByKey.set(key, await this.ensureSupplierForPurchaseImport(manager, row));
        }
      }

      const products = await manager.find(Product, { where: { isActive: true, targetSection: "gaming" } });
      const productByExactName = new Map(products.map((product) => [normalizeLookupKey(product.name), product]));
      const productByFuzzyName = new Map<string, Product>();
      products.forEach((product) => {
        productByFuzzyName.set(resolveProductMatchKey(product.name, product.packSize), product);
        productByFuzzyName.set(resolveProductMatchKey(product.name), product);
      });

      const existingOrders = await manager.find(PurchaseOrder, {
        where: { purchaseSection: "gaming" },
        relations: { supplier: true, lines: true }
      });
      const existingLineKeys = new Set<string>();
      for (const order of existingOrders) {
        for (const line of order.lines ?? []) {
          if (line.lineType !== "product") {
            continue;
          }
          existingLineKeys.add(
            this.buildPurchaseDuplicateKey({
              supplierName: order.supplier?.name ?? "",
              purchaseDate: order.purchaseDate,
              vendorInvoiceNumber: order.vendorInvoiceNumber,
              productName: line.itemNameSnapshot,
              packSize: line.packSizeSnapshot,
              quantity: toNumber(line.enteredQuantity ?? line.stockAdded),
              unitPrice: toNumber(line.unitPrice),
              gstAmount: toNumber(line.gstValue),
              grandTotal: toNumber(line.sourceGrandTotal ?? line.lineTotal)
            })
          );
        }
      }

      const duplicateInUpload = new Set<string>();
      const validRowsByGroup = new Map<string, PurchaseBulkCsvRow[]>();
      const details: PurchaseBulkRowDetail[] = [...parsed.invalidRowDetails];
      let skippedDuplicateRows = 0;
      let createdProducts = 0;
      let matchedProducts = 0;

      for (const row of productRows) {
        const matchedProduct =
          productByExactName.get(normalizeLookupKey(row.itemName)) ??
          productByFuzzyName.get(resolveProductMatchKey(row.itemName, row.packSize)) ??
          productByFuzzyName.get(resolveProductMatchKey(row.itemName));

        if (matchedProduct) {
          row.itemName = matchedProduct.name;
          matchedProducts += 1;
        }

        const rowDuplicateKey = this.buildPurchaseDuplicateKey({
          supplierName: row.supplierName,
          purchaseDate: row.purchaseDate,
          vendorInvoiceNumber: row.vendorInvoiceNumber,
          productName: row.itemName,
          packSize: row.packSize,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          gstAmount: row.gstAmount ?? 0,
          grandTotal: row.grandTotal ?? row.quantity * row.unitPrice
        });
        if (existingLineKeys.has(rowDuplicateKey) || duplicateInUpload.has(rowDuplicateKey)) {
          skippedDuplicateRows += 1;
          details.push({
            rowNumber: row.rowNumber,
            status: "skipped_duplicate",
            supplierName: row.supplierName,
            itemName: row.itemName,
            packSize: row.packSize ?? null,
            purchaseDate: row.purchaseDate,
            vendorInvoiceNumber: row.vendorInvoiceNumber || null,
            quantity: row.quantity,
            quantityUnit: row.quantityUnit ?? "pcs",
            unitPrice: row.unitPrice,
            amount: row.amount ?? null,
            gstAmount: row.gstAmount ?? 0,
            grandTotal: row.grandTotal ?? row.quantity * row.unitPrice,
            reason: "Already imported with the same vendor, date, invoice, item, quantity and amount."
          });
          continue;
        }
        duplicateInUpload.add(rowDuplicateKey);

        let product = matchedProduct;
        if (!product) {
          const created = manager.create(Product, {
            name: row.itemName,
            category: "Snooker Beverages",
            sku: null,
            packSize: row.packSize ?? null,
            unit: "pcs",
            currentStock: 0,
            dipAndDashStock: 0,
            gamingStock: 0,
            minStock: 0,
            purchaseUnitPrice: row.unitPrice,
            sellingPrice: 0,
            targetSection: "gaming",
            defaultSupplierId: suppliersByKey.get(normalizeLookupKey(row.supplierName))?.id ?? null,
            isActive: true
          });
          product = await manager.save(Product, created);
          productByExactName.set(normalizeLookupKey(product.name), product);
          productByFuzzyName.set(resolveProductMatchKey(product.name, product.packSize), product);
          productByFuzzyName.set(resolveProductMatchKey(product.name), product);
          createdProducts += 1;
        } else {
          let changed = false;
          if (!product.packSize && row.packSize) {
            product.packSize = row.packSize;
            changed = true;
          }
          if (!product.defaultSupplierId) {
            product.defaultSupplierId = suppliersByKey.get(normalizeLookupKey(row.supplierName))?.id ?? null;
            changed = true;
          }
          if (changed) {
            product = await manager.save(Product, product);
          }
        }

        const groupKey = [normalizeLookupKey(row.supplierName), row.purchaseDate, normalizeLookupKey(row.vendorInvoiceNumber ?? "")].join("|");
        const groupRows = validRowsByGroup.get(groupKey) ?? [];
        groupRows.push({ ...row, itemName: product.name });
        validRowsByGroup.set(groupKey, groupRows);
      }

      const createdOrders: Array<{ id: string; purchaseNumber: string; purchaseDate: string; supplierName: string; lineCount: number; totalAmount: number }> = [];
      for (const groupRows of validRowsByGroup.values()) {
        const firstRow = groupRows[0];
        const supplier = suppliersByKey.get(normalizeLookupKey(firstRow.supplierName));
        if (!supplier) {
          continue;
        }
        const lines: PurchaseOrderLinePayload[] = groupRows.map((row) => {
          const product = productByExactName.get(normalizeLookupKey(row.itemName));
          return {
            lineType: "product",
            productId: product?.id,
            productName: row.itemName,
            productCategory: "Snooker Beverages",
            productPackSize: row.packSize,
            productUnit: "pcs",
            quantity: row.quantity,
            quantityUnit: row.quantityUnit ?? "pcs",
            unitPrice: row.unitPrice,
            gstPercentage: row.gstPercentage,
            gstValue: row.gstAmount ?? 0,
            sourceAmount: row.amount,
            sourceGrandTotal: row.grandTotal,
            sourceRowNumber: row.rowNumber,
            expiryDate: row.expiryDate,
            note: row.lineNote || `Imported row ${row.rowNumber}${row.packSize ? `, pack ${row.packSize}` : ""}`
          };
        });
        const createdOrder = await this.createPurchaseOrder(
          {
            supplierId: supplier.id,
            purchaseDate: firstRow.purchaseDate,
            purchaseSection: "gaming",
            vendorInvoiceNumber: firstRow.vendorInvoiceNumber || undefined,
            projectName: firstRow.projectName || undefined,
            purchaseMonth: firstRow.month || undefined,
            receivedDate: firstRow.receivedDate || undefined,
            note: this.buildPurchaseOrderNote(firstRow),
            lines
          },
          createdByUserId,
          manager
        );
        createdOrders.push({
          id: createdOrder.id,
          purchaseNumber: createdOrder.purchaseNumber,
          purchaseDate: createdOrder.purchaseDate,
          supplierName: createdOrder.supplierName,
          lineCount: createdOrder.lines.length,
          totalAmount: createdOrder.totalAmount
        });
        groupRows.forEach((row) =>
          details.push({
            rowNumber: row.rowNumber,
            status: "inserted",
            supplierName: row.supplierName,
            itemName: row.itemName,
            packSize: row.packSize ?? null,
            purchaseDate: row.purchaseDate,
            vendorInvoiceNumber: row.vendorInvoiceNumber || null,
            quantity: row.quantity,
            quantityUnit: row.quantityUnit ?? "pcs",
            unitPrice: row.unitPrice,
            amount: row.amount ?? null,
            gstAmount: row.gstAmount ?? 0,
            grandTotal: row.grandTotal ?? row.quantity * row.unitPrice,
            purchaseNumber: createdOrder.purchaseNumber,
            reason: `Inserted in ${createdOrder.purchaseNumber}.`
          })
        );
      }

      const importSummary = {
        totalRows: parsed.totalRows,
        parsedRows: parsed.rows.length,
        insertedRows: details.filter((entry) => entry.status === "inserted").length,
        skippedDuplicateRows,
        failedRows: parsed.invalidRows,
        createdProducts,
        matchedProducts,
        createdOrders,
        invalidRowDetails: parsed.invalidRowDetails,
        rowDetails: details.sort((left, right) => left.rowNumber - right.rowNumber)
      };

      const savedHistory = await manager.save(
        PurchaseBulkImport,
        manager.create(PurchaseBulkImport, {
          fileName: originalName?.trim() || "purchase-upload",
          purchaseSection: "gaming",
          createdByUserId,
          summary: importSummary
        })
      );

      return {
        ...importSummary,
        importId: savedHistory.id,
        fileName: savedHistory.fileName,
        importedAt: savedHistory.createdAt.toISOString()
      };
    });

    const firstOrder = result.createdOrders[0];
    return {
      ...result,
      purchaseOrderId: firstOrder?.id ?? "",
      purchaseNumber: firstOrder?.purchaseNumber ?? "",
      purchaseDate: firstOrder?.purchaseDate ?? parsed.purchaseDate,
      supplierName: firstOrder?.supplierName ?? parsed.supplierName,
      lineCount: result.insertedRows,
      ingredientLineCount: 0,
      productLineCount: result.insertedRows,
      totalAmount: toFixedPrice(result.createdOrders.reduce((sum, order) => sum + order.totalAmount, 0))
    };
  }

  async listPurchaseBulkImportHistory(filters: PurchaseBulkImportHistoryFilters) {
    const page = Math.max(1, filters.page);
    const limit = Math.min(Math.max(1, filters.limit), 100);
    const query = this.purchaseBulkImportRepository
      .createQueryBuilder("bulkImport")
      .orderBy("bulkImport.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.purchaseSection) {
      query.andWhere("bulkImport.purchaseSection = :purchaseSection", {
        purchaseSection: filters.purchaseSection
      });
    }

    const [imports, total] = await query.getManyAndCount();
    return {
      imports: imports.map((entry) => ({
        id: entry.id,
        fileName: entry.fileName,
        purchaseSection: entry.purchaseSection,
        createdByUserId: entry.createdByUserId,
        createdAt: entry.createdAt.toISOString(),
        ...(entry.summary as Record<string, unknown>)
      })),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  private getPurchaseBulkCreatedOrderIds(summary: Record<string, unknown>) {
    const orderIds = new Set<string>();
    const createdOrders = Array.isArray(summary.createdOrders) ? summary.createdOrders : [];

    for (const order of createdOrders) {
      if (order && typeof order === "object" && "id" in order && typeof order.id === "string") {
        orderIds.add(order.id);
      }
    }

    if (typeof summary.purchaseOrderId === "string" && summary.purchaseOrderId.trim()) {
      orderIds.add(summary.purchaseOrderId);
    }

    return Array.from(orderIds);
  }

  async deletePurchaseBulkImport(id: string) {
    return AppDataSource.transaction(async (manager) => {
      const bulkImport = await manager.findOne(PurchaseBulkImport, { where: { id } });
      if (!bulkImport) {
        throw new AppError(404, "Purchase bulk upload history not found");
      }

      const summary = bulkImport.summary as Record<string, unknown>;
      const orderIds = this.getPurchaseBulkCreatedOrderIds(summary);
      const deletedOrders: Array<{ id: string; purchaseNumber: string; purchaseDate: string }> = [];
      let missingOrders = 0;

      for (const orderId of orderIds) {
        const deletedOrder = await this.deletePurchaseOrderWithManager(manager, orderId, { allowMissing: true });
        if (!deletedOrder) {
          missingOrders += 1;
          continue;
        }
        deletedOrders.push(deletedOrder);
      }

      await manager.delete(PurchaseBulkImport, { id: bulkImport.id });

      return {
        id: bulkImport.id,
        fileName: bulkImport.fileName,
        deletedOrders,
        deletedOrderCount: deletedOrders.length,
        missingOrderCount: missingOrders,
        stockRolledBack: true
      };
    });
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

    if (filters.section) {
      query.andWhere("supplier.section = :section", { section: filters.section });
    }

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
          .andWhere(filters.section ? "purchaseOrder.purchaseSection = :section" : "1=1", {
            section: filters.section
          })
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
        .where(filters.section ? "purchaseOrder.purchaseSection = :section" : "1=1", {
          section: filters.section
        })
        .getRawOne<{ count: string; amount: string }>(),
      this.supplierRepository
        .createQueryBuilder("supplier")
        .select("supplier.isActive", "isActive")
        .addSelect("COUNT(*)", "count")
        .where(filters.section ? "supplier.section = :section" : "1=1", { section: filters.section })
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
    const section = this.resolvePurchaseSection(payload.section);
    await this.ensureSupplierNameUnique(name, section);

    const supplier = this.supplierRepository.create({
      name,
      storeName: payload.storeName ? normalizeText(payload.storeName) : null,
      phone: normalizeText(payload.phone),
      address: payload.address ? normalizeText(payload.address) : null,
      section,
      isActive: payload.isActive ?? true
    });

    const saved = await this.supplierRepository.save(supplier);
    return this.mapSupplierSummary(saved);
  }

  async updateSupplier(id: string, payload: UpdateSupplierPayload) {
    const supplier = await this.getSupplierOrFail(id);
    const nextSection =
      payload.section !== undefined ? this.resolvePurchaseSection(payload.section) : supplier.section;
    const nextName = payload.name ? normalizeText(payload.name) : supplier.name;

    if (payload.name !== undefined || payload.section !== undefined) {
      await this.ensureSupplierNameUnique(nextName, nextSection, id);
      supplier.name = nextName;
      supplier.section = nextSection;
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
            .andWhere(
              filters.targetSection && filters.targetSection !== "both"
                ? "purchaseOrder.purchaseSection = :purchaseSection"
                : "1=1",
              {
                purchaseSection: filters.targetSection === "gaming" ? "gaming" : "dip_and_dash"
              }
            )
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
            .andWhere("CAST(line.\"referenceId\" AS text) IN (:...productIds)", { productIds })
            .andWhere("(invoice.status = :status OR line.meta ->> 'source' = :productConsumptionSource)", {
              status: "paid",
              productConsumptionSource: PRODUCT_CONSUMPTION_SOURCE
            })
            .andWhere(
              filters.targetSection === "gaming"
                ? "invoice.orderType = :snookerOrderType"
                : filters.targetSection === "dip_and_dash"
                  ? "invoice.orderType != :snookerOrderType"
                  : "1=1",
              { snookerOrderType: "snooker" }
            )
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
        .where(filters.targetSection ? "product.targetSection = :targetSection" : "1=1", {
          targetSection: filters.targetSection
        })
        .groupBy("product.isActive")
        .getRawMany<{ isActive: boolean; count: string }>(),
      this.productRepository
        .createQueryBuilder("product")
        .select("COALESCE(SUM(product.currentStock * product.purchaseUnitPrice), 0)", "valuation")
        .addSelect("COUNT(*) FILTER (WHERE product.currentStock <= product.minStock)", "lowStock")
        .where(filters.targetSection ? "product.targetSection = :targetSection" : "1=1", {
          targetSection: filters.targetSection
        })
        .getRawOne<{ valuation: string; lowStock: string }>(),
      this.purchaseOrderLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.product", "product")
        .select("line.productId", "productId")
        .addSelect("product.name", "name")
        .addSelect("product.unit", "unit")
        .addSelect("COALESCE(SUM(line.stockAdded), 0)", "qty")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere(filters.targetSection ? "product.targetSection = :targetSection" : "1=1", {
          targetSection: filters.targetSection
        })
        .groupBy("line.productId")
        .addGroupBy("product.name")
        .addGroupBy("product.unit")
        .orderBy("COALESCE(SUM(line.stockAdded), 0)", "DESC")
        .limit(5)
        .getRawMany<{ productId: string; name: string; unit: string; qty: string }>(),
      this.invoiceLineRepository
        .createQueryBuilder("line")
        .leftJoin(Product, "product", "CAST(product.id AS text) = CAST(line.\"referenceId\" AS text)")
        .leftJoin("line.invoice", "invoice")
        .select("line.\"referenceId\"", "productId")
        .addSelect("COALESCE(product.name, MAX(line.\"nameSnapshot\"))", "name")
        .addSelect("COALESCE(product.unit, 'unit')", "unit")
        .addSelect("COALESCE(SUM(line.quantity), 0)", "qty")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere("(invoice.status = :status OR line.meta ->> 'source' = :productConsumptionSource)", {
          status: "paid",
          productConsumptionSource: PRODUCT_CONSUMPTION_SOURCE
        })
        .andWhere(filters.targetSection ? "product.targetSection = :targetSection" : "1=1", {
          targetSection: filters.targetSection
        })
        .andWhere(
          filters.targetSection === "gaming"
            ? "invoice.orderType = :snookerOrderType"
            : filters.targetSection === "dip_and_dash"
              ? "invoice.orderType != :snookerOrderType"
              : "1=1",
          { snookerOrderType: "snooker" }
        )
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

  async getProduct(id: string) {
    const product = await this.getProductOrFail(id);

    const [purchaseMetricsRow, expiryMetricsRow, salesMetricsRow] = await Promise.all([
      this.purchaseOrderLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.purchaseOrder", "purchaseOrder")
        .select("COUNT(DISTINCT line.purchaseOrderId)", "ordersCount")
        .addSelect("COALESCE(SUM(line.stockAdded), 0)", "qty")
        .addSelect("COALESCE(SUM(line.lineTotal), 0)", "amount")
        .addSelect("MAX(purchaseOrder.purchaseDate)", "recentPurchaseDate")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere("line.productId = :productId", { productId: id })
        .getRawOne<{ ordersCount: string; qty: string; amount: string; recentPurchaseDate: string | null }>(),
      this.purchaseOrderLineRepository
        .createQueryBuilder("line")
        .select("MIN(CASE WHEN line.expiryDate >= CURRENT_DATE THEN line.expiryDate END)", "nextExpiryDate")
        .addSelect("MAX(line.expiryDate)", "latestExpiryDate")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere("line.productId = :productId", { productId: id })
        .andWhere("line.expiryDate IS NOT NULL")
        .getRawOne<{ nextExpiryDate: string | null; latestExpiryDate: string | null }>(),
      this.invoiceLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.invoice", "invoice")
        .select("COALESCE(SUM(line.quantity), 0)", "soldQty")
        .addSelect("COALESCE(SUM(line.lineTotal), 0)", "soldAmount")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere("CAST(line.\"referenceId\" AS text) = :productId", { productId: id })
        .andWhere("(invoice.status = :status OR line.meta ->> 'source' = :productConsumptionSource)", {
          status: "paid",
          productConsumptionSource: PRODUCT_CONSUMPTION_SOURCE
        })
        .getRawOne<{ soldQty: string; soldAmount: string }>()
    ]);

    return this.mapProductSummary(product, {
      purchasedQuantity: toNumber(purchaseMetricsRow?.qty ?? 0),
      purchaseOrdersCount: Number(purchaseMetricsRow?.ordersCount ?? 0),
      totalPurchasedAmount: toNumber(purchaseMetricsRow?.amount ?? 0),
      recentPurchaseDate: purchaseMetricsRow?.recentPurchaseDate ?? null,
      soldQuantity: toNumber(salesMetricsRow?.soldQty ?? 0),
      soldAmount: toNumber(salesMetricsRow?.soldAmount ?? 0),
      nextExpiryDate: expiryMetricsRow?.nextExpiryDate ?? null,
      latestExpiryDate: expiryMetricsRow?.latestExpiryDate ?? null
    });
  }

  async getProductStockHistory(productId: string, filters: ProductStockHistoryFilters) {
    const product = await this.getProductOrFail(productId);
    const dateFrom = filters.dateFrom?.trim() || undefined;
    const dateTo = filters.dateTo?.trim() || undefined;
    if (dateFrom) {
      resolveDayRangeInUtc(dateFrom);
    }
    if (dateTo) {
      resolveDayRangeInUtc(dateTo);
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new AppError(422, "Date to must be on or after date from.");
    }

    const purchasePage = Math.max(1, filters.purchasePage || 1);
    const purchaseLimit = Math.min(200, Math.max(1, filters.purchaseLimit || 10));
    const purchaseOffset = (purchasePage - 1) * purchaseLimit;
    const consumptionPage = Math.max(1, filters.consumptionPage || 1);
    const consumptionLimit = Math.min(200, Math.max(1, filters.consumptionLimit || 10));
    const consumptionOffset = (consumptionPage - 1) * consumptionLimit;

    const purchaseBaseQuery = this.purchaseOrderLineRepository
      .createQueryBuilder("line")
      .leftJoin("line.purchaseOrder", "purchaseOrder")
      .leftJoin("purchaseOrder.supplier", "supplier")
      .where("line.lineType = :lineType", { lineType: "product" })
      .andWhere("line.productId = :productId", { productId })
      .andWhere(dateFrom ? "purchaseOrder.purchaseDate >= :dateFrom" : "1=1", { dateFrom })
      .andWhere(dateTo ? "purchaseOrder.purchaseDate <= :dateTo" : "1=1", { dateTo });

    const consumptionBaseQuery = this.invoiceLineRepository
      .createQueryBuilder("line")
      .leftJoin("line.invoice", "invoice")
      .leftJoin("invoice.customer", "customer")
      .where("line.lineType = :lineType", { lineType: "product" })
      .andWhere("CAST(line.\"referenceId\" AS text) = :productId", { productId })
      .andWhere("(invoice.status = :status OR line.meta ->> 'source' = :productConsumptionSource)", {
        status: "paid",
        productConsumptionSource: PRODUCT_CONSUMPTION_SOURCE
      })
      .andWhere(dateFrom ? "CAST(timezone('Asia/Kolkata', invoice.\"createdAt\") AS date) >= :dateFrom" : "1=1", { dateFrom })
      .andWhere(dateTo ? "CAST(timezone('Asia/Kolkata', invoice.\"createdAt\") AS date) <= :dateTo" : "1=1", { dateTo });

    const [
      purchaseTotal,
      consumptionTotal,
      purchaseTotalQuantityRow,
      consumptionTotalQuantityRow,
      purchaseRows,
      consumptionRows
    ] = await Promise.all([
      purchaseBaseQuery.clone().getCount(),
      consumptionBaseQuery.clone().getCount(),
      purchaseBaseQuery
        .clone()
        .select("COALESCE(SUM(line.stockAdded), 0)", "quantity")
        .getRawOne<{ quantity: string }>(),
      consumptionBaseQuery
        .clone()
        .select("COALESCE(SUM(line.quantity), 0)", "quantity")
        .getRawOne<{ quantity: string }>(),
      purchaseBaseQuery
        .clone()
        .select("line.id", "id")
        .addSelect("to_char(purchaseOrder.purchaseDate, 'YYYY-MM-DD')", "purchaseDate")
        .addSelect("purchaseOrder.id", "purchaseOrderId")
        .addSelect("purchaseOrder.purchaseNumber", "purchaseNumber")
        .addSelect("purchaseOrder.purchaseSection", "purchaseSection")
        .addSelect("supplier.name", "supplierName")
        .addSelect("supplier.\"storeName\"", "storeName")
        .addSelect("line.stockAdded", "stockAdded")
        .addSelect("line.enteredQuantity", "enteredQuantity")
        .addSelect("line.unit", "unit")
        .addSelect("line.enteredUnit", "enteredUnit")
        .addSelect("line.unitPrice", "unitPrice")
        .addSelect("line.gstValue", "gstValue")
        .addSelect("line.lineTotal", "lineTotal")
        .addSelect("line.expiryDate", "expiryDate")
        .addSelect("line.createdAt", "createdAt")
        .orderBy("purchaseOrder.purchaseDate", "DESC")
        .addOrderBy("line.createdAt", "DESC")
        .skip(purchaseOffset)
        .take(purchaseLimit)
        .getRawMany<{
          id: string;
          purchaseDate: string;
          purchaseOrderId: string;
          purchaseNumber: string;
          purchaseSection: PurchaseSection;
          supplierName: string;
          storeName: string | null;
          stockAdded: string;
          enteredQuantity: string | null;
          unit: string;
          enteredUnit: string | null;
          unitPrice: string;
          gstValue: string;
          lineTotal: string;
          expiryDate: string | null;
          createdAt: string;
        }>(),
      consumptionBaseQuery
        .clone()
        .select("line.id", "id")
        .addSelect("to_char(timezone('Asia/Kolkata', invoice.\"createdAt\"), 'YYYY-MM-DD')", "consumptionDate")
        .addSelect("invoice.id", "invoiceId")
        .addSelect("invoice.\"invoiceNumber\"", "invoiceNumber")
        .addSelect("invoice.\"orderType\"", "orderType")
        .addSelect(
          `COALESCE(customer.name, invoice."customerSnapshot"->>'name', invoice."customerSnapshot"->>'customerName', 'Walk-in')`,
          "customerName"
        )
        .addSelect(
          `COALESCE(customer.phone, invoice."customerSnapshot"->>'phone', invoice."customerSnapshot"->>'customerPhone', '-')`,
          "customerPhone"
        )
        .addSelect("line.quantity", "quantity")
        .addSelect("line.unitPrice", "unitPrice")
        .addSelect("line.lineTotal", "lineTotal")
        .addSelect("line.createdAt", "createdAt")
        .orderBy("invoice.createdAt", "DESC")
        .addOrderBy("line.createdAt", "DESC")
        .skip(consumptionOffset)
        .take(consumptionLimit)
        .getRawMany<{
          id: string;
          consumptionDate: string;
          invoiceId: string;
          invoiceNumber: string;
          orderType: string;
          customerName: string;
          customerPhone: string;
          quantity: string;
          unitPrice: string;
          lineTotal: string;
          createdAt: string;
        }>()
    ]);

    return {
      product: {
        id: product.id,
        name: product.name,
        category: product.category,
        sku: product.sku,
        unit: product.unit,
        targetSection: product.targetSection,
        currentStock: toFixedQuantity(toNumber(product.currentStock))
      },
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      summary: {
        totalPurchasedQuantity: toFixedQuantity(toNumber(purchaseTotalQuantityRow?.quantity ?? 0)),
        totalConsumptionQuantity: toFixedQuantity(toNumber(consumptionTotalQuantityRow?.quantity ?? 0)),
        currentStock: toFixedQuantity(toNumber(product.currentStock)),
        purchaseEntries: purchaseTotal,
        consumptionEntries: consumptionTotal
      },
      purchases: {
        rows: purchaseRows.map((row) => ({
          id: row.id,
          purchaseDate: toYmd(row.purchaseDate),
          purchaseOrderId: row.purchaseOrderId,
          purchaseNumber: row.purchaseNumber,
          purchaseSection: row.purchaseSection,
          supplierName: row.supplierName,
          storeName: row.storeName,
          quantity: toFixedQuantity(toNumber(row.enteredQuantity ?? row.stockAdded)),
          quantityUnit: row.enteredUnit || row.unit,
          baseQuantity: toFixedQuantity(toNumber(row.stockAdded)),
          baseUnit: row.unit,
          unitPrice: toFixedPrice(toNumber(row.unitPrice)),
          gstValue: toFixedPrice(toNumber(row.gstValue)),
          lineTotal: toFixedPrice(toNumber(row.lineTotal)),
          expiryDate: row.expiryDate,
          createdAt: row.createdAt
        })),
        pagination: getPaginationMeta(purchasePage, purchaseLimit, purchaseTotal)
      },
      consumptions: {
        rows: consumptionRows.map((row) => ({
          id: row.id,
          consumptionDate: toYmd(row.consumptionDate),
          invoiceId: row.invoiceId,
          invoiceNumber: row.invoiceNumber,
          orderType: row.orderType,
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          quantity: toFixedQuantity(toNumber(row.quantity)),
          unit: product.unit,
          unitPrice: toFixedPrice(toNumber(row.unitPrice)),
          lineTotal: toFixedPrice(toNumber(row.lineTotal)),
          createdAt: row.createdAt
        })),
        pagination: getPaginationMeta(consumptionPage, consumptionLimit, consumptionTotal)
      }
    };
  }

  private async getProductLedgerOpeningBeforeDate(productId: string, date: string) {
    const [purchaseBeforeRow, salesBeforeRow, adjustmentBeforeRow] = await Promise.all([
      this.purchaseOrderLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.purchaseOrder", "purchaseOrder")
        .select("COALESCE(SUM(line.stockAdded), 0)", "quantity")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere("line.productId = :productId", { productId })
        .andWhere("purchaseOrder.purchaseDate < :date", { date })
        .getRawOne<{ quantity: string }>(),
      this.invoiceLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.invoice", "invoice")
        .select("COALESCE(SUM(line.quantity), 0)", "quantity")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere("CAST(line.\"referenceId\" AS text) = :productId", { productId })
        .andWhere("(invoice.status = :status OR line.meta ->> 'source' = :productConsumptionSource)", {
          status: "paid",
          productConsumptionSource: PRODUCT_CONSUMPTION_SOURCE
        })
        .andWhere("CAST(timezone('Asia/Kolkata', invoice.\"createdAt\") AS date) < :date", { date })
        .getRawOne<{ quantity: string }>(),
      this.productDayLedgerAdjustmentRepository
        .createQueryBuilder("adjustment")
        .select(
          `COALESCE(SUM(adjustment."openingDelta" + adjustment."purchasedDelta" - adjustment."consumptionDelta"), 0)`,
          "quantity"
        )
        .where("adjustment.productId = :productId", { productId })
        .andWhere("adjustment.date < :date", { date })
        .getRawOne<{ quantity: string }>()
    ]);

    return toFixedQuantity(
      toNumber(purchaseBeforeRow?.quantity) -
        toNumber(salesBeforeRow?.quantity) +
        toNumber(adjustmentBeforeRow?.quantity)
    );
  }

  private async getProductLedgerRowSnapshot(productId: string, date: string) {
    const snapshot = await this.getProductDayLedger({
      productId,
      dateFrom: date,
      dateTo: date,
      page: 1,
      limit: 200
    });
    return snapshot.rows.find((row) => row.productId === productId && row.date === date) ?? null;
  }

  async upsertProductDayLedgerAdjustment(sourceProductId: string, sourceDate: string, payload: UpsertProductDayLedgerPayload) {
    resolveDayRangeInUtc(sourceDate);
    const targetProductId = payload.productId?.trim() || sourceProductId;
    const targetDate = payload.date?.trim() || sourceDate;
    resolveDayRangeInUtc(targetDate);

    const sourceProduct = await this.getProductOrFail(sourceProductId);
    const targetProduct = targetProductId === sourceProductId ? sourceProduct : await this.getProductOrFail(targetProductId);
    const isSameLedgerKey = sourceProductId === targetProductId && sourceDate === targetDate;

    const targetOpeningStock = toFixedQuantity(toNumber(payload.openingStock));
    const targetPurchased = toFixedQuantity(toNumber(payload.purchased));
    const targetConsumption = toFixedQuantity(toNumber(payload.consumption));
    const targetDipAndDashConsumption = toFixedQuantity(toNumber(payload.dipAndDashConsumption));
    const targetSnookerConsumption = toFixedQuantity(toNumber(payload.snookerConsumption));
    const note = payload.note?.trim() ? payload.note.trim() : null;

    if (targetPurchased < 0 || targetConsumption < 0 || targetDipAndDashConsumption < 0 || targetSnookerConsumption < 0) {
      throw new AppError(422, "Purchased and consumption values cannot be negative.");
    }
    if (Math.abs(targetConsumption - (targetDipAndDashConsumption + targetSnookerConsumption)) > 0.001) {
      throw new AppError(422, "Consumption must equal Dip Used + Snooker Used.");
    }
    const targetClosingStock = toFixedQuantity(targetOpeningStock + targetPurchased - targetConsumption);
    if (payload.stockHealth === "HEALTHY" && targetClosingStock <= 0) {
      throw new AppError(422, "Cannot mark health as Healthy when closing stock is zero or below.");
    }

    const sourceAdjustmentRows = await this.productDayLedgerAdjustmentRepository.find({
      where: { productId: sourceProductId, date: sourceDate },
      order: { updatedAt: "DESC", createdAt: "DESC" }
    });
    const sourceAdjustment = sourceAdjustmentRows[0] ?? null;
    const sourceAdjustmentTotals = sumProductLedgerAdjustments(sourceAdjustmentRows);
    const staleSourceAdjustmentIds = sourceAdjustmentRows.slice(1).map((row) => row.id);
    if (staleSourceAdjustmentIds.length) {
      await this.productDayLedgerAdjustmentRepository.delete(staleSourceAdjustmentIds);
    }

    const targetAdjustmentRows = isSameLedgerKey
      ? sourceAdjustmentRows
      : await this.productDayLedgerAdjustmentRepository.find({
          where: { productId: targetProductId, date: targetDate },
          order: { updatedAt: "DESC", createdAt: "DESC" }
        });
    const targetExistingAdjustment = isSameLedgerKey ? sourceAdjustment : targetAdjustmentRows[0] ?? null;
    const targetAdjustmentTotals = isSameLedgerKey
      ? sourceAdjustmentTotals
      : sumProductLedgerAdjustments(targetAdjustmentRows);
    const staleTargetAdjustmentIds = !isSameLedgerKey ? targetAdjustmentRows.slice(1).map((row) => row.id) : [];
    if (staleTargetAdjustmentIds.length) {
      await this.productDayLedgerAdjustmentRepository.delete(staleTargetAdjustmentIds);
    }

    const sourceNetBefore = getProductLedgerAdjustmentNet(sourceAdjustmentTotals);
    const targetNetBefore = isSameLedgerKey
      ? sourceNetBefore
      : getProductLedgerAdjustmentNet(targetAdjustmentTotals);

    if (!isSameLedgerKey) {
      await this.productDayLedgerAdjustmentRepository.delete({
        productId: sourceProductId,
        date: sourceDate
      });
      const sourceAdjustmentForMove = this.productDayLedgerAdjustmentRepository.create({
        productId: sourceProductId,
        date: sourceDate
      });
      sourceAdjustmentForMove.productId = sourceProductId;
      sourceAdjustmentForMove.date = sourceDate;
      sourceAdjustmentForMove.openingDelta = 0;
      sourceAdjustmentForMove.purchasedDelta = 0;
      sourceAdjustmentForMove.consumptionDelta = 0;
      sourceAdjustmentForMove.dipAndDashConsumptionDelta = 0;
      sourceAdjustmentForMove.snookerConsumptionDelta = 0;
      sourceAdjustmentForMove.note = `${LEDGER_MOVE_SUPPRESS_PREFIX}${targetDate}::${targetProductId}`;
      await this.productDayLedgerAdjustmentRepository.save(sourceAdjustmentForMove);
    }

    const currentAdjustment = isSameLedgerKey ? sourceAdjustment : targetExistingAdjustment;
    const [currentRow, openingBefore] = await Promise.all([
      this.getProductLedgerRowSnapshot(targetProductId, targetDate),
      this.getProductLedgerOpeningBeforeDate(targetProductId, targetDate)
    ]);

    const currentOpeningStock = toFixedQuantity(currentRow?.openingStock ?? openingBefore);
    const currentPurchased = toFixedQuantity(currentRow?.purchased ?? 0);
    const currentConsumption = toFixedQuantity(currentRow?.consumption ?? 0);
    const currentDipAndDashConsumption = toFixedQuantity(currentRow?.dipAndDashConsumption ?? 0);
    const currentSnookerConsumption = toFixedQuantity(currentRow?.snookerConsumption ?? 0);

    const targetBaseDeltas = isSameLedgerKey ? sourceAdjustmentTotals : targetAdjustmentTotals;
    const baseOpeningDelta = toFixedQuantity(toNumber(targetBaseDeltas.openingDelta));
    const basePurchasedDelta = toFixedQuantity(toNumber(targetBaseDeltas.purchasedDelta));
    const baseConsumptionDelta = toFixedQuantity(toNumber(targetBaseDeltas.consumptionDelta));
    const baseDipDelta = toFixedQuantity(toNumber(targetBaseDeltas.dipAndDashConsumptionDelta));
    const baseSnookerDelta = toFixedQuantity(toNumber(targetBaseDeltas.snookerConsumptionDelta));

    const nextOpeningDelta = toFixedQuantity(baseOpeningDelta + (targetOpeningStock - currentOpeningStock));
    const nextPurchasedDelta = toFixedQuantity(basePurchasedDelta + (targetPurchased - currentPurchased));
    const nextConsumptionDelta = toFixedQuantity(baseConsumptionDelta + (targetConsumption - currentConsumption));
    const nextDipDelta = toFixedQuantity(baseDipDelta + (targetDipAndDashConsumption - currentDipAndDashConsumption));
    const nextSnookerDelta = toFixedQuantity(baseSnookerDelta + (targetSnookerConsumption - currentSnookerConsumption));

    const hasMeaningfulDelta =
      Math.abs(nextOpeningDelta) > 0.0005 ||
      Math.abs(nextPurchasedDelta) > 0.0005 ||
      Math.abs(nextConsumptionDelta) > 0.0005 ||
      Math.abs(nextDipDelta) > 0.0005 ||
      Math.abs(nextSnookerDelta) > 0.0005;

    let targetNetAfter = 0;
    if (!hasMeaningfulDelta && !note) {
      await this.productDayLedgerAdjustmentRepository.delete({
        productId: targetProductId,
        date: targetDate
      });
    } else {
      const entity =
        currentAdjustment ??
        this.productDayLedgerAdjustmentRepository.create({
          productId: targetProductId,
          date: targetDate
        });

      entity.productId = targetProductId;
      entity.date = targetDate;
      entity.openingDelta = nextOpeningDelta;
      entity.purchasedDelta = nextPurchasedDelta;
      entity.consumptionDelta = nextConsumptionDelta;
      entity.dipAndDashConsumptionDelta = nextDipDelta;
      entity.snookerConsumptionDelta = nextSnookerDelta;
      entity.note = note;
      await this.productDayLedgerAdjustmentRepository.save(entity);
      targetNetAfter = getProductLedgerAdjustmentNet({
        openingDelta: nextOpeningDelta,
        purchasedDelta: nextPurchasedDelta,
        consumptionDelta: nextConsumptionDelta
      });
    }

    if (payload.targetSection && payload.targetSection !== targetProduct.targetSection) {
      targetProduct.targetSection = payload.targetSection;
      const normalized = normalizeProductSectionStocks({
        targetSection: payload.targetSection,
        currentStock: toNumber(targetProduct.currentStock),
        dipAndDashStock: toNumber(targetProduct.dipAndDashStock),
        gamingStock: toNumber(targetProduct.gamingStock)
      });
      targetProduct.currentStock = normalized.currentStock;
      targetProduct.dipAndDashStock = normalized.dipAndDashStock;
      targetProduct.gamingStock = normalized.gamingStock;
    }

    if (payload.stockHealth) {
      if (payload.stockHealth === "LOW_STOCK") {
        targetProduct.minStock = toFixedQuantity(Math.max(toNumber(targetProduct.minStock), Math.max(targetClosingStock, 0)));
      } else {
        targetProduct.minStock = toFixedQuantity(Math.max(0, targetClosingStock - 0.001));
      }
    }

    if (isSameLedgerKey) {
      const netDelta = toFixedQuantity(targetNetAfter - sourceNetBefore);
      applyProductLedgerNetDelta(targetProduct, netDelta);
    } else {
      applyProductLedgerNetDelta(sourceProduct, toFixedQuantity(-sourceNetBefore));
      applyProductLedgerNetDelta(targetProduct, toFixedQuantity(targetNetAfter - targetNetBefore));
    }

    if (targetProduct.id === sourceProduct.id) {
      await this.productRepository.save(targetProduct);
    } else {
      await this.productRepository.save([sourceProduct, targetProduct]);
    }

    const refreshedRow = await this.getProductLedgerRowSnapshot(targetProductId, targetDate);
    if (!refreshedRow) {
      throw new AppError(500, "Unable to load refreshed product ledger row.");
    }
    return refreshedRow;
  }

  async deleteProductDayLedgerAdjustment(productId: string, date: string) {
    resolveDayRangeInUtc(date);
    const existingRows = await this.productDayLedgerAdjustmentRepository.find({
      where: { productId, date }
    });
    if (!existingRows.length) {
      return {
        productId,
        date,
        deleted: false
      };
    }

    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) {
      await this.productDayLedgerAdjustmentRepository.delete({ productId, date });
      return {
        productId,
        date,
        deleted: true
      };
    }

    const totals = sumProductLedgerAdjustments(existingRows);
    const netBeforeDelete = getProductLedgerAdjustmentNet(totals);

    await this.productDayLedgerAdjustmentRepository.delete({ productId, date });
    applyProductLedgerNetDelta(product, toFixedQuantity(-netBeforeDelete));
    await this.productRepository.save(product);

    return {
      productId,
      date,
      deleted: true
    };
  }

  async removeProductDayLedgerRow(productId: string, date: string) {
    resolveDayRangeInUtc(date);
    const row = await this.getProductLedgerRowSnapshot(productId, date);
    if (!row) {
      return {
        productId,
        date,
        deleted: false
      };
    }

    const product = await this.getProductOrFail(productId);
    const existingRows = await this.productDayLedgerAdjustmentRepository.find({
      where: { productId, date }
    });
    const totals = sumProductLedgerAdjustments(existingRows);
    const netBeforeDelete = getProductLedgerAdjustmentNet(totals);

    await this.productDayLedgerAdjustmentRepository.delete({ productId, date });
    await this.productDayLedgerAdjustmentRepository.save(
      this.productDayLedgerAdjustmentRepository.create({
        productId,
        date,
        openingDelta: 0,
        purchasedDelta: 0,
        consumptionDelta: 0,
        dipAndDashConsumptionDelta: 0,
        snookerConsumptionDelta: 0,
        note: `${LEDGER_ROW_DELETE_SUPPRESS_PREFIX}${new Date().toISOString()}`
      })
    );

    if (Math.abs(netBeforeDelete) > 0.0005) {
      applyProductLedgerNetDelta(product, toFixedQuantity(-netBeforeDelete));
      await this.productRepository.save(product);
    }

    return {
      productId,
      date,
      deleted: true
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

    const [
      purchaseMovementRows,
      salesMovementRows,
      purchaseBeforeRows,
      salesBeforeRows,
      adjustmentRows,
      adjustmentBeforeRows
    ] = await Promise.all([
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
        .andWhere("CAST(line.\"referenceId\" AS text) IN (:...productIds)", { productIds })
        .andWhere("(invoice.status = :status OR line.meta ->> 'source' = :productConsumptionSource)", {
          status: "paid",
          productConsumptionSource: PRODUCT_CONSUMPTION_SOURCE
        })
        .andWhere(dateFrom ? "CAST(timezone('Asia/Kolkata', invoice.\"createdAt\") AS date) >= :dateFrom" : "1=1", { dateFrom })
        .andWhere(dateTo ? "CAST(timezone('Asia/Kolkata', invoice.\"createdAt\") AS date) <= :dateTo" : "1=1", { dateTo })
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
            .andWhere("CAST(line.\"referenceId\" AS text) IN (:...productIds)", { productIds })
            .andWhere("(invoice.status = :status OR line.meta ->> 'source' = :productConsumptionSource)", {
              status: "paid",
              productConsumptionSource: PRODUCT_CONSUMPTION_SOURCE
            })
            .andWhere("CAST(timezone('Asia/Kolkata', invoice.\"createdAt\") AS date) < :dateFrom", { dateFrom })
            .groupBy("line.\"referenceId\"")
            .getRawMany<{ productId: string; quantity: string }>()
        : Promise.resolve([] as Array<{ productId: string; quantity: string }>),
      this.productDayLedgerAdjustmentRepository
        .createQueryBuilder("adjustment")
        .select("adjustment.productId", "productId")
        .addSelect("to_char(adjustment.date, 'YYYY-MM-DD')", "date")
        .addSelect("adjustment.\"openingDelta\"", "openingDelta")
        .addSelect("adjustment.\"purchasedDelta\"", "purchasedDelta")
        .addSelect("adjustment.\"consumptionDelta\"", "consumptionDelta")
        .addSelect("adjustment.\"dipAndDashConsumptionDelta\"", "dipAndDashConsumptionDelta")
        .addSelect("adjustment.\"snookerConsumptionDelta\"", "snookerConsumptionDelta")
        .addSelect("adjustment.note", "note")
        .where("adjustment.productId IN (:...productIds)", { productIds })
        .andWhere(dateFrom ? "adjustment.date >= :dateFrom" : "1=1", { dateFrom })
        .andWhere(dateTo ? "adjustment.date <= :dateTo" : "1=1", { dateTo })
        .getRawMany<{
          productId: string;
          date: string;
          openingDelta: string;
          purchasedDelta: string;
          consumptionDelta: string;
          dipAndDashConsumptionDelta: string;
          snookerConsumptionDelta: string;
          note: string | null;
        }>(),
      dateFrom
        ? this.productDayLedgerAdjustmentRepository
            .createQueryBuilder("adjustment")
            .select("adjustment.productId", "productId")
            .addSelect(
              `COALESCE(SUM(adjustment."openingDelta" + adjustment."purchasedDelta" - adjustment."consumptionDelta"), 0)`,
              "quantity"
            )
            .where("adjustment.productId IN (:...productIds)", { productIds })
            .andWhere("adjustment.date < :dateFrom", { dateFrom })
            .groupBy("adjustment.productId")
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

    const adjustmentMap = new Map<
      string,
      {
        openingDelta: number;
        purchasedDelta: number;
        consumptionDelta: number;
        dipAndDashConsumptionDelta: number;
        snookerConsumptionDelta: number;
        note: string | null;
        isSuppressedByMove: boolean;
      }
    >();
    adjustmentRows.forEach((row) => {
      const date = toYmd(row.date);
      const key = `${date}::${row.productId}`;
      const existing = adjustmentMap.get(key) ?? {
        openingDelta: 0,
        purchasedDelta: 0,
        consumptionDelta: 0,
        dipAndDashConsumptionDelta: 0,
        snookerConsumptionDelta: 0,
        note: null as string | null,
        isSuppressedByMove: false
      };
      existing.openingDelta = toFixedQuantity(existing.openingDelta + toNumber(row.openingDelta));
      existing.purchasedDelta = toFixedQuantity(existing.purchasedDelta + toNumber(row.purchasedDelta));
      existing.consumptionDelta = toFixedQuantity(existing.consumptionDelta + toNumber(row.consumptionDelta));
      existing.dipAndDashConsumptionDelta = toFixedQuantity(
        existing.dipAndDashConsumptionDelta + toNumber(row.dipAndDashConsumptionDelta)
      );
      existing.snookerConsumptionDelta = toFixedQuantity(
        existing.snookerConsumptionDelta + toNumber(row.snookerConsumptionDelta)
      );
      existing.note = row.note ?? existing.note;
      existing.isSuppressedByMove = isLedgerSuppressionNote(existing.note);
      adjustmentMap.set(key, existing);
      getMovement(date, row.productId);
    });

    const purchaseBeforeMap = new Map(purchaseBeforeRows.map((row) => [row.productId, toFixedQuantity(toNumber(row.quantity))]));
    const salesBeforeMap = new Map(salesBeforeRows.map((row) => [row.productId, toFixedQuantity(toNumber(row.quantity))]));
    const adjustmentBeforeMap = new Map(
      adjustmentBeforeRows.map((row) => [row.productId, toFixedQuantity(toNumber(row.quantity))])
    );
    const runningStockByProduct = new Map(
      products.map((product) => [
        product.id,
        toFixedQuantity(
          (purchaseBeforeMap.get(product.id) ?? 0) -
            (salesBeforeMap.get(product.id) ?? 0) +
            (adjustmentBeforeMap.get(product.id) ?? 0)
        )
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
        const adjustment = adjustmentMap.get(`${movement.date}::${product.id}`);
        if (adjustment?.isSuppressedByMove) {
          return null;
        }
        const openingStock = toFixedQuantity(
          (runningStockByProduct.get(product.id) ?? 0) + toNumber(adjustment?.openingDelta)
        );
        const purchased = toFixedQuantity(movement.purchased + toNumber(adjustment?.purchasedDelta));
        const consumption = toFixedQuantity(movement.consumption + toNumber(adjustment?.consumptionDelta));
        const dipAndDashConsumption = toFixedQuantity(
          movement.dipAndDashConsumption + toNumber(adjustment?.dipAndDashConsumptionDelta)
        );
        const snookerConsumption = toFixedQuantity(
          movement.snookerConsumption + toNumber(adjustment?.snookerConsumptionDelta)
        );
        const closingStock = toFixedQuantity(openingStock + purchased - consumption);
        runningStockByProduct.set(product.id, closingStock);
        const isAdjusted =
          Boolean(adjustment?.note) ||
          Math.abs(toNumber(adjustment?.openingDelta)) > 0.0005 ||
          Math.abs(toNumber(adjustment?.purchasedDelta)) > 0.0005 ||
          Math.abs(toNumber(adjustment?.consumptionDelta)) > 0.0005 ||
          Math.abs(toNumber(adjustment?.dipAndDashConsumptionDelta)) > 0.0005 ||
          Math.abs(toNumber(adjustment?.snookerConsumptionDelta)) > 0.0005;
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
          stockHealth: closingStock <= toNumber(product.minStock) ? "LOW_STOCK" : "HEALTHY",
          isAdjusted,
          adjustmentNote: adjustment?.note ?? null
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
    const targetSection = payload.targetSection ?? "dip_and_dash";
    await this.ensureProductNameUnique(name, targetSection);
    await this.ensureSupplierExists(
      payload.defaultSupplierId,
      targetSection === "both" ? undefined : targetSection
    );

    const initialSectionStocks = normalizeProductSectionStocks({
      targetSection,
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
      targetSection,
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
    let nextTargetSection = payload.targetSection ?? product.targetSection;

    if (payload.name) {
      const name = normalizeText(payload.name);
      await this.ensureProductNameUnique(name, nextTargetSection, id);
      product.name = name;
    } else if (payload.targetSection !== undefined) {
      await this.ensureProductNameUnique(product.name, nextTargetSection, id);
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
      product.targetSection = payload.targetSection;
    }

    if (payload.defaultSupplierId !== undefined) {
      await this.ensureSupplierExists(
        payload.defaultSupplierId,
        nextTargetSection === "both" ? undefined : nextTargetSection
      );
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
    await AppDataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(PurchaseOrderLine)
        .set({ productId: null })
        .where("productId = :productId", { productId: id })
        .execute();

      await manager.delete(Product, { id });
    });
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
    supplierName: string,
    purchaseSection: PurchaseSection,
    supplierId: string
  ) {
    const lineEntities: PurchaseOrderLine[] = [];
    const stockLogs: IngredientStockLog[] = [];
    let totalAmount = 0;

    const missingProductNameLines = lines.filter(
      (line) => line.lineType === "product" && !line.productId && line.productName?.trim()
    );
    if (missingProductNameLines.length) {
      const activeProducts = await manager.find(Product, {
        where: { isActive: true, targetSection: purchaseSection === "gaming" ? "gaming" : "dip_and_dash" }
      });
      const productByExactName = new Map(activeProducts.map((product) => [normalizeLookupKey(product.name), product]));
      const productByFuzzyName = new Map<string, Product>();
      activeProducts.forEach((product) => {
        productByFuzzyName.set(resolveProductMatchKey(product.name, product.packSize), product);
        productByFuzzyName.set(resolveProductMatchKey(product.name), product);
      });

      for (const line of missingProductNameLines) {
        const productName = normalizeText(line.productName ?? "");
        const packSize = line.productPackSize ? normalizeText(line.productPackSize) : null;
        const matchedProduct =
          productByExactName.get(normalizeLookupKey(productName)) ??
          productByFuzzyName.get(resolveProductMatchKey(productName, packSize)) ??
          productByFuzzyName.get(resolveProductMatchKey(productName));

        if (matchedProduct) {
          line.productId = matchedProduct.id;
          line.productPackSize = line.productPackSize ?? matchedProduct.packSize ?? undefined;
          continue;
        }

        const targetSection: ProductTargetSection = purchaseSection === "gaming" ? "gaming" : "dip_and_dash";
        const productUnit = (line.productUnit ?? line.quantityUnit ?? "pcs") as ProductUnit;
        const createdProduct = await manager.save(
          Product,
          manager.create(Product, {
            name: productName,
            category: line.productCategory || (purchaseSection === "gaming" ? "Snooker Beverages" : "General"),
            sku: null,
            packSize,
            unit: PRODUCT_UNITS.includes(productUnit) ? productUnit : "pcs",
            currentStock: 0,
            dipAndDashStock: 0,
            gamingStock: 0,
            minStock: 0,
            purchaseUnitPrice: toFixedPrice(line.unitPrice),
            sellingPrice: 0,
            targetSection,
            defaultSupplierId: supplierId,
            isActive: true
          })
        );
        productByExactName.set(normalizeLookupKey(createdProduct.name), createdProduct);
        productByFuzzyName.set(resolveProductMatchKey(createdProduct.name, createdProduct.packSize), createdProduct);
        productByFuzzyName.set(resolveProductMatchKey(createdProduct.name), createdProduct);
        line.productId = createdProduct.id;
      }
    }

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
      const gstValue = toFixedPrice(Math.max(0, toNumber(line.gstValue ?? 0)));
      const lineTotal = toFixedPrice(enteredQuantity * unitPrice + gstValue);

      if (line.lineType === "ingredient") {
        if (purchaseSection === "gaming") {
          throw new AppError(422, "Ingredients are Dip & Dash only. Use product lines for snooker purchases.");
        }
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
          gstPercentage: line.gstPercentage ?? null,
          sourceAmount: line.sourceAmount ?? null,
          gstValue,
          sourceGrandTotal: line.sourceGrandTotal ?? null,
          lineTotal,
          packSizeSnapshot: null,
          sourceRowNumber: line.sourceRowNumber ?? null,
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
      const expectedTargetSection: ProductTargetSection =
        purchaseSection === "gaming" ? "gaming" : "dip_and_dash";
      if (product.targetSection !== expectedTargetSection) {
        throw new AppError(422, "Selected product does not belong to this purchase section.");
      }

      const enteredUnit = (line.quantityUnit || product.unit).trim().toLowerCase();
      const convertedAdded = convertPurchaseQuantityToBase("product", enteredQuantity, enteredUnit, product.unit);
      if (convertedAdded === null) {
        throw new AppError(422, `Unit ${enteredUnit} is not compatible with product base unit ${product.unit}.`);
      }
      const stockAdded = toFixedQuantity(convertedAdded);

      const stockBefore = toFixedQuantity(toNumber(product.currentStock));
      const sectionSplit = applyProductPurchaseSplit(product, stockAdded, purchaseSection);
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
        gstPercentage: line.gstPercentage ?? null,
        sourceAmount: line.sourceAmount ?? null,
        gstValue,
        sourceGrandTotal: line.sourceGrandTotal ?? null,
        lineTotal,
        packSizeSnapshot: line.productPackSize ?? product.packSize ?? null,
        sourceRowNumber: line.sourceRowNumber ?? null,
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

  private async rollbackPurchaseOrderLines(
    manager: EntityManager,
    lines: PurchaseOrderLine[],
    purchaseNumber: string,
    action: "edit" | "delete"
  ) {
    const allowNegativeStock = action === "delete";

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

        if (!allowNegativeStock && stockAfter < 0) {
          throw new AppError(
            409,
            `Cannot ${action} purchase order ${purchaseNumber} because stock for ${line.itemNameSnapshot} is already consumed.`
          );
        }

        stock.totalStock = stockAfter;
        stock.lastUpdatedAt = new Date();
        await manager.save(IngredientStock, stock);

        const rollbackLog = manager.create(IngredientStockLog, {
          ingredientId: ingredient.id,
          type: IngredientStockLogType.ADJUST,
          quantity: toFixedQuantity(-rollbackQuantity),
          note: `Rollback from purchase ${action} ${purchaseNumber}`
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
        if (!allowNegativeStock && stockAfter < 0) {
          throw new AppError(
            409,
            `Cannot ${action} purchase order ${purchaseNumber} because stock for ${line.itemNameSnapshot} is already consumed.`
          );
        }

        const sectionStocks = allowNegativeStock
          ? {
              dipAndDashStock: toFixedQuantity(toNumber(product.dipAndDashStock)),
              gamingStock: toFixedQuantity(toNumber(product.gamingStock))
            }
          : normalizeProductSectionStocks({
              targetSection: product.targetSection,
              currentStock: toNumber(product.currentStock),
              dipAndDashStock: toNumber(product.dipAndDashStock),
              gamingStock: toNumber(product.gamingStock)
            });

        const nextDip = toFixedQuantity(
          sectionStocks.dipAndDashStock - (rollbackBySectionTotal > 0 ? rollbackDip : effectiveRollbackQuantity)
        );
        const nextGaming = toFixedQuantity(
          sectionStocks.gamingStock - (rollbackBySectionTotal > 0 ? rollbackGaming : 0)
        );

        if (!allowNegativeStock && (nextDip < -0.001 || nextGaming < -0.001)) {
          throw new AppError(
            409,
            `Cannot ${action} purchase order ${purchaseNumber} because section stock for ${line.itemNameSnapshot} is already consumed.`
          );
        }

        product.dipAndDashStock = allowNegativeStock ? nextDip : toFixedQuantity(Math.max(nextDip, 0));
        product.gamingStock = allowNegativeStock ? nextGaming : toFixedQuantity(Math.max(nextGaming, 0));
        product.currentStock = toFixedQuantity(product.dipAndDashStock + product.gamingStock);
        await manager.save(Product, product);
      }
    }
  }

  private async createPurchaseOrderWithManager(
    manager: EntityManager,
    payload: CreatePurchaseOrderPayload,
    createdByUserId: string | null
  ) {
    const purchaseDate = payload.purchaseDate || getTodayDate();
    const purchaseType = this.resolvePurchaseType(payload.lines);
    const purchaseSection = this.resolvePurchaseSection(payload.purchaseSection);

    const supplier = payload.supplierId
      ? await manager.findOne(Supplier, {
          where: { id: payload.supplierId, isActive: true, section: purchaseSection }
        })
      : payload.supplierName
        ? await this.ensureSupplierForPurchaseImport(
            manager,
            {
              supplierName: payload.supplierName,
              phone: payload.supplierPhone ?? ""
            },
            purchaseSection
          )
        : null;
    if (!supplier) {
      throw new AppError(404, "Supplier not found or inactive");
    }

    const purchaseNumber = await this.generatePurchaseNumber(manager, purchaseDate);
    const { lineEntities, totalAmount } = await this.applyPurchaseLines(
      manager,
      payload.lines,
      purchaseNumber,
      supplier.name,
      purchaseSection,
      supplier.id
    );

    const order = manager.create(PurchaseOrder, {
      purchaseNumber,
      supplierId: supplier.id,
      purchaseDate,
      purchaseType,
      purchaseSection,
      totalAmount,
      note: payload.note?.trim() || null,
      vendorInvoiceNumber: payload.vendorInvoiceNumber?.trim() || null,
      projectName: payload.projectName?.trim() || null,
      purchaseMonth: payload.purchaseMonth?.trim() || null,
      receivedDate: payload.receivedDate || null,
      invoiceImageUrl: payload.invoiceImageUrl?.trim() || null,
      createdByUserId
    });
    const savedOrder = await manager.save(PurchaseOrder, order);

    lineEntities.forEach((lineEntity) => {
      lineEntity.purchaseOrderId = savedOrder.id;
    });
    await manager.save(PurchaseOrderLine, lineEntities);
    return savedOrder;
  }

  async createPurchaseOrder(
    payload: CreatePurchaseOrderPayload,
    createdByUserId: string | null,
    existingManager?: EntityManager
  ) {
    if (existingManager) {
      const savedOrder = await this.createPurchaseOrderWithManager(existingManager, payload, createdByUserId);
      const hydrated = await existingManager.findOne(PurchaseOrder, {
        where: { id: savedOrder.id },
        relations: { supplier: true, createdByUser: true, lines: true }
      });
      return this.mapPurchaseOrderDetail(hydrated ?? savedOrder);
    }

    const savedOrder = await AppDataSource.transaction((manager) =>
      this.createPurchaseOrderWithManager(manager, payload, createdByUserId)
    );
    return this.getPurchaseOrderById(savedOrder.id);
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

      if (!payload.supplierId) {
        throw new AppError(422, "Supplier is required for purchase order update.");
      }

      const supplier = await queryRunner.manager.findOne(Supplier, {
        where: { id: payload.supplierId, isActive: true, section: purchaseSection }
      });
      if (!supplier) {
        throw new AppError(404, "Supplier not found or inactive");
      }

      await this.rollbackPurchaseOrderLines(queryRunner.manager, existingOrder.lines, existingOrder.purchaseNumber, "edit");

      await queryRunner.manager.delete(PurchaseOrderLine, { purchaseOrderId: existingOrder.id });

      const { lineEntities, totalAmount } = await this.applyPurchaseLines(
        queryRunner.manager,
        payload.lines,
        existingOrder.purchaseNumber,
        supplier.name,
        purchaseSection,
        supplier.id
      );

      existingOrder.supplierId = payload.supplierId;
      existingOrder.purchaseDate = purchaseDate;
      existingOrder.purchaseType = purchaseType;
      existingOrder.purchaseSection = purchaseSection;
      existingOrder.totalAmount = totalAmount;
      existingOrder.note = payload.note?.trim() || null;
      existingOrder.vendorInvoiceNumber = payload.vendorInvoiceNumber?.trim() || null;
      existingOrder.projectName = payload.projectName?.trim() || null;
      existingOrder.purchaseMonth = payload.purchaseMonth?.trim() || null;
      existingOrder.receivedDate = payload.receivedDate || null;
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

  private async deletePurchaseOrderWithManager(
    manager: EntityManager,
    id: string,
    options?: { allowMissing?: boolean }
  ) {
    const existingOrder = await manager.findOne(PurchaseOrder, {
      where: { id },
      relations: { lines: true }
    });

    if (!existingOrder) {
      if (options?.allowMissing) {
        return null;
      }
      throw new AppError(404, "Purchase order not found");
    }

    await this.rollbackPurchaseOrderLines(manager, existingOrder.lines, existingOrder.purchaseNumber, "delete");
    await manager.delete(PurchaseOrderLine, { purchaseOrderId: existingOrder.id });
    await manager.delete(PurchaseOrder, { id: existingOrder.id });

    return {
      id: existingOrder.id,
      purchaseNumber: existingOrder.purchaseNumber,
      purchaseDate: existingOrder.purchaseDate
    };
  }

  async deletePurchaseOrder(id: string) {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const deletedOrder = await this.deletePurchaseOrderWithManager(queryRunner.manager, id);

      await queryRunner.commitTransaction();
      return deletedOrder;
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

    if (filters.purchaseSection) {
      query.andWhere("purchaseOrder.purchaseSection = :purchaseSection", {
        purchaseSection: filters.purchaseSection
      });
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

    if (filters.purchaseSection) {
      totalsQuery.andWhere("purchaseOrder.purchaseSection = :purchaseSection", {
        purchaseSection: filters.purchaseSection
      });
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
          vendorInvoiceNumber: order.vendorInvoiceNumber,
          projectName: order.projectName,
          purchaseMonth: order.purchaseMonth,
          receivedDate: order.receivedDate,
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

  private mapPurchaseOrderDetail(order: PurchaseOrder) {
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
      vendorInvoiceNumber: order.vendorInvoiceNumber,
      projectName: order.projectName,
      purchaseMonth: order.purchaseMonth,
      receivedDate: order.receivedDate,
      invoiceImageUrl: order.invoiceImageUrl,
      totalAmount: toFixedPrice(toNumber(order.totalAmount)),
      createdByUserId: order.createdByUserId,
      createdByUserName: order.createdByUser?.fullName ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      lines: (order.lines ?? []).map((line) => ({
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
        gstPercentage:
          line.gstPercentage === null || line.gstPercentage === undefined
            ? null
            : Number(toNumber(line.gstPercentage).toFixed(4)),
        sourceAmount:
          line.sourceAmount === null || line.sourceAmount === undefined
            ? null
            : toFixedPrice(toNumber(line.sourceAmount)),
        gstValue: toFixedPrice(toNumber(line.gstValue)),
        sourceGrandTotal:
          line.sourceGrandTotal === null || line.sourceGrandTotal === undefined
            ? null
            : toFixedPrice(toNumber(line.sourceGrandTotal)),
        lineTotal: toFixedPrice(toNumber(line.lineTotal)),
        packSizeSnapshot: line.packSizeSnapshot,
        sourceRowNumber: line.sourceRowNumber,
        unitPriceUpdated: line.unitPriceUpdated,
        expiryDate: line.expiryDate,
        createdAt: line.createdAt
      }))
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

    return this.mapPurchaseOrderDetail(order);
  }

  async getMeta(filters: ProcurementMetaFilters) {
    const date = filters.date || getTodayDate();
    const targetSection =
      filters.purchaseSection === "gaming"
        ? "gaming"
        : filters.purchaseSection === "dip_and_dash"
          ? "dip_and_dash"
          : undefined;

    const ingredientQuery = this.ingredientRepository
      .createQueryBuilder("ingredient")
      .leftJoinAndSelect("ingredient.category", "category")
      .where("ingredient.isActive = true")
      .orderBy("ingredient.name", "ASC");

    if (filters.purchaseSection === "gaming") {
      ingredientQuery.andWhere("1 = 0");
    }

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

    if (targetSection) {
      productQuery.andWhere("product.targetSection = :targetSection", { targetSection });
    }

    if (filters.productSearch) {
      productQuery.andWhere(
        "(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.category) LIKE LOWER(:search) OR LOWER(COALESCE(product.sku, '')) LIKE LOWER(:search))",
        { search: `%${filters.productSearch}%` }
      );
    }

    const supplierQuery = this.supplierRepository
      .createQueryBuilder("supplier")
      .where("supplier.isActive = true")
      .orderBy("supplier.name", "ASC");
    if (filters.purchaseSection) {
      supplierQuery.andWhere("supplier.section = :section", { section: filters.purchaseSection });
    }

    const categoryQuery = this.ingredientCategoryRepository
      .createQueryBuilder("category")
      .where("category.isActive = true")
      .orderBy("category.name", "ASC");
    if (filters.purchaseSection === "gaming") {
      categoryQuery.andWhere("1 = 0");
    }

    const [suppliers, categories, ingredients, products] = await Promise.all([
      supplierQuery.getMany(),
      categoryQuery.getMany(),
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
    if (filters.purchaseSection) {
      purchaseQuery.andWhere("purchaseOrder.purchaseSection = :purchaseSection", {
        purchaseSection: filters.purchaseSection
      });
    }

    const [supplierCount, productCount, purchaseSummary, productPurchaseSummary, recentPurchases] = await Promise.all([
      this.supplierRepository.count(
        filters.purchaseSection ? { where: { section: filters.purchaseSection } } : undefined
      ),
      this.productRepository.count(
        filters.purchaseSection
          ? { where: { targetSection: filters.purchaseSection === "gaming" ? "gaming" : "dip_and_dash" } }
          : undefined
      ),
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
        .andWhere(filters.purchaseSection ? "purchaseOrder.purchaseSection = :purchaseSection" : "1=1", {
          purchaseSection: filters.purchaseSection
        })
        .getRawOne<{ qty: string; amount: string }>(),
      this.purchaseOrderRepository.find({
        where: filters.purchaseSection ? { purchaseSection: filters.purchaseSection } : undefined,
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
