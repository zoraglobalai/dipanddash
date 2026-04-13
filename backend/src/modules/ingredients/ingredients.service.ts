import { EntityManager, In, QueryFailedError } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { DailyAllocation } from "./daily-allocation.entity";
import { IngredientCategory } from "./ingredient-category.entity";
import { Ingredient } from "./ingredient.entity";
import { IngredientStockLog } from "./ingredient-stock-log.entity";
import { IngredientStock } from "./ingredient-stock.entity";
import { INGREDIENT_UNITS, IngredientStockLogType, type IngredientUnit } from "./ingredients.constants";
import { ItemIngredient } from "../items/item-ingredient.entity";
import { AddOnIngredient } from "../items/add-on-ingredient.entity";
import { InvoiceUsageEvent } from "../invoices/invoice-usage-event.entity";
import { PosBillingControl } from "./pos-billing-control.entity";
import { StaffClosingReport } from "./staff-closing-report.entity";
import { UserRole } from "../../constants/roles";
import {
  getIngredientValuationMapFromCurrentStock,
  getLatestIngredientPurchasePriceMap
} from "../procurement/ingredient-costing";

type PaginationQuery = {
  page: number;
  limit: number;
};

type CategoryListFilters = PaginationQuery & {
  search?: string;
  includeInactive?: boolean;
};

type IngredientListFilters = PaginationQuery & {
  search?: string;
  categoryId?: string;
  includeInactive?: boolean;
  withMovementStats?: boolean;
};

type AllocationListFilters = PaginationQuery & {
  date: string;
  search?: string;
  categoryId?: string;
  overall?: boolean;
};

type AllocationStatsFilters = {
  date: string;
  search?: string;
  categoryId?: string;
};

type StockLogListFilters = PaginationQuery;

type BulkIngredientImportRow = {
  rowNumber: number;
  categoryName: string;
  categoryDescription: string | null;
  ingredientName: string;
  unit: IngredientUnit;
  minStock: number;
};

type BulkIngredientImportSummary = {
  totalRows: number;
  parsedRows: number;
  insertedCategories: number;
  insertedIngredients: number;
  skippedExistingIngredients: number;
  skippedDuplicateRows: number;
  invalidRows: number;
  invalidRowDetails: Array<{ rowNumber: number; reason: string }>;
};

const BULK_INGREDIENT_TEMPLATE_HEADERS = [
  "category_name",
  "category_description",
  "ingredient_name",
  "unit",
  "min_stock"
] as const;
const VALID_INGREDIENT_UNIT_SET = new Set<string>(INGREDIENT_UNITS.map((unit) => unit.toLowerCase()));
const MAX_BULK_INVALID_ROW_DETAILS = 40;

const getNumericValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toFixedQuantity = (value: number) => Number(value.toFixed(3));

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const getStockStatus = (totalStock: number, minStock: number) => (totalStock <= minStock ? "LOW_STOCK" : "OK");
const allocationDisabledMessage =
  "Daily allocation flow is disabled. Staff usage now runs directly from available stock in hand.";

const getTodayDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getPreviousDateString = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return getTodayDateString();
  }
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
};

const getDateOnlyString = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDateInput = (value: string | Date, label: string) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new AppError(422, `${label} must be in YYYY-MM-DD format.`);
    }
    return getDateOnlyString(value);
  }

  const trimmed = value.trim();
  if (dateOnlyPattern.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000`);
    if (Number.isNaN(parsed.getTime())) {
      throw new AppError(422, `${label} must be in YYYY-MM-DD format.`);
    }
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(422, `${label} must be in YYYY-MM-DD format.`);
  }
  return getDateOnlyString(parsed);
};

const chunkArray = <T>(values: T[], chunkSize = 500) => {
  if (chunkSize <= 0) {
    return [values];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
};

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeLookupKey = (value: string) => normalizeName(value).toLowerCase();
const normalizeHeaderKey = (value: string) => value.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

const escapeCsvValue = (value: string | number | null) => {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
};

const parseCsvNumber = (
  value: string | undefined,
  fallback: number,
  fieldLabel: string,
  rowNumber: number
) => {
  if (!value || !value.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} must be a valid number.`);
  }

  if (parsed < 0) {
    throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} cannot be negative.`);
  }

  return parsed;
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

export class IngredientsService {
  private readonly categoryRepository = AppDataSource.getRepository(IngredientCategory);
  private readonly ingredientRepository = AppDataSource.getRepository(Ingredient);
  private readonly stockRepository = AppDataSource.getRepository(IngredientStock);
  private readonly stockLogRepository = AppDataSource.getRepository(IngredientStockLog);
  private readonly allocationRepository = AppDataSource.getRepository(DailyAllocation);
  private readonly itemIngredientRepository = AppDataSource.getRepository(ItemIngredient);
  private readonly addOnIngredientRepository = AppDataSource.getRepository(AddOnIngredient);
  private readonly usageEventRepository = AppDataSource.getRepository(InvoiceUsageEvent);
  private readonly posBillingControlRepository = AppDataSource.getRepository(PosBillingControl);
  private readonly closingReportRepository = AppDataSource.getRepository(StaffClosingReport);

  private async getActiveCategoryOrFail(categoryId: string) {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId, isActive: true }
    });

    if (!category) {
      throw new AppError(404, "Ingredient category not found");
    }

    return category;
  }

  private async getActiveIngredientOrFail(ingredientId: string) {
    const ingredient = await this.ingredientRepository.findOne({
      where: { id: ingredientId, isActive: true },
      relations: { category: true }
    });

    if (!ingredient) {
      throw new AppError(404, "Ingredient not found");
    }

    return ingredient;
  }

  private async createStockLog(payload: {
    ingredientId: string;
    type: IngredientStockLogType;
    quantity: number;
    note?: string;
  }) {
    const quantity = Math.abs(toFixedQuantity(payload.quantity));
    if (quantity <= 0) {
      return null;
    }

    const log = this.stockLogRepository.create({
      ingredientId: payload.ingredientId,
      type: payload.type,
      quantity,
      note: payload.note ?? null
    });

    return this.stockLogRepository.save(log);
  }

  private async getOrCreateStockByIngredientId(ingredientId: string) {
    const existing = await this.stockRepository.findOne({ where: { ingredientId } });
    if (existing) {
      return existing;
    }

    const created = this.stockRepository.create({
      ingredientId,
      totalStock: 0,
      lastUpdatedAt: new Date()
    });

    return this.stockRepository.save(created);
  }

  private async getCategoryIngredientCountMap(categoryIds: string[]) {
    if (!categoryIds.length) {
      return new Map<string, number>();
    }

    const rows = await this.ingredientRepository
      .createQueryBuilder("ingredient")
      .select("ingredient.categoryId", "categoryId")
      .addSelect("COUNT(*)", "count")
      .where("ingredient.categoryId IN (:...categoryIds)", { categoryIds })
      .groupBy("ingredient.categoryId")
      .getRawMany<{ categoryId: string; count: string }>();

    return new Map(rows.map((row) => [row.categoryId, Number(row.count)]));
  }

  private mapCategorySummary(category: IngredientCategory, ingredientCount: number) {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      isActive: category.isActive,
      ingredientCount,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    };
  }

  getBulkImportTemplate() {
    const rows = [
      [...BULK_INGREDIENT_TEMPLATE_HEADERS],
      ["Beverages", "Lemon based ingredients", "Lemon", "kg", "1"],
      ["Bakery", "", "Bread Slice", "pcs", "20"]
    ];

    const csv = rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\n");
    return {
      fileName: "ingredient_bulk_template.csv",
      content: `\uFEFF${csv}`
    };
  }

  private parseBulkRowsFromCsv(csvBuffer: Buffer) {
    const textContent = csvBuffer.toString("utf-8").replace(/^\uFEFF/, "").trim();
    if (!textContent) {
      throw new AppError(422, "Uploaded CSV file is empty.");
    }

    const parsedCsvRows = parseCsvRows(textContent);
    if (!parsedCsvRows.length) {
      throw new AppError(422, "Uploaded CSV file is empty.");
    }

    const headerRow = parsedCsvRows[0].map((cell) => cell.trim());
    const headerAliases = new Map<string, string>([
      ["categoryname", "category_name"],
      ["category", "category_name"],
      ["categorydescription", "category_description"],
      ["ingredientname", "ingredient_name"],
      ["ingredient", "ingredient_name"],
      ["unit", "unit"],
      ["minstock", "min_stock"],
      ["minimumstock", "min_stock"]
    ]);

    const headerIndexMap = new Map<string, number>();
    headerRow.forEach((header, index) => {
      const alias = headerAliases.get(normalizeHeaderKey(header));
      if (alias) {
        headerIndexMap.set(alias, index);
      }
    });

    const requiredHeaders: Array<(typeof BULK_INGREDIENT_TEMPLATE_HEADERS)[number]> = [
      "category_name",
      "ingredient_name",
      "unit"
    ];
    const missingHeaders = requiredHeaders.filter((header) => !headerIndexMap.has(header));
    if (missingHeaders.length) {
      throw new AppError(
        422,
        `Missing required column(s): ${missingHeaders.join(", ")}. Please use the downloadable template.`
      );
    }

    const readValue = (row: string[], header: (typeof BULK_INGREDIENT_TEMPLATE_HEADERS)[number]) => {
      const columnIndex = headerIndexMap.get(header);
      if (columnIndex === undefined) {
        return undefined;
      }
      return row[columnIndex];
    };

    const nonEmptyRows = parsedCsvRows
      .slice(1)
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(({ row }) => row.some((cell) => cell.trim().length > 0));

    const validRows: BulkIngredientImportRow[] = [];
    const invalidRowDetails: Array<{ rowNumber: number; reason: string }> = [];
    const seenIngredientKeys = new Set<string>();
    let skippedDuplicateRows = 0;

    nonEmptyRows.forEach(({ row, rowNumber }) => {
      try {
        const categoryName = normalizeName(readValue(row, "category_name") ?? "");
        const ingredientName = normalizeName(readValue(row, "ingredient_name") ?? "");
        const unitValue = (readValue(row, "unit") ?? "").trim().toLowerCase();
        const minStock = parseCsvNumber(readValue(row, "min_stock"), 0, "Min stock", rowNumber);
        const categoryDescriptionRaw = readValue(row, "category_description");
        const categoryDescription = categoryDescriptionRaw
          ? normalizeName(categoryDescriptionRaw).slice(0, 255) || null
          : null;

        if (categoryName.length < 2 || categoryName.length > 80) {
          throw new AppError(422, "Category name must be between 2 and 80 characters.");
        }
        if (ingredientName.length < 2 || ingredientName.length > 120) {
          throw new AppError(422, "Ingredient name must be between 2 and 120 characters.");
        }
        if (!unitValue || !VALID_INGREDIENT_UNIT_SET.has(unitValue)) {
          throw new AppError(422, "Unit is invalid.");
        }

        const ingredientLookupKey = normalizeLookupKey(ingredientName);
        if (seenIngredientKeys.has(ingredientLookupKey)) {
          skippedDuplicateRows += 1;
          return;
        }

        seenIngredientKeys.add(ingredientLookupKey);
        validRows.push({
          rowNumber,
          categoryName,
          categoryDescription,
          ingredientName,
          unit: unitValue as IngredientUnit,
          minStock: toFixedQuantity(minStock)
        });
      } catch (error) {
        const reason =
          error instanceof AppError ? error.message.replace(/^Row \d+:\s*/i, "") : "Row validation failed.";
        if (invalidRowDetails.length < MAX_BULK_INVALID_ROW_DETAILS) {
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

  private async getCategoryMapByNameKeys(manager: EntityManager, nameKeys: string[]) {
    const categoryMap = new Map<string, { id: string; name: string; isActive: boolean }>();
    if (!nameKeys.length) {
      return categoryMap;
    }

    for (const chunk of chunkArray(nameKeys)) {
      const rows = await manager
        .getRepository(IngredientCategory)
        .createQueryBuilder("category")
        .select("category.id", "id")
        .addSelect("category.name", "name")
        .addSelect("category.isActive", "isActive")
        .where("LOWER(category.name) IN (:...nameKeys)", { nameKeys: chunk })
        .getRawMany<{ id: string; name: string; isActive: boolean }>();

      rows.forEach((row) => {
        categoryMap.set(normalizeLookupKey(row.name), {
          id: row.id,
          name: row.name,
          isActive: Boolean(row.isActive)
        });
      });
    }

    return categoryMap;
  }

  private async getExistingIngredientNameKeySet(manager: EntityManager, nameKeys: string[]) {
    const ingredientNameKeySet = new Set<string>();
    if (!nameKeys.length) {
      return ingredientNameKeySet;
    }

    for (const chunk of chunkArray(nameKeys)) {
      const rows = await manager
        .getRepository(Ingredient)
        .createQueryBuilder("ingredient")
        .select("ingredient.name", "name")
        .where("LOWER(ingredient.name) IN (:...nameKeys)", { nameKeys: chunk })
        .getRawMany<{ name: string }>();

      rows.forEach((row) => ingredientNameKeySet.add(normalizeLookupKey(row.name)));
    }

    return ingredientNameKeySet;
  }

  async bulkImportIngredientsFromCsv(csvBuffer: Buffer): Promise<BulkIngredientImportSummary> {
    const parsedCsv = this.parseBulkRowsFromCsv(csvBuffer);
    if (!parsedCsv.validRows.length) {
      return {
        totalRows: parsedCsv.totalRows,
        parsedRows: 0,
        insertedCategories: 0,
        insertedIngredients: 0,
        skippedExistingIngredients: 0,
        skippedDuplicateRows: parsedCsv.skippedDuplicateRows,
        invalidRows: parsedCsv.invalidRows,
        invalidRowDetails: parsedCsv.invalidRowDetails
      };
    }

    return AppDataSource.transaction(async (manager) => {
      const categoryByKey = new Map<
        string,
        { categoryName: string; categoryDescription: string | null }
      >();

      parsedCsv.validRows.forEach((row) => {
        const categoryKey = normalizeLookupKey(row.categoryName);
        if (!categoryByKey.has(categoryKey)) {
          categoryByKey.set(categoryKey, {
            categoryName: row.categoryName,
            categoryDescription: row.categoryDescription
          });
        }
      });

      const categoryNameKeys = Array.from(categoryByKey.keys());
      const ingredientNameKeys = Array.from(
        new Set(parsedCsv.validRows.map((row) => normalizeLookupKey(row.ingredientName)))
      );

      let categoryMap = await this.getCategoryMapByNameKeys(manager, categoryNameKeys);
      const missingCategoryValues = categoryNameKeys
        .filter((nameKey) => !categoryMap.has(nameKey))
        .map((nameKey) => {
          const category = categoryByKey.get(nameKey)!;
          return {
            name: category.categoryName,
            description: category.categoryDescription,
            isActive: true
          };
        });

      let insertedCategories = 0;
      if (missingCategoryValues.length) {
        const categoryInsertResult = await manager
          .createQueryBuilder()
          .insert()
          .into(IngredientCategory)
          .values(missingCategoryValues)
          .orIgnore()
          .execute();
        insertedCategories = categoryInsertResult.identifiers.length;
        categoryMap = await this.getCategoryMapByNameKeys(manager, categoryNameKeys);
      }

      const existingIngredientNameKeySet = await this.getExistingIngredientNameKeySet(manager, ingredientNameKeys);
      const ingredientInsertValues: Array<{
        name: string;
        categoryId: string;
        unit: IngredientUnit;
        perUnitPrice: number;
        minStock: number;
        isActive: boolean;
      }> = [];
      let skippedExistingIngredients = 0;

      parsedCsv.validRows.forEach((row) => {
        const ingredientNameKey = normalizeLookupKey(row.ingredientName);
        if (existingIngredientNameKeySet.has(ingredientNameKey)) {
          skippedExistingIngredients += 1;
          return;
        }

        const category = categoryMap.get(normalizeLookupKey(row.categoryName));
        if (!category) {
          return;
        }

        ingredientInsertValues.push({
          name: row.ingredientName,
          categoryId: category.id,
          unit: row.unit,
          perUnitPrice: 0,
          minStock: row.minStock,
          isActive: true
        });
        existingIngredientNameKeySet.add(ingredientNameKey);
      });

      if (!ingredientInsertValues.length) {
        return {
          totalRows: parsedCsv.totalRows,
          parsedRows: parsedCsv.validRows.length,
          insertedCategories,
          insertedIngredients: 0,
          skippedExistingIngredients,
          skippedDuplicateRows: parsedCsv.skippedDuplicateRows,
          invalidRows: parsedCsv.invalidRows,
          invalidRowDetails: parsedCsv.invalidRowDetails
        };
      }

      const ingredientInsertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(Ingredient)
        .values(ingredientInsertValues)
        .orIgnore()
        .returning(["id", "name"])
        .execute();

      const insertedIngredients = Array.isArray(ingredientInsertResult.raw)
        ? ingredientInsertResult.raw
            .map((row) => ({
              id: typeof row.id === "string" ? row.id : "",
              name: typeof row.name === "string" ? row.name : ""
            }))
            .filter((row) => row.id && row.name)
        : [];

      if (!insertedIngredients.length) {
        return {
          totalRows: parsedCsv.totalRows,
          parsedRows: parsedCsv.validRows.length,
          insertedCategories,
          insertedIngredients: 0,
          skippedExistingIngredients: skippedExistingIngredients + ingredientInsertValues.length,
          skippedDuplicateRows: parsedCsv.skippedDuplicateRows,
          invalidRows: parsedCsv.invalidRows,
          invalidRowDetails: parsedCsv.invalidRowDetails
        };
      }

      const skippedDuringInsert = Math.max(ingredientInsertValues.length - insertedIngredients.length, 0);

      const now = new Date();
      const stockInsertValues = insertedIngredients.map((ingredient) => ({
        ingredientId: ingredient.id,
        totalStock: 0,
        lastUpdatedAt: now
      }));

      await manager
        .createQueryBuilder()
        .insert()
        .into(IngredientStock)
        .values(stockInsertValues)
        .orIgnore()
        .execute();

      return {
        totalRows: parsedCsv.totalRows,
        parsedRows: parsedCsv.validRows.length,
        insertedCategories,
        insertedIngredients: insertedIngredients.length,
        skippedExistingIngredients: skippedExistingIngredients + skippedDuringInsert,
        skippedDuplicateRows: parsedCsv.skippedDuplicateRows,
        invalidRows: parsedCsv.invalidRows,
        invalidRowDetails: parsedCsv.invalidRowDetails
      };
    });
  }

  async listCategories(filters: CategoryListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.categoryRepository
      .createQueryBuilder("category")
      .where("1 = 1")
      .orderBy("category.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("category.isActive = true");
    }

    if (filters.search) {
      query.andWhere("LOWER(category.name) LIKE LOWER(:search)", {
        search: `%${filters.search}%`
      });
    }

    const total = await query.getCount();
    const categories = await query.offset(offset).limit(limit).getMany();
    const categoryIds = categories.map((category) => category.id);
    const countMap = await this.getCategoryIngredientCountMap(categoryIds);

    return {
      categories: categories.map((category) =>
        this.mapCategorySummary(category, countMap.get(category.id) ?? 0)
      ),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async createCategory(payload: { name: string; description?: string }) {
    const normalizedName = payload.name.trim();
    const exists = await this.categoryRepository
      .createQueryBuilder("category")
      .where("LOWER(category.name) = LOWER(:name)", { name: normalizedName })
      .getOne();

    if (exists) {
      throw new AppError(409, "Category with this name already exists");
    }

    const category = this.categoryRepository.create({
      name: normalizedName,
      description: payload.description?.trim() || null,
      isActive: true
    });

    const saved = await this.categoryRepository.save(category);
    return this.mapCategorySummary(saved, 0);
  }

  async updateCategory(id: string, payload: { name?: string; description?: string; isActive?: boolean }) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new AppError(404, "Ingredient category not found");
    }

    if (payload.name) {
      const normalizedName = payload.name.trim();
      const duplicate = await this.categoryRepository
        .createQueryBuilder("category")
        .where("LOWER(category.name) = LOWER(:name)", { name: normalizedName })
        .andWhere("category.id != :id", { id })
        .getOne();

      if (duplicate) {
        throw new AppError(409, "Category with this name already exists");
      }
      category.name = normalizedName;
    }

    if (payload.description !== undefined) {
      category.description = payload.description.trim() || null;
    }

    if (payload.isActive !== undefined) {
      category.isActive = payload.isActive;
    }

    const saved = await this.categoryRepository.save(category);
    const countMap = await this.getCategoryIngredientCountMap([saved.id]);
    return this.mapCategorySummary(saved, countMap.get(saved.id) ?? 0);
  }

  async deleteCategory(id: string) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new AppError(404, "Ingredient category not found");
    }

    const ingredientCount = await this.ingredientRepository.count({
      where: { categoryId: id }
    });

    if (ingredientCount > 0) {
      throw new AppError(409, "Cannot delete category with existing ingredients");
    }

    await this.categoryRepository.remove(category);
    return this.mapCategorySummary(category, 0);
  }

  async listIngredients(filters: IngredientListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.ingredientRepository
      .createQueryBuilder("ingredient")
      .leftJoinAndSelect("ingredient.category", "category")
      .where("1 = 1")
      .orderBy("ingredient.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("ingredient.isActive = true");
    }

    if (filters.search) {
      query.andWhere("LOWER(ingredient.name) LIKE LOWER(:search)", {
        search: `%${filters.search}%`
      });
    }

    if (filters.categoryId) {
      query.andWhere("ingredient.categoryId = :categoryId", { categoryId: filters.categoryId });
    }

    const total = await query.getCount();
    const ingredients = await query.offset(offset).limit(limit).getMany();

    const ingredientIds = ingredients.map((ingredient) => ingredient.id);
    const [stocks, usageRows, dumpRows] = ingredientIds.length
      ? await Promise.all([
          this.stockRepository.find({
            where: { ingredientId: In(ingredientIds) }
          }),
          filters.withMovementStats
            ? this.usageEventRepository
                .createQueryBuilder("event")
                .select("event.ingredientId", "ingredientId")
                .addSelect("SUM(event.consumedQuantity + COALESCE(event.overusedQuantity, 0))", "usedQuantity")
                .where("event.ingredientId IN (:...ingredientIds)", { ingredientIds })
                .groupBy("event.ingredientId")
                .getRawMany<{ ingredientId: string; usedQuantity: string }>()
            : Promise.resolve([]),
          filters.withMovementStats
            ? AppDataSource.query(
                `
                  SELECT
                    COALESCE(NULLIF((impact->>'ingredientId'), ''), dump."ingredientId"::text) AS "ingredientId",
                    SUM(
                      CASE
                        WHEN COALESCE(impact->>'quantity', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (impact->>'quantity')::numeric
                        WHEN COALESCE(impact->>'baseQuantity', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (impact->>'baseQuantity')::numeric
                        ELSE COALESCE(dump."baseQuantity", 0)::numeric
                      END
                    ) AS "dumpQuantity"
                  FROM "dump_entries" dump
                  LEFT JOIN LATERAL jsonb_array_elements(
                    CASE
                      WHEN jsonb_typeof(dump."ingredientImpacts") = 'array' THEN dump."ingredientImpacts"
                      ELSE '[]'::jsonb
                    END
                  ) impact ON TRUE
                  WHERE COALESCE(NULLIF((impact->>'ingredientId'), ''), dump."ingredientId"::text) = ANY($1::text[])
                  GROUP BY COALESCE(NULLIF((impact->>'ingredientId'), ''), dump."ingredientId"::text)
                `,
                [ingredientIds]
              )
            : Promise.resolve([])
        ])
      : [[], [], []];

    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, getNumericValue(stock.totalStock)]));
    const fallbackPriceMap = new Map(ingredients.map((ingredient) => [ingredient.id, getNumericValue(ingredient.perUnitPrice)]));
    const latestPriceMap = await getLatestIngredientPurchasePriceMap(ingredientIds, fallbackPriceMap);
    const usageMap = new Map(
      (usageRows as Array<{ ingredientId: string; usedQuantity: string }>).map((row) => [
        row.ingredientId,
        getNumericValue(row.usedQuantity)
      ])
    );
    const dumpMap = new Map(
      (dumpRows as Array<{ ingredientId: string; dumpQuantity: string }>).map((row) => [
        row.ingredientId,
        getNumericValue(row.dumpQuantity)
      ])
    );

    return {
      ingredients: ingredients.map((ingredient) => {
        const totalStock = toFixedQuantity(stockMap.get(ingredient.id) ?? 0);
        const minStock = toFixedQuantity(getNumericValue(ingredient.minStock));
        const staffUsedQuantity = toFixedQuantity(usageMap.get(ingredient.id) ?? 0);
        const dumpQuantity = toFixedQuantity(dumpMap.get(ingredient.id) ?? 0);

        return {
          id: ingredient.id,
          name: ingredient.name,
          categoryId: ingredient.categoryId,
          categoryName: ingredient.category.name,
          unit: ingredient.unit,
          perUnitPrice: toFixedQuantity(
            latestPriceMap.get(ingredient.id) ?? getNumericValue(ingredient.perUnitPrice)
          ),
          minStock,
          totalStock,
          staffUsedQuantity,
          dumpQuantity,
          isActive: ingredient.isActive,
          status: getStockStatus(totalStock, minStock),
          createdAt: ingredient.createdAt,
          updatedAt: ingredient.updatedAt
        };
      }),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async createIngredient(payload: {
    name: string;
    categoryId: string;
    unit: IngredientUnit;
    perUnitPrice?: number;
    minStock: number;
    currentStock?: number;
  }) {
    await this.getActiveCategoryOrFail(payload.categoryId);

    const normalizedName = payload.name.trim();
    const exists = await this.ingredientRepository
      .createQueryBuilder("ingredient")
      .where("LOWER(ingredient.name) = LOWER(:name)", { name: normalizedName })
      .getOne();

    if (exists) {
      throw new AppError(409, "Ingredient with this name already exists");
    }

    const ingredient = this.ingredientRepository.create({
      name: normalizedName,
      categoryId: payload.categoryId,
      unit: payload.unit,
      perUnitPrice: toFixedQuantity(payload.perUnitPrice ?? 0),
      minStock: toFixedQuantity(payload.minStock),
      isActive: true
    });

    const saved = await this.ingredientRepository.save(ingredient);
    const initialStock = toFixedQuantity(payload.currentStock ?? 0);

    const stock = this.stockRepository.create({
      ingredientId: saved.id,
      totalStock: initialStock,
      lastUpdatedAt: new Date()
    });
    await this.stockRepository.save(stock);

    await this.createStockLog({
      ingredientId: saved.id,
      type: IngredientStockLogType.ADD,
      quantity: initialStock,
      note: initialStock > 0 ? "Initial stock set during ingredient creation." : undefined
    });

    return saved;
  }

  async updateIngredient(
    id: string,
    payload: {
      name?: string;
      categoryId?: string;
      unit?: IngredientUnit;
      perUnitPrice?: number;
      minStock?: number;
      currentStock?: number;
      isActive?: boolean;
    }
  ) {
    const ingredient = await this.ingredientRepository.findOne({
      where: { id },
      relations: { category: true }
    });
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found");
    }

    if (payload.name) {
      const normalizedName = payload.name.trim();
      const duplicate = await this.ingredientRepository
        .createQueryBuilder("ingredient")
        .where("LOWER(ingredient.name) = LOWER(:name)", { name: normalizedName })
        .andWhere("ingredient.id != :id", { id })
        .getOne();

      if (duplicate) {
        throw new AppError(409, "Ingredient with this name already exists");
      }

      ingredient.name = normalizedName;
    }

    if (payload.categoryId) {
      await this.getActiveCategoryOrFail(payload.categoryId);
      ingredient.categoryId = payload.categoryId;
    }

    if (payload.unit) {
      ingredient.unit = payload.unit;
    }

    if (payload.perUnitPrice !== undefined) {
      ingredient.perUnitPrice = toFixedQuantity(payload.perUnitPrice);
    }

    if (payload.minStock !== undefined) {
      ingredient.minStock = toFixedQuantity(payload.minStock);
    }

    if (payload.isActive !== undefined) {
      ingredient.isActive = payload.isActive;
    }

    const saved = await this.ingredientRepository.save(ingredient);
    const stock = await this.getOrCreateStockByIngredientId(saved.id);

    if (payload.currentStock !== undefined) {
      const nextStock = toFixedQuantity(payload.currentStock);
      const currentStock = toFixedQuantity(getNumericValue(stock.totalStock));
      const adjustment = toFixedQuantity(nextStock - currentStock);

      if (adjustment !== 0) {
        stock.totalStock = nextStock;
        stock.lastUpdatedAt = new Date();
        await this.stockRepository.save(stock);

        await this.createStockLog({
          ingredientId: saved.id,
          type: IngredientStockLogType.ADJUST,
          quantity: adjustment,
          note: "Stock updated from ingredient edit."
        });
      }
    }

    return saved;
  }

  async deleteIngredient(id: string) {
    const ingredient = await this.ingredientRepository.findOne({
      where: { id }
    });

    if (!ingredient) {
      throw new AppError(404, "Ingredient not found");
    }

    const [itemUsageCount, addOnUsageCount] = await Promise.all([
      this.itemIngredientRepository.count({ where: { ingredientId: id } }),
      this.addOnIngredientRepository.count({ where: { ingredientId: id } })
    ]);

    if (itemUsageCount + addOnUsageCount > 0) {
      throw new AppError(
        409,
        `Cannot delete this ingredient because it is used in ${itemUsageCount} item recipe(s) and ${addOnUsageCount} add-on recipe(s).`
      );
    }

    try {
      await this.ingredientRepository.remove(ingredient);
      return ingredient;
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new AppError(
          409,
          "Cannot delete this ingredient because it is linked to existing records."
        );
      }
      throw error;
    }
  }

  async getIngredientStock(ingredientId: string, filters: StockLogListFilters) {
    const ingredient = await this.getActiveIngredientOrFail(ingredientId);
    const stock = await this.getOrCreateStockByIngredientId(ingredientId);

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const logQuery = this.stockLogRepository
      .createQueryBuilder("log")
      .where("log.ingredientId = :ingredientId", { ingredientId })
      .orderBy("log.createdAt", "DESC");

    const total = await logQuery.getCount();
    const logs = await logQuery.offset(offset).limit(limit).getMany();

    const totalStock = toFixedQuantity(getNumericValue(stock.totalStock));
    const minStock = toFixedQuantity(getNumericValue(ingredient.minStock));
    const fallbackPriceMap = new Map([[ingredientId, getNumericValue(ingredient.perUnitPrice)]]);
    const stockMap = new Map([[ingredientId, totalStock]]);
    const latestPriceMap = await getLatestIngredientPurchasePriceMap([ingredientId], fallbackPriceMap);
    const valuationMap = await getIngredientValuationMapFromCurrentStock({
      ingredientIds: [ingredientId],
      stockByIngredient: stockMap,
      fallbackPriceByIngredient: fallbackPriceMap
    });
    const perUnitPrice = toFixedQuantity(latestPriceMap.get(ingredientId) ?? getNumericValue(ingredient.perUnitPrice));
    const totalValuation = toFixedQuantity(valuationMap.get(ingredientId) ?? totalStock * perUnitPrice);

    return {
      stock: {
        ingredientId,
        ingredientName: ingredient.name,
        unit: ingredient.unit,
        perUnitPrice,
        totalValuation,
        totalStock,
        minStock,
        status: getStockStatus(totalStock, minStock),
        lastUpdatedAt: stock.lastUpdatedAt
      },
      logs: logs.map((log) => ({
        id: log.id,
        type: log.type,
        quantity: toFixedQuantity(getNumericValue(log.quantity)),
        note: log.note,
        createdAt: log.createdAt
      })),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async addStock(ingredientId: string, payload: { quantity: number; note?: string }) {
    await this.getActiveIngredientOrFail(ingredientId);
    const quantity = toFixedQuantity(payload.quantity);
    if (quantity <= 0) {
      throw new AppError(422, "Quantity must be greater than zero");
    }

    const stock = await this.getOrCreateStockByIngredientId(ingredientId);
    const current = getNumericValue(stock.totalStock);
    stock.totalStock = toFixedQuantity(current + quantity);
    stock.lastUpdatedAt = new Date();
    const savedStock = await this.stockRepository.save(stock);

    await this.createStockLog({
      ingredientId,
      type: IngredientStockLogType.ADD,
      quantity,
      note: payload.note
    });

    return {
      ingredientId,
      totalStock: toFixedQuantity(getNumericValue(savedStock.totalStock)),
      lastUpdatedAt: savedStock.lastUpdatedAt
    };
  }

  async adjustStock(ingredientId: string, payload: { quantity: number; note?: string }) {
    await this.getActiveIngredientOrFail(ingredientId);
    const quantity = toFixedQuantity(payload.quantity);
    if (quantity === 0) {
      throw new AppError(422, "Adjustment quantity cannot be zero");
    }

    const stock = await this.getOrCreateStockByIngredientId(ingredientId);
    const current = getNumericValue(stock.totalStock);
    const next = toFixedQuantity(current + quantity);

    if (next < 0) {
      throw new AppError(409, "Stock cannot be negative after adjustment");
    }

    stock.totalStock = next;
    stock.lastUpdatedAt = new Date();
    const savedStock = await this.stockRepository.save(stock);

    await this.createStockLog({
      ingredientId,
      type: IngredientStockLogType.ADJUST,
      quantity,
      note: payload.note
    });

    return {
      ingredientId,
      totalStock: toFixedQuantity(getNumericValue(savedStock.totalStock)),
      lastUpdatedAt: savedStock.lastUpdatedAt
    };
  }

  async getAllocations(filters: AllocationListFilters) {
    const targetDate = filters.date || getTodayDateString();
    const isOverall = Boolean(filters.overall);
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const ingredientQuery = this.ingredientRepository
      .createQueryBuilder("ingredient")
      .leftJoinAndSelect("ingredient.category", "category")
      .where("ingredient.isActive = true")
      .orderBy("ingredient.name", "ASC");

    if (filters.search) {
      ingredientQuery.andWhere("LOWER(ingredient.name) LIKE LOWER(:search)", {
        search: `%${filters.search}%`
      });
    }

    if (filters.categoryId) {
      ingredientQuery.andWhere("ingredient.categoryId = :categoryId", { categoryId: filters.categoryId });
    }

    const total = await ingredientQuery.getCount();
    const ingredients = await ingredientQuery.offset(offset).limit(limit).getMany();

    const ingredientIds = ingredients.map((ingredient) => ingredient.id);
    const [stocks, allocationRows, usageRows] = await Promise.all([
      ingredientIds.length
        ? this.stockRepository.find({
            where: { ingredientId: In(ingredientIds) }
          })
        : Promise.resolve([]),
      ingredientIds.length
        ? isOverall
          ? this.allocationRepository
              .createQueryBuilder("allocation")
              .select("allocation.ingredientId", "ingredientId")
              .addSelect("SUM(allocation.allocatedQuantity)", "allocatedQuantity")
              .addSelect("SUM(allocation.usedQuantity)", "usedQuantity")
              .addSelect("SUM(allocation.remainingQuantity)", "remainingQuantity")
              .where("allocation.ingredientId IN (:...ingredientIds)", { ingredientIds })
              .groupBy("allocation.ingredientId")
              .getRawMany<{
                ingredientId: string;
                allocatedQuantity: string;
                usedQuantity: string;
                remainingQuantity: string;
              }>()
          : this.allocationRepository.find({
              where: { ingredientId: In(ingredientIds), date: targetDate }
            })
        : Promise.resolve([]),
      ingredientIds.length
        ? this.usageEventRepository
            .createQueryBuilder("event")
            .select("event.ingredientId", "ingredientId")
            .addSelect("SUM(event.consumedQuantity)", "usedQuantity")
            .where("event.ingredientId IN (:...ingredientIds)", { ingredientIds })
            .andWhere(isOverall ? "1 = 1" : "event.usageDate = :date", isOverall ? {} : { date: targetDate })
            .groupBy("event.ingredientId")
            .getRawMany<{ ingredientId: string; usedQuantity: string }>()
        : Promise.resolve([])
    ]);

    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, getNumericValue(stock.totalStock)]));
    const allocationMap = isOverall
      ? new Map(
          (allocationRows as Array<{
            ingredientId: string;
            allocatedQuantity: string;
            usedQuantity: string;
            remainingQuantity: string;
          }>).map((allocation) => [
            allocation.ingredientId,
            {
              id: null,
              allocatedQuantity: getNumericValue(allocation.allocatedQuantity),
              usedQuantity: getNumericValue(allocation.usedQuantity),
              remainingQuantity: getNumericValue(allocation.remainingQuantity)
            }
          ])
        )
      : new Map(
          (allocationRows as DailyAllocation[]).map((allocation) => [
            allocation.ingredientId,
            {
              id: allocation.id,
              allocatedQuantity: getNumericValue(allocation.allocatedQuantity),
              usedQuantity: getNumericValue(allocation.usedQuantity),
              remainingQuantity: getNumericValue(allocation.remainingQuantity)
            }
          ])
        );
    const usageMap = new Map(usageRows.map((row) => [row.ingredientId, getNumericValue(row.usedQuantity)]));

    return {
      rows: ingredients.map((ingredient) => {
        const stockValue = toFixedQuantity(stockMap.get(ingredient.id) ?? 0);
        const allocation = allocationMap.get(ingredient.id);
        const allocatedQuantity = toFixedQuantity(getNumericValue(allocation?.allocatedQuantity));
        const allocationUsed = toFixedQuantity(getNumericValue(allocation?.usedQuantity));
        const usageUsed = toFixedQuantity(usageMap.get(ingredient.id) ?? 0);
        const usedQuantity = toFixedQuantity(Math.max(allocationUsed, usageUsed));
        const remainingQuantity = toFixedQuantity(Math.max(allocatedQuantity - usedQuantity, 0));
        const minStock = toFixedQuantity(getNumericValue(ingredient.minStock));

        return {
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          categoryId: ingredient.categoryId,
          categoryName: ingredient.category.name,
          unit: ingredient.unit,
          totalStock: stockValue,
          minStock,
          allocatedQuantity,
          usedQuantity,
          remainingQuantity,
          allocationId: allocation?.id ?? null,
          status: getStockStatus(stockValue, minStock),
          date: isOverall ? "overall" : targetDate
        };
      }),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async getAllocationStats(filters: AllocationStatsFilters) {
    const targetDate = filters.date || getTodayDateString();
    const ingredientQuery = this.ingredientRepository
      .createQueryBuilder("ingredient")
      .leftJoinAndSelect("ingredient.category", "category")
      .where("ingredient.isActive = true")
      .orderBy("ingredient.name", "ASC");

    if (filters.search) {
      ingredientQuery.andWhere("LOWER(ingredient.name) LIKE LOWER(:search)", {
        search: `%${filters.search}%`
      });
    }

    if (filters.categoryId) {
      ingredientQuery.andWhere("ingredient.categoryId = :categoryId", { categoryId: filters.categoryId });
    }

    const ingredients = await ingredientQuery.getMany();

    const ingredientIds = ingredients.map((ingredient) => ingredient.id);
    const [stocks, allocationTotalsRows, usageRows, staffUsageRows, recentAllocations] = await Promise.all([
      ingredientIds.length
        ? this.stockRepository.find({
            where: { ingredientId: In(ingredientIds) }
          })
        : Promise.resolve([]),
      ingredientIds.length
        ? this.allocationRepository
            .createQueryBuilder("allocation")
            .select("allocation.ingredientId", "ingredientId")
            .addSelect("SUM(allocation.allocatedQuantity)", "allocatedQuantity")
            .addSelect("SUM(allocation.usedQuantity)", "usedQuantity")
            .addSelect("SUM(allocation.remainingQuantity)", "remainingQuantity")
            .where("allocation.ingredientId IN (:...ingredientIds)", { ingredientIds })
            .groupBy("allocation.ingredientId")
            .getRawMany<{
              ingredientId: string;
              allocatedQuantity: string;
              usedQuantity: string;
              remainingQuantity: string;
            }>()
        : Promise.resolve([]),
      ingredientIds.length
        ? this.usageEventRepository
            .createQueryBuilder("event")
            .select("event.ingredientId", "ingredientId")
            .addSelect("SUM(event.consumedQuantity)", "usedQuantity")
            .addSelect("SUM(event.overusedQuantity)", "overusedQuantity")
            .where("event.ingredientId IN (:...ingredientIds)", { ingredientIds })
            .groupBy("event.ingredientId")
            .getRawMany<{ ingredientId: string; usedQuantity: string; overusedQuantity: string }>()
        : Promise.resolve([]),
      ingredientIds.length
        ? this.usageEventRepository
            .createQueryBuilder("event")
            .leftJoin("event.staff", "staff")
            .select("COALESCE(CAST(event.staffId AS text), 'unknown')", "staffId")
            .addSelect("COALESCE(staff.fullName, 'Unknown Staff')", "staffName")
            .addSelect("COUNT(DISTINCT event.ingredientId)", "ingredientCount")
            .addSelect("SUM(event.consumedQuantity)", "consumedQuantity")
            .where("event.ingredientId IN (:...ingredientIds)", { ingredientIds })
            .groupBy("event.staffId")
            .addGroupBy("staff.fullName")
            .orderBy("SUM(event.consumedQuantity)", "DESC")
            .getRawMany<{
              staffId: string;
              staffName: string;
              ingredientCount: string;
              consumedQuantity: string;
            }>()
        : Promise.resolve([]),
      ingredientIds.length
        ? this.allocationRepository.find({
            where: { ingredientId: In(ingredientIds) },
            relations: { ingredient: { category: true } },
            order: { updatedAt: "DESC" },
            take: 6
          })
        : Promise.resolve([])
    ]);

    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, getNumericValue(stock.totalStock)]));
    const fallbackPriceMap = new Map(ingredients.map((ingredient) => [ingredient.id, getNumericValue(ingredient.perUnitPrice)]));
    const valuationMap = await getIngredientValuationMapFromCurrentStock({
      ingredientIds,
      stockByIngredient: stockMap,
      fallbackPriceByIngredient: fallbackPriceMap
    });
    const allocationTotalsMap = new Map(
      allocationTotalsRows.map((row) => [
        row.ingredientId,
        {
          allocatedQuantity: getNumericValue(row.allocatedQuantity),
          usedQuantity: getNumericValue(row.usedQuantity),
          remainingQuantity: getNumericValue(row.remainingQuantity)
        }
      ])
    );
    const usageMap = new Map(
      usageRows.map((row) => [
        row.ingredientId,
        {
          usedQuantity: getNumericValue(row.usedQuantity),
          overusedQuantity: getNumericValue(row.overusedQuantity)
        }
      ])
    );

    let allocatedIngredients = 0;
    let missingAllocationIngredients = 0;
    let lowStockIngredients = 0;
    let healthyStockIngredients = 0;
    let totalStock = 0;
    let totalAllocated = 0;
    let totalUsed = 0;
    let totalRemaining = 0;
    let totalValuation = 0;
    let totalOverused = 0;

    const categoryMetrics = new Map<
      string,
      { categoryName: string; totalStock: number; allocated: number; used: number; remaining: number }
    >();

    let highestValuationIngredient: {
      ingredientId: string;
      ingredientName: string;
      unit: IngredientUnit;
      valuation: number;
      totalStock: number;
    } | null = null;

    let mostUsedIngredient: {
      ingredientId: string;
      ingredientName: string;
      unit: IngredientUnit;
      usedQuantity: number;
    } | null = null;

    for (const ingredient of ingredients) {
      const stockValue = toFixedQuantity(stockMap.get(ingredient.id) ?? 0);
      const minStock = toFixedQuantity(getNumericValue(ingredient.minStock));
      const allocationTotals = allocationTotalsMap.get(ingredient.id);
      const allocationUsed = allocationTotals?.usedQuantity ?? 0;
      const usageUsed = usageMap.get(ingredient.id)?.usedQuantity ?? 0;
      const usedQuantity = toFixedQuantity(Math.max(allocationUsed, usageUsed));
      const allocatedQuantity = toFixedQuantity(allocationTotals?.allocatedQuantity ?? 0);
      const remainingQuantity = toFixedQuantity(Math.max(allocatedQuantity - usedQuantity, 0));
      const overusedQuantity = toFixedQuantity(usageMap.get(ingredient.id)?.overusedQuantity ?? 0);
      const valuation = toFixedQuantity(
        valuationMap.get(ingredient.id) ?? stockValue * getNumericValue(ingredient.perUnitPrice)
      );

      if (allocatedQuantity > 0) {
        allocatedIngredients += 1;
      } else {
        missingAllocationIngredients += 1;
      }

      if (stockValue <= minStock) {
        lowStockIngredients += 1;
      } else {
        healthyStockIngredients += 1;
      }

      totalStock += stockValue;
      totalAllocated += allocatedQuantity;
      totalUsed += usedQuantity;
      totalRemaining += remainingQuantity;
      totalValuation += valuation;
      totalOverused += overusedQuantity;

      if (!highestValuationIngredient || valuation > highestValuationIngredient.valuation) {
        highestValuationIngredient = {
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          unit: ingredient.unit,
          valuation,
          totalStock: stockValue
        };
      }

      if (!mostUsedIngredient || usedQuantity > mostUsedIngredient.usedQuantity) {
        mostUsedIngredient = {
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          unit: ingredient.unit,
          usedQuantity
        };
      }

      const categoryEntry = categoryMetrics.get(ingredient.categoryId) ?? {
        categoryName: ingredient.category.name,
        totalStock: 0,
        allocated: 0,
        used: 0,
        remaining: 0
      };
      categoryEntry.totalStock = toFixedQuantity(categoryEntry.totalStock + stockValue);
      categoryEntry.allocated = toFixedQuantity(categoryEntry.allocated + allocatedQuantity);
      categoryEntry.used = toFixedQuantity(categoryEntry.used + usedQuantity);
      categoryEntry.remaining = toFixedQuantity(categoryEntry.remaining + remainingQuantity);
      categoryMetrics.set(ingredient.categoryId, categoryEntry);
    }

    const recentUpdates = recentAllocations.map((allocation) => ({
      allocationId: allocation.id,
      ingredientId: allocation.ingredientId,
      ingredientName: allocation.ingredient.name,
      categoryName: allocation.ingredient.category.name,
      unit: allocation.ingredient.unit,
      allocatedQuantity: toFixedQuantity(getNumericValue(allocation.allocatedQuantity)),
      usedQuantity: toFixedQuantity(getNumericValue(allocation.usedQuantity)),
      remainingQuantity: toFixedQuantity(getNumericValue(allocation.remainingQuantity)),
      updatedAt: allocation.updatedAt
    }));

    const topUsedIngredients = [...ingredients]
      .map((ingredient) => ({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        unit: ingredient.unit,
        usedQuantity: toFixedQuantity(
          Math.max(allocationTotalsMap.get(ingredient.id)?.usedQuantity ?? 0, usageMap.get(ingredient.id)?.usedQuantity ?? 0)
        )
      }))
      .filter((entry) => entry.usedQuantity > 0)
      .sort((a, b) => b.usedQuantity - a.usedQuantity)
      .slice(0, 8);

    const staffUsageSummary = staffUsageRows.map((row) => ({
      staffId: row.staffId,
      staffName: row.staffName,
      ingredientCount: Number(row.ingredientCount),
      consumedQuantity: toFixedQuantity(getNumericValue(row.consumedQuantity))
    }));

    return {
      date: targetDate,
      totals: {
        totalIngredients: ingredients.length,
        allocatedIngredients,
        missingAllocationIngredients,
        lowStockIngredients,
        healthyStockIngredients
      },
      quantities: {
        totalStock: toFixedQuantity(totalStock),
        totalAllocated: toFixedQuantity(totalAllocated),
        totalUsed: toFixedQuantity(totalUsed),
        totalRemaining: toFixedQuantity(totalRemaining),
        totalValuation: toFixedQuantity(totalValuation),
        totalOverused: toFixedQuantity(totalOverused)
      },
      insights: {
        highestValuationIngredient,
        mostUsedIngredient,
        recentAllocationUpdates: recentUpdates,
        staffUsageSummary
      },
      charts: {
        statusBreakdown: [
          { label: "Low Stock", value: lowStockIngredients },
          { label: "Healthy Stock", value: healthyStockIngredients },
          { label: "No Allocation", value: missingAllocationIngredients }
        ],
        stockByCategory: [...categoryMetrics.values()].sort((a, b) =>
          a.categoryName.localeCompare(b.categoryName)
        ),
        topUsedIngredients
      }
    };
  }

  async assignAllStockToDate(payload: { date: string; note?: string }) {
    throw new AppError(409, allocationDisabledMessage);
  }

  async continueYesterdayAllocation(payload: { date: string; note?: string }) {
    throw new AppError(409, allocationDisabledMessage);
  }

  private async getOrCreatePosBillingControl() {
    const existing = await this.posBillingControlRepository.findOne({
      where: {},
      order: { updatedAt: "DESC" },
      relations: { updatedByUser: true }
    });

    if (existing) {
      return existing;
    }

    const created = this.posBillingControlRepository.create({
      isBillingEnabled: true,
      enforceDailyAllocation: false,
      reason: null,
      updatedByUserId: null
    });
    return this.posBillingControlRepository.save(created);
  }

  private async getClosingDraftItems(reportDate: string) {
    const ingredients = await this.ingredientRepository.find({
      where: { isActive: true },
      relations: { category: true },
      order: { name: "ASC" }
    });

    const ingredientIds = ingredients.map((ingredient) => ingredient.id);
    if (!ingredientIds.length) {
      return [];
    }

    const [allocations, usageRows, stocks, purchaseRows, dumpRows] = await Promise.all([
      this.allocationRepository.find({
        where: { ingredientId: In(ingredientIds), date: reportDate }
      }),
      this.usageEventRepository
        .createQueryBuilder("usage")
        .select("usage.ingredientId", "ingredientId")
        .addSelect("SUM(usage.consumedQuantity)", "usedQuantity")
        .where("usage.usageDate = :reportDate", { reportDate })
        .andWhere("usage.ingredientId IS NOT NULL")
        .groupBy("usage.ingredientId")
        .getRawMany<{ ingredientId: string; usedQuantity: string }>(),
      this.stockRepository.find({
        where: { ingredientId: In(ingredientIds) }
      }),
      AppDataSource.query(
        `
        SELECT
          line."ingredientId" AS "ingredientId",
          SUM(COALESCE(line."stockAdded", 0)) AS "quantity"
        FROM "purchase_order_lines" line
        INNER JOIN "purchase_orders" po ON po."id" = line."purchaseOrderId"
        WHERE line."lineType" = 'ingredient'
          AND line."ingredientId" IS NOT NULL
          AND line."ingredientId" = ANY($2::uuid[])
          AND po."purchaseDate" = $1
        GROUP BY line."ingredientId"
        `,
        [reportDate, ingredientIds]
      ),
      AppDataSource.query(
        `
        WITH expanded AS (
          SELECT
            COALESCE(NULLIF((impact->>'ingredientId'), ''), dump."ingredientId"::text) AS "ingredientId",
            COALESCE(
              CASE WHEN impact ? 'quantity' THEN NULLIF(impact->>'quantity', '')::numeric ELSE NULL END,
              dump."baseQuantity"
            ) AS "quantity"
          FROM "dump_entries" dump
          LEFT JOIN LATERAL jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(dump."ingredientImpacts") = 'array' THEN dump."ingredientImpacts"
              ELSE '[]'::jsonb
            END
          ) impact ON TRUE
          WHERE dump."entryDate" = $1
            AND (
              dump."entryType" = 'ingredient'
              OR (impact->>'ingredientId') IS NOT NULL
            )
        )
        SELECT
          expanded."ingredientId" AS "ingredientId",
          SUM(COALESCE(expanded."quantity", 0)) AS "quantity"
        FROM expanded
        WHERE expanded."ingredientId" = ANY($2::text[])
        GROUP BY expanded."ingredientId"
        `,
        [reportDate, ingredientIds]
      )
    ]);

    const allocationMap = new Map(allocations.map((allocation) => [allocation.ingredientId, allocation]));
    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, toFixedQuantity(getNumericValue(stock.totalStock))]));
    const usageMap = new Map(
      usageRows.map((row) => [row.ingredientId, toFixedQuantity(getNumericValue(row.usedQuantity))])
    );
    const purchaseMap = new Map(
      (purchaseRows as Array<Record<string, unknown>>).map((row) => [
        String(row.ingredientId ?? ""),
        toFixedQuantity(getNumericValue(row.quantity as string | number | null | undefined))
      ])
    );
    const dumpMap = new Map(
      (dumpRows as Array<Record<string, unknown>>).map((row) => [
        String(row.ingredientId ?? ""),
        toFixedQuantity(getNumericValue(row.quantity as string | number | null | undefined))
      ])
    );

    return ingredients.map((ingredient) => {
      const allocation = allocationMap.get(ingredient.id);
      const currentStock = stockMap.get(ingredient.id) ?? 0;
      const allocatedQuantity = toFixedQuantity(getNumericValue(allocation?.allocatedQuantity));
      const allocationUsed = toFixedQuantity(getNumericValue(allocation?.usedQuantity));
      const usageUsed = usageMap.get(ingredient.id) ?? 0;
      const usedQuantity = toFixedQuantity(Math.max(allocationUsed, usageUsed));
      const purchaseQuantity = purchaseMap.get(ingredient.id) ?? 0;
      const dumpQuantity = dumpMap.get(ingredient.id) ?? 0;
      const hasAllocation = allocatedQuantity > 0;
      const openingQuantity = hasAllocation
        ? allocatedQuantity
        : toFixedQuantity(Math.max(currentStock + usedQuantity + dumpQuantity - purchaseQuantity, 0));
      const expectedRemainingQuantity = hasAllocation
        ? toFixedQuantity(Math.max(allocatedQuantity - usedQuantity, 0))
        : currentStock;

      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        categoryName: ingredient.category.name,
        unit: ingredient.unit,
        allocatedQuantity: openingQuantity,
        usedQuantity,
        expectedRemainingQuantity
      };
    });
  }

  private async resolveOrderGateStatus(userId: string) {
    const now = new Date();
    const today = getDateOnlyString(now);
    const previousDate = getPreviousDateString(today);
    const control = await this.getOrCreatePosBillingControl();

    const [reports, oldestPendingCloseDate] = await Promise.all([
      this.closingReportRepository.find({
        where: {
          staffId: userId,
          reportDate: In([previousDate, today])
        }
      }),
      this.usageEventRepository
        .createQueryBuilder("usage")
        .select("usage.usageDate", "usageDate")
        .leftJoin(
          StaffClosingReport,
          "report",
          'report."staffId" = :staffId AND report."reportDate" = usage."usageDate"',
          { staffId: userId }
        )
        .where("usage.staffId = :staffId", { staffId: userId })
        .andWhere("usage.usageDate < :today", { today })
        .andWhere("usage.ingredientId IS NOT NULL")
        .andWhere("report.id IS NULL")
        .groupBy("usage.usageDate")
        .orderBy("usage.usageDate", "ASC")
        .limit(1)
        .getRawOne<{ usageDate: string }>()
    ]);

    const hasClosedPreviousBusinessDate = reports.some((report) => report.reportDate === previousDate);
    const hasClosedTodayBusinessDate = reports.some((report) => report.reportDate === today);
    const pendingCloseDate = oldestPendingCloseDate?.usageDate ?? (hasClosedTodayBusinessDate ? null : today);

    if (!control.isBillingEnabled) {
      return {
        canTakeOrders: false,
        reason: control.reason?.trim() || "POS billing is disabled by admin. Please contact administrator.",
        pendingCloseDate,
        hasClosedPreviousBusinessDate,
        hasClosedTodayBusinessDate,
        today,
        previousDate,
        control
      };
    }

    if (oldestPendingCloseDate?.usageDate) {
      return {
        canTakeOrders: false,
        reason: `Business day (${oldestPendingCloseDate.usageDate}) closing is pending. Submit that closing first to continue billing.`,
        pendingCloseDate,
        hasClosedPreviousBusinessDate,
        hasClosedTodayBusinessDate,
        today,
        previousDate,
        control
      };
    }

    if (hasClosedTodayBusinessDate) {
      return {
        canTakeOrders: false,
        reason: "Today closing already submitted. Admin can reopen this date to continue billing.",
        pendingCloseDate,
        hasClosedPreviousBusinessDate,
        hasClosedTodayBusinessDate,
        today,
        previousDate,
        control
      };
    }

    return {
      canTakeOrders: true,
      reason: null as string | null,
      pendingCloseDate,
      hasClosedPreviousBusinessDate,
      hasClosedTodayBusinessDate,
      today,
      previousDate,
      control
    };
  }

  async getPosBillingControl() {
    const control = await this.getOrCreatePosBillingControl();
    return {
      isBillingEnabled: control.isBillingEnabled,
      enforceDailyAllocation: control.enforceDailyAllocation,
      reason: control.reason,
      updatedAt: control.updatedAt,
      updatedByUserId: control.updatedByUserId,
      updatedByName: control.updatedByUser?.fullName ?? null
    };
  }

  async updatePosBillingControl(payload: {
    isBillingEnabled?: boolean;
    enforceDailyAllocation?: boolean;
    reason?: string;
  }, updatedByUserId: string) {
    const control = await this.getOrCreatePosBillingControl();

    if (payload.isBillingEnabled !== undefined) {
      control.isBillingEnabled = payload.isBillingEnabled;
    }
    if (payload.enforceDailyAllocation !== undefined) {
      control.enforceDailyAllocation = payload.enforceDailyAllocation;
    }
    if (payload.reason !== undefined) {
      control.reason = payload.reason.trim() || null;
    }
    control.updatedByUserId = updatedByUserId;

    const saved = await this.posBillingControlRepository.save(control);
    return {
      isBillingEnabled: saved.isBillingEnabled,
      enforceDailyAllocation: saved.enforceDailyAllocation,
      reason: saved.reason,
      updatedAt: saved.updatedAt,
      updatedByUserId: saved.updatedByUserId
    };
  }

  async getClosingStatus(userId: string) {
    const gate = await this.resolveOrderGateStatus(userId);
    const draftItems = await this.getClosingDraftItems(gate.pendingCloseDate ?? gate.today);

    return {
      canTakeOrders: gate.canTakeOrders,
      reason: gate.reason,
      pendingCloseDate: gate.pendingCloseDate,
      hasClosedPreviousBusinessDate: gate.hasClosedPreviousBusinessDate,
      hasClosedTodayBusinessDate: gate.hasClosedTodayBusinessDate,
      todayClosingCount: gate.hasClosedTodayBusinessDate ? 1 : 0,
      maxClosingsPerDay: 1,
      posBillingControl: {
        isBillingEnabled: gate.control.isBillingEnabled,
        enforceDailyAllocation: gate.control.enforceDailyAllocation,
        reason: gate.control.reason
      },
      draft: {
        reportDate: gate.pendingCloseDate ?? gate.today,
        rows: draftItems
      }
    };
  }

  async submitClosingReport(
    payload: {
      reportDate?: string;
      note?: string;
      rows: Array<{ ingredientId: string; reportedRemainingQuantity: number }>;
    },
    userId: string
  ) {
    const gate = await this.resolveOrderGateStatus(userId);
    const reportDate = payload.reportDate || gate.pendingCloseDate || gate.today;

    if (!gate.pendingCloseDate) {
      throw new AppError(409, "No pending closing found for submission right now.");
    }

    if (reportDate !== gate.pendingCloseDate) {
      throw new AppError(
        409,
        `Please submit pending closing for ${gate.pendingCloseDate} first before closing ${reportDate}.`
      );
    }

    const existing = await this.closingReportRepository.findOne({
      where: { staffId: userId, reportDate }
    });
    if (existing) {
      throw new AppError(409, `Closing for ${reportDate} is already submitted.`);
    }

    const draftItems = await this.getClosingDraftItems(reportDate);
    if (!draftItems.length) {
      throw new AppError(422, "No ingredient rows available for closing submission.");
    }

    const reportedMap = new Map<string, number>();
    payload.rows.forEach((row) => {
      reportedMap.set(row.ingredientId, toFixedQuantity(row.reportedRemainingQuantity));
    });

    const items = draftItems.map((entry) => {
      const reported =
        reportedMap.has(entry.ingredientId) ? reportedMap.get(entry.ingredientId)! : entry.expectedRemainingQuantity;

      if (reported < 0) {
        throw new AppError(422, `Reported remaining cannot be negative for ${entry.ingredientName}.`);
      }

      return {
        ingredientId: entry.ingredientId,
        ingredientName: entry.ingredientName,
        unit: entry.unit,
        allocatedQuantity: entry.allocatedQuantity,
        usedQuantity: entry.usedQuantity,
        expectedRemainingQuantity: entry.expectedRemainingQuantity,
        reportedRemainingQuantity: reported,
        varianceQuantity: toFixedQuantity(reported - entry.expectedRemainingQuantity)
      };
    });

    const totalExpectedRemaining = toFixedQuantity(
      items.reduce((sum, item) => sum + item.expectedRemainingQuantity, 0)
    );
    const totalReportedRemaining = toFixedQuantity(
      items.reduce((sum, item) => sum + item.reportedRemainingQuantity, 0)
    );
    const totalVariance = toFixedQuantity(totalReportedRemaining - totalExpectedRemaining);

    const report = this.closingReportRepository.create({
      staffId: userId,
      reportDate,
      closingSlot: 1,
      isCarryForwardClosing: false,
      totalIngredients: items.length,
      totalExpectedRemaining,
      totalReportedRemaining,
      totalVariance,
      items,
      note: payload.note?.trim() || null
    });

    const saved = await this.closingReportRepository.save(report);
    const status = await this.getClosingStatus(userId);

    return {
      report: {
        id: saved.id,
        staffId: saved.staffId,
        reportDate: saved.reportDate,
        closingSlot: saved.closingSlot,
        isCarryForwardClosing: saved.isCarryForwardClosing,
        totalIngredients: saved.totalIngredients,
        totalExpectedRemaining: toFixedQuantity(getNumericValue(saved.totalExpectedRemaining)),
        totalReportedRemaining: toFixedQuantity(getNumericValue(saved.totalReportedRemaining)),
        totalVariance: toFixedQuantity(getNumericValue(saved.totalVariance)),
        note: saved.note,
        submittedAt: saved.submittedAt,
        items: saved.items
      },
      status
    };
  }

  async reopenClosingReport(reportId: string, reopenedByUserId: string) {
    const report = await this.closingReportRepository.findOne({
      where: { id: reportId }
    });

    if (!report) {
      throw new AppError(404, "Closing report not found.");
    }

    await this.closingReportRepository.delete({ id: report.id });
    const status = await this.getClosingStatus(report.staffId);

    return {
      reopened: {
        id: report.id,
        staffId: report.staffId,
        reportDate: report.reportDate,
        reopenedByUserId
      },
      status
    };
  }

  async listClosingReports(filters: {
    date?: string;
    page: number;
    limit: number;
    staffId?: string;
  }, context: { userId: string; role: UserRole }) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 10));

    const query = this.closingReportRepository
      .createQueryBuilder("report")
      .leftJoinAndSelect("report.staff", "staff")
      .orderBy("report.submittedAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.date) {
      query.andWhere("report.reportDate = :reportDate", { reportDate: filters.date });
    }

    if (context.role === UserRole.ADMIN || context.role === UserRole.MANAGER || context.role === UserRole.ACCOUNTANT) {
      if (filters.staffId) {
        query.andWhere("report.staffId = :staffId", { staffId: filters.staffId });
      }
    } else {
      query.andWhere("report.staffId = :staffId", { staffId: context.userId });
    }

    const [reports, total] = await query.getManyAndCount();
    return {
      reports: reports.map((report) => ({
        id: report.id,
        staffId: report.staffId,
        staffName: report.staff?.fullName ?? "-",
        reportDate: report.reportDate,
        closingSlot: report.closingSlot,
        isCarryForwardClosing: report.isCarryForwardClosing,
        totalIngredients: report.totalIngredients,
        totalExpectedRemaining: toFixedQuantity(getNumericValue(report.totalExpectedRemaining)),
        totalReportedRemaining: toFixedQuantity(getNumericValue(report.totalReportedRemaining)),
        totalVariance: toFixedQuantity(getNumericValue(report.totalVariance)),
        note: report.note,
        submittedAt: report.submittedAt
      })),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async getStockAudit(filters: { dateFrom?: string; dateTo?: string; page: number; limit: number; staffId?: string }) {
    const rangeTo = normalizeDateInput(filters.dateTo || getTodayDateString(), "Date To");
    let rangeFrom = filters.dateFrom ? normalizeDateInput(filters.dateFrom, "Date From") : "";

    if (!rangeFrom) {
      const firstReportQuery = this.closingReportRepository
        .createQueryBuilder("report")
        .select("MIN(report.reportDate)", "firstDate");
      if (filters.staffId) {
        firstReportQuery.where("report.staffId = :staffId", { staffId: filters.staffId });
      }
      const firstReport = await firstReportQuery.getRawOne<{ firstDate: string | Date | null }>();
      rangeFrom = firstReport?.firstDate ? normalizeDateInput(firstReport.firstDate, "Date From") : rangeTo;
    }

    if (rangeFrom > rangeTo) {
      throw new AppError(422, "Date From must be before Date To.");
    }

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const query = this.closingReportRepository
      .createQueryBuilder("report")
      .leftJoinAndSelect("report.staff", "staff")
      .where("report.reportDate >= :rangeFrom AND report.reportDate <= :rangeTo", { rangeFrom, rangeTo })
      .orderBy("report.submittedAt", "DESC");

    if (filters.staffId) {
      query.andWhere("report.staffId = :staffId", { staffId: filters.staffId });
    }

    const reports = await query.getMany();

    const purchaseRows = await AppDataSource.query(
      `
      SELECT
        po."purchaseDate" AS "date",
        line."ingredientId" AS "ingredientId",
        SUM(COALESCE(line."stockAdded", 0)) AS "quantity"
      FROM "purchase_order_lines" line
      INNER JOIN "purchase_orders" po ON po."id" = line."purchaseOrderId"
      WHERE line."lineType" = 'ingredient'
        AND line."ingredientId" IS NOT NULL
        AND po."purchaseDate" >= $1
        AND po."purchaseDate" <= $2
      GROUP BY po."purchaseDate", line."ingredientId"
      `,
      [rangeFrom, rangeTo]
    );

    const dumpRows = await AppDataSource.query(
      `
      SELECT
        dump."entryDate" AS "date",
        COALESCE(NULLIF((impact->>'ingredientId'), ''), dump."ingredientId"::text) AS "ingredientId",
        SUM(
          COALESCE(
            CASE WHEN impact ? 'quantity' THEN NULLIF(impact->>'quantity', '')::numeric ELSE NULL END,
            dump."baseQuantity"
          )
        ) AS "quantity"
      FROM "dump_entries" dump
      LEFT JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(dump."ingredientImpacts") = 'array' THEN dump."ingredientImpacts"
          ELSE '[]'::jsonb
        END
      ) impact ON TRUE
      WHERE dump."entryDate" >= $1
        AND dump."entryDate" <= $2
        AND (
          dump."entryType" = 'ingredient'
          OR (impact->>'ingredientId') IS NOT NULL
        )
      GROUP BY
        dump."entryDate",
        COALESCE(NULLIF((impact->>'ingredientId'), ''), dump."ingredientId"::text)
      `,
      [rangeFrom, rangeTo]
    );

    const transferRows = await AppDataSource.query(
      `
      SELECT
        transfer."transferDate" AS "date",
        movement."ingredientId" AS "ingredientId",
        SUM(
          CASE
            WHEN transfer."toOutletId" IS NOT NULL THEN movement."quantity"
            ELSE 0
          END
        ) AS "transferredIn",
        SUM(
          CASE
            WHEN transfer."fromOutletId" IS NOT NULL THEN movement."quantity"
            ELSE 0
          END
        ) AS "transferredOut"
      FROM "outlet_transfers" transfer
      JOIN LATERAL (
        SELECT
          NULLIF(line->>'sourceId', '') AS "ingredientId",
          COALESCE(NULLIF(line->>'quantity', ''), '0')::numeric AS "quantity"
        FROM jsonb_array_elements(transfer."lines") line
        WHERE line->>'lineType' = 'ingredient'

        UNION ALL

        SELECT
          NULLIF(impact->>'ingredientId', '') AS "ingredientId",
          COALESCE(NULLIF(impact->>'quantity', ''), '0')::numeric AS "quantity"
        FROM jsonb_array_elements(transfer."lines") line
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(line->'impacts') = 'array' THEN line->'impacts'
            ELSE '[]'::jsonb
          END
        ) impact
        WHERE line->>'lineType' = 'item'
      ) movement ON TRUE
      WHERE transfer."transferDate" >= $1
        AND transfer."transferDate" <= $2
        AND movement."ingredientId" IS NOT NULL
      GROUP BY transfer."transferDate", movement."ingredientId"
      `,
      [rangeFrom, rangeTo]
    );

    const movementKey = (ingredientId: string, date: string) => `${ingredientId}::${date}`;
    const purchaseByKey = new Map<string, number>();
    const dumpByKey = new Map<string, number>();
    const transferInByKey = new Map<string, number>();
    const transferOutByKey = new Map<string, number>();

    (purchaseRows as Array<Record<string, unknown>>).forEach((row) => {
      const ingredientId = String(row.ingredientId ?? "");
      const date = String(row.date ?? "");
      if (!ingredientId || !date) {
        return;
      }
      purchaseByKey.set(
        movementKey(ingredientId, date),
        toFixedQuantity(getNumericValue(row.quantity as string | number | null | undefined))
      );
    });

    (dumpRows as Array<Record<string, unknown>>).forEach((row) => {
      const ingredientId = String(row.ingredientId ?? "");
      const date = String(row.date ?? "");
      if (!ingredientId || !date) {
        return;
      }
      dumpByKey.set(
        movementKey(ingredientId, date),
        toFixedQuantity(getNumericValue(row.quantity as string | number | null | undefined))
      );
    });

    (transferRows as Array<Record<string, unknown>>).forEach((row) => {
      const ingredientId = String(row.ingredientId ?? "");
      const date = String(row.date ?? "");
      if (!ingredientId || !date) {
        return;
      }
      transferInByKey.set(
        movementKey(ingredientId, date),
        toFixedQuantity(getNumericValue(row.transferredIn as string | number | null | undefined))
      );
      transferOutByKey.set(
        movementKey(ingredientId, date),
        toFixedQuantity(getNumericValue(row.transferredOut as string | number | null | undefined))
      );
    });

    const flattenedItems = reports.flatMap((report) =>
      (report.items ?? []).map((item) => {
        const key = movementKey(item.ingredientId, report.reportDate);
        const purchaseStockQuantity = toFixedQuantity(purchaseByKey.get(key) ?? 0);
        const transferredInQuantity = toFixedQuantity(transferInByKey.get(key) ?? 0);
        const transferredOutQuantity = toFixedQuantity(transferOutByKey.get(key) ?? 0);
        const dumpQuantity = toFixedQuantity(dumpByKey.get(key) ?? 0);
        const consumptionQuantity = toFixedQuantity(getNumericValue(item.usedQuantity));
        const expectedStockQuantity = toFixedQuantity(getNumericValue(item.expectedRemainingQuantity));
        const openingFromSnapshot = toFixedQuantity(getNumericValue(item.allocatedQuantity));
        const openingFromBalance = toFixedQuantity(
          expectedStockQuantity -
            purchaseStockQuantity -
            transferredInQuantity +
            transferredOutQuantity +
            consumptionQuantity +
            dumpQuantity
        );
        const openingStockQuantity =
          Math.abs(openingFromSnapshot - openingFromBalance) > 0.001
            ? toFixedQuantity(Math.max(openingFromBalance, 0))
            : openingFromSnapshot;

        return {
          reportItemId: `${report.id}-${item.ingredientId}`,
          reportId: report.id,
          reportDate: report.reportDate,
          staffId: report.staffId,
          staffName: report.staff?.fullName ?? "-",
          submittedAt: report.submittedAt,
          ingredientId: item.ingredientId,
          ingredientName: item.ingredientName,
          unit: item.unit,
          openingStockQuantity,
          purchaseStockQuantity,
          transferredInQuantity,
          transferredOutQuantity,
          consumptionQuantity,
          dumpQuantity,
          expectedStockQuantity,
          enteredStockQuantity: toFixedQuantity(getNumericValue(item.reportedRemainingQuantity)),
          allocatedQuantity: openingFromSnapshot,
          usedQuantity: consumptionQuantity,
          expectedRemainingQuantity: expectedStockQuantity,
          reportedRemainingQuantity: toFixedQuantity(getNumericValue(item.reportedRemainingQuantity)),
          varianceQuantity: toFixedQuantity(getNumericValue(item.varianceQuantity)),
          isMismatch: Math.abs(getNumericValue(item.varianceQuantity)) > 0.0001
        };
      })
    );

    const totalItems = flattenedItems.length;
    const pagedItems = flattenedItems.slice(offset, offset + limit);
    const totalExpected = toFixedQuantity(
      flattenedItems.reduce((sum, item) => sum + item.expectedStockQuantity, 0)
    );
    const totalEntered = toFixedQuantity(
      flattenedItems.reduce((sum, item) => sum + item.enteredStockQuantity, 0)
    );
    const totalVarianceAbs = toFixedQuantity(
      flattenedItems.reduce((sum, item) => sum + Math.abs(item.varianceQuantity), 0)
    );
    const totalPurchaseStock = toFixedQuantity(
      flattenedItems.reduce((sum, item) => sum + item.purchaseStockQuantity, 0)
    );
    const totalConsumptionStock = toFixedQuantity(
      flattenedItems.reduce((sum, item) => sum + item.consumptionQuantity, 0)
    );
    const totalDumpStock = toFixedQuantity(
      flattenedItems.reduce((sum, item) => sum + item.dumpQuantity, 0)
    );
    const totalTransferInStock = toFixedQuantity(
      flattenedItems.reduce((sum, item) => sum + item.transferredInQuantity, 0)
    );
    const totalTransferOutStock = toFixedQuantity(
      flattenedItems.reduce((sum, item) => sum + item.transferredOutQuantity, 0)
    );
    const mismatchedIngredients = flattenedItems.filter((item) => item.isMismatch).length;
    const uniqueStaff = new Set(reports.map((report) => report.staffId));
    const control = await this.getOrCreatePosBillingControl();
    const unallocatedStockSummary = await AppDataSource.query(
      `
      SELECT
        COALESCE(SUM(stock."totalStock"), 0) AS "totalUnallocatedStock",
        COALESCE(SUM(CASE WHEN COALESCE(stock."totalStock", 0) > 0 THEN 1 ELSE 0 END), 0) AS "ingredientsWithUnallocated"
      FROM "ingredient_stocks" stock
      INNER JOIN "ingredients" ingredient ON ingredient."id" = stock."ingredientId"
      WHERE ingredient."isActive" = TRUE
      `
    );
    const totalUnallocatedStock = toFixedQuantity(
      getNumericValue((unallocatedStockSummary?.[0] as Record<string, unknown> | undefined)?.totalUnallocatedStock as
        | string
        | number
        | null
        | undefined)
    );
    const ingredientsWithUnallocated = Math.max(
      0,
      Number(
        (unallocatedStockSummary?.[0] as Record<string, unknown> | undefined)?.ingredientsWithUnallocated ?? 0
      ) || 0
    );

    return {
      dateFrom: rangeFrom,
      dateTo: rangeTo,
      stats: {
        totalReports: reports.length,
        staffSubmitted: uniqueStaff.size,
        totalIngredients: totalItems,
        mismatchedIngredients,
        matchedIngredients: Math.max(totalItems - mismatchedIngredients, 0),
        totalExpectedRemaining: totalExpected,
        totalReportedRemaining: totalEntered,
        totalVarianceAbs,
        totalPurchaseStock,
        totalConsumptionStock,
        totalDumpStock,
        totalTransferInStock,
        totalTransferOutStock,
        totalUnallocatedStock,
        ingredientsWithUnallocated
      },
      posBillingControl: {
        isBillingEnabled: control.isBillingEnabled,
        enforceDailyAllocation: control.enforceDailyAllocation,
        reason: control.reason,
        updatedAt: control.updatedAt
      },
      reports: reports.map((report) => ({
        id: report.id,
        staffId: report.staffId,
        staffName: report.staff?.fullName ?? "-",
        reportDate: report.reportDate,
        closingSlot: report.closingSlot,
        isCarryForwardClosing: report.isCarryForwardClosing,
        totalIngredients: report.totalIngredients,
        mismatchRows: (report.items ?? []).filter((item) => Math.abs(getNumericValue(item.varianceQuantity)) > 0.0001).length,
        matchedRows: (report.items ?? []).filter((item) => Math.abs(getNumericValue(item.varianceQuantity)) <= 0.0001).length,
        totalExpectedRemaining: toFixedQuantity(getNumericValue(report.totalExpectedRemaining)),
        totalReportedRemaining: toFixedQuantity(getNumericValue(report.totalReportedRemaining)),
        totalVariance: toFixedQuantity(getNumericValue(report.totalVariance)),
        note: report.note,
        submittedAt: report.submittedAt
      })),
      items: {
        rows: pagedItems,
        pagination: getPaginationMeta(page, limit, totalItems)
      }
    };
  }

  async saveAllocation(payload: { ingredientId: string; date: string; allocatedQuantity: number; note?: string }) {
    throw new AppError(409, allocationDisabledMessage);
  }

  async updateAllocation(
    id: string,
    payload: { allocatedQuantity?: number; usedQuantity?: number; note?: string }
  ) {
    throw new AppError(409, allocationDisabledMessage);
  }
}
