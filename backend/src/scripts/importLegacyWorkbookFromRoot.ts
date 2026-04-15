import "reflect-metadata";

import { existsSync, readFileSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

import { AppDataSource } from "../database/data-source";
import { env } from "../config/env";
import { UserRole } from "../constants/roles";
import { InvoiceLine } from "../modules/invoices/invoice-line.entity";
import { Invoice } from "../modules/invoices/invoice.entity";
import { IngredientsService } from "../modules/ingredients/ingredients.service";
import { Product } from "../modules/procurement/product.entity";
import { ProcurementService } from "../modules/procurement/procurement.service";
import { PurchaseOrder } from "../modules/procurement/purchase-order.entity";
import { Supplier } from "../modules/procurement/supplier.entity";
import { User } from "../modules/users/user.entity";

const LEGACY_SUPPLIER_NAME = "Legacy Sheet Supplier";
const LEGACY_SNOOKER_SALES_INVOICE_NUMBER = "INV-LEGACY-SNK-SHEET";
const LEGACY_SNOOKER_PURCHASE_NOTES = [
  "Legacy workbook import - snooker products",
  "Legacy workbook import - snooker opening stock",
  "Legacy workbook import - snooker summary purchase"
];

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

const normalizeHeaderKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

const normalizeNameKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const toNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

type SnookerSummaryRow = {
  productName: string;
  openingStock: number;
  purchaseRate: number;
  purchaseQty: number;
  sellingRate: number;
  salesQty: number;
  salesValue: number;
  closingStock: number;
  summaryDate: string;
};

const toCsvBuffer = (rows: string[][]) => {
  const escapeCell = (value: string) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
  const content = rows.map((row) => row.map((cell) => escapeCell(cell)).join(",")).join("\n");
  return Buffer.from(`\uFEFF${content}`, "utf-8");
};

const hasCsvDataRows = (content: Buffer) => {
  const rows = content
    .toString("utf-8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  if (rows.length <= 1) {
    return false;
  }
  return rows.slice(1).some((line) => line.length > 0);
};

const resolveWorkbookPath = () => {
  const input = process.argv[2]?.trim();
  if (input) {
    return path.resolve(process.cwd(), input);
  }
  return path.resolve(process.cwd(), "..", "Dip Nd Dash & snookers Snacks & beavarge -13-Apr-26.xlsx");
};

const runPrepareScript = (workbookPath: string, outputDir: string) => {
  const scriptPath = path.resolve(process.cwd(), "scripts", "prepare_legacy_workbook_import.py");
  if (!existsSync(scriptPath)) {
    throw new Error(`Prepare script not found at ${scriptPath}`);
  }

  const command = process.platform === "win32" ? "python" : "python3";
  const result = spawnSync(command, [scriptPath, "--workbook", workbookPath, "--outdir", outputDir], {
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error("Failed to prepare CSV files from workbook.");
  }
};

const readCsvBuffer = (filePath: string) => {
  if (!existsSync(filePath)) {
    return null;
  }
  const content = readFileSync(filePath);
  return hasCsvDataRows(content) ? content : null;
};

const parseSnookerSummaryRows = (csvBuffer: Buffer | null) => {
  if (!csvBuffer) {
    return [] as SnookerSummaryRow[];
  }

  const content = csvBuffer.toString("utf-8").replace(/^\uFEFF/, "").trim();
  if (!content) {
    return [] as SnookerSummaryRow[];
  }

  const rows = parseCsvRows(content);
  if (rows.length <= 1) {
    return [] as SnookerSummaryRow[];
  }

  const header = rows[0];
  const headerIndexMap = new Map<string, number>();
  header.forEach((cell, index) => {
    headerIndexMap.set(normalizeHeaderKey(cell), index);
  });

  const required = [
    "product_name",
    "opening_stock",
    "purchase_rate",
    "purchase_qty",
    "selling_rate",
    "sales_qty",
    "sales_value",
    "closing_stock",
    "summary_date"
  ];
  const missing = required.filter((key) => !headerIndexMap.has(key));
  if (missing.length) {
    throw new Error(`snooker_summary.csv is missing required columns: ${missing.join(", ")}`);
  }

  const readCell = (row: string[], key: string) => {
    const index = headerIndexMap.get(key);
    if (index === undefined) {
      return "";
    }
    return String(row[index] ?? "").trim();
  };

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => ({
      productName: readCell(row, "product_name"),
      openingStock: toNumber(readCell(row, "opening_stock")),
      purchaseRate: toNumber(readCell(row, "purchase_rate")),
      purchaseQty: toNumber(readCell(row, "purchase_qty")),
      sellingRate: toNumber(readCell(row, "selling_rate")),
      salesQty: toNumber(readCell(row, "sales_qty")),
      salesValue: toNumber(readCell(row, "sales_value")),
      closingStock: toNumber(readCell(row, "closing_stock")),
      summaryDate: readCell(row, "summary_date")
    }))
    .filter((row) => row.productName.length > 0);
};

type GroupedPurchaseCsv = {
  supplierName: string;
  date: string;
  note: string;
  buffer: Buffer;
};

const splitPurchaseCsvByGroup = (csvBuffer: Buffer) => {
  const content = csvBuffer.toString("utf-8").replace(/^\uFEFF/, "").trim();
  if (!content) {
    return [] as GroupedPurchaseCsv[];
  }

  const rows = parseCsvRows(content);
  if (rows.length <= 1) {
    return [] as GroupedPurchaseCsv[];
  }

  const header = rows[0];
  const dateIndex = header.findIndex((cell) => cell.trim().toLowerCase() === "purchase_date");
  const supplierIndex = header.findIndex((cell) => cell.trim().toLowerCase() === "supplier_name");
  const noteIndex = header.findIndex((cell) => cell.trim().toLowerCase() === "purchase_note");
  if (dateIndex < 0 || supplierIndex < 0 || noteIndex < 0) {
    return [] as GroupedPurchaseCsv[];
  }

  const grouped = new Map<string, { supplierName: string; date: string; note: string; rows: string[][] }>();
  rows.slice(1).forEach((row) => {
    const date = (row[dateIndex] ?? "").trim();
    const supplierName = (row[supplierIndex] ?? "").trim();
    const note = (row[noteIndex] ?? "").trim();
    if (!date || !supplierName) {
      return;
    }
    const key = `${supplierName.toLowerCase()}|${date}|${note}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.rows.push(row);
      return;
    }
    grouped.set(key, {
      supplierName,
      date,
      note,
      rows: [row]
    });
  });

  return Array.from(grouped.values())
    .sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.note.localeCompare(b.note);
    })
    .map((group) => ({
      supplierName: group.supplierName,
      date: group.date,
      note: group.note,
      buffer: toCsvBuffer([header, ...group.rows])
    }));
};

const ensureLegacySupplier = async (procurementService: ProcurementService) => {
  const supplierRepo = AppDataSource.getRepository(Supplier);
  const existing = await supplierRepo
    .createQueryBuilder("supplier")
    .where("LOWER(supplier.name) = LOWER(:name)", { name: LEGACY_SUPPLIER_NAME })
    .getOne();
  if (existing) {
    return existing;
  }

  await procurementService.createSupplier({
    name: LEGACY_SUPPLIER_NAME,
    storeName: "Legacy Import",
    phone: "9000000000",
    address: "Auto-created for legacy workbook import",
    isActive: true
  });

  const created = await supplierRepo
    .createQueryBuilder("supplier")
    .where("LOWER(supplier.name) = LOWER(:name)", { name: LEGACY_SUPPLIER_NAME })
    .getOne();

  if (!created) {
    throw new Error("Unable to create supplier required for legacy import.");
  }

  return created;
};

const findImportUserId = async () => {
  const userRepo = AppDataSource.getRepository(User);
  const seedUsername = env.SEED_ADMIN_USERNAME?.trim().toLowerCase() ?? "";

  if (seedUsername) {
    const seedAdmin = await userRepo
      .createQueryBuilder("user")
      .where("user.role = :role", { role: UserRole.ADMIN })
      .andWhere("LOWER(user.username) = :username", { username: seedUsername })
      .getOne();
    if (seedAdmin) {
      return seedAdmin.id;
    }
  }

  const fallbackAdmin = await userRepo.findOne({
    where: { role: UserRole.ADMIN },
    order: { createdAt: "ASC" }
  });
  if (!fallbackAdmin) {
    throw new Error("No admin user found to mark legacy purchase imports.");
  }

  return fallbackAdmin.id;
};

const purchaseGroupAlreadyImported = async (group: Pick<GroupedPurchaseCsv, "supplierName" | "date" | "note">) => {
  const purchaseOrderRepo = AppDataSource.getRepository(PurchaseOrder);
  const existingCount = await purchaseOrderRepo
    .createQueryBuilder("purchaseOrder")
    .leftJoin("purchaseOrder.supplier", "supplier")
    .where("LOWER(supplier.name) = LOWER(:supplierName)", { supplierName: group.supplierName })
    .andWhere("purchaseOrder.purchaseDate = :purchaseDate", { purchaseDate: group.date })
    .andWhere("COALESCE(purchaseOrder.note, '') = :purchaseNote", { purchaseNote: group.note })
    .getCount();

  return existingCount > 0;
};

const deleteLegacySnookerPurchaseOrders = async (supplierName: string) => {
  const purchaseOrderRepo = AppDataSource.getRepository(PurchaseOrder);
  const legacyOrders = await purchaseOrderRepo
    .createQueryBuilder("purchaseOrder")
    .leftJoin("purchaseOrder.supplier", "supplier")
    .select("purchaseOrder.id", "id")
    .where("LOWER(supplier.name) = LOWER(:supplierName)", { supplierName })
    .andWhere("purchaseOrder.note IN (:...notes)", { notes: LEGACY_SNOOKER_PURCHASE_NOTES })
    .getRawMany<{ id: string }>();

  const ids = legacyOrders.map((row) => row.id);
  if (!ids.length) {
    return 0;
  }

  // Cascades and removes related purchase_order_lines.
  await purchaseOrderRepo.delete(ids);
  return ids.length;
};

const upsertLegacySnookerSalesAndStock = async (summaryRows: SnookerSummaryRow[], staffUserId: string) => {
  if (!summaryRows.length) {
    return {
      updatedProducts: 0,
      missingProducts: [] as string[],
      salesLines: 0,
      salesAmount: 0
    };
  }

  const productRepo = AppDataSource.getRepository(Product);

  const products = await productRepo.find();
  const productMap = new Map(products.map((product) => [normalizeNameKey(product.name), product]));
  const missingProducts: string[] = [];

  const matchedRows: Array<SnookerSummaryRow & { product: Product }> = [];
  summaryRows.forEach((row) => {
    const product = productMap.get(normalizeNameKey(row.productName));
    if (!product) {
      missingProducts.push(row.productName);
      return;
    }
    matchedRows.push({ ...row, product });
  });

  if (!matchedRows.length) {
    return {
      updatedProducts: 0,
      missingProducts,
      salesLines: 0,
      salesAmount: 0
    };
  }

  await AppDataSource.transaction(async (manager) => {
    const updateProducts = matchedRows.map((row) => {
      const product = row.product;
      product.targetSection = "gaming";
      product.purchaseUnitPrice = row.purchaseRate > 0 ? Number(row.purchaseRate.toFixed(2)) : product.purchaseUnitPrice;
      product.sellingPrice = row.sellingRate > 0 ? Number(row.sellingRate.toFixed(2)) : product.sellingPrice;
      product.currentStock = Number(row.closingStock.toFixed(3));
      product.dipAndDashStock = 0;
      product.gamingStock = Number(row.closingStock.toFixed(3));
      product.isActive = true;
      return product;
    });
    await manager.save(Product, updateProducts);

    const salesRows = matchedRows.filter((row) => row.salesQty > 0 || row.salesValue > 0);
    const salesAmount = Number(
      salesRows.reduce((acc, row) => acc + Math.max(0, row.salesValue), 0).toFixed(2)
    );

    let invoice = await manager.findOne(Invoice, {
      where: { invoiceNumber: LEGACY_SNOOKER_SALES_INVOICE_NUMBER }
    });

    const latestSummaryDate = salesRows
      .map((row) => row.summaryDate)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .at(-1);
    const sourceDate = latestSummaryDate ? new Date(`${latestSummaryDate}T12:00:00.000Z`) : new Date();

    if (!invoice) {
      invoice = manager.create(Invoice, {
        invoiceNumber: LEGACY_SNOOKER_SALES_INVOICE_NUMBER,
        idempotencyKey: "legacy_sheet_snooker_sales",
        orderReference: "Legacy workbook sales import",
        customerId: null,
        staffId: staffUserId,
        branchId: "legacy-import",
        deviceId: "legacy-sheet",
        orderType: "snooker",
        tableLabel: null,
        kitchenStatus: "served",
        status: "paid",
        paymentMode: "cash",
        subtotal: salesAmount,
        itemDiscountAmount: 0,
        couponDiscountAmount: 0,
        manualDiscountAmount: 0,
        taxAmount: 0,
        totalAmount: salesAmount,
        couponCode: null,
        notes: "Legacy workbook import - snooker summary sales",
        customerSnapshot: null,
        totalsSnapshot: null,
        linesSnapshot: null,
        syncedFromPos: false,
        sourceCreatedAt: sourceDate,
        cancelledAt: null,
        cancelledReason: null,
        refundedAt: null,
        refundedReason: null
      });
    } else {
      invoice.staffId = staffUserId;
      invoice.orderType = "snooker";
      invoice.kitchenStatus = "served";
      invoice.status = "paid";
      invoice.paymentMode = "cash";
      invoice.subtotal = salesAmount;
      invoice.itemDiscountAmount = 0;
      invoice.couponDiscountAmount = 0;
      invoice.manualDiscountAmount = 0;
      invoice.taxAmount = 0;
      invoice.totalAmount = salesAmount;
      invoice.orderReference = "Legacy workbook sales import";
      invoice.notes = "Legacy workbook import - snooker summary sales";
      invoice.sourceCreatedAt = sourceDate;
    }

    const savedInvoice = await manager.save(Invoice, invoice);
    await manager.delete(InvoiceLine, { invoiceId: savedInvoice.id });

    if (salesRows.length) {
      const invoiceLines = salesRows.map((row) => {
        const salesQty = row.salesQty > 0 ? row.salesQty : 0;
        const salesValue = Math.max(0, row.salesValue);
        const derivedUnitPrice =
          salesQty > 0 ? Number((salesValue / salesQty).toFixed(2)) : Number(row.sellingRate.toFixed(2));

        return manager.create(InvoiceLine, {
          invoiceId: savedInvoice.id,
          lineType: "product",
          referenceId: row.product.id,
          nameSnapshot: row.product.name,
          quantity: Number(salesQty.toFixed(3)),
          unitPrice: derivedUnitPrice,
          discountAmount: 0,
          gstPercentage: 0,
          lineTotal: Number(salesValue.toFixed(2)),
          meta: {
            source: "legacy_sheet",
            summaryDate: row.summaryDate || null
          }
        });
      });
      await manager.save(InvoiceLine, invoiceLines);
    }

    await manager
      .createQueryBuilder()
      .update(Invoice)
      .set({
        createdAt: sourceDate,
        updatedAt: sourceDate
      })
      .where("id = :id", { id: savedInvoice.id })
      .execute();
  });

  return {
    updatedProducts: matchedRows.length,
    missingProducts,
    salesLines: matchedRows.filter((row) => row.salesQty > 0 || row.salesValue > 0).length,
    salesAmount: Number(
      matchedRows.reduce((acc, row) => acc + Math.max(0, row.salesValue), 0).toFixed(2)
    )
  };
};

const main = async () => {
  const workbookPath = resolveWorkbookPath();
  const outputDir = path.resolve(process.cwd(), "uploads", "legacy-workbook");

  console.info(`Preparing legacy workbook import from: ${workbookPath}`);
  runPrepareScript(workbookPath, outputDir);

  const additionalCsvPath = path.resolve(outputDir, "additional_ingredients.csv");
  const productCsvPath = path.resolve(outputDir, "products.csv");
  const purchaseCsvPath = path.resolve(outputDir, "purchases.csv");
  const snookerSummaryCsvPath = path.resolve(outputDir, "snooker_summary.csv");

  const additionalCsv = readCsvBuffer(additionalCsvPath);
  const productCsv = readCsvBuffer(productCsvPath);
  const purchaseCsv = readCsvBuffer(purchaseCsvPath);
  const snookerSummaryCsv = readCsvBuffer(snookerSummaryCsvPath);
  const snookerSummaryRows = parseSnookerSummaryRows(snookerSummaryCsv);

  if (!additionalCsv && !productCsv && !purchaseCsv && !snookerSummaryRows.length) {
    console.info("No importable rows found in generated CSV files. Nothing to import.");
    return;
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const ingredientsService = new IngredientsService();
  const procurementService = new ProcurementService();

  await ensureLegacySupplier(procurementService);
  const createdByUserId = await findImportUserId();

  if (additionalCsv) {
    const summary = await ingredientsService.bulkImportIngredientsFromCsv(additionalCsv, "additional");
    console.info("Additional ingredient import summary:", summary);
  } else {
    console.info("Skipped additional ingredient import (no rows).");
  }

  if (productCsv) {
    const summary = await procurementService.bulkImportProductsFromCsv(productCsv);
    console.info("Product import summary:", summary);
  } else {
    console.info("Skipped product import (no rows).");
  }

  if (purchaseCsv) {
    const removedLegacySnookerOrders = await deleteLegacySnookerPurchaseOrders(LEGACY_SUPPLIER_NAME);
    if (removedLegacySnookerOrders > 0) {
      console.info("Removed existing legacy snooker purchase orders:", { removedLegacySnookerOrders });
    }

    const groupedPurchases = splitPurchaseCsvByGroup(purchaseCsv);
    if (!groupedPurchases.length) {
      console.info("Skipped purchase import (unable to parse dated rows).");
    } else {
      let totalInsertedOrders = 0;
      let totalInsertedLines = 0;
      let totalSkippedOrders = 0;
      for (const group of groupedPurchases) {
        const alreadyImported = await purchaseGroupAlreadyImported(group);
        if (alreadyImported) {
          totalSkippedOrders += 1;
          console.info(`Skipped purchase group [${group.date}] (${group.note || "no-note"}): already imported.`);
          continue;
        }
        const summary = await procurementService.bulkImportPurchaseOrderFromCsv(group.buffer, createdByUserId);
        totalInsertedOrders += 1;
        totalInsertedLines += summary.lineCount;
        console.info(`Purchase import summary [${group.date}] (${group.note || "no-note"}):`, summary);
      }
      console.info("Purchase import totals:", {
        insertedPurchaseOrders: totalInsertedOrders,
        insertedLines: totalInsertedLines,
        skippedExistingPurchaseOrders: totalSkippedOrders
      });
    }
  } else {
    console.info("Skipped purchase import (no rows).");
  }

  if (snookerSummaryRows.length) {
    const summary = await upsertLegacySnookerSalesAndStock(snookerSummaryRows, createdByUserId);
    console.info("Snooker summary stock/sales reconciliation:", summary);
  } else {
    console.info("Skipped snooker summary reconciliation (no rows).");
  }

  console.info(`Legacy workbook import completed. Generated CSV files are in ${outputDir}`);
};

main()
  .catch((error) => {
    console.error("Legacy workbook import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });
