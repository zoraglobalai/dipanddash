import "reflect-metadata";

import { existsSync, readFileSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

import { AppDataSource } from "../database/data-source";
import { env } from "../config/env";
import { UserRole } from "../constants/roles";
import { IngredientsService } from "../modules/ingredients/ingredients.service";
import { ProcurementService } from "../modules/procurement/procurement.service";
import { Supplier } from "../modules/procurement/supplier.entity";
import { PurchaseOrder } from "../modules/procurement/purchase-order.entity";
import { User } from "../modules/users/user.entity";

const resolveRootPath = (...segments: string[]) => path.resolve(process.cwd(), "..", ...segments);

const resolveWorkbookPath = (argValue: string | undefined, fallbackFileName: string) => {
  if (!argValue?.trim()) {
    return resolveRootPath(fallbackFileName);
  }

  const raw = argValue.trim();
  if (path.isAbsolute(raw)) {
    return raw;
  }

  const fromBackendParent = resolveRootPath(raw);
  if (existsSync(fromBackendParent)) {
    return fromBackendParent;
  }
  return path.resolve(process.cwd(), raw);
};

const getCliOptions = () => {
  const args = process.argv.slice(2);
  const replaceExisting = args.includes("--replace-existing") || args.includes("--force-reimport");
  const workbookArg = args.find((arg) => !arg.startsWith("--"));
  return { replaceExisting, workbookArg };
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

const readCsvBuffer = (filePath: string) => {
  if (!existsSync(filePath)) {
    return null;
  }
  const content = readFileSync(filePath);
  return hasCsvDataRows(content) ? content : null;
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

const toCsvBuffer = (rows: string[][]) => {
  const escapeCell = (value: string) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
  const content = rows.map((row) => row.map((cell) => escapeCell(cell)).join(",")).join("\n");
  return Buffer.from(`\uFEFF${content}`, "utf-8");
};

const runPrepareScript = (workbookPath: string, outputDir: string) => {
  const scriptPath = path.resolve(process.cwd(), "scripts", "prepare_purchase_workbook_import.py");
  if (!existsSync(scriptPath)) {
    throw new Error(`Prepare script not found at ${scriptPath}`);
  }

  const command = process.platform === "win32" ? "python" : "python3";
  const result = spawnSync(command, [scriptPath, "--workbook", workbookPath, "--outdir", outputDir], {
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error("Failed to prepare CSV files from purchase workbook.");
  }
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
      const supplierCompare = a.supplierName.localeCompare(b.supplierName);
      if (supplierCompare !== 0) {
        return supplierCompare;
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

const supplierPhoneFromName = (supplierName: string) => {
  const hash = supplierName
    .trim()
    .toLowerCase()
    .split("")
    .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 1_000_000_000, 97);
  return `9${String(hash).padStart(9, "0").slice(0, 9)}`;
};

const ensureSuppliersFromPurchaseCsv = async (csvBuffer: Buffer, procurementService: ProcurementService) => {
  const content = csvBuffer.toString("utf-8").replace(/^\uFEFF/, "").trim();
  if (!content) {
    return {
      createdSuppliers: 0,
      totalSuppliersInCsv: 0
    };
  }

  const rows = parseCsvRows(content);
  if (rows.length <= 1) {
    return {
      createdSuppliers: 0,
      totalSuppliersInCsv: 0
    };
  }

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const supplierIndex = header.indexOf("supplier_name");
  if (supplierIndex < 0) {
    throw new Error("purchases.csv is missing supplier_name column.");
  }

  const supplierNames = Array.from(
    new Set(
      rows
        .slice(1)
        .map((row) => String(row[supplierIndex] ?? "").trim())
        .filter((name) => name.length > 0)
    )
  );

  if (!supplierNames.length) {
    return {
      createdSuppliers: 0,
      totalSuppliersInCsv: 0
    };
  }

  const supplierRepo = AppDataSource.getRepository(Supplier);
  const existingSuppliers = await supplierRepo
    .createQueryBuilder("supplier")
    .where("LOWER(supplier.name) IN (:...nameKeys)", { nameKeys: supplierNames.map((name) => name.toLowerCase()) })
    .getMany();
  const existingNameKeys = new Set(existingSuppliers.map((supplier) => supplier.name.trim().toLowerCase()));

  let createdSuppliers = 0;
  for (const supplierName of supplierNames) {
    const nameKey = supplierName.toLowerCase();
    if (existingNameKeys.has(nameKey)) {
      continue;
    }

    await procurementService.createSupplier({
      name: supplierName,
      storeName: supplierName,
      phone: supplierPhoneFromName(supplierName),
      address: "Auto-created from purchase workbook import",
      isActive: true
    });
    existingNameKeys.add(nameKey);
    createdSuppliers += 1;
  }

  return {
    createdSuppliers,
    totalSuppliersInCsv: supplierNames.length
  };
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
    throw new Error("No admin user found to mark purchase workbook imports.");
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

const deleteExistingPurchaseGroup = async (group: Pick<GroupedPurchaseCsv, "supplierName" | "date" | "note">) => {
  const purchaseOrderRepo = AppDataSource.getRepository(PurchaseOrder);
  const rows = await purchaseOrderRepo
    .createQueryBuilder("purchaseOrder")
    .leftJoin("purchaseOrder.supplier", "supplier")
    .select("purchaseOrder.id", "id")
    .where("LOWER(supplier.name) = LOWER(:supplierName)", { supplierName: group.supplierName })
    .andWhere("purchaseOrder.purchaseDate = :purchaseDate", { purchaseDate: group.date })
    .andWhere("COALESCE(purchaseOrder.note, '') = :purchaseNote", { purchaseNote: group.note })
    .getRawMany<{ id: string }>();

  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) {
    return 0;
  }

  // Cascades to purchase order lines.
  await purchaseOrderRepo.delete(ids);
  return ids.length;
};

const main = async () => {
  const cli = getCliOptions();
  const workbookPath = resolveWorkbookPath(cli.workbookArg, "purchase.xlsx");
  const outputDir = path.resolve(process.cwd(), "uploads", "purchase-workbook");

  if (!existsSync(workbookPath)) {
    throw new Error(`Purchase workbook not found: ${workbookPath}`);
  }

  console.info("Preparing purchase workbook import files...", { workbookPath });
  runPrepareScript(workbookPath, outputDir);

  const ingredientsCsvPath = path.resolve(outputDir, "ingredients.csv");
  const purchasesCsvPath = path.resolve(outputDir, "purchases.csv");
  const ingredientsCsv = readCsvBuffer(ingredientsCsvPath);
  const purchasesCsv = readCsvBuffer(purchasesCsvPath);

  if (!ingredientsCsv || !purchasesCsv) {
    throw new Error("Prepared ingredient/purchase CSV files are empty or missing.");
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const ingredientsService = new IngredientsService();
  const procurementService = new ProcurementService();
  const createdByUserId = await findImportUserId();

  const ingredientSummary = await ingredientsService.bulkImportIngredientsFromCsv(ingredientsCsv, "additional");
  const supplierSummary = await ensureSuppliersFromPurchaseCsv(purchasesCsv, procurementService);

  const groupedPurchases = splitPurchaseCsvByGroup(purchasesCsv);
  if (!groupedPurchases.length) {
    throw new Error("No valid purchase groups found in generated purchases.csv.");
  }

  let insertedPurchaseOrders = 0;
  let insertedLines = 0;
  let skippedExistingPurchaseOrders = 0;
  let replacedExistingPurchaseOrders = 0;

  for (const group of groupedPurchases) {
    const alreadyImported = await purchaseGroupAlreadyImported(group);
    if (alreadyImported) {
      if (!cli.replaceExisting) {
        skippedExistingPurchaseOrders += 1;
        continue;
      }
      const deleted = await deleteExistingPurchaseGroup(group);
      replacedExistingPurchaseOrders += deleted;
    }

    const summary = await procurementService.bulkImportPurchaseOrderFromCsv(group.buffer, createdByUserId);
    insertedPurchaseOrders += 1;
    insertedLines += summary.lineCount;
  }

  console.info("Purchase workbook import summary:", {
    ingredientSummary,
    supplierSummary,
    purchaseSummary: {
      insertedPurchaseOrders,
      insertedLines,
      skippedExistingPurchaseOrders,
      replacedExistingPurchaseOrders,
      replaceExistingMode: cli.replaceExisting
    },
    outputDir
  });
};

main()
  .catch((error) => {
    console.error("Purchase workbook import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });
