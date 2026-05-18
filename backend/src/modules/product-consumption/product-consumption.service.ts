import { createHash } from "node:crypto";
import { inflateRawSync } from "zlib";
import { EntityManager, In } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { Customer } from "../customers/customer.entity";
import { InvoiceActivity } from "../invoices/invoice-activity.entity";
import { InvoiceLine } from "../invoices/invoice-line.entity";
import { InvoicePayment } from "../invoices/invoice-payment.entity";
import { Invoice } from "../invoices/invoice.entity";
import type { InvoicePaymentMode, InvoiceStatus, PaymentMode } from "../invoices/invoices.constants";
import { Product } from "../procurement/product.entity";
import type { ProductUnit } from "../procurement/procurement.constants";
import { ProductConsumptionImport } from "./product-consumption-import.entity";

type PaginationFilters = {
  page: number;
  limit: number;
};

type ConsumptionListFilters = PaginationFilters & {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};

type ConsumptionImportHistoryFilters = PaginationFilters;

type ConsumptionSourceRow = {
  rowNumber: number;
  serial?: string;
  date: string;
  month?: string;
  customerName: string;
  description: string;
  rate: number;
  quantity: number;
  totalAmount: number;
  gpayAmount: number;
  cashAmount: number;
  remarks?: string;
  finalRemarks?: string;
  statusText?: string;
};

type ConsumptionRowDetail = {
  rowNumber: number;
  status: "inserted" | "skipped_duplicate" | "failed";
  date?: string;
  customerName?: string;
  itemName?: string;
  quantity?: number | null;
  rate?: number | null;
  totalAmount?: number | null;
  cashAmount?: number | null;
  gpayAmount?: number | null;
  pendingAmount?: number | null;
  invoiceNumber?: string;
  reason?: string;
};

type ConsumptionImportSummary = {
  importId?: string;
  fileName?: string;
  importedAt?: Date;
  totalRows: number;
  parsedRows: number;
  insertedRows: number;
  skippedDuplicateRows: number;
  failedRows: number;
  createdProducts: number;
  updatedProducts: number;
  createdCustomers: number;
  createdInvoices: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    customerName: string;
    itemName: string;
    quantity: number;
    totalAmount: number;
    pendingAmount: number;
  }>;
  rowDetails: ConsumptionRowDetail[];
};

export type CreateConsumptionPayload = {
  date?: string;
  customerName?: string;
  productId?: string;
  productName?: string;
  rate: number;
  quantity: number;
  totalAmount?: number;
  cashAmount?: number;
  gpayAmount?: number;
  remarks?: string;
  finalRemarks?: string;
  status?: string;
};

const TEMPLATE_HEADERS = [
  "S.No",
  "Date",
  "Month",
  "Coustmer Name",
  "Description",
  "Rate",
  "Qty",
  "Total Amount",
  "Gpay",
  "Cash",
  "Remarks",
  "Final Remarks",
  "Stauts"
] as const;

const PRODUCT_CONSUMPTION_SOURCE = "snooker_product_consumption";
const DEFAULT_CUSTOMER_NAME = "Admin";
const DEFAULT_PRODUCT_NAME = "No Description";
const DEFAULT_PRODUCT_CATEGORY = "Snooker Products";

const toNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const cleaned = value.replace(/[₹,\s]/g, "").trim();
  if (!cleaned) {
    return 0;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toFixedPrice = (value: number) => Number(value.toFixed(2));
const toFixedQuantity = (value: number) => Number(value.toFixed(3));
const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeLookupKey = (value: string) => normalizeText(value).toLowerCase();
const normalizeHeaderKey = (value: string) => value.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
const escapeCsvValue = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
};

const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toYmd = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }
  return text;
};

type DateOrder = "mdy" | "dmy";

const MONTH_NAME_TO_NUMBER = new Map(
  [
    ["jan", 1],
    ["january", 1],
    ["feb", 2],
    ["february", 2],
    ["mar", 3],
    ["march", 3],
    ["apr", 4],
    ["april", 4],
    ["may", 5],
    ["jun", 6],
    ["june", 6],
    ["jul", 7],
    ["july", 7],
    ["aug", 8],
    ["august", 8],
    ["sep", 9],
    ["sept", 9],
    ["september", 9],
    ["oct", 10],
    ["october", 10],
    ["nov", 11],
    ["november", 11],
    ["dec", 12],
    ["december", 12]
  ].map(([name, month]) => [name, month as number])
);

const parseMonthHint = (value?: string) => {
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
    return numeric;
  }
  const normalized = trimmed.replace(/[^a-z]/g, "");
  return MONTH_NAME_TO_NUMBER.get(normalized) ?? null;
};

const normalizeYear = (value: string) => {
  const year = Number(value);
  if (!Number.isFinite(year)) {
    return NaN;
  }
  return value.length === 2 ? 2000 + year : year;
};

const assertValidDate = (year: number, month: number, day: number, rowNumber: number, fieldLabel: string) => {
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) {
    throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} must be a valid date.`);
  }
};

const parseDelimitedDate = (
  first: string,
  second: string,
  yearText: string,
  rowNumber: number,
  fieldLabel: string,
  dateOrder: DateOrder,
  monthHint?: string
) => {
  const left = Number(first);
  const right = Number(second);
  const year = normalizeYear(yearText);
  const hintedMonth = parseMonthHint(monthHint);
  let month: number;
  let day: number;

  if (hintedMonth === left && hintedMonth !== right) {
    month = left;
    day = right;
  } else if (hintedMonth === right && hintedMonth !== left) {
    month = right;
    day = left;
  } else if (left > 12 && right <= 12) {
    day = left;
    month = right;
  } else if (right > 12 && left <= 12) {
    month = left;
    day = right;
  } else if (dateOrder === "dmy") {
    day = left;
    month = right;
  } else {
    month = left;
    day = right;
  }

  assertValidDate(year, month, day, rowNumber, fieldLabel);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const parseDateLikeToYmd = (
  value: string,
  rowNumber: number,
  fieldLabel: string,
  dateOrder: DateOrder = "mdy",
  monthHint?: string
) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const excelSerial = Number(trimmed);
  if (/^\d{4,6}(?:\.\d+)?$/.test(trimmed) && Number.isFinite(excelSerial) && excelSerial > 20000 && excelSerial < 70000) {
    const parsed = new Date(Date.UTC(1899, 11, 30 + Math.floor(excelSerial)));
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(
      parsed.getUTCDate()
    ).padStart(2, "0")}`;
  }

  const ymdMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) {
      throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} must be a valid date.`);
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const delimitedMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/.exec(trimmed);
  if (delimitedMatch) {
    return parseDelimitedDate(
      delimitedMatch[1],
      delimitedMatch[2],
      delimitedMatch[3],
      rowNumber,
      fieldLabel,
      dateOrder,
      monthHint
    );
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} must be a valid date.`);
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate()
  ).padStart(2, "0")}`;
};

const toLocalBusinessDate = (date: string) => new Date(`${date}T12:00:00.000+05:30`);

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

const parseCsvRows = (content: string) => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === "\"") {
      if (inQuotes && content[index + 1] === "\"") {
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

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const getCell = (row: string[], headerMap: Map<string, number>, aliases: string[]) => {
  for (const alias of aliases) {
    const index = headerMap.get(alias);
    if (index !== undefined) {
      return row[index] ?? "";
    }
  }
  return "";
};

const isMostlyEmptyRow = (row: string[]) => row.every((cell) => !String(cell ?? "").trim());

const inferDateOrder = (rows: string[][], headerMap: Map<string, number>, startIndex: number): DateOrder => {
  let mdyScore = 0;
  let dmyScore = 0;

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || isMostlyEmptyRow(row)) {
      continue;
    }
    const rawDate = getCell(row, headerMap, ["date"]).trim();
    const match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/.exec(rawDate);
    if (!match) {
      continue;
    }

    const left = Number(match[1]);
    const right = Number(match[2]);
    const monthHint = parseMonthHint(getCell(row, headerMap, ["month"]));
    if (monthHint && left === monthHint && right !== monthHint) {
      mdyScore += 3;
    }
    if (monthHint && right === monthHint && left !== monthHint) {
      dmyScore += 3;
    }
    if (left > 12 && right <= 12) {
      dmyScore += 2;
    }
    if (right > 12 && left <= 12) {
      mdyScore += 2;
    }
  }

  return dmyScore > mdyScore ? "dmy" : "mdy";
};

const normalizeCustomerName = (value: string) => normalizeText(value) || DEFAULT_CUSTOMER_NAME;

const normalizeProductName = (value: string) => normalizeText(value);

const resolveEnteredPaymentAmounts = (input: {
  rawCashAmount: number;
  rawGpayAmount: number;
  totalAmount: number;
  remarks?: string;
  finalRemarks?: string;
  statusText?: string;
}) => {
  let cashAmount = toFixedPrice(input.rawCashAmount);
  let gpayAmount = toFixedPrice(input.rawGpayAmount);
  const note = `${input.remarks ?? ""} ${input.finalRemarks ?? ""} ${input.statusText ?? ""}`.toLowerCase();
  const hasCashText = /\bcash\b/.test(note);
  const hasGpayText = /\b(gpay|upi|phonepe|paytm|online)\b/.test(note);

  if (hasCashText !== hasGpayText) {
    const singleEnteredAmount =
      cashAmount > 0 && gpayAmount <= 0 ? cashAmount : gpayAmount > 0 && cashAmount <= 0 ? gpayAmount : 0;
    if (singleEnteredAmount > 0) {
      cashAmount = hasCashText ? singleEnteredAmount : 0;
      gpayAmount = hasGpayText ? singleEnteredAmount : 0;
    } else if (cashAmount <= 0 && gpayAmount <= 0 && input.totalAmount > 0) {
      cashAmount = hasCashText ? toFixedPrice(input.totalAmount) : 0;
      gpayAmount = hasGpayText ? toFixedPrice(input.totalAmount) : 0;
    }
  }

  return { cashAmount, gpayAmount };
};

const buildSyntheticPhone = (name: string, salt = "") => {
  const base = normalizeLookupKey(name).replace(/[^a-z0-9]/g, "").toUpperCase() || "ADMIN";
  const hash = createHash("sha1").update(`${name}:${salt}`).digest("hex").slice(0, 4).toUpperCase();
  return `SNK-${base.slice(0, 11)}${hash}`.slice(0, 20);
};

const buildIdempotencyKey = (row: ConsumptionSourceRow) => {
  const raw = [
    row.date,
    row.serial || row.rowNumber,
    normalizeLookupKey(row.customerName),
    normalizeLookupKey(row.description),
    row.quantity,
    row.totalAmount
  ].join("|");
  return `snk_consumption_${createHash("sha1").update(raw).digest("hex")}`;
};

const resolvePaymentBreakdown = (row: ConsumptionSourceRow) => {
  const totalAmount = toFixedPrice(row.totalAmount);
  let cashAmount = toFixedPrice(row.cashAmount);
  let upiAmount = toFixedPrice(row.gpayAmount);
  const note = `${row.remarks ?? ""} ${row.finalRemarks ?? ""} ${row.statusText ?? ""}`.toLowerCase();

  if (cashAmount <= 0 && upiAmount <= 0 && totalAmount > 0) {
    if (/\b(gpay|upi|phonepe|paytm|online)\b/.test(note)) {
      upiAmount = totalAmount;
    } else if (/\b(cash)\b/.test(note)) {
      cashAmount = totalAmount;
    }
  }

  const paidAmount = toFixedPrice(cashAmount + upiAmount);
  if (paidAmount - totalAmount > 0.05) {
    throw new AppError(422, `Payment amount ${paidAmount} is greater than total ${totalAmount}.`);
  }

  const pendingByText = /\b(pending|credit|due|balance)\b/.test(note);
  const pendingAmount = toFixedPrice(Math.max(0, totalAmount - paidAmount));
  const invoiceStatus: InvoiceStatus = pendingByText || pendingAmount > 0.05 ? "pending" : "paid";
  let paymentMode: InvoicePaymentMode = "pending";
  if (cashAmount > 0 && upiAmount > 0) {
    paymentMode = "mixed";
  } else if (cashAmount > 0) {
    paymentMode = "cash";
  } else if (upiAmount > 0) {
    paymentMode = "upi";
  }

  return {
    cashAmount,
    upiAmount,
    paidAmount,
    pendingAmount,
    invoiceStatus,
    paymentMode
  };
};

export class ProductConsumptionService {
  private readonly importRepository = AppDataSource.getRepository(ProductConsumptionImport);
  private readonly invoiceLineRepository = AppDataSource.getRepository(InvoiceLine);

  getTemplate() {
    return {
      fileName: "snooker_product_consumption_template.csv",
      content: `${TEMPLATE_HEADERS.map(escapeCsvValue).join(",")}\n`
    };
  }

  private parseUpload(buffer: Buffer, originalName?: string) {
    const rows = parseTabularUploadRows(buffer, originalName);
    const headerRowIndex = rows.findIndex((row) => {
      const keys = row.map((cell) => normalizeHeaderKey(String(cell ?? "")));
      return keys.includes("description") && keys.includes("rate") && keys.includes("qty");
    });
    if (headerRowIndex < 0) {
      throw new AppError(422, "Consumption file header row was not found.");
    }

    const headerMap = new Map<string, number>();
    rows[headerRowIndex].forEach((cell, index) => {
      const key = normalizeHeaderKey(String(cell ?? ""));
      if (key) {
        headerMap.set(key, index);
      }
    });
    const detectedDateOrder = inferDateOrder(rows, headerMap, headerRowIndex + 1);

    const parsedRows: ConsumptionSourceRow[] = [];
    const invalidDetails: ConsumptionRowDetail[] = [];
    for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 1;
      if (!row || isMostlyEmptyRow(row)) {
        continue;
      }
      const rowDetail: ConsumptionRowDetail = { rowNumber, status: "failed" };
      try {
        const description =
          normalizeProductName(getCell(row, headerMap, ["description", "product", "productname", "item"])) ||
          DEFAULT_PRODUCT_NAME;
        const month = getCell(row, headerMap, ["month"]);
        const date =
          parseDateLikeToYmd(getCell(row, headerMap, ["date"]), rowNumber, "Date", detectedDateOrder, month) ||
          getTodayDate();
        const rate = toNumber(getCell(row, headerMap, ["rate", "sellingprice", "unitprice"]));
        const quantity = toNumber(getCell(row, headerMap, ["qty", "quantity"]));
        const enteredTotal = toNumber(getCell(row, headerMap, ["totalamount", "total"]));
        const totalAmount = enteredTotal > 0 ? enteredTotal : rate * quantity;

        rowDetail.date = date;
        rowDetail.customerName = normalizeCustomerName(
          getCell(row, headerMap, ["coustmername", "customername", "customer"])
        );
        rowDetail.itemName = description;
        rowDetail.quantity = quantity;
        rowDetail.rate = rate;
        rowDetail.totalAmount = totalAmount;

        if (rate <= 0) {
          throw new AppError(422, "Rate must be greater than zero.");
        }
        if (quantity <= 0) {
          throw new AppError(422, "Qty must be greater than zero.");
        }
        if (totalAmount <= 0) {
          throw new AppError(422, "Total Amount must be greater than zero.");
        }

        const remarks = getCell(row, headerMap, ["remarks", "remark"]);
        const finalRemarks = getCell(row, headerMap, ["finalremarks", "finalremark"]);
        const statusText = getCell(row, headerMap, ["stauts", "status"]);
        const { cashAmount, gpayAmount } = resolveEnteredPaymentAmounts({
          rawCashAmount: toNumber(getCell(row, headerMap, ["cash", "cashamount"])),
          rawGpayAmount: toNumber(getCell(row, headerMap, ["gpay", "upi", "gpayamount"])),
          totalAmount,
          remarks,
          finalRemarks,
          statusText
        });
        rowDetail.cashAmount = cashAmount;
        rowDetail.gpayAmount = gpayAmount;

        parsedRows.push({
          rowNumber,
          serial: getCell(row, headerMap, ["sno", "serial", "slno"]),
          date,
          month,
          customerName: rowDetail.customerName,
          description,
          rate: toFixedPrice(rate),
          quantity: toFixedQuantity(quantity),
          totalAmount: toFixedPrice(totalAmount),
          gpayAmount: toFixedPrice(gpayAmount),
          cashAmount: toFixedPrice(cashAmount),
          remarks,
          finalRemarks,
          statusText
        });
      } catch (error) {
        rowDetail.reason = error instanceof AppError ? error.message : "Unable to parse this row.";
        invalidDetails.push(rowDetail);
      }
    }

    return {
      totalRows: rows.length - headerRowIndex - 1,
      parsedRows,
      invalidDetails
    };
  }

  private async resolveCustomer(
    manager: EntityManager,
    name: string,
    createdByUserId: string,
    counters: { createdCustomers: number },
    cache: Map<string, Customer>
  ) {
    const customerName = normalizeCustomerName(name);
    const key = normalizeLookupKey(customerName);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const repo = manager.getRepository(Customer);
    const existing = await repo
      .createQueryBuilder("customer")
      .where("LOWER(customer.name) = LOWER(:name)", { name: customerName })
      .andWhere("customer.section = :section", { section: "gaming" })
      .getOne();
    if (existing) {
      cache.set(key, existing);
      return existing;
    }

    let phone = buildSyntheticPhone(customerName);
    for (let index = 1; index <= 20; index += 1) {
      const phoneHolder = await repo.findOne({ where: { phone, section: "gaming" } });
      if (!phoneHolder) {
        break;
      }
      phone = buildSyntheticPhone(customerName, String(index));
    }

    const customer = await repo.save(
      repo.create({
        name: customerName,
        phone,
        section: "gaming",
        notes: "Created from Snooker product consumption.",
        createdByUserId,
        isActive: true
      })
    );
    counters.createdCustomers += 1;
    cache.set(key, customer);
    return customer;
  }

  private async resolveProduct(
    manager: EntityManager,
    row: ConsumptionSourceRow,
    counters: { createdProducts: number; updatedProducts: number },
    cache: Map<string, Product>,
    productId?: string
  ) {
    const repo = manager.getRepository(Product);
    if (productId) {
      const product = await repo.findOne({ where: { id: productId } });
      if (!product) {
        throw new AppError(404, "Product not found.");
      }
      if (product.targetSection !== "gaming") {
        throw new AppError(422, "Only Snooker products can be consumed here.");
      }
      return product;
    }

    const productName = normalizeProductName(row.description);
    const key = normalizeLookupKey(productName);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const existing = await repo
      .createQueryBuilder("product")
      .where("LOWER(product.name) = LOWER(:name)", { name: productName })
      .andWhere("product.targetSection = :targetSection", { targetSection: "gaming" })
      .getOne();
    if (existing) {
      let changed = false;
      if (toNumber(existing.sellingPrice) <= 0 && row.rate > 0) {
        existing.sellingPrice = row.rate;
        changed = true;
      }
      if (toNumber(existing.purchaseUnitPrice) <= 0 && row.rate > 0) {
        existing.purchaseUnitPrice = row.rate;
        changed = true;
      }
      const product = changed ? await repo.save(existing) : existing;
      if (changed) {
        counters.updatedProducts += 1;
      }
      cache.set(key, product);
      return product;
    }

    const created = await repo.save(
      repo.create({
        name: productName,
        category: DEFAULT_PRODUCT_CATEGORY,
        sku: null,
        packSize: null,
        unit: "pcs" as ProductUnit,
        currentStock: 0,
        dipAndDashStock: 0,
        gamingStock: 0,
        minStock: 0,
        purchaseUnitPrice: row.rate,
        sellingPrice: row.rate,
        targetSection: "gaming",
        defaultSupplierId: null,
        isActive: true
      })
    );
    counters.createdProducts += 1;
    cache.set(key, created);
    return created;
  }

  private async buildInvoiceNumber(manager: EntityManager, date: string, rowNumber: number) {
    const compactDate = date.replace(/-/g, "");
    const base = `SNK-CONS-${compactDate}-${String(rowNumber).padStart(4, "0")}`;
    const repo = manager.getRepository(Invoice);
    for (let suffix = 0; suffix <= 99; suffix += 1) {
      const invoiceNumber = suffix === 0 ? base : `${base}-${suffix}`;
      const existing = await repo.findOne({ where: { invoiceNumber } });
      if (!existing) {
        return invoiceNumber;
      }
    }
    throw new AppError(500, "Unable to generate invoice number right now.");
  }

  private async insertConsumptionRow(
    manager: EntityManager,
    row: ConsumptionSourceRow,
    createdByUserId: string,
    counters: { createdProducts: number; updatedProducts: number; createdCustomers: number },
    caches: { customers: Map<string, Customer>; products: Map<string, Product> },
    productId?: string
  ) {
    const payment = resolvePaymentBreakdown(row);
    const invoiceRepo = manager.getRepository(Invoice);
    const existing = await invoiceRepo.findOne({ where: { idempotencyKey: buildIdempotencyKey(row) } });
    if (existing) {
      return {
        status: "skipped_duplicate" as const,
        invoice: existing,
        payment,
        product: null,
        customer: null
      };
    }

    const customer = await this.resolveCustomer(manager, row.customerName, createdByUserId, counters, caches.customers);
    const product = await this.resolveProduct(manager, row, counters, caches.products, productId);
    const invoiceNumber = await this.buildInvoiceNumber(manager, row.date, row.rowNumber);
    const businessDate = toLocalBusinessDate(row.date);
    const lineTotal = toFixedPrice(row.totalAmount);

    product.gamingStock = toFixedQuantity(toNumber(product.gamingStock) - row.quantity);
    product.dipAndDashStock = toFixedQuantity(toNumber(product.dipAndDashStock));
    product.currentStock = toFixedQuantity(product.targetSection === "gaming"
      ? toNumber(product.gamingStock)
      : toNumber(product.dipAndDashStock) + toNumber(product.gamingStock));
    await manager.getRepository(Product).save(product);

    const invoice = await invoiceRepo.save(
      invoiceRepo.create({
        invoiceNumber,
        idempotencyKey: buildIdempotencyKey(row),
        orderReference: `Product Consumption #${row.serial || row.rowNumber}`,
        customerId: customer.id,
        staffId: createdByUserId,
        branchId: "snooker",
        deviceId: "web-product-consumption",
        orderType: "snooker",
        tableLabel: "Snooker Products",
        kitchenStatus: "served",
        status: payment.invoiceStatus,
        paymentMode: payment.paymentMode,
        subtotal: lineTotal,
        itemDiscountAmount: 0,
        couponDiscountAmount: 0,
        manualDiscountAmount: 0,
        taxAmount: 0,
        totalAmount: lineTotal,
        couponCode: null,
        notes: [row.remarks, row.finalRemarks].filter(Boolean).join(" | ") || null,
        customerSnapshot: { id: customer.id, name: customer.name, phone: customer.phone, section: customer.section },
        totalsSnapshot: {
          cashAmount: payment.cashAmount,
          gpayAmount: payment.upiAmount,
          paidAmount: payment.paidAmount,
          pendingAmount: payment.pendingAmount,
          source: PRODUCT_CONSUMPTION_SOURCE
        },
        linesSnapshot: null,
        syncedFromPos: false,
        sourceCreatedAt: businessDate,
        createdAt: businessDate,
        updatedAt: businessDate
      })
    );

    await manager.getRepository(InvoiceLine).save(
      manager.getRepository(InvoiceLine).create({
        invoiceId: invoice.id,
        lineType: "product",
        referenceId: product.id,
        nameSnapshot: product.name,
        quantity: row.quantity,
        unitPrice: row.rate,
        discountAmount: 0,
        gstPercentage: 0,
        lineTotal,
        meta: {
          source: PRODUCT_CONSUMPTION_SOURCE,
          rowNumber: row.rowNumber,
          serial: row.serial ?? null,
          month: row.month ?? null,
          cashAmount: payment.cashAmount,
          gpayAmount: payment.upiAmount,
          pendingAmount: payment.pendingAmount,
          remarks: row.remarks ?? null,
          finalRemarks: row.finalRemarks ?? null,
          statusText: row.statusText ?? null
        },
        createdAt: businessDate
      })
    );

    const payments: Array<{ mode: PaymentMode; amount: number }> = [];
    if (payment.cashAmount > 0) {
      payments.push({ mode: "cash", amount: payment.cashAmount });
    }
    if (payment.upiAmount > 0) {
      payments.push({ mode: "upi", amount: payment.upiAmount });
    }
    if (payments.length) {
      await manager.getRepository(InvoicePayment).save(
        payments.map((paymentRow) =>
          manager.getRepository(InvoicePayment).create({
            invoiceId: invoice.id,
            mode: paymentRow.mode,
            status: "success",
            amount: paymentRow.amount,
            receivedAmount: paymentRow.amount,
            changeAmount: 0,
            referenceNo: null,
            paidAt: businessDate,
            createdAt: businessDate
          })
        )
      );
    }

    await manager.getRepository(InvoiceActivity).save(
      manager.getRepository(InvoiceActivity).create({
        invoiceId: invoice.id,
        actionType: "created",
        reason: "Snooker product consumption",
        performedByUserId: createdByUserId,
        payload: {
          source: PRODUCT_CONSUMPTION_SOURCE,
          rowNumber: row.rowNumber,
          productId: product.id,
          customerId: customer.id,
          quantity: row.quantity,
          totalAmount: lineTotal,
          pendingAmount: payment.pendingAmount
        }
      })
    );

    return {
      status: "inserted" as const,
      invoice,
      payment,
      product,
      customer
    };
  }

  async createConsumption(payload: CreateConsumptionPayload, createdByUserId: string) {
    const date = parseDateLikeToYmd(payload.date || getTodayDate(), 1, "Date") || getTodayDate();
    let productName = normalizeProductName(payload.productName || "");
    const quantity = toNumber(payload.quantity);
    const rate = toNumber(payload.rate);
    const totalAmount = toFixedPrice(toNumber(payload.totalAmount) > 0 ? toNumber(payload.totalAmount) : rate * quantity);

    productName = productName || DEFAULT_PRODUCT_NAME;
    if (quantity <= 0) {
      throw new AppError(422, "Qty must be greater than zero.");
    }
    if (rate <= 0) {
      throw new AppError(422, "Rate must be greater than zero.");
    }
    if (totalAmount <= 0) {
      throw new AppError(422, "Total Amount must be greater than zero.");
    }
    if (payload.productId) {
      const selectedProduct = await AppDataSource.getRepository(Product).findOne({ where: { id: payload.productId } });
      if (!selectedProduct) {
        throw new AppError(404, "Product not found.");
      }
      if (selectedProduct.targetSection !== "gaming") {
        throw new AppError(422, "Only Snooker products can be consumed here.");
      }
      productName = selectedProduct.name;
    }

    const row: ConsumptionSourceRow = {
      rowNumber: 1,
      date,
      customerName: normalizeCustomerName(payload.customerName || DEFAULT_CUSTOMER_NAME),
      description: productName,
      rate: toFixedPrice(rate),
      quantity: toFixedQuantity(quantity),
      totalAmount,
      cashAmount: toFixedPrice(toNumber(payload.cashAmount)),
      gpayAmount: toFixedPrice(toNumber(payload.gpayAmount)),
      remarks: payload.remarks,
      finalRemarks: payload.finalRemarks,
      statusText: payload.status
    };

    const result = await AppDataSource.transaction(async (manager) =>
      this.insertConsumptionRow(
        manager,
        row,
        createdByUserId,
        { createdProducts: 0, updatedProducts: 0, createdCustomers: 0 },
        { customers: new Map(), products: new Map() },
        payload.productId
      )
    );

    return {
      invoice: {
        id: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        status: result.invoice.status,
        totalAmount: toFixedPrice(toNumber(result.invoice.totalAmount)),
        pendingAmount: result.payment.pendingAmount
      }
    };
  }

  async importConsumptionFile(buffer: Buffer, createdByUserId: string, originalName?: string) {
    const parsed = this.parseUpload(buffer, originalName);
    const summary: ConsumptionImportSummary = {
      fileName: originalName || "products_consumption_upload",
      totalRows: parsed.totalRows,
      parsedRows: parsed.parsedRows.length,
      insertedRows: 0,
      skippedDuplicateRows: 0,
      failedRows: parsed.invalidDetails.length,
      createdProducts: 0,
      updatedProducts: 0,
      createdCustomers: 0,
      createdInvoices: [],
      rowDetails: [...parsed.invalidDetails]
    };

    const persisted = await AppDataSource.transaction(async (manager) => {
      const counters = { createdProducts: 0, updatedProducts: 0, createdCustomers: 0 };
      const caches = { customers: new Map<string, Customer>(), products: new Map<string, Product>() };

      for (const row of parsed.parsedRows) {
        const rowDetail: ConsumptionRowDetail = {
          rowNumber: row.rowNumber,
          status: "failed",
          date: row.date,
          customerName: row.customerName,
          itemName: row.description,
          quantity: row.quantity,
          rate: row.rate,
          totalAmount: row.totalAmount,
          cashAmount: row.cashAmount,
          gpayAmount: row.gpayAmount
        };
        try {
          const result = await this.insertConsumptionRow(manager, row, createdByUserId, counters, caches);
          rowDetail.status = result.status;
          rowDetail.invoiceNumber = result.invoice.invoiceNumber;
          rowDetail.pendingAmount = result.payment.pendingAmount;
          rowDetail.reason =
            result.status === "inserted"
              ? `Inserted in ${result.invoice.invoiceNumber}.`
              : `Duplicate skipped. Existing invoice ${result.invoice.invoiceNumber}.`;
          if (result.status === "inserted" && result.product && result.customer) {
            summary.insertedRows += 1;
            summary.createdInvoices.push({
              id: result.invoice.id,
              invoiceNumber: result.invoice.invoiceNumber,
              date: row.date,
              customerName: result.customer.name,
              itemName: result.product.name,
              quantity: row.quantity,
              totalAmount: row.totalAmount,
              pendingAmount: result.payment.pendingAmount
            });
          } else {
            summary.skippedDuplicateRows += 1;
          }
        } catch (error) {
          rowDetail.status = "failed";
          rowDetail.reason = error instanceof AppError ? error.message : "Unable to insert this row.";
          summary.failedRows += 1;
        }
        summary.rowDetails.push(rowDetail);
      }

      summary.createdProducts = counters.createdProducts;
      summary.updatedProducts = counters.updatedProducts;
      summary.createdCustomers = counters.createdCustomers;

      const importRow = await manager.getRepository(ProductConsumptionImport).save(
        manager.getRepository(ProductConsumptionImport).create({
          fileName: summary.fileName!,
          createdByUserId,
          summary
        })
      );

      return importRow;
    });

    return {
      id: persisted.id,
      importId: persisted.id,
      createdAt: persisted.createdAt,
      importedAt: persisted.createdAt,
      ...(persisted.summary as ConsumptionImportSummary)
    };
  }

  async listImportHistory(filters: ConsumptionImportHistoryFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 10));
    const [imports, totalItems] = await this.importRepository.findAndCount({
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit
    });

    return {
      imports: imports.map((row) => ({
        id: row.id,
        fileName: row.fileName,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt,
        ...(row.summary as ConsumptionImportSummary)
      })),
      pagination: getPaginationMeta(page, limit, totalItems)
    };
  }

  async deleteImportHistory(importId: string) {
    const importRow = await this.importRepository.findOne({ where: { id: importId } });
    if (!importRow) {
      throw new AppError(404, "Product consumption upload history not found.");
    }

    const result = await AppDataSource.transaction(async (manager) => {
      const summary = importRow.summary as ConsumptionImportSummary;
      const invoiceIds = new Set<string>();
      const invoiceNumbers = new Set<string>();

      for (const invoice of summary.createdInvoices ?? []) {
        if (invoice.id) {
          invoiceIds.add(invoice.id);
        }
        if (invoice.invoiceNumber) {
          invoiceNumbers.add(invoice.invoiceNumber);
        }
      }
      for (const detail of summary.rowDetails ?? []) {
        if (detail.status === "inserted" && detail.invoiceNumber) {
          invoiceNumbers.add(detail.invoiceNumber);
        }
      }

      const hasInvoiceIds = invoiceIds.size > 0;
      const hasInvoiceNumbers = invoiceNumbers.size > 0;
      let invoiceRows: Array<{ invoiceId: string; invoiceNumber: string }> = [];
      let lineRows: Array<{ invoiceId: string; productId: string; quantity: string }> = [];

      if (hasInvoiceIds || hasInvoiceNumbers) {
        const invoiceQuery = manager
          .getRepository(Invoice)
          .createQueryBuilder("invoice")
          .innerJoin(InvoiceLine, "line", "line.\"invoiceId\" = invoice.id")
          .select("invoice.id", "invoiceId")
          .addSelect("invoice.\"invoiceNumber\"", "invoiceNumber")
          .where("line.lineType = :lineType", { lineType: "product" })
          .andWhere("line.meta ->> 'source' = :source", { source: PRODUCT_CONSUMPTION_SOURCE });

        if (hasInvoiceIds && hasInvoiceNumbers) {
          invoiceQuery.andWhere("(invoice.id IN (:...invoiceIds) OR invoice.\"invoiceNumber\" IN (:...invoiceNumbers))", {
            invoiceIds: Array.from(invoiceIds),
            invoiceNumbers: Array.from(invoiceNumbers)
          });
        } else if (hasInvoiceIds) {
          invoiceQuery.andWhere("invoice.id IN (:...invoiceIds)", { invoiceIds: Array.from(invoiceIds) });
        } else {
          invoiceQuery.andWhere("invoice.\"invoiceNumber\" IN (:...invoiceNumbers)", {
            invoiceNumbers: Array.from(invoiceNumbers)
          });
        }

        invoiceRows = await invoiceQuery.groupBy("invoice.id").getRawMany<{
          invoiceId: string;
          invoiceNumber: string;
        }>();

        const rollbackInvoiceIds = invoiceRows.map((invoice) => invoice.invoiceId);
        if (rollbackInvoiceIds.length > 0) {
          lineRows = await manager
            .getRepository(InvoiceLine)
            .createQueryBuilder("line")
            .select("line.\"invoiceId\"", "invoiceId")
            .addSelect("line.\"referenceId\"", "productId")
            .addSelect("line.quantity", "quantity")
            .where("line.lineType = :lineType", { lineType: "product" })
            .andWhere("line.meta ->> 'source' = :source", { source: PRODUCT_CONSUMPTION_SOURCE })
            .andWhere("line.\"invoiceId\" IN (:...invoiceIds)", { invoiceIds: rollbackInvoiceIds })
            .getRawMany<{ invoiceId: string; productId: string; quantity: string }>();

          const quantityByProductId = new Map<string, number>();
          for (const line of lineRows) {
            if (!line.productId) {
              continue;
            }
            quantityByProductId.set(
              line.productId,
              toFixedQuantity((quantityByProductId.get(line.productId) ?? 0) + toNumber(line.quantity))
            );
          }

          if (quantityByProductId.size > 0) {
            const products = await manager.getRepository(Product).findBy({ id: In(Array.from(quantityByProductId.keys())) });
            for (const product of products) {
              const restoreQuantity = quantityByProductId.get(product.id) ?? 0;
              product.gamingStock = toFixedQuantity(toNumber(product.gamingStock) + restoreQuantity);
              product.currentStock = toFixedQuantity(
                product.targetSection === "gaming"
                  ? toNumber(product.gamingStock)
                  : toNumber(product.dipAndDashStock) + toNumber(product.gamingStock)
              );
            }
            await manager.getRepository(Product).save(products);
          }

          await manager.getRepository(Invoice).delete({ id: In(rollbackInvoiceIds) });
        }
      }

      await manager.getRepository(ProductConsumptionImport).delete(importRow.id);

      return {
        importId: importRow.id,
        deletedInvoices: invoiceRows.length,
        deletedLines: lineRows.length,
        restoredStockQuantity: toFixedQuantity(lineRows.reduce((sum, line) => sum + toNumber(line.quantity), 0))
      };
    });

    return result;
  }

  async listConsumptions(filters: ConsumptionListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 10));
    const dateFrom = filters.dateFrom?.trim() || undefined;
    const dateTo = filters.dateTo?.trim() || undefined;

    const baseQuery = this.invoiceLineRepository
      .createQueryBuilder("line")
      .innerJoin("line.invoice", "invoice")
      .leftJoin("invoice.customer", "customer")
      .leftJoin(Product, "product", "CAST(line.\"referenceId\" AS text) = CAST(product.id AS text)")
      .leftJoin(InvoicePayment, "payment", "payment.\"invoiceId\" = invoice.id AND payment.status = :paymentStatus", {
        paymentStatus: "success"
      })
      .where("line.lineType = :lineType", { lineType: "product" })
      .andWhere("line.meta ->> 'source' = :source", { source: PRODUCT_CONSUMPTION_SOURCE })
      .andWhere(dateFrom ? "CAST(timezone('Asia/Kolkata', invoice.\"createdAt\") AS date) >= :dateFrom" : "1=1", {
        dateFrom
      })
      .andWhere(dateTo ? "CAST(timezone('Asia/Kolkata', invoice.\"createdAt\") AS date) <= :dateTo" : "1=1", {
        dateTo
      });

    if (filters.search?.trim()) {
      baseQuery.andWhere(
        `(LOWER(line."nameSnapshot") LIKE LOWER(:search)
          OR LOWER(invoice."invoiceNumber") LIKE LOWER(:search)
          OR LOWER(COALESCE(customer.name, invoice."customerSnapshot"->>'name', '')) LIKE LOWER(:search))`,
        { search: `%${filters.search.trim()}%` }
      );
    }

    const totalItems = await baseQuery.clone().getCount();
    const rows = await baseQuery
      .clone()
      .select("line.id", "id")
      .addSelect("invoice.id", "invoiceId")
      .addSelect("invoice.\"invoiceNumber\"", "invoiceNumber")
      .addSelect("to_char(timezone('Asia/Kolkata', invoice.\"createdAt\"), 'YYYY-MM-DD')", "date")
      .addSelect("invoice.status", "status")
      .addSelect("invoice.\"paymentMode\"", "paymentMode")
      .addSelect(`COALESCE(customer.name, invoice."customerSnapshot"->>'name', 'Admin')`, "customerName")
      .addSelect("line.\"referenceId\"", "productId")
      .addSelect("line.\"nameSnapshot\"", "productName")
      .addSelect("product.\"currentStock\"", "currentStock")
      .addSelect("line.quantity", "quantity")
      .addSelect("line.\"unitPrice\"", "rate")
      .addSelect("line.\"lineTotal\"", "totalAmount")
      .addSelect("COALESCE(SUM(CASE WHEN payment.mode = 'cash' THEN payment.amount ELSE 0 END), 0)", "cashAmount")
      .addSelect("COALESCE(SUM(CASE WHEN payment.mode = 'upi' THEN payment.amount ELSE 0 END), 0)", "gpayAmount")
      .addSelect(
        "GREATEST(0, invoice.\"totalAmount\" - COALESCE(SUM(CASE WHEN payment.mode IN ('cash', 'upi', 'card', 'mixed') THEN payment.amount ELSE 0 END), 0))",
        "pendingAmount"
      )
      .groupBy("line.id")
      .addGroupBy("invoice.id")
      .addGroupBy("customer.id")
      .addGroupBy("product.id")
      .orderBy("invoice.createdAt", "DESC")
      .addOrderBy("line.createdAt", "DESC")
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        id: string;
        invoiceId: string;
        invoiceNumber: string;
        date: string;
        status: InvoiceStatus;
        paymentMode: InvoicePaymentMode;
        customerName: string;
        productId: string;
        productName: string;
        currentStock: string | null;
        quantity: string;
        rate: string;
        totalAmount: string;
        cashAmount: string;
        gpayAmount: string;
        pendingAmount: string;
      }>();

    return {
      consumptions: rows.map((row) => ({
        id: row.id,
        invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        date: toYmd(row.date),
        status: row.status,
        paymentMode: row.paymentMode,
        customerName: row.customerName,
        productId: row.productId,
        productName: row.productName,
        currentStock: toFixedQuantity(toNumber(row.currentStock)),
        quantity: toFixedQuantity(toNumber(row.quantity)),
        rate: toFixedPrice(toNumber(row.rate)),
        totalAmount: toFixedPrice(toNumber(row.totalAmount)),
        cashAmount: toFixedPrice(toNumber(row.cashAmount)),
        gpayAmount: toFixedPrice(toNumber(row.gpayAmount)),
        pendingAmount: toFixedPrice(toNumber(row.pendingAmount))
      })),
      pagination: getPaginationMeta(page, limit, totalItems)
    };
  }
}
