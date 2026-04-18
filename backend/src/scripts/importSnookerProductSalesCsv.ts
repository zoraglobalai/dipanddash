import "reflect-metadata";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { randomUUID } from "node:crypto";

import { AppDataSource } from "../database/data-source";
import { UserRole } from "../constants/roles";
import { InvoicesService } from "../modules/invoices/invoices.service";
import { Invoice } from "../modules/invoices/invoice.entity";
import { Product } from "../modules/procurement/product.entity";
import { Supplier } from "../modules/procurement/supplier.entity";
import { User } from "../modules/users/user.entity";
import { In } from "typeorm";

type RawRow = {
  serial: number;
  date: string;
  description: string;
  rate: number;
  quantity: number;
  totalAmount: number;
  remarks: string;
};

type ParsedPayment = {
  mode: "cash" | "upi" | "card";
  amount: number;
  referenceNo: string | null;
};

const DEFAULT_CSV_FILE = "prodyuct_sales_snooker.csv";
const ROW_PREFIX = "SNK-SALE";

const buildInvoiceNumber = (row: Pick<RawRow, "date" | "serial">) =>
  `${ROW_PREFIX}-${row.date.replace(/\//g, "")}-${String(row.serial).padStart(4, "0")}`;

const buildIdempotencyKey = (row: Pick<RawRow, "date" | "serial">) =>
  `legacy_snk_sale_${row.date.replace(/\//g, "_")}_${row.serial}`;

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

const toNumber = (value: string | number | null | undefined) => {
  const parsed = Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toQty = (value: number) => Number(value.toFixed(3));
const toMoney = (value: number) => Number(value.toFixed(2));

const normalizeNameKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const titleCase = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const DESCRIPTION_ALIASES: Record<string, string> = {
  [normalizeNameKey("Kitkat")]: normalizeNameKey("Kit Kat Chocolate"),
  [normalizeNameKey("Dairy Milk")]: normalizeNameKey("Dairy Milk Chocolate"),
  [normalizeNameKey("Budhweiser Non Apple")]: normalizeNameKey("Budweiser Normal"),
  [normalizeNameKey("Sprite")]: normalizeNameKey("Sprite Drink"),
  [normalizeNameKey("Water bottel")]: normalizeNameKey("Water Bottel"),
  [normalizeNameKey("To Yummy Chips")]: normalizeNameKey("To Yummy Chips ( Spicy Chili)")
};

const parseRows = (csvFilePath: string) => {
  const content = readFileSync(csvFilePath, "utf8");
  const parsedCsvRows = parseCsvRows(content);
  const dataRows: RawRow[] = [];
  const skipped: Array<{ rowIndex: number; reason: string }> = [];

  for (let index = 0; index < parsedCsvRows.length; index += 1) {
    const row = parsedCsvRows[index];
    const serial = Number(row[0]?.trim());
    if (!Number.isFinite(serial)) {
      continue;
    }

    const date = row[1]?.trim() ?? "";
    const description = row[3]?.trim() ?? "";
    const rate = toMoney(toNumber(row[4]));
    const quantity = toQty(toNumber(row[5]));
    const totalAmount = toMoney(toNumber(row[6]));
    const remarks = (row[7] ?? "").trim();

    if (!date || !description || quantity <= 0 || totalAmount <= 0) {
      skipped.push({ rowIndex: index + 1, reason: "missing_required_values" });
      continue;
    }

    dataRows.push({
      serial,
      date,
      description,
      rate,
      quantity,
      totalAmount,
      remarks
    });
  }

  return { dataRows, skipped };
};

const parseDateToIso = (input: string, serial: number) => {
  const normalized = input.trim().replace(/-/g, "/");
  const parts = normalized.split("/");
  if (parts.length !== 3) {
    throw new Error(`Invalid date format "${input}"`);
  }
  let year = 0;
  let month = 0;
  let day = 0;

  if (parts[0].length === 4) {
    year = Number(parts[0]);
    month = Number(parts[1]);
    day = Number(parts[2]);
  } else if (parts[2].length === 4) {
    year = Number(parts[2]);
    const first = Number(parts[0]);
    const second = Number(parts[1]);
    // Support both MM/DD/YYYY and DD/MM/YYYY inputs.
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else {
      month = first;
      day = second;
    }
  }

  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) {
    throw new Error(`Invalid date parts "${input}"`);
  }

  const minuteOffset = serial % 60;
  const secondOffset = Math.floor(serial / 60) % 60;
  const isoWithOffset = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}T12:${String(minuteOffset).padStart(2, "0")}:${String(secondOffset).padStart(2, "0")}+05:30`;
  const parsed = new Date(isoWithOffset);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse sale date "${input}"`);
  }
  return parsed.toISOString();
};

const resolveCsvPath = () => {
  const argPath = process.argv[2]?.trim();
  const fileName = argPath || DEFAULT_CSV_FILE;
  const candidates = argPath
    ? [path.resolve(process.cwd(), fileName), path.resolve(process.cwd(), "..", fileName)]
    : [path.resolve(process.cwd(), "..", fileName), path.resolve(process.cwd(), fileName)];
  const existing = candidates.find((entry) => existsSync(entry));
  return existing ?? candidates[0];
};

const parsePayments = (remarks: string, totalAmount: number): ParsedPayment[] => {
  const lower = remarks.toLowerCase();

  const readSplit = (pattern: RegExp) => {
    const match = lower.match(pattern);
    return match ? toMoney(toNumber(match[1])) : 0;
  };

  const cashAmount = readSplit(/cash\s*[-:]\s*([0-9]+(?:\.[0-9]+)?)/i);
  const upiAmount = readSplit(/(?:gpay|upi|phonepe|paytm)\s*[-:]\s*([0-9]+(?:\.[0-9]+)?)/i);
  const cardAmount = readSplit(/(?:card|credit|debit)\s*[-:]\s*([0-9]+(?:\.[0-9]+)?)/i);
  const splitTotal = toMoney(cashAmount + upiAmount + cardAmount);

  const payments: ParsedPayment[] = [];
  if (splitTotal > 0 && Math.abs(splitTotal - totalAmount) <= 0.05) {
    if (cashAmount > 0) {
      payments.push({ mode: "cash", amount: cashAmount, referenceNo: null });
    }
    if (upiAmount > 0) {
      payments.push({ mode: "upi", amount: upiAmount, referenceNo: `LEGACY-UPI-${randomUUID().slice(0, 8)}` });
    }
    if (cardAmount > 0) {
      payments.push({ mode: "card", amount: cardAmount, referenceNo: `LEGACY-CARD-${randomUUID().slice(0, 8)}` });
    }
    return payments;
  }

  let mode: ParsedPayment["mode"] = "cash";
  if (lower.includes("gpay") || lower.includes("upi") || lower.includes("phonepe") || lower.includes("paytm")) {
    mode = "upi";
  } else if (lower.includes("card")) {
    mode = "card";
  }

  payments.push({
    mode,
    amount: totalAmount,
    referenceNo: mode === "cash" ? null : `LEGACY-${mode.toUpperCase()}-${randomUUID().slice(0, 8)}`
  });
  return payments;
};

const chooseStaff = async () => {
  const userRepository = AppDataSource.getRepository(User);
  const users = await userRepository.find({
    where: [{ role: UserRole.SNOOKER_STAFF, isActive: true }, { role: UserRole.ADMIN, isActive: true }],
    order: { createdAt: "ASC" }
  });
  if (!users.length) {
    throw new Error("No active snooker_staff/admin user found for import.");
  }
  return users.find((entry) => entry.role === UserRole.SNOOKER_STAFF) ?? users[0];
};

