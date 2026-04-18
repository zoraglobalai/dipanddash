import "reflect-metadata";

import { existsSync, readFileSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

import { AppDataSource } from "../database/data-source";
import { IngredientsService } from "../modules/ingredients/ingredients.service";
import { ItemsService } from "../modules/items/items.service";

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

const runPrepareScript = (ingredientsWorkbookPath: string, menusWorkbookPath: string, outputDir: string) => {
  const scriptPath = path.resolve(process.cwd(), "scripts", "prepare_menu_item_import.py");
  if (!existsSync(scriptPath)) {
    throw new Error(`Prepare script not found at ${scriptPath}`);
  }

  const command = process.platform === "win32" ? "python" : "python3";
  const result = spawnSync(
    command,
    [
      scriptPath,
      "--ingredients-workbook",
      ingredientsWorkbookPath,
      "--menus-workbook",
      menusWorkbookPath,
      "--outdir",
      outputDir
    ],
    { stdio: "inherit" }
  );

  if (result.status !== 0) {
    throw new Error("Failed to prepare CSV files from ingredient/menu workbooks.");
  }
};

const main = async () => {
  const ingredientsWorkbookPath = resolveWorkbookPath(process.argv[2], "incredients.xlsx");
  const menusWorkbookPath = resolveWorkbookPath(process.argv[3], "menus.xlsx");
  const outputDir = path.resolve(process.cwd(), "uploads", "menu-item-import");

  if (!existsSync(ingredientsWorkbookPath)) {
    throw new Error(`Ingredients workbook not found: ${ingredientsWorkbookPath}`);
  }
  if (!existsSync(menusWorkbookPath)) {
    throw new Error(`Menus workbook not found: ${menusWorkbookPath}`);
  }

  console.info("Preparing menu + ingredient CSV import files...", {
    ingredientsWorkbookPath,
    menusWorkbookPath
  });
  runPrepareScript(ingredientsWorkbookPath, menusWorkbookPath, outputDir);

  const ingredientsCsvPath = path.resolve(outputDir, "ingredients.csv");
  const itemsCsvPath = path.resolve(outputDir, "items.csv");
  const unmatchedCsvPath = path.resolve(outputDir, "unmatched_menu_items.csv");

  const ingredientsCsv = readCsvBuffer(ingredientsCsvPath);
  const itemsCsv = readCsvBuffer(itemsCsvPath);

  if (!ingredientsCsv || !itemsCsv) {
    throw new Error("Prepared CSV files are empty or missing.");
  }

  await AppDataSource.initialize();
  const ingredientsService = new IngredientsService();
  const itemsService = new ItemsService();

  const ingredientSummary = await ingredientsService.bulkImportIngredientsFromCsv(ingredientsCsv, "core");
  const itemSummary = await itemsService.bulkImportItemsFromCsv(itemsCsv);

  console.info("Menu/ingredient import summary:", {
    ingredientSummary,
    itemSummary,
    unmatchedItemsCsv: existsSync(unmatchedCsvPath) ? unmatchedCsvPath : null,
    outputDir
  });
};

main()
  .catch((error) => {
    console.error("Menu/ingredient workbook import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