const resolveProducts = async (rows: RawRow[]) => {
  const productRepository = AppDataSource.getRepository(Product);
  const supplierRepository = AppDataSource.getRepository(Supplier);
  const products = await productRepository.find({ order: { name: "ASC" } });

  const supplier =
    (await supplierRepository.findOne({
      where: { name: "Legacy Sheet Supplier" }
    })) ??
    (await supplierRepository.findOne({ where: { isActive: true }, order: { createdAt: "ASC" } }));

  const byKey = new Map<string, Product>();
  for (const product of products) {
    byKey.set(normalizeNameKey(product.name), product);
  }

  const resolved = new Map<string, Product>();
  const createdProducts: Product[] = [];
  const soldQuantityByProductId = new Map<string, number>();

  const findProduct = (description: string) => {
    const normalized = normalizeNameKey(description);
    const aliasKey = DESCRIPTION_ALIASES[normalized] ?? normalized;

    if (byKey.has(aliasKey)) {
      return byKey.get(aliasKey) ?? null;
    }

    if (byKey.has(normalized)) {
      return byKey.get(normalized) ?? null;
    }

    const tokenSet = new Set(aliasKey.split(" ").filter(Boolean));
    let best: { product: Product; score: number } | null = null;
    for (const [nameKey, product] of byKey.entries()) {
      const nameTokens = nameKey.split(" ").filter(Boolean);
      const intersection = nameTokens.filter((token) => tokenSet.has(token)).length;
      const union = new Set([...nameTokens, ...tokenSet]).size;
      const score = union > 0 ? intersection / union : 0;
      if (!best || score > best.score) {
        best = { product, score };
      }
    }
    if (best && best.score >= 0.6) {
      return best.product;
    }
    return null;
  };

  for (const row of rows) {
    const normalized = normalizeNameKey(row.description);
    if (resolved.has(normalized)) {
      continue;
    }

    let product = findProduct(row.description);
    if (!product) {
      product = productRepository.create({
        name: titleCase(row.description),
        category: "Snooker",
        sku: null,
        packSize: null,
        unit: "pcs",
        minStock: 0,
        purchaseUnitPrice: row.rate > 0 ? row.rate : row.totalAmount,
        sellingPrice: row.rate > 0 ? row.rate : row.totalAmount,
        targetSection: "gaming",
        currentStock: 0,
        dipAndDashStock: 0,
        gamingStock: 0,
        defaultSupplierId: supplier?.id ?? null,
        isActive: true
      });
      const saved = await productRepository.save(product);
      byKey.set(normalizeNameKey(saved.name), saved);
      createdProducts.push(saved);
      product = saved;
    }
    resolved.set(normalized, product);
  }

  for (const row of rows) {
    const product = resolved.get(normalizeNameKey(row.description));
    if (!product) {
      continue;
    }
    const existing = soldQuantityByProductId.get(product.id) ?? 0;
    soldQuantityByProductId.set(product.id, toQty(existing + row.quantity));
  }

  const topupProducts: Product[] = [];
  for (const [productId, soldQty] of soldQuantityByProductId.entries()) {
    const product = [...resolved.values()].find((entry) => entry.id === productId);
    if (!product) {
      continue;
    }

    const currentStock = toQty(Number(product.currentStock ?? 0));
    let dipAndDashStock = toQty(Number(product.dipAndDashStock ?? 0));
    let gamingStock = toQty(Number(product.gamingStock ?? 0));

    if (product.targetSection === "gaming") {
      gamingStock = currentStock;
      dipAndDashStock = 0;
    } else if (product.targetSection === "dip_and_dash") {
      gamingStock = 0;
      dipAndDashStock = currentStock;
    } else {
      const sectionTotal = toQty(dipAndDashStock + gamingStock);
      if (Math.abs(sectionTotal - currentStock) > 0.001) {
        gamingStock = toQty(Math.max(currentStock - dipAndDashStock, 0));
      }
    }

    const deficit = toQty(Math.max(soldQty - gamingStock, 0));
    if (deficit <= 0) {
      continue;
    }

    if (product.targetSection === "dip_and_dash") {
      product.targetSection = "gaming";
      dipAndDashStock = 0;
      gamingStock = currentStock;
    }

    product.gamingStock = toQty(gamingStock + deficit);
    product.currentStock = toQty((product.targetSection === "both" ? dipAndDashStock : 0) + product.gamingStock);
    if (!Number(product.sellingPrice) || Number(product.sellingPrice) <= 0) {
      product.sellingPrice = Number(product.purchaseUnitPrice) > 0 ? Number(product.purchaseUnitPrice) : 0;
    }
    topupProducts.push(product);
  }

  if (topupProducts.length) {
    await productRepository.save(topupProducts);
  }

  return {
    resolved,
    createdProducts,
    topupProducts
  };
};

const run = async () => {
  const csvPath = resolveCsvPath();

  if (!existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const { dataRows, skipped } = parseRows(csvPath);
  if (!dataRows.length) {
    throw new Error("No valid sales rows found in CSV.");
  }

  await AppDataSource.initialize();
  const invoicesService = new InvoicesService();
  const invoiceRepository = AppDataSource.getRepository(Invoice);

  try {
    const invoiceNumbers = dataRows.map((row) => buildInvoiceNumber(row));
    const existingInvoiceRows = invoiceNumbers.length
      ? await invoiceRepository.find({
          where: {
            invoiceNumber: In(invoiceNumbers)
          },
          select: {
            invoiceNumber: true
          }
        })
      : [];
    const existingInvoiceNumberSet = new Set(existingInvoiceRows.map((entry) => entry.invoiceNumber));
    const rowsToImport = dataRows.filter((row) => !existingInvoiceNumberSet.has(buildInvoiceNumber(row)));

    const staff = await chooseStaff();
    const { resolved, createdProducts, topupProducts } = rowsToImport.length
      ? await resolveProducts(rowsToImport)
      : { resolved: new Map<string, Product>(), createdProducts: [], topupProducts: [] };

    let createdInvoices = 0;
    let existingInvoices = 0;
    let failedRows = 0;
    const failures: Array<{ serial: number; reason: string }> = [];

    for (const row of dataRows) {
      const invoiceNumber = buildInvoiceNumber(row);
      if (existingInvoiceNumberSet.has(invoiceNumber)) {
        existingInvoices += 1;
        continue;
      }

      const product = resolved.get(normalizeNameKey(row.description));
      if (!product) {
        failedRows += 1;
        failures.push({ serial: row.serial, reason: `Product mapping missing for ${row.description}` });
        continue;
      }

      const sourceCreatedAt = parseDateToIso(row.date, row.serial);
      const invoiceDate = sourceCreatedAt;
      const idempotencyKey = buildIdempotencyKey(row);
      const lineUnitPrice = row.rate > 0 ? row.rate : toMoney(row.totalAmount / Math.max(row.quantity, 1));
      const payments = parsePayments(row.remarks, row.totalAmount);

      try {
        const result = await invoicesService.createInvoiceFromSync(
          {
            idempotencyKey,
            invoiceNumber,
            orderReference: `Legacy Snooker Product Sale #${row.serial}`,
            customerName: "Walk-in",
            customerPhone: null,
            branchId: "snooker",
            deviceId: "legacy-csv-import",
            orderType: "snooker",
            tableLabel: "Snooker Counter",
            kitchenStatus: "served",
            status: "paid",
            paymentMode: payments[0]?.mode ?? "cash",
            subtotal: row.totalAmount,
            itemDiscountAmount: 0,
            couponDiscountAmount: 0,
            manualDiscountAmount: 0,
            taxAmount: 0,
            totalAmount: row.totalAmount,
            couponCode: null,
            notes: row.remarks || null,
            customerSnapshot: {
              name: "Walk-in",
              phone: null
            },
            totalsSnapshot: {
              subtotal: row.totalAmount,
              totalAmount: row.totalAmount
            },
            sourceCreatedAt,
            lines: [
              {
                lineType: "product",
                referenceId: product.id,
                nameSnapshot: product.name,
                quantity: row.quantity,
                unitPrice: lineUnitPrice,
                discountAmount: 0,
                gstPercentage: 0,
                lineTotal: row.totalAmount,
                meta: {
                  legacyImport: true,
                  sourceCsv: path.basename(csvPath),
                  sourceDescription: row.description,
                  sourceSerial: row.serial
                }
              }
            ],
            payments: payments.map((payment) => ({
              mode: payment.mode,
              status: "success",
              amount: payment.amount,
              receivedAmount: payment.amount,
              changeAmount: 0,
              referenceNo: payment.referenceNo,
              paidAt: invoiceDate
            })),
            usageEvents: []
          },
          {
            id: staff.id,
            role: staff.role
          }
        );

        await invoiceRepository.update(
          { id: result.invoice.id },
          {
            createdAt: new Date(invoiceDate),
            updatedAt: new Date(invoiceDate),
            sourceCreatedAt: new Date(invoiceDate)
          }
        );

        createdInvoices += result.created ? 1 : 0;
      } catch (error) {
        failedRows += 1;
        failures.push({
          serial: row.serial,
          reason: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    const importedInvoiceCount = await invoiceRepository.count({
      where: {
        invoiceNumber: In(dataRows.map((row) => `${ROW_PREFIX}-${row.date.replace(/\//g, "")}-${String(row.serial).padStart(4, "0")}`))
      }
    });

    console.log(
      JSON.stringify(
        {
          success: true,
          csvPath,
          parsedRows: dataRows.length,
          pendingImportRows: rowsToImport.length,
          skippedRows: skipped.length,
          createdProducts: createdProducts.length,
          toppedUpProducts: topupProducts.length,
          createdInvoices,
          existingInvoices,
          failedRows,
          importedInvoiceCount,
          sampleFailures: failures.slice(0, 10)
        },
        null,
        2
      )
    );
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error("[IMPORT_SNOOKER_PRODUCT_SALES_FAILED]", error);
  process.exit(1);
});
