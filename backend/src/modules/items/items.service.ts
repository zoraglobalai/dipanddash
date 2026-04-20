import { EntityManager, In } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { IngredientCategory } from "../ingredients/ingredient-category.entity";
import { Ingredient } from "../ingredients/ingredient.entity";
import { IngredientStockLog } from "../ingredients/ingredient-stock-log.entity";
import { IngredientStock } from "../ingredients/ingredient-stock.entity";
import {
  INGREDIENT_UNITS,
  IngredientStockLogType,
  type IngredientUnit
} from "../ingredients/ingredients.constants";
import { AddOn } from "./add-on.entity";
import { AddOnIngredient } from "./add-on-ingredient.entity";
import { Combo } from "./combo.entity";
import { ComboItem } from "./combo-item.entity";
import { ItemCategory } from "./item-category.entity";
import { Item } from "./item.entity";
import { ItemIngredient } from "./item-ingredient.entity";
import { ItemSauce } from "./item-sauce.entity";
import { SauceBatch } from "./sauce-batch.entity";
import { SauceRecipeIngredient } from "./sauce-recipe-ingredient.entity";
import { SauceRecipe } from "./sauce-recipe.entity";
import { UNIT_META, convertIngredientQuantity } from "./items.units";
import { getLatestIngredientPurchasePriceMap } from "../procurement/ingredient-costing";

type PaginationQuery = {
  page: number;
  limit: number;
};

type CategoryFilters = PaginationQuery & {
  search?: string;
  includeInactive?: boolean;
};

type ItemFilters = PaginationQuery & {
  search?: string;
  categoryId?: string;
  includeInactive?: boolean;
};

type AddOnFilters = PaginationQuery & {
  search?: string;
  includeInactive?: boolean;
};

type ComboFilters = PaginationQuery & {
  search?: string;
  includeInactive?: boolean;
};

type SauceFilters = PaginationQuery & {
  search?: string;
  includeInactive?: boolean;
};

type RecipePayload = {
  ingredientId: string;
  quantity: number;
  unit: IngredientUnit;
};

type ItemSaucePayload = {
  sauceId: string;
  quantity: number;
  unit: IngredientUnit;
};

type ComboPayloadItem = {
  itemId: string;
  quantity: number;
};

type BulkItemImportRow = {
  rowNumber: number;
  categoryName: string;
  categoryDescription: string | null;
  itemName: string;
  sellingPrice: number;
  gstPercentage: number;
  note: string | null;
  ingredientName: string;
  ingredientQuantity: number;
  ingredientUnit: IngredientUnit;
};

type BulkItemGroupedRecipeRow = {
  rowNumber: number;
  ingredientName: string;
  ingredientKey: string;
  quantity: number;
  unit: IngredientUnit;
};

type BulkItemGroupedRow = {
  itemKey: string;
  itemName: string;
  categoryKey: string;
  categoryName: string;
  categoryDescription: string | null;
  sellingPrice: number;
  gstPercentage: number;
  note: string | null;
  recipeRows: BulkItemGroupedRecipeRow[];
};

type BulkItemImportSummary = {
  totalRows: number;
  parsedRows: number;
  parsedItems: number;
  insertedCategories: number;
  insertedItems: number;
  insertedRecipeRows: number;
  skippedExistingItems: number;
  skippedDuplicateRows: number;
  invalidRows: number;
  invalidRowDetails: Array<{ rowNumber: number; reason: string }>;
};

const BULK_ITEM_TEMPLATE_HEADERS = [
  "category_name",
  "category_description",
  "item_name",
  "selling_price",
  "gst_percentage",
  "note",
  "ingredient_name",
  "ingredient_quantity",
  "ingredient_unit"
] as const;

const VALID_INGREDIENT_UNIT_SET = new Set<string>(INGREDIENT_UNITS.map((unit) => unit.toLowerCase()));
const MAX_BULK_INVALID_ROW_DETAILS = 40;
const SAUCE_CATEGORY_NAME = "Prepared Sauces";
const SAUCE_CATEGORY_DESCRIPTION = "Prepared sauces, dips and premixes for recipe usage.";

const getNumericValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toFixed = (value: number, digits = 3) => Number(getNumericValue(value).toFixed(digits));
const toMoney = (value: number) => toFixed(value, 2);

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const cleanOptionalText = (value?: string) => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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

const parseCsvNonNegativeNumber = (
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

const parseCsvPositiveNumber = (value: string | undefined, fieldLabel: string, rowNumber: number) => {
  if (!value || !value.trim()) {
    throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} is required.`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} must be a valid number.`);
  }
  if (parsed <= 0) {
    throw new AppError(422, `Row ${rowNumber}: ${fieldLabel} must be greater than zero.`);
  }
  return parsed;
};

const mapDuplicateIds = (ids: string[]) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) {
      duplicates.add(id);
      return;
    }
    seen.add(id);
  });
  return Array.from(duplicates);
};

export class ItemsService {
  private readonly itemCategoryRepository = AppDataSource.getRepository(ItemCategory);
  private readonly ingredientCategoryRepository = AppDataSource.getRepository(IngredientCategory);
  private readonly itemRepository = AppDataSource.getRepository(Item);
  private readonly itemIngredientRepository = AppDataSource.getRepository(ItemIngredient);
  private readonly itemSauceRepository = AppDataSource.getRepository(ItemSauce);
  private readonly addOnRepository = AppDataSource.getRepository(AddOn);
  private readonly addOnIngredientRepository = AppDataSource.getRepository(AddOnIngredient);
  private readonly comboRepository = AppDataSource.getRepository(Combo);
  private readonly comboItemRepository = AppDataSource.getRepository(ComboItem);
  private readonly sauceRecipeRepository = AppDataSource.getRepository(SauceRecipe);
  private readonly sauceRecipeIngredientRepository = AppDataSource.getRepository(SauceRecipeIngredient);
  private readonly sauceBatchRepository = AppDataSource.getRepository(SauceBatch);
  private readonly ingredientRepository = AppDataSource.getRepository(Ingredient);
  private readonly ingredientStockRepository = AppDataSource.getRepository(IngredientStock);
  private readonly ingredientStockLogRepository = AppDataSource.getRepository(IngredientStockLog);

  private async getActiveItemCategoryOrFail(categoryId: string) {
    const category = await this.itemCategoryRepository.findOne({
      where: { id: categoryId, isActive: true }
    });

    if (!category) {
      throw new AppError(404, "Item category not found");
    }

    return category;
  }

  private async getItemOrFail(itemId: string) {
    const item = await this.itemRepository.findOne({
      where: { id: itemId },
      relations: { category: true }
    });

    if (!item) {
      throw new AppError(404, "Item not found");
    }

    return item;
  }

  private async getAddOnOrFail(addOnId: string) {
    const addOn = await this.addOnRepository.findOne({
      where: { id: addOnId }
    });

    if (!addOn) {
      throw new AppError(404, "Add-on not found");
    }

    return addOn;
  }

  private async getComboOrFail(comboId: string) {
    const combo = await this.comboRepository.findOne({
      where: { id: comboId }
    });

    if (!combo) {
      throw new AppError(404, "Combo not found");
    }

    return combo;
  }

  private async getSauceOrFail(sauceId: string) {
    const sauce = await this.sauceRecipeRepository.findOne({
      where: { id: sauceId },
      relations: { outputIngredient: true }
    });

    if (!sauce) {
      throw new AppError(404, "Sauce not found");
    }

    return sauce;
  }

  private async validateUniqueCategoryName(name: string, excludeId?: string) {
    const query = this.itemCategoryRepository
      .createQueryBuilder("category")
      .where("LOWER(category.name) = LOWER(:name)", { name });

    if (excludeId) {
      query.andWhere("category.id != :excludeId", { excludeId });
    }

    const exists = await query.getOne();
    if (exists) {
      throw new AppError(409, "Item category with this name already exists");
    }
  }

  private async validateUniqueItemName(name: string, excludeId?: string) {
    const query = this.itemRepository
      .createQueryBuilder("item")
      .where("LOWER(item.name) = LOWER(:name)", { name });

    if (excludeId) {
      query.andWhere("item.id != :excludeId", { excludeId });
    }

    const exists = await query.getOne();
    if (exists) {
      throw new AppError(409, "Item with this name already exists");
    }
  }

  private async validateUniqueAddOnName(name: string, excludeId?: string) {
    const query = this.addOnRepository
      .createQueryBuilder("addOn")
      .where("LOWER(addOn.name) = LOWER(:name)", { name });

    if (excludeId) {
      query.andWhere("addOn.id != :excludeId", { excludeId });
    }

    const exists = await query.getOne();
    if (exists) {
      throw new AppError(409, "Add-on with this name already exists");
    }
  }

  private async validateUniqueComboName(name: string, excludeId?: string) {
    const query = this.comboRepository
      .createQueryBuilder("combo")
      .where("LOWER(combo.name) = LOWER(:name)", { name });

    if (excludeId) {
      query.andWhere("combo.id != :excludeId", { excludeId });
    }

    const exists = await query.getOne();
    if (exists) {
      throw new AppError(409, "Combo with this name already exists");
    }
  }

  private async getCategoryItemCountMap(categoryIds: string[]) {
    if (!categoryIds.length) {
      return new Map<string, number>();
    }

    const counts = await this.itemRepository
      .createQueryBuilder("item")
      .select("item.categoryId", "categoryId")
      .addSelect("COUNT(*)", "count")
      .where("item.categoryId IN (:...categoryIds)", { categoryIds })
      .groupBy("item.categoryId")
      .getRawMany<{ categoryId: string; count: string }>();

    return new Map(counts.map((entry) => [entry.categoryId, Number(entry.count)]));
  }

  private mapCategorySummary(category: ItemCategory, itemCount: number) {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      isActive: category.isActive,
      itemCount,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    };
  }

  getItemBulkImportTemplate() {
    const rows = [
      [...BULK_ITEM_TEMPLATE_HEADERS],
      [
        "Juice",
        "Fresh juice menu",
        "Lemon Juice",
        "99",
        "2",
        "Fresh and tangy",
        "Lemon",
        "1",
        "count"
      ],
      ["Juice", "Fresh juice menu", "Lemon Juice", "99", "2", "Fresh and tangy", "Sugar", "20", "g"],
      ["Burger", "", "Chicken Burger", "149", "5", "", "Chicken Patty", "1", "count"],
      ["Burger", "", "Chicken Burger", "149", "5", "", "Burger Bun", "1", "count"]
    ];

    const csv = rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\n");
    return {
      fileName: "item_bulk_template.csv",
      content: `\uFEFF${csv}`
    };
  }

  private parseBulkItemsFromCsv(csvBuffer: Buffer) {
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
      ["itemname", "item_name"],
      ["item", "item_name"],
      ["sellingprice", "selling_price"],
      ["price", "selling_price"],
      ["gstpercentage", "gst_percentage"],
      ["gstpercent", "gst_percentage"],
      ["gst", "gst_percentage"],
      ["note", "note"],
      ["ingredientname", "ingredient_name"],
      ["ingredient", "ingredient_name"],
      ["ingredientquantity", "ingredient_quantity"],
      ["quantity", "ingredient_quantity"],
      ["qty", "ingredient_quantity"],
      ["ingredientunit", "ingredient_unit"],
      ["unit", "ingredient_unit"]
    ]);

    const headerIndexMap = new Map<string, number>();
    headerRow.forEach((header, index) => {
      const alias = headerAliases.get(normalizeHeaderKey(header));
      if (alias) {
        headerIndexMap.set(alias, index);
      }
    });

    const requiredHeaders: Array<(typeof BULK_ITEM_TEMPLATE_HEADERS)[number]> = [
      "category_name",
      "item_name",
      "ingredient_name",
      "ingredient_quantity",
      "ingredient_unit"
    ];
    const missingHeaders = requiredHeaders.filter((header) => !headerIndexMap.has(header));
    if (missingHeaders.length) {
      throw new AppError(
        422,
        `Missing required column(s): ${missingHeaders.join(", ")}. Please use the downloadable template.`
      );
    }

    const readValue = (row: string[], header: (typeof BULK_ITEM_TEMPLATE_HEADERS)[number]) => {
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

    const invalidRowDetails: Array<{ rowNumber: number; reason: string }> = [];
    let invalidRows = 0;
    let skippedDuplicateRows = 0;

    const pushInvalidRow = (rowNumber: number, reason: string) => {
      invalidRows += 1;
      if (invalidRowDetails.length < MAX_BULK_INVALID_ROW_DETAILS) {
        invalidRowDetails.push({ rowNumber, reason });
      }
    };

    const validRows: BulkItemImportRow[] = [];
    nonEmptyRows.forEach(({ row, rowNumber }) => {
      try {
        const categoryName = normalizeName(readValue(row, "category_name") ?? "");
        const itemName = normalizeName(readValue(row, "item_name") ?? "");
        const ingredientName = normalizeName(readValue(row, "ingredient_name") ?? "");
        const ingredientUnitRaw = normalizeName(readValue(row, "ingredient_unit") ?? "").toLowerCase();
        const ingredientQuantity = parseCsvPositiveNumber(
          readValue(row, "ingredient_quantity"),
          "Ingredient quantity",
          rowNumber
        );
        const sellingPrice = parseCsvNonNegativeNumber(
          readValue(row, "selling_price"),
          0,
          "Selling price",
          rowNumber
        );
        const gstPercentage = parseCsvNonNegativeNumber(
          readValue(row, "gst_percentage"),
          0,
          "GST percentage",
          rowNumber
        );
        const noteRaw = readValue(row, "note");
        const note = noteRaw ? normalizeName(noteRaw).slice(0, 500) || null : null;
        const categoryDescriptionRaw = readValue(row, "category_description");
        const categoryDescription = categoryDescriptionRaw
          ? normalizeName(categoryDescriptionRaw).slice(0, 255) || null
          : null;

        if (categoryName.length < 2 || categoryName.length > 120) {
          throw new AppError(422, "Category name must be between 2 and 120 characters.");
        }
        if (itemName.length < 2 || itemName.length > 160) {
          throw new AppError(422, "Item name must be between 2 and 160 characters.");
        }
        if (ingredientName.length < 2 || ingredientName.length > 120) {
          throw new AppError(422, "Ingredient name must be between 2 and 120 characters.");
        }
        if (!ingredientUnitRaw || !VALID_INGREDIENT_UNIT_SET.has(ingredientUnitRaw)) {
          throw new AppError(422, "Ingredient unit is invalid.");
        }

        validRows.push({
          rowNumber,
          categoryName,
          categoryDescription,
          itemName,
          sellingPrice: toMoney(sellingPrice),
          gstPercentage: toMoney(gstPercentage),
          note,
          ingredientName,
          ingredientQuantity: toFixed(ingredientQuantity),
          ingredientUnit: ingredientUnitRaw as IngredientUnit
        });
      } catch (error) {
        const reason =
          error instanceof AppError ? error.message.replace(/^Row \d+:\s*/i, "") : "Row validation failed.";
        pushInvalidRow(rowNumber, reason);
      }
    });

    const itemMap = new Map<
      string,
      BulkItemGroupedRow & {
        ingredientKeys: Set<string>;
      }
    >();

    validRows.forEach((row) => {
      const itemKey = normalizeLookupKey(row.itemName);
      const categoryKey = normalizeLookupKey(row.categoryName);
      const ingredientKey = normalizeLookupKey(row.ingredientName);

      const existing = itemMap.get(itemKey);
      if (!existing) {
        itemMap.set(itemKey, {
          itemKey,
          itemName: row.itemName,
          categoryKey,
          categoryName: row.categoryName,
          categoryDescription: row.categoryDescription,
          sellingPrice: row.sellingPrice,
          gstPercentage: row.gstPercentage,
          note: row.note,
          ingredientKeys: new Set([ingredientKey]),
          recipeRows: [
            {
              rowNumber: row.rowNumber,
              ingredientName: row.ingredientName,
              ingredientKey,
              quantity: row.ingredientQuantity,
              unit: row.ingredientUnit
            }
          ]
        });
        return;
      }

      const isMismatch =
        existing.categoryKey !== categoryKey ||
        existing.sellingPrice !== row.sellingPrice ||
        existing.gstPercentage !== row.gstPercentage ||
        (existing.note ?? null) !== (row.note ?? null);

      if (isMismatch) {
        pushInvalidRow(
          row.rowNumber,
          "Rows for same item must have matching category, selling price, GST and note."
        );
        return;
      }

      if (existing.ingredientKeys.has(ingredientKey)) {
        skippedDuplicateRows += 1;
        return;
      }

      existing.ingredientKeys.add(ingredientKey);
      existing.recipeRows.push({
        rowNumber: row.rowNumber,
        ingredientName: row.ingredientName,
        ingredientKey,
        quantity: row.ingredientQuantity,
        unit: row.ingredientUnit
      });
    });

    const groupedItems: BulkItemGroupedRow[] = Array.from(itemMap.values()).map((entry) => ({
      itemKey: entry.itemKey,
      itemName: entry.itemName,
      categoryKey: entry.categoryKey,
      categoryName: entry.categoryName,
      categoryDescription: entry.categoryDescription,
      sellingPrice: entry.sellingPrice,
      gstPercentage: entry.gstPercentage,
      note: entry.note,
      recipeRows: entry.recipeRows
    }));

    return {
      totalRows: nonEmptyRows.length,
      parsedRows: groupedItems.reduce((sum, item) => sum + item.recipeRows.length, 0),
      parsedItems: groupedItems.length,
      groupedItems,
      skippedDuplicateRows,
      invalidRows,
      invalidRowDetails
    };
  }

  private async getCategoryMapByNameKeys(manager: EntityManager, categoryNameKeys: string[]) {
    const categoryMap = new Map<string, { id: string; name: string; isActive: boolean }>();
    if (!categoryNameKeys.length) {
      return categoryMap;
    }

    for (const chunk of chunkArray(categoryNameKeys)) {
      const rows = await manager
        .getRepository(ItemCategory)
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

  private async getExistingItemNameKeySet(manager: EntityManager, itemNameKeys: string[]) {
    const existingItemNameKeySet = new Set<string>();
    if (!itemNameKeys.length) {
      return existingItemNameKeySet;
    }

    for (const chunk of chunkArray(itemNameKeys)) {
      const rows = await manager
        .getRepository(Item)
        .createQueryBuilder("item")
        .select("item.name", "name")
        .where("LOWER(item.name) IN (:...itemNameKeys)", { itemNameKeys: chunk })
        .getRawMany<{ name: string }>();

      rows.forEach((row) => existingItemNameKeySet.add(normalizeLookupKey(row.name)));
    }

    return existingItemNameKeySet;
  }

  private async getIngredientMapByNameKeys(manager: EntityManager, ingredientNameKeys: string[]) {
    const ingredientMap = new Map<
      string,
      { id: string; name: string; unit: IngredientUnit; perUnitPrice: number; isActive: boolean }
    >();
    if (!ingredientNameKeys.length) {
      return ingredientMap;
    }

    for (const chunk of chunkArray(ingredientNameKeys)) {
      const rows = await manager
        .getRepository(Ingredient)
        .createQueryBuilder("ingredient")
        .select("ingredient.id", "id")
        .addSelect("ingredient.name", "name")
        .addSelect("ingredient.unit", "unit")
        .addSelect("ingredient.perUnitPrice", "perUnitPrice")
        .addSelect("ingredient.isActive", "isActive")
        .where("LOWER(ingredient.name) IN (:...ingredientNameKeys)", { ingredientNameKeys: chunk })
        .andWhere("ingredient.isActive = true")
        .getRawMany<{
          id: string;
          name: string;
          unit: IngredientUnit;
          perUnitPrice: string | number;
          isActive: boolean;
        }>();

      rows.forEach((row) => {
        ingredientMap.set(normalizeLookupKey(row.name), {
          id: row.id,
          name: row.name,
          unit: row.unit,
          perUnitPrice: getNumericValue(row.perUnitPrice),
          isActive: Boolean(row.isActive)
        });
      });
    }

    return ingredientMap;
  }

  async bulkImportItemsFromCsv(csvBuffer: Buffer): Promise<BulkItemImportSummary> {
    const parsedCsv = this.parseBulkItemsFromCsv(csvBuffer);
    if (!parsedCsv.groupedItems.length) {
      return {
        totalRows: parsedCsv.totalRows,
        parsedRows: parsedCsv.parsedRows,
        parsedItems: parsedCsv.parsedItems,
        insertedCategories: 0,
        insertedItems: 0,
        insertedRecipeRows: 0,
        skippedExistingItems: 0,
        skippedDuplicateRows: parsedCsv.skippedDuplicateRows,
        invalidRows: parsedCsv.invalidRows,
        invalidRowDetails: parsedCsv.invalidRowDetails
      };
    }

    return AppDataSource.transaction(async (manager) => {
      const invalidRowDetails = [...parsedCsv.invalidRowDetails];
      let invalidRows = parsedCsv.invalidRows;

      const pushInvalidRow = (rowNumber: number, reason: string) => {
        invalidRows += 1;
        if (invalidRowDetails.length < MAX_BULK_INVALID_ROW_DETAILS) {
          invalidRowDetails.push({ rowNumber, reason });
        }
      };

      const categoryByKey = new Map<string, { name: string; description: string | null }>();
      parsedCsv.groupedItems.forEach((row) => {
        if (!categoryByKey.has(row.categoryKey)) {
          categoryByKey.set(row.categoryKey, {
            name: row.categoryName,
            description: row.categoryDescription
          });
        }
      });

      const categoryNameKeys = Array.from(categoryByKey.keys());
      const itemNameKeys = parsedCsv.groupedItems.map((row) => row.itemKey);
      const ingredientNameKeys = Array.from(
        new Set(parsedCsv.groupedItems.flatMap((item) => item.recipeRows.map((row) => row.ingredientKey)))
      );

      let categoryMap = await this.getCategoryMapByNameKeys(manager, categoryNameKeys);
      const missingCategoryValues = categoryNameKeys
        .filter((key) => !categoryMap.has(key))
        .map((key) => {
          const category = categoryByKey.get(key)!;
          return {
            name: category.name,
            description: category.description,
            isActive: true
          };
        });

      let insertedCategories = 0;
      if (missingCategoryValues.length) {
        const categoryInsertResult = await manager
          .createQueryBuilder()
          .insert()
          .into(ItemCategory)
          .values(missingCategoryValues)
          .orIgnore()
          .execute();
        insertedCategories = categoryInsertResult.identifiers.length;
        categoryMap = await this.getCategoryMapByNameKeys(manager, categoryNameKeys);
      }

      const existingItemNameKeySet = await this.getExistingItemNameKeySet(manager, itemNameKeys);
      const ingredientMap = await this.getIngredientMapByNameKeys(manager, ingredientNameKeys);

      const ingredientIds = Array.from(new Set(Array.from(ingredientMap.values()).map((ingredient) => ingredient.id)));
      const fallbackPriceMap = new Map(
        Array.from(ingredientMap.values()).map((ingredient) => [ingredient.id, ingredient.perUnitPrice])
      );
      const latestPriceMap = await getLatestIngredientPurchasePriceMap(ingredientIds, fallbackPriceMap);

      const itemsToInsert: Array<{
        itemKey: string;
        name: string;
        categoryId: string;
        sellingPrice: number;
        gstPercentage: number;
        note: string | null;
        estimatedIngredientCost: number;
        recipeRows: Array<{
          ingredientId: string;
          quantity: number;
          unit: IngredientUnit;
          normalizedQuantity: number;
          costContribution: number;
        }>;
      }> = [];

      let skippedExistingItems = 0;

      parsedCsv.groupedItems.forEach((item) => {
        if (existingItemNameKeySet.has(item.itemKey)) {
          skippedExistingItems += 1;
          return;
        }

        const category = categoryMap.get(item.categoryKey);
        if (!category) {
          item.recipeRows.forEach((row) => {
            pushInvalidRow(row.rowNumber, `Category '${item.categoryName}' not found.`);
          });
          return;
        }

        const preparedRecipeRows: Array<{
          ingredientId: string;
          quantity: number;
          unit: IngredientUnit;
          normalizedQuantity: number;
          costContribution: number;
        }> = [];
        let hasInvalidRecipeRow = false;
        let totalEstimatedCost = 0;

        item.recipeRows.forEach((recipeRow) => {
          const ingredient = ingredientMap.get(recipeRow.ingredientKey);
          if (!ingredient) {
            hasInvalidRecipeRow = true;
            pushInvalidRow(recipeRow.rowNumber, `Ingredient '${recipeRow.ingredientName}' not found or inactive.`);
            return;
          }

          const normalizedQuantity = convertIngredientQuantity(recipeRow.quantity, recipeRow.unit, ingredient.unit);
          if (normalizedQuantity === null) {
            hasInvalidRecipeRow = true;
            pushInvalidRow(
              recipeRow.rowNumber,
              `Ingredient unit '${recipeRow.unit}' is not compatible with '${ingredient.name}' base unit '${ingredient.unit}'.`
            );
            return;
          }

          const perUnitPrice = latestPriceMap.get(ingredient.id) ?? ingredient.perUnitPrice;
          const costContribution = toFixed(normalizedQuantity * perUnitPrice);
          totalEstimatedCost += costContribution;

          preparedRecipeRows.push({
            ingredientId: ingredient.id,
            quantity: toFixed(recipeRow.quantity),
            unit: recipeRow.unit,
            normalizedQuantity: toFixed(normalizedQuantity, 6),
            costContribution: toFixed(costContribution)
          });
        });

        if (hasInvalidRecipeRow || !preparedRecipeRows.length) {
          return;
        }

        itemsToInsert.push({
          itemKey: item.itemKey,
          name: item.itemName,
          categoryId: category.id,
          sellingPrice: toMoney(item.sellingPrice),
          gstPercentage: toMoney(item.gstPercentage),
          note: item.note,
          estimatedIngredientCost: toFixed(totalEstimatedCost),
          recipeRows: preparedRecipeRows
        });
        existingItemNameKeySet.add(item.itemKey);
      });

      if (!itemsToInsert.length) {
        return {
          totalRows: parsedCsv.totalRows,
          parsedRows: parsedCsv.parsedRows,
          parsedItems: parsedCsv.parsedItems,
          insertedCategories,
          insertedItems: 0,
          insertedRecipeRows: 0,
          skippedExistingItems,
          skippedDuplicateRows: parsedCsv.skippedDuplicateRows,
          invalidRows,
          invalidRowDetails
        };
      }

      const itemInsertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(Item)
        .values(
          itemsToInsert.map((item) => ({
            name: item.name,
            categoryId: item.categoryId,
            sellingPrice: item.sellingPrice,
            gstPercentage: item.gstPercentage,
            imageUrl: null,
            note: item.note,
            estimatedIngredientCost: item.estimatedIngredientCost,
            isActive: true
          }))
        )
        .orIgnore()
        .returning(["id", "name"])
        .execute();

      const insertedItems = Array.isArray(itemInsertResult.raw)
        ? itemInsertResult.raw
            .map((row) => ({
              id: typeof row.id === "string" ? row.id : "",
              name: typeof row.name === "string" ? row.name : ""
            }))
            .filter((row) => row.id && row.name)
        : [];

      if (!insertedItems.length) {
        return {
          totalRows: parsedCsv.totalRows,
          parsedRows: parsedCsv.parsedRows,
          parsedItems: parsedCsv.parsedItems,
          insertedCategories,
          insertedItems: 0,
          insertedRecipeRows: 0,
          skippedExistingItems: skippedExistingItems + itemsToInsert.length,
          skippedDuplicateRows: parsedCsv.skippedDuplicateRows,
          invalidRows,
          invalidRowDetails
        };
      }

      const insertedItemKeyToId = new Map(
        insertedItems.map((item) => [normalizeLookupKey(item.name), item.id])
      );
      const skippedDuringInsert = Math.max(itemsToInsert.length - insertedItems.length, 0);

      const recipeInsertValues = itemsToInsert.flatMap((item) => {
        const insertedItemId = insertedItemKeyToId.get(item.itemKey);
        if (!insertedItemId) {
          return [];
        }
        return item.recipeRows.map((recipeRow) => ({
          itemId: insertedItemId,
          ingredientId: recipeRow.ingredientId,
          quantity: recipeRow.quantity,
          unit: recipeRow.unit,
          normalizedQuantity: recipeRow.normalizedQuantity,
          costContribution: recipeRow.costContribution
        }));
      });

      let insertedRecipeRows = 0;
      if (recipeInsertValues.length) {
        const recipeInsertResult = await manager
          .createQueryBuilder()
          .insert()
          .into(ItemIngredient)
          .values(recipeInsertValues)
          .orIgnore()
          .execute();
        insertedRecipeRows = recipeInsertResult.identifiers.length;
      }

      return {
        totalRows: parsedCsv.totalRows,
        parsedRows: parsedCsv.parsedRows,
        parsedItems: parsedCsv.parsedItems,
        insertedCategories,
        insertedItems: insertedItems.length,
        insertedRecipeRows,
        skippedExistingItems: skippedExistingItems + skippedDuringInsert,
        skippedDuplicateRows: parsedCsv.skippedDuplicateRows,
        invalidRows,
        invalidRowDetails
      };
    });
  }

  private async prepareRecipeRows(payloadIngredients: RecipePayload[]) {
    if (!payloadIngredients.length) {
      throw new AppError(422, "Please add at least one ingredient");
    }

    const ingredientIds = payloadIngredients.map((ingredient) => ingredient.ingredientId);
    const duplicates = mapDuplicateIds(ingredientIds);
    if (duplicates.length) {
      throw new AppError(422, "Duplicate ingredients are not allowed in recipe");
    }

    const ingredientEntities = await this.ingredientRepository.find({
      where: {
        id: In(ingredientIds),
        isActive: true
      },
      relations: { category: true }
    });

    if (ingredientEntities.length !== ingredientIds.length) {
      throw new AppError(404, "One or more selected ingredients were not found");
    }

    const ingredientMap = new Map(ingredientEntities.map((ingredient) => [ingredient.id, ingredient]));
    const fallbackPriceMap = new Map(
      ingredientEntities.map((ingredient) => [ingredient.id, getNumericValue(ingredient.perUnitPrice)])
    );
    const latestPriceMap = await getLatestIngredientPurchasePriceMap(ingredientIds, fallbackPriceMap);
    let totalEstimatedCost = 0;

    const rows = payloadIngredients.map((row) => {
      const ingredient = ingredientMap.get(row.ingredientId);
      if (!ingredient) {
        throw new AppError(404, "Ingredient not found in recipe");
      }

      const normalizedQuantity = convertIngredientQuantity(row.quantity, row.unit, ingredient.unit);
      if (normalizedQuantity === null) {
        throw new AppError(422, "Selected unit is not compatible with the ingredient base unit");
      }

      const perUnitPrice = latestPriceMap.get(ingredient.id) ?? getNumericValue(ingredient.perUnitPrice);
      const costContribution = toFixed(normalizedQuantity * perUnitPrice);
      totalEstimatedCost += costContribution;

      return {
        ingredientId: ingredient.id,
        quantity: toFixed(row.quantity),
        unit: row.unit,
        ingredientBaseUnit: ingredient.unit,
        normalizedQuantity: toFixed(normalizedQuantity, 6),
        costContribution: toFixed(costContribution)
      };
    });

    return {
      rows,
      totalEstimatedCost: toFixed(totalEstimatedCost)
    };
  }

  private async prepareItemSauceRows(payloadSauces: ItemSaucePayload[]) {
    if (!payloadSauces.length) {
      return {
        rows: [] as Array<{
          sauceRecipeId: string;
          quantity: number;
          unit: IngredientUnit;
          normalizedQuantity: number;
          estimatedCostContribution: number;
        }>,
        totalEstimatedCost: 0
      };
    }

    const sauceIds = payloadSauces.map((row) => row.sauceId);
    const duplicates = mapDuplicateIds(sauceIds);
    if (duplicates.length) {
      throw new AppError(422, "Duplicate sauces are not allowed in item recipe");
    }

    const sauceRows = await this.sauceRecipeRepository.find({
      where: { id: In(sauceIds) }
    });
    if (sauceRows.length !== sauceIds.length) {
      throw new AppError(404, "One or more selected sauces were not found");
    }

    const sauceMap = new Map(sauceRows.map((row) => [row.id, row]));
    let totalEstimatedCost = 0;
    const rows = payloadSauces.map((row) => {
      const sauce = sauceMap.get(row.sauceId);
      if (!sauce) {
        throw new AppError(404, "Selected sauce not found");
      }
      if (!sauce.isActive) {
        throw new AppError(409, `${sauce.name} is inactive. Enable the sauce to map it in items.`);
      }

      const quantity = toFixed(row.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new AppError(422, `Invalid quantity for sauce ${sauce.name}.`);
      }
      const normalizedQuantityValue = convertIngredientQuantity(quantity, row.unit, sauce.outputUnit);
      if (normalizedQuantityValue === null) {
        throw new AppError(422, `Selected unit is not compatible with sauce output unit for ${sauce.name}.`);
      }
      const batchQuantity = toFixed(getNumericValue(sauce.baseBatchQuantity));
      if (batchQuantity <= 0) {
        throw new AppError(409, `Sauce ${sauce.name} has invalid base batch quantity.`);
      }

      const normalizedQuantity = toFixed(normalizedQuantityValue, 6);
      const batchFactor = normalizedQuantity / batchQuantity;
      const estimatedCostContribution = toFixed(getNumericValue(sauce.estimatedBatchCost) * batchFactor);
      totalEstimatedCost += estimatedCostContribution;

      return {
        sauceRecipeId: sauce.id,
        quantity,
        unit: row.unit,
        normalizedQuantity,
        estimatedCostContribution
      };
    });

    return {
      rows,
      totalEstimatedCost: toFixed(totalEstimatedCost)
    };
  }

  private async mergeItemRecipeRows(
    ingredientRows: Array<{
      ingredientId: string;
      quantity: number;
      unit: IngredientUnit;
      ingredientBaseUnit: IngredientUnit;
      normalizedQuantity: number;
      costContribution: number;
    }>,
    sauceRows: Array<{
      sauceRecipeId: string;
      quantity: number;
      normalizedQuantity: number;
    }>
  ) {
    const merged = new Map<
      string,
      {
        ingredientId: string;
        quantity: number;
        unit: IngredientUnit;
        normalizedQuantity: number;
        costContribution: number;
      }
    >();

    const upsertIngredientUsage = (
      ingredientId: string,
      unit: IngredientUnit,
      normalizedQuantity: number,
      costContribution: number
    ) => {
      if (normalizedQuantity <= 0) {
        return;
      }

      const existing = merged.get(ingredientId);
      if (!existing) {
        merged.set(ingredientId, {
          ingredientId,
          quantity: toFixed(normalizedQuantity),
          unit,
          normalizedQuantity: toFixed(normalizedQuantity, 6),
          costContribution: toFixed(costContribution)
        });
        return;
      }

      const nextNormalized = toFixed(existing.normalizedQuantity + normalizedQuantity, 6);
      const nextCost = toFixed(existing.costContribution + costContribution);
      existing.quantity = toFixed(nextNormalized);
      existing.unit = unit;
      existing.normalizedQuantity = nextNormalized;
      existing.costContribution = nextCost;
    };

    ingredientRows.forEach((row) => {
      upsertIngredientUsage(
        row.ingredientId,
        row.ingredientBaseUnit,
        getNumericValue(row.normalizedQuantity),
        getNumericValue(row.costContribution)
      );
    });

    if (sauceRows.length) {
      const sauceRecipeIds = Array.from(new Set(sauceRows.map((row) => row.sauceRecipeId)));
      const [sauces, sauceIngredients] = await Promise.all([
        this.sauceRecipeRepository.find({
          where: { id: In(sauceRecipeIds) }
        }),
        this.sauceRecipeIngredientRepository.find({
          where: { sauceRecipeId: In(sauceRecipeIds) },
          relations: { ingredient: true }
        })
      ]);

      const sauceMap = new Map(sauces.map((row) => [row.id, row]));
      const ingredientRowsBySauce = new Map<string, typeof sauceIngredients>();
      sauceIngredients.forEach((row) => {
        const existing = ingredientRowsBySauce.get(row.sauceRecipeId);
        if (existing) {
          existing.push(row);
        } else {
          ingredientRowsBySauce.set(row.sauceRecipeId, [row]);
        }
      });

      for (const sauceRow of sauceRows) {
        const sauce = sauceMap.get(sauceRow.sauceRecipeId);
        if (!sauce) {
          throw new AppError(404, "Sauce not found while expanding recipe");
        }
        const baseBatchQuantity = toFixed(getNumericValue(sauce.baseBatchQuantity));
        if (baseBatchQuantity <= 0) {
          throw new AppError(409, `Sauce ${sauce.name} has invalid batch quantity for expansion.`);
        }

        const batchFactor = toFixed(getNumericValue(sauceRow.normalizedQuantity) / baseBatchQuantity, 6);
        const recipeRows = ingredientRowsBySauce.get(sauce.id) ?? [];
        recipeRows.forEach((recipeRow) => {
          const normalizedQuantity = toFixed(getNumericValue(recipeRow.normalizedQuantity) * batchFactor, 6);
          const costContribution = toFixed(getNumericValue(recipeRow.costContribution) * batchFactor);
          upsertIngredientUsage(
            recipeRow.ingredientId,
            recipeRow.ingredient.unit,
            normalizedQuantity,
            costContribution
          );
        });
      }
    }

    return {
      rows: Array.from(merged.values()),
      totalEstimatedCost: toFixed(
        Array.from(merged.values()).reduce((sum, row) => sum + getNumericValue(row.costContribution), 0)
      )
    };
  }

  private async prepareComboItems(rows: ComboPayloadItem[]) {
    if (!rows.length) {
      throw new AppError(422, "Please add at least one item");
    }

    const itemIds = rows.map((row) => row.itemId);
    const duplicates = mapDuplicateIds(itemIds);
    if (duplicates.length) {
      throw new AppError(422, "Duplicate items are not allowed in a combo");
    }

    const items = await this.itemRepository.find({
      where: {
        id: In(itemIds),
        isActive: true
      }
    });

    if (items.length !== rows.length) {
      throw new AppError(404, "One or more selected items were not found");
    }

    const itemMap = new Map(items.map((item) => [item.id, item]));

    return rows.map((row) => {
      const item = itemMap.get(row.itemId);
      if (!item) {
        throw new AppError(404, "Item not found for combo");
      }

      return {
        itemId: item.id,
        quantity: toFixed(row.quantity)
      };
    });
  }

  async listCategories(filters: CategoryFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.itemCategoryRepository
      .createQueryBuilder("category")
      .where("1 = 1")
      .orderBy("category.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("category.isActive = true");
    }

    if (filters.search) {
      query.andWhere("LOWER(category.name) LIKE LOWER(:search)", { search: `%${filters.search}%` });
    }

    const total = await query.getCount();
    const categories = await query.offset(offset).limit(limit).getMany();
    const categoryIds = categories.map((category) => category.id);
    const countMap = await this.getCategoryItemCountMap(categoryIds);

    return {
      categories: categories.map((category) => this.mapCategorySummary(category, countMap.get(category.id) ?? 0)),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async createCategory(payload: { name: string; description?: string }) {
    const name = payload.name.trim();
    await this.validateUniqueCategoryName(name);

    const category = this.itemCategoryRepository.create({
      name,
      description: cleanOptionalText(payload.description) ?? null,
      isActive: true
    });

    const savedCategory = await this.itemCategoryRepository.save(category);
    return this.mapCategorySummary(savedCategory, 0);
  }

  async updateCategory(id: string, payload: { name?: string; description?: string; isActive?: boolean }) {
    const category = await this.itemCategoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new AppError(404, "Item category not found");
    }

    if (payload.name !== undefined) {
      const name = payload.name.trim();
      await this.validateUniqueCategoryName(name, id);
      category.name = name;
    }

    if (payload.description !== undefined) {
      category.description = cleanOptionalText(payload.description) ?? null;
    }

    if (payload.isActive !== undefined) {
      category.isActive = payload.isActive;
    }

    const savedCategory = await this.itemCategoryRepository.save(category);
    const countMap = await this.getCategoryItemCountMap([savedCategory.id]);
    return this.mapCategorySummary(savedCategory, countMap.get(savedCategory.id) ?? 0);
  }

  async deleteCategory(id: string) {
    const category = await this.itemCategoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new AppError(404, "Item category not found");
    }

    const itemCount = await this.itemRepository.count({ where: { categoryId: id } });
    if (itemCount > 0) {
      throw new AppError(409, "Cannot delete category because it has items. Move or delete items first.");
    }

    await this.itemCategoryRepository.remove(category);
    return this.mapCategorySummary(category, 0);
  }

  async listItems(filters: ItemFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.itemRepository
      .createQueryBuilder("item")
      .leftJoinAndSelect("item.category", "category")
      .where("1 = 1")
      .orderBy("item.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("item.isActive = true");
    }

    if (filters.search) {
      query.andWhere("LOWER(item.name) LIKE LOWER(:search)", { search: `%${filters.search}%` });
    }

    if (filters.categoryId) {
      query.andWhere("item.categoryId = :categoryId", { categoryId: filters.categoryId });
    }

    const total = await query.getCount();
    const items = await query.offset(offset).limit(limit).getMany();

    const itemIds = items.map((item) => item.id);
    const [ingredientCounts, sauceCounts] = itemIds.length
      ? await Promise.all([
          this.itemIngredientRepository
            .createQueryBuilder("recipe")
            .select("recipe.itemId", "itemId")
            .addSelect("COUNT(*)", "count")
            .where("recipe.itemId IN (:...itemIds)", { itemIds })
            .groupBy("recipe.itemId")
            .getRawMany<{ itemId: string; count: string }>(),
          this.itemSauceRepository
            .createQueryBuilder("itemSauce")
            .select("itemSauce.itemId", "itemId")
            .addSelect("COUNT(*)", "count")
            .where("itemSauce.itemId IN (:...itemIds)", { itemIds })
            .groupBy("itemSauce.itemId")
            .getRawMany<{ itemId: string; count: string }>()
        ])
      : [[], []];

    const ingredientCountMap = new Map(ingredientCounts.map((entry) => [entry.itemId, Number(entry.count)]));
    const sauceCountMap = new Map(sauceCounts.map((entry) => [entry.itemId, Number(entry.count)]));

    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        categoryId: item.categoryId,
        categoryName: item.category.name,
        sellingPrice: toMoney(getNumericValue(item.sellingPrice)),
        gstPercentage: toMoney(getNumericValue(item.gstPercentage)),
        imageUrl: item.imageUrl,
        note: item.note,
        estimatedIngredientCost: toFixed(getNumericValue(item.estimatedIngredientCost)),
        ingredientCount: (ingredientCountMap.get(item.id) ?? 0) + (sauceCountMap.get(item.id) ?? 0),
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      })),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async getItem(id: string) {
    const item = await this.getItemOrFail(id);
    const [recipeRows, sauceRows] = await Promise.all([
      this.itemIngredientRepository.find({
        where: { itemId: id },
        relations: {
          ingredient: { category: true }
        },
        order: {
          createdAt: "ASC"
        }
      }),
      this.itemSauceRepository.find({
        where: { itemId: id },
        relations: {
          sauceRecipe: true
        },
        order: {
          createdAt: "ASC"
        }
      })
    ]);

    const estimatedIngredientCost = toFixed(
      recipeRows.reduce((sum, row) => sum + getNumericValue(row.costContribution), 0)
    );
    const sellingPrice = toMoney(getNumericValue(item.sellingPrice));

    return {
      id: item.id,
      name: item.name,
      categoryId: item.categoryId,
      categoryName: item.category.name,
      sellingPrice,
      gstPercentage: toMoney(getNumericValue(item.gstPercentage)),
      imageUrl: item.imageUrl,
      note: item.note,
      estimatedIngredientCost,
      estimatedMargin: toMoney(sellingPrice - estimatedIngredientCost),
      isActive: item.isActive,
      sauces: sauceRows.map((row) => ({
        id: row.id,
        sauceId: row.sauceRecipeId,
        sauceName: row.sauceRecipe.name,
        quantity: toFixed(getNumericValue(row.quantity)),
        unit: row.unit,
        normalizedQuantity: toFixed(getNumericValue(row.normalizedQuantity), 6),
        estimatedCostContribution: toFixed(getNumericValue(row.estimatedCostContribution))
      })),
      ingredients: recipeRows.map((row) => ({
        id: row.id,
        ingredientId: row.ingredientId,
        ingredientName: row.ingredient.name,
        ingredientCategoryId: row.ingredient.categoryId,
        ingredientCategoryName: row.ingredient.category.name,
        ingredientBaseUnit: row.ingredient.unit,
        ingredientPerUnitPrice: toFixed(getNumericValue(row.ingredient.perUnitPrice)),
        quantity: toFixed(getNumericValue(row.quantity)),
        unit: row.unit,
        normalizedQuantity: toFixed(getNumericValue(row.normalizedQuantity), 6),
        costContribution: toFixed(getNumericValue(row.costContribution))
      })),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  async createItem(payload: {
    name: string;
    categoryId: string;
    sellingPrice: number;
    gstPercentage: number;
    imageUrl?: string;
    note?: string;
    ingredients?: RecipePayload[];
    sauces?: ItemSaucePayload[];
  }) {
    await this.getActiveItemCategoryOrFail(payload.categoryId);
    const name = payload.name.trim();
    await this.validateUniqueItemName(name);

    const ingredientPayload = payload.ingredients ?? [];
    const saucePayload = payload.sauces ?? [];
    if (!ingredientPayload.length && !saucePayload.length) {
      throw new AppError(422, "Please add at least one ingredient or sauce");
    }

    const preparedRecipe = ingredientPayload.length
      ? await this.prepareRecipeRows(ingredientPayload)
      : { rows: [], totalEstimatedCost: 0 };
    const preparedSauces = await this.prepareItemSauceRows(saucePayload);
    const mergedRecipe = await this.mergeItemRecipeRows(preparedRecipe.rows, preparedSauces.rows);
    if (!mergedRecipe.rows.length) {
      throw new AppError(422, "Unable to derive ingredient usage from selected recipe mapping.");
    }
    const imageUrl = cleanOptionalText(payload.imageUrl) ?? null;
    const note = cleanOptionalText(payload.note) ?? null;

    const savedItem = await AppDataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(Item);
      const recipeRepo = manager.getRepository(ItemIngredient);
      const itemSauceRepo = manager.getRepository(ItemSauce);

      const item = itemRepo.create({
        name,
        categoryId: payload.categoryId,
        sellingPrice: toMoney(payload.sellingPrice),
        gstPercentage: toMoney(payload.gstPercentage),
        imageUrl,
        note,
        estimatedIngredientCost: toFixed(mergedRecipe.totalEstimatedCost),
        isActive: true
      });

      const saved = await itemRepo.save(item);
      const recipeEntities = mergedRecipe.rows.map((row) =>
        recipeRepo.create({
          itemId: saved.id,
          ingredientId: row.ingredientId,
          quantity: row.quantity,
          unit: row.unit,
          normalizedQuantity: row.normalizedQuantity,
          costContribution: row.costContribution
        })
      );
      await recipeRepo.save(recipeEntities);

      if (preparedSauces.rows.length) {
        const sauceEntities = preparedSauces.rows.map((row) =>
          itemSauceRepo.create({
            itemId: saved.id,
            sauceRecipeId: row.sauceRecipeId,
            quantity: row.quantity,
            unit: row.unit,
            normalizedQuantity: row.normalizedQuantity,
            estimatedCostContribution: row.estimatedCostContribution
          })
        );
        await itemSauceRepo.save(sauceEntities);
      }
      return saved;
    });

    return this.getItem(savedItem.id);
  }

  async updateItem(
    id: string,
    payload: {
      name?: string;
      categoryId?: string;
      sellingPrice?: number;
      gstPercentage?: number;
      imageUrl?: string;
      note?: string;
      isActive?: boolean;
      ingredients?: RecipePayload[];
      sauces?: ItemSaucePayload[];
    }
  ) {
    const existing = await this.getItemOrFail(id);

    if (payload.name !== undefined) {
      const name = payload.name.trim();
      await this.validateUniqueItemName(name, id);
      existing.name = name;
    }

    if (payload.categoryId !== undefined) {
      await this.getActiveItemCategoryOrFail(payload.categoryId);
      existing.categoryId = payload.categoryId;
    }

    if (payload.sellingPrice !== undefined) {
      existing.sellingPrice = toMoney(payload.sellingPrice);
    }

    if (payload.gstPercentage !== undefined) {
      existing.gstPercentage = toMoney(payload.gstPercentage);
    }

    if (payload.imageUrl !== undefined) {
      existing.imageUrl = cleanOptionalText(payload.imageUrl) ?? null;
    }

    if (payload.note !== undefined) {
      existing.note = cleanOptionalText(payload.note) ?? null;
    }

    if (payload.isActive !== undefined) {
      existing.isActive = payload.isActive;
    }

    const shouldReplaceRecipe = payload.ingredients !== undefined || payload.sauces !== undefined;
    let preparedRecipe: {
      rows: Array<{
        ingredientId: string;
        quantity: number;
        unit: IngredientUnit;
        ingredientBaseUnit: IngredientUnit;
        normalizedQuantity: number;
        costContribution: number;
      }>;
      totalEstimatedCost: number;
    } | null = null;
    let preparedSauces: {
      rows: Array<{
        sauceRecipeId: string;
        quantity: number;
        unit: IngredientUnit;
        normalizedQuantity: number;
        estimatedCostContribution: number;
      }>;
      totalEstimatedCost: number;
    } | null = null;
    let mergedRecipe: {
      rows: Array<{
        ingredientId: string;
        quantity: number;
        unit: IngredientUnit;
        normalizedQuantity: number;
        costContribution: number;
      }>;
      totalEstimatedCost: number;
    } | null = null;

    if (shouldReplaceRecipe) {
      const ingredientPayload = payload.ingredients ?? [];
      const saucePayload = payload.sauces ?? [];
      if (!ingredientPayload.length && !saucePayload.length) {
        throw new AppError(422, "Please add at least one ingredient or sauce");
      }

      preparedRecipe = ingredientPayload.length
        ? await this.prepareRecipeRows(ingredientPayload)
        : { rows: [], totalEstimatedCost: 0 };
      preparedSauces = await this.prepareItemSauceRows(saucePayload);
      mergedRecipe = await this.mergeItemRecipeRows(preparedRecipe.rows, preparedSauces.rows);
      if (!mergedRecipe.rows.length) {
        throw new AppError(422, "Unable to derive ingredient usage from selected recipe mapping.");
      }
      existing.estimatedIngredientCost = toFixed(mergedRecipe.totalEstimatedCost);
    }

    await AppDataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(Item);
      const recipeRepo = manager.getRepository(ItemIngredient);
      const itemSauceRepo = manager.getRepository(ItemSauce);

      await itemRepo.save(existing);

      if (mergedRecipe && preparedSauces) {
        await recipeRepo.delete({ itemId: id });
        await itemSauceRepo.delete({ itemId: id });

        const recipeEntities = mergedRecipe.rows.map((row) =>
          recipeRepo.create({
            itemId: id,
            ingredientId: row.ingredientId,
            quantity: row.quantity,
            unit: row.unit,
            normalizedQuantity: row.normalizedQuantity,
            costContribution: row.costContribution
          })
        );
        await recipeRepo.save(recipeEntities);

        if (preparedSauces.rows.length) {
          const sauceEntities = preparedSauces.rows.map((row) =>
            itemSauceRepo.create({
              itemId: id,
              sauceRecipeId: row.sauceRecipeId,
              quantity: row.quantity,
              unit: row.unit,
              normalizedQuantity: row.normalizedQuantity,
              estimatedCostContribution: row.estimatedCostContribution
            })
          );
          await itemSauceRepo.save(sauceEntities);
        }
      }
    });

    return this.getItem(id);
  }

  async deleteItem(id: string) {
    const item = await this.getItemOrFail(id);
    const comboUsageCount = await this.comboItemRepository.count({ where: { itemId: id } });
    if (comboUsageCount > 0) {
      throw new AppError(
        409,
        `Cannot delete item because it is used in ${comboUsageCount} combo(s). Remove it from combos first.`
      );
    }

    await this.itemRepository.remove(item);
    return item;
  }

  async listAddOns(filters: AddOnFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.addOnRepository
      .createQueryBuilder("addOn")
      .where("1 = 1")
      .orderBy("addOn.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("addOn.isActive = true");
    }

    if (filters.search) {
      query.andWhere("LOWER(addOn.name) LIKE LOWER(:search)", { search: `%${filters.search}%` });
    }

    const total = await query.getCount();
    const addOns = await query.offset(offset).limit(limit).getMany();

    const addOnIds = addOns.map((row) => row.id);
    const ingredientCounts = addOnIds.length
      ? await this.addOnIngredientRepository
          .createQueryBuilder("recipe")
          .select("recipe.addOnId", "addOnId")
          .addSelect("COUNT(*)", "count")
          .where("recipe.addOnId IN (:...addOnIds)", { addOnIds })
          .groupBy("recipe.addOnId")
          .getRawMany<{ addOnId: string; count: string }>()
      : [];
    const countMap = new Map(ingredientCounts.map((entry) => [entry.addOnId, Number(entry.count)]));

    return {
      addOns: addOns.map((row) => ({
        id: row.id,
        name: row.name,
        sellingPrice: toMoney(getNumericValue(row.sellingPrice)),
        gstPercentage: toMoney(getNumericValue(row.gstPercentage)),
        imageUrl: row.imageUrl,
        note: row.note,
        estimatedIngredientCost: toFixed(getNumericValue(row.estimatedIngredientCost)),
        ingredientCount: countMap.get(row.id) ?? 0,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      })),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async getAddOn(id: string) {
    const addOn = await this.getAddOnOrFail(id);
    const recipeRows = await this.addOnIngredientRepository.find({
      where: { addOnId: id },
      relations: {
        ingredient: { category: true }
      },
      order: {
        createdAt: "ASC"
      }
    });

    const estimatedIngredientCost = toFixed(
      recipeRows.reduce((sum, row) => sum + getNumericValue(row.costContribution), 0)
    );
    const sellingPrice = toMoney(getNumericValue(addOn.sellingPrice));

    return {
      id: addOn.id,
      name: addOn.name,
      sellingPrice,
      gstPercentage: toMoney(getNumericValue(addOn.gstPercentage)),
      imageUrl: addOn.imageUrl,
      note: addOn.note,
      estimatedIngredientCost,
      estimatedMargin: toMoney(sellingPrice - estimatedIngredientCost),
      isActive: addOn.isActive,
      ingredients: recipeRows.map((row) => ({
        id: row.id,
        ingredientId: row.ingredientId,
        ingredientName: row.ingredient.name,
        ingredientCategoryId: row.ingredient.categoryId,
        ingredientCategoryName: row.ingredient.category.name,
        ingredientBaseUnit: row.ingredient.unit,
        ingredientPerUnitPrice: toFixed(getNumericValue(row.ingredient.perUnitPrice)),
        quantity: toFixed(getNumericValue(row.quantity)),
        unit: row.unit,
        normalizedQuantity: toFixed(getNumericValue(row.normalizedQuantity), 6),
        costContribution: toFixed(getNumericValue(row.costContribution))
      })),
      createdAt: addOn.createdAt,
      updatedAt: addOn.updatedAt
    };
  }

  async createAddOn(payload: {
    name: string;
    sellingPrice: number;
    gstPercentage: number;
    imageUrl?: string;
    note?: string;
    ingredients: RecipePayload[];
  }) {
    const name = payload.name.trim();
    await this.validateUniqueAddOnName(name);

    const preparedRecipe = await this.prepareRecipeRows(payload.ingredients);
    const imageUrl = cleanOptionalText(payload.imageUrl) ?? null;
    const note = cleanOptionalText(payload.note) ?? null;

    const savedAddOn = await AppDataSource.transaction(async (manager) => {
      const addOnRepo = manager.getRepository(AddOn);
      const recipeRepo = manager.getRepository(AddOnIngredient);

      const addOn = addOnRepo.create({
        name,
        sellingPrice: toMoney(payload.sellingPrice),
        gstPercentage: toMoney(payload.gstPercentage),
        imageUrl,
        note,
        estimatedIngredientCost: toFixed(preparedRecipe.totalEstimatedCost),
        isActive: true
      });

      const saved = await addOnRepo.save(addOn);
      const recipeEntities = preparedRecipe.rows.map((row) =>
        recipeRepo.create({
          addOnId: saved.id,
          ingredientId: row.ingredientId,
          quantity: row.quantity,
          unit: row.unit,
          normalizedQuantity: row.normalizedQuantity,
          costContribution: row.costContribution
        })
      );
      await recipeRepo.save(recipeEntities);
      return saved;
    });

    return this.getAddOn(savedAddOn.id);
  }

  async updateAddOn(
    id: string,
    payload: {
      name?: string;
      sellingPrice?: number;
      gstPercentage?: number;
      imageUrl?: string;
      note?: string;
      isActive?: boolean;
      ingredients?: RecipePayload[];
    }
  ) {
    const existing = await this.getAddOnOrFail(id);

    if (payload.name !== undefined) {
      const name = payload.name.trim();
      await this.validateUniqueAddOnName(name, id);
      existing.name = name;
    }

    if (payload.sellingPrice !== undefined) {
      existing.sellingPrice = toMoney(payload.sellingPrice);
    }

    if (payload.gstPercentage !== undefined) {
      existing.gstPercentage = toMoney(payload.gstPercentage);
    }

    if (payload.imageUrl !== undefined) {
      existing.imageUrl = cleanOptionalText(payload.imageUrl) ?? null;
    }

    if (payload.note !== undefined) {
      existing.note = cleanOptionalText(payload.note) ?? null;
    }

    if (payload.isActive !== undefined) {
      existing.isActive = payload.isActive;
    }

    const preparedRecipe = payload.ingredients ? await this.prepareRecipeRows(payload.ingredients) : null;
    if (preparedRecipe) {
      existing.estimatedIngredientCost = toFixed(preparedRecipe.totalEstimatedCost);
    }

    await AppDataSource.transaction(async (manager) => {
      const addOnRepo = manager.getRepository(AddOn);
      const recipeRepo = manager.getRepository(AddOnIngredient);

      await addOnRepo.save(existing);

      if (preparedRecipe) {
        await recipeRepo.delete({ addOnId: id });
        const entities = preparedRecipe.rows.map((row) =>
          recipeRepo.create({
            addOnId: id,
            ingredientId: row.ingredientId,
            quantity: row.quantity,
            unit: row.unit,
            normalizedQuantity: row.normalizedQuantity,
            costContribution: row.costContribution
          })
        );
        await recipeRepo.save(entities);
      }
    });

    return this.getAddOn(id);
  }

  async deleteAddOn(id: string) {
    const addOn = await this.getAddOnOrFail(id);
    await this.addOnRepository.remove(addOn);
    return addOn;
  }

  private async validateUniqueSauceName(name: string, excludeId?: string) {
    const query = this.sauceRecipeRepository
      .createQueryBuilder("sauce")
      .where("LOWER(sauce.name) = LOWER(:name)", { name });

    if (excludeId) {
      query.andWhere("sauce.id != :excludeId", { excludeId });
    }

    const exists = await query.getOne();
    if (exists) {
      throw new AppError(409, "Sauce with this name already exists");
    }
  }

  private async ensureSauceCategory(manager: EntityManager) {
    const existing = await manager
      .getRepository(IngredientCategory)
      .createQueryBuilder("category")
      .where("LOWER(category.name) = LOWER(:name)", { name: SAUCE_CATEGORY_NAME })
      .getOne();

    if (existing) {
      if (!existing.isActive || existing.kind !== "additional") {
        existing.isActive = true;
        existing.kind = "additional";
        existing.description = existing.description ?? SAUCE_CATEGORY_DESCRIPTION;
        return manager.save(IngredientCategory, existing);
      }
      return existing;
    }

    const created = manager.create(IngredientCategory, {
      name: SAUCE_CATEGORY_NAME,
      description: SAUCE_CATEGORY_DESCRIPTION,
      kind: "additional",
      isActive: true
    });
    return manager.save(IngredientCategory, created);
  }

  private async getOrCreateIngredientStock(manager: EntityManager, ingredientId: string) {
    const existing = await manager.findOne(IngredientStock, { where: { ingredientId } });
    if (existing) {
      return existing;
    }

    const created = manager.create(IngredientStock, {
      ingredientId,
      totalStock: 0,
      lastUpdatedAt: new Date()
    });
    return manager.save(IngredientStock, created);
  }

  private async getSauceReferenceCount(outputIngredientId: string, sauceRecipeId: string) {
    const [itemCount, addOnCount, itemSauceCount] = await Promise.all([
      this.itemIngredientRepository.count({ where: { ingredientId: outputIngredientId } }),
      this.addOnIngredientRepository.count({ where: { ingredientId: outputIngredientId } }),
      this.itemSauceRepository.count({ where: { sauceRecipeId } })
    ]);
    return itemCount + addOnCount + itemSauceCount;
  }

  private async getSauceSummaryById(id: string) {
    const sauce = await this.sauceRecipeRepository.findOne({
      where: { id },
      relations: { outputIngredient: true }
    });

    if (!sauce) {
      throw new AppError(404, "Sauce not found");
    }

    const [stock, ingredientCount] = await Promise.all([
      this.ingredientStockRepository.findOne({ where: { ingredientId: sauce.outputIngredientId } }),
      this.sauceRecipeIngredientRepository.count({ where: { sauceRecipeId: id } })
    ]);

    const batchQuantity = toFixed(getNumericValue(sauce.baseBatchQuantity));
    const estimatedBatchCost = toFixed(getNumericValue(sauce.estimatedBatchCost));
    const estimatedUnitCost = batchQuantity > 0 ? toMoney(estimatedBatchCost / batchQuantity) : toMoney(estimatedBatchCost);

    return {
      id: sauce.id,
      name: sauce.name,
      outputIngredientId: sauce.outputIngredientId,
      outputIngredientName: sauce.outputIngredient?.name ?? sauce.name,
      outputUnit: sauce.outputUnit,
      baseBatchQuantity: batchQuantity,
      estimatedBatchCost,
      estimatedUnitCost,
      totalStock: toFixed(getNumericValue(stock?.totalStock)),
      note: sauce.note,
      ingredientCount,
      isActive: sauce.isActive,
      createdAt: sauce.createdAt,
      updatedAt: sauce.updatedAt
    };
  }

  async listSauces(filters: SauceFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.sauceRecipeRepository
      .createQueryBuilder("sauce")
      .leftJoinAndSelect("sauce.outputIngredient", "outputIngredient")
      .where("1 = 1")
      .orderBy("sauce.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("sauce.isActive = true");
    }

    if (filters.search) {
      query.andWhere("LOWER(sauce.name) LIKE LOWER(:search)", { search: `%${filters.search}%` });
    }

    const total = await query.getCount();
    const sauces = await query.offset(offset).limit(limit).getMany();
    const sauceIds = sauces.map((sauce) => sauce.id);
    const ingredientCounts = sauceIds.length
      ? await this.sauceRecipeIngredientRepository
          .createQueryBuilder("row")
          .select("row.sauceRecipeId", "sauceRecipeId")
          .addSelect("COUNT(*)", "count")
          .where("row.sauceRecipeId IN (:...sauceIds)", { sauceIds })
          .groupBy("row.sauceRecipeId")
          .getRawMany<{ sauceRecipeId: string; count: string }>()
      : [];
    const countMap = new Map(ingredientCounts.map((entry) => [entry.sauceRecipeId, Number(entry.count)]));

    const outputIngredientIds = sauces.map((sauce) => sauce.outputIngredientId);
    const stocks = outputIngredientIds.length
      ? await this.ingredientStockRepository.find({ where: { ingredientId: In(outputIngredientIds) } })
      : [];
    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, toFixed(getNumericValue(stock.totalStock))]));

    return {
      sauces: sauces.map((sauce) => {
        const batchQuantity = toFixed(getNumericValue(sauce.baseBatchQuantity));
        const estimatedBatchCost = toFixed(getNumericValue(sauce.estimatedBatchCost));
        return {
          id: sauce.id,
          name: sauce.name,
          outputIngredientId: sauce.outputIngredientId,
          outputIngredientName: sauce.outputIngredient?.name ?? sauce.name,
          outputUnit: sauce.outputUnit,
          baseBatchQuantity: batchQuantity,
          estimatedBatchCost,
          estimatedUnitCost:
            batchQuantity > 0 ? toMoney(estimatedBatchCost / batchQuantity) : toMoney(estimatedBatchCost),
          totalStock: stockMap.get(sauce.outputIngredientId) ?? 0,
          note: sauce.note,
          ingredientCount: countMap.get(sauce.id) ?? 0,
          isActive: sauce.isActive,
          createdAt: sauce.createdAt,
          updatedAt: sauce.updatedAt
        };
      }),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async getSauce(id: string) {
    const sauce = await this.getSauceOrFail(id);

    const [recipeRows, stock, recentBatches] = await Promise.all([
      this.sauceRecipeIngredientRepository.find({
        where: { sauceRecipeId: id },
        relations: {
          ingredient: { category: true }
        },
        order: { createdAt: "ASC" }
      }),
      this.ingredientStockRepository.findOne({ where: { ingredientId: sauce.outputIngredientId } }),
      this.sauceBatchRepository.find({
        where: { sauceRecipeId: id },
        order: { createdAt: "DESC" },
        take: 12
      })
    ]);

    const batchQuantity = toFixed(getNumericValue(sauce.baseBatchQuantity));
    const estimatedBatchCost = toFixed(getNumericValue(sauce.estimatedBatchCost));

    return {
      id: sauce.id,
      name: sauce.name,
      outputIngredientId: sauce.outputIngredientId,
      outputIngredientName: sauce.outputIngredient.name,
      outputUnit: sauce.outputUnit,
      baseBatchQuantity: batchQuantity,
      estimatedBatchCost,
      estimatedUnitCost: batchQuantity > 0 ? toMoney(estimatedBatchCost / batchQuantity) : toMoney(estimatedBatchCost),
      totalStock: toFixed(getNumericValue(stock?.totalStock)),
      note: sauce.note,
      isActive: sauce.isActive,
      ingredients: recipeRows.map((row) => ({
        id: row.id,
        ingredientId: row.ingredientId,
        ingredientName: row.ingredient.name,
        ingredientCategoryId: row.ingredient.categoryId,
        ingredientCategoryName: row.ingredient.category.name,
        ingredientBaseUnit: row.ingredient.unit,
        ingredientPerUnitPrice: toFixed(getNumericValue(row.ingredient.perUnitPrice)),
        quantity: toFixed(getNumericValue(row.quantity)),
        unit: row.unit,
        normalizedQuantity: toFixed(getNumericValue(row.normalizedQuantity), 6),
        costContribution: toFixed(getNumericValue(row.costContribution))
      })),
      recentBatches: recentBatches.map((batch) => ({
        id: batch.id,
        producedQuantity: toFixed(getNumericValue(batch.producedQuantity)),
        producedUnit: batch.producedUnit,
        batchFactor: toFixed(getNumericValue(batch.batchFactor), 6),
        consumedCost: toFixed(getNumericValue(batch.consumedCost)),
        note: batch.note,
        createdByUserId: batch.createdByUserId,
        createdAt: batch.createdAt
      })),
      createdAt: sauce.createdAt,
      updatedAt: sauce.updatedAt
    };
  }

  async createSauce(payload: {
    name: string;
    outputUnit: IngredientUnit;
    baseBatchQuantity: number;
    note?: string;
    ingredients: RecipePayload[];
  }) {
    const name = payload.name.trim();
    await this.validateUniqueSauceName(name);

    const preparedRecipe = await this.prepareRecipeRows(payload.ingredients);
    const baseBatchQuantity = toFixed(payload.baseBatchQuantity);
    const note = cleanOptionalText(payload.note) ?? null;

    if (baseBatchQuantity <= 0) {
      throw new AppError(422, "Batch quantity must be greater than zero");
    }

    const savedSauce = await AppDataSource.transaction(async (manager) => {
      const sauceRepo = manager.getRepository(SauceRecipe);
      const sauceIngredientRepo = manager.getRepository(SauceRecipeIngredient);
      const ingredientRepo = manager.getRepository(Ingredient);

      const existingIngredient = await ingredientRepo
        .createQueryBuilder("ingredient")
        .where("LOWER(ingredient.name) = LOWER(:name)", { name })
        .getOne();
      if (existingIngredient) {
        throw new AppError(409, "Ingredient with this name already exists. Choose a different sauce name.");
      }

      const sauceCategory = await this.ensureSauceCategory(manager);
      const unitCost = toMoney(preparedRecipe.totalEstimatedCost / baseBatchQuantity);

      const outputIngredient = ingredientRepo.create({
        name,
        categoryId: sauceCategory.id,
        unit: payload.outputUnit,
        perUnitPrice: unitCost,
        minStock: 0,
        isActive: true
      });
      const savedIngredient = await ingredientRepo.save(outputIngredient);
      await this.getOrCreateIngredientStock(manager, savedIngredient.id);

      const sauce = sauceRepo.create({
        name,
        outputIngredientId: savedIngredient.id,
        baseBatchQuantity,
        outputUnit: payload.outputUnit,
        estimatedBatchCost: toFixed(preparedRecipe.totalEstimatedCost),
        note,
        isActive: true
      });
      const saved = await sauceRepo.save(sauce);

      const recipeEntities = preparedRecipe.rows.map((row) =>
        sauceIngredientRepo.create({
          sauceRecipeId: saved.id,
          ingredientId: row.ingredientId,
          quantity: row.quantity,
          unit: row.unit,
          normalizedQuantity: row.normalizedQuantity,
          costContribution: row.costContribution
        })
      );
      await sauceIngredientRepo.save(recipeEntities);
      return saved;
    });

    return this.getSauce(savedSauce.id);
  }

  async updateSauce(
    id: string,
    payload: {
      name?: string;
      baseBatchQuantity?: number;
      note?: string;
      isActive?: boolean;
      ingredients?: RecipePayload[];
    }
  ) {
    const existing = await this.getSauceOrFail(id);

    if (payload.name !== undefined) {
      const name = payload.name.trim();
      await this.validateUniqueSauceName(name, id);
      existing.name = name;
    }

    if (payload.baseBatchQuantity !== undefined) {
      const baseBatchQuantity = toFixed(payload.baseBatchQuantity);
      if (baseBatchQuantity <= 0) {
        throw new AppError(422, "Batch quantity must be greater than zero");
      }
      existing.baseBatchQuantity = baseBatchQuantity;
    }

    if (payload.note !== undefined) {
      existing.note = cleanOptionalText(payload.note) ?? null;
    }

    if (payload.isActive !== undefined) {
      existing.isActive = payload.isActive;
    }

    const preparedRecipe = payload.ingredients ? await this.prepareRecipeRows(payload.ingredients) : null;
    if (preparedRecipe) {
      existing.estimatedBatchCost = toFixed(preparedRecipe.totalEstimatedCost);
    }

    await AppDataSource.transaction(async (manager) => {
      const sauceRepo = manager.getRepository(SauceRecipe);
      const recipeRepo = manager.getRepository(SauceRecipeIngredient);
      const ingredientRepo = manager.getRepository(Ingredient);

      const outputIngredient = await ingredientRepo.findOne({ where: { id: existing.outputIngredientId } });
      if (!outputIngredient) {
        throw new AppError(404, "Output ingredient for sauce not found");
      }

      if (payload.name !== undefined) {
        const name = payload.name.trim();
        const existingIngredient = await ingredientRepo
          .createQueryBuilder("ingredient")
          .where("LOWER(ingredient.name) = LOWER(:name)", { name })
          .andWhere("ingredient.id != :ingredientId", { ingredientId: outputIngredient.id })
          .getOne();

        if (existingIngredient) {
          throw new AppError(409, "Ingredient with this name already exists. Choose a different sauce name.");
        }

        outputIngredient.name = name;
      }

      if (payload.isActive !== undefined) {
        outputIngredient.isActive = payload.isActive;
      }

      const effectiveBatchCost = preparedRecipe
        ? preparedRecipe.totalEstimatedCost
        : getNumericValue(existing.estimatedBatchCost);
      const effectiveBatchQty = getNumericValue(existing.baseBatchQuantity);
      if (effectiveBatchQty > 0) {
        outputIngredient.perUnitPrice = toMoney(effectiveBatchCost / effectiveBatchQty);
      }

      await ingredientRepo.save(outputIngredient);
      await sauceRepo.save(existing);

      if (preparedRecipe) {
        await recipeRepo.delete({ sauceRecipeId: id });
        const entities = preparedRecipe.rows.map((row) =>
          recipeRepo.create({
            sauceRecipeId: id,
            ingredientId: row.ingredientId,
            quantity: row.quantity,
            unit: row.unit,
            normalizedQuantity: row.normalizedQuantity,
            costContribution: row.costContribution
          })
        );
        await recipeRepo.save(entities);
      }
    });

    return this.getSauce(id);
  }

  async deleteSauce(id: string) {
    const existing = await this.getSauceOrFail(id);
    const [referenceCount, batchCount] = await Promise.all([
      this.getSauceReferenceCount(existing.outputIngredientId, existing.id),
      this.sauceBatchRepository.count({ where: { sauceRecipeId: id } })
    ]);

    if (referenceCount > 0) {
      throw new AppError(
        409,
        `Cannot delete sauce because it is used in ${referenceCount} item/add-on recipe(s). Remove those mappings first.`
      );
    }
    if (batchCount > 0) {
      throw new AppError(409, "Cannot delete sauce because sauce batch history exists.");
    }

    await AppDataSource.transaction(async (manager) => {
      const sauceRepo = manager.getRepository(SauceRecipe);
      const ingredientRepo = manager.getRepository(Ingredient);
      const stockRepo = manager.getRepository(IngredientStock);

      const sauce = await sauceRepo.findOne({ where: { id } });
      if (!sauce) {
        throw new AppError(404, "Sauce not found");
      }

      const stock = await stockRepo.findOne({ where: { ingredientId: sauce.outputIngredientId } });
      if (stock && getNumericValue(stock.totalStock) > 0) {
        throw new AppError(
          409,
          "Cannot delete sauce because prepared stock is still available. Consume/adjust stock first."
        );
      }

      await sauceRepo.remove(sauce);

      if (stock) {
        await stockRepo.remove(stock);
      }

      const ingredient = await ingredientRepo.findOne({ where: { id: sauce.outputIngredientId } });
      if (ingredient) {
        await ingredientRepo.remove(ingredient);
      }
    });

    return {
      id: existing.id,
      name: existing.name,
      outputIngredientId: existing.outputIngredientId
    };
  }

  async makeSauceBatch(
    sauceId: string,
    payload: {
      producedQuantity: number;
      note?: string;
      createdByUserId?: string | null;
    }
  ) {
    const producedQuantity = toFixed(payload.producedQuantity);
    if (producedQuantity <= 0) {
      throw new AppError(422, "Produced quantity must be greater than zero");
    }

    const savedBatch = await AppDataSource.transaction(async (manager) => {
      const sauceRepo = manager.getRepository(SauceRecipe);
      const sauceIngredientRepo = manager.getRepository(SauceRecipeIngredient);
      const ingredientRepo = manager.getRepository(Ingredient);
      const stockRepo = manager.getRepository(IngredientStock);
      const stockLogRepo = manager.getRepository(IngredientStockLog);
      const batchRepo = manager.getRepository(SauceBatch);

      const sauce = await sauceRepo.findOne({
        where: { id: sauceId },
        relations: { outputIngredient: true }
      });
      if (!sauce) {
        throw new AppError(404, "Sauce not found");
      }
      if (!sauce.isActive) {
        throw new AppError(409, "This sauce is inactive. Enable it before recording a batch.");
      }

      const recipeRows = await sauceIngredientRepo.find({
        where: { sauceRecipeId: sauceId },
        relations: { ingredient: true },
        order: { createdAt: "ASC" }
      });
      if (!recipeRows.length) {
        throw new AppError(422, "Sauce recipe is empty. Add ingredients before recording a batch.");
      }

      const baseBatchQuantity = toFixed(getNumericValue(sauce.baseBatchQuantity));
      if (baseBatchQuantity <= 0) {
        throw new AppError(409, "Sauce base batch quantity is invalid. Update recipe first.");
      }

      const producedNormalized = convertIngredientQuantity(
        producedQuantity,
        sauce.outputUnit,
        sauce.outputIngredient.unit
      );
      if (producedNormalized === null) {
        throw new AppError(409, "Produced unit is not compatible with output ingredient unit.");
      }

      const baseBatchNormalized = convertIngredientQuantity(
        baseBatchQuantity,
        sauce.outputUnit,
        sauce.outputIngredient.unit
      );
      if (baseBatchNormalized === null || baseBatchNormalized <= 0) {
        throw new AppError(409, "Sauce batch setup is invalid. Update the recipe output unit.");
      }

      const normalizedProducedQty = toFixed(producedNormalized, 6);
      const batchFactor = toFixed(normalizedProducedQty / baseBatchNormalized, 6);
      if (batchFactor <= 0) {
        throw new AppError(422, "Unable to compute sauce batch factor from provided quantity.");
      }

      const ingredientIds = Array.from(
        new Set([...recipeRows.map((row) => row.ingredientId), sauce.outputIngredientId])
      );
      const stocks = ingredientIds.length
        ? await stockRepo.find({ where: { ingredientId: In(ingredientIds) } })
        : [];
      const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, stock]));
      const touchedStocks = new Set<IngredientStock>();
      const logs: IngredientStockLog[] = [];

      let consumedCost = 0;
      for (const recipeRow of recipeRows) {
        const consumedQuantity = toFixed(getNumericValue(recipeRow.normalizedQuantity) * batchFactor);
        if (consumedQuantity <= 0) {
          continue;
        }

        const stock =
          stockMap.get(recipeRow.ingredientId) ??
          manager.create(IngredientStock, {
            ingredientId: recipeRow.ingredientId,
            totalStock: 0,
            lastUpdatedAt: new Date()
          });
        stockMap.set(recipeRow.ingredientId, stock);

        const available = toFixed(getNumericValue(stock.totalStock));
        if (available + 0.000001 < consumedQuantity) {
          throw new AppError(
            409,
            `Insufficient stock for ${recipeRow.ingredient.name}. Available ${available} ${recipeRow.ingredient.unit}, required ${consumedQuantity} ${recipeRow.ingredient.unit}.`
          );
        }

        stock.totalStock = toFixed(available - consumedQuantity);
        stock.lastUpdatedAt = new Date();
        touchedStocks.add(stock);

        consumedCost += toFixed(getNumericValue(recipeRow.costContribution) * batchFactor);
        logs.push(
          manager.create(IngredientStockLog, {
            ingredientId: recipeRow.ingredientId,
            type: IngredientStockLogType.USE,
            quantity: consumedQuantity,
            note:
              cleanOptionalText(payload.note) ??
              `Consumed for sauce batch (${sauce.name}) production.`
          })
        );
      }

      const outputStock =
        stockMap.get(sauce.outputIngredientId) ??
        manager.create(IngredientStock, {
          ingredientId: sauce.outputIngredientId,
          totalStock: 0,
          lastUpdatedAt: new Date()
        });
      outputStock.totalStock = toFixed(getNumericValue(outputStock.totalStock) + normalizedProducedQty);
      outputStock.lastUpdatedAt = new Date();
      touchedStocks.add(outputStock);

      logs.push(
        manager.create(IngredientStockLog, {
          ingredientId: sauce.outputIngredientId,
          type: IngredientStockLogType.ADD,
          quantity: toFixed(normalizedProducedQty),
          note: cleanOptionalText(payload.note) ?? `Prepared sauce batch (${sauce.name}) added to stock.`
        })
      );

      if (touchedStocks.size) {
        await stockRepo.save(Array.from(touchedStocks));
      }
      if (logs.length) {
        await stockLogRepo.save(logs);
      }

      if (normalizedProducedQty > 0) {
        const outputIngredient = await ingredientRepo.findOne({ where: { id: sauce.outputIngredientId } });
        if (outputIngredient) {
          outputIngredient.perUnitPrice = toMoney(consumedCost / normalizedProducedQty);
          await ingredientRepo.save(outputIngredient);
        }
      }

      const batch = batchRepo.create({
        sauceRecipeId: sauce.id,
        outputIngredientId: sauce.outputIngredientId,
        producedQuantity: producedQuantity,
        producedUnit: sauce.outputUnit,
        batchFactor: toFixed(batchFactor, 6),
        consumedCost: toFixed(consumedCost),
        note: cleanOptionalText(payload.note) ?? null,
        createdByUserId: payload.createdByUserId ?? null
      });

      return batchRepo.save(batch);
    });

    const sauce = await this.getSauceSummaryById(sauceId);
    return {
      sauce,
      batch: {
        id: savedBatch.id,
        sauceRecipeId: savedBatch.sauceRecipeId,
        outputIngredientId: savedBatch.outputIngredientId,
        producedQuantity: toFixed(getNumericValue(savedBatch.producedQuantity)),
        producedUnit: savedBatch.producedUnit,
        batchFactor: toFixed(getNumericValue(savedBatch.batchFactor), 6),
        consumedCost: toFixed(getNumericValue(savedBatch.consumedCost)),
        note: savedBatch.note,
        createdByUserId: savedBatch.createdByUserId,
        createdAt: savedBatch.createdAt
      }
    };
  }

  async listCombos(filters: ComboFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.comboRepository
      .createQueryBuilder("combo")
      .where("1 = 1")
      .orderBy("combo.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("combo.isActive = true");
    }

    if (filters.search) {
      query.andWhere("LOWER(combo.name) LIKE LOWER(:search)", { search: `%${filters.search}%` });
    }

    const total = await query.getCount();
    const combos = await query.offset(offset).limit(limit).getMany();

    const comboIds = combos.map((combo) => combo.id);
    const comboItems = comboIds.length
      ? await this.comboItemRepository.find({
          where: { comboId: In(comboIds) },
          relations: { item: true }
        })
      : [];

    const comboCountMap = new Map<string, number>();
    const comboIncludedValueMap = new Map<string, number>();
    comboItems.forEach((row) => {
      comboCountMap.set(row.comboId, (comboCountMap.get(row.comboId) ?? 0) + 1);
      const lineTotal = getNumericValue(row.quantity) * getNumericValue(row.item.sellingPrice);
      comboIncludedValueMap.set(row.comboId, (comboIncludedValueMap.get(row.comboId) ?? 0) + lineTotal);
    });

    return {
      combos: combos.map((combo) => ({
        id: combo.id,
        name: combo.name,
        sellingPrice: toMoney(getNumericValue(combo.sellingPrice)),
        gstPercentage: toMoney(getNumericValue(combo.gstPercentage)),
        imageUrl: combo.imageUrl,
        note: combo.note,
        includedItemsCount: comboCountMap.get(combo.id) ?? 0,
        includedItemsValue: toMoney(comboIncludedValueMap.get(combo.id) ?? 0),
        isActive: combo.isActive,
        createdAt: combo.createdAt,
        updatedAt: combo.updatedAt
      })),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async getCombo(id: string) {
    const combo = await this.getComboOrFail(id);
    const comboItems = await this.comboItemRepository.find({
      where: { comboId: id },
      relations: { item: true },
      order: { createdAt: "ASC" }
    });

    const includedItemsValue = toMoney(
      comboItems.reduce(
        (sum, row) => sum + getNumericValue(row.quantity) * getNumericValue(row.item.sellingPrice),
        0
      )
    );

    return {
      id: combo.id,
      name: combo.name,
      sellingPrice: toMoney(getNumericValue(combo.sellingPrice)),
      gstPercentage: toMoney(getNumericValue(combo.gstPercentage)),
      imageUrl: combo.imageUrl,
      note: combo.note,
      includedItemsValue,
      isActive: combo.isActive,
      items: comboItems.map((row) => ({
        id: row.id,
        itemId: row.itemId,
        itemName: row.item.name,
        quantity: toFixed(getNumericValue(row.quantity)),
        itemSellingPrice: toMoney(getNumericValue(row.item.sellingPrice)),
        lineTotal: toMoney(getNumericValue(row.quantity) * getNumericValue(row.item.sellingPrice))
      })),
      createdAt: combo.createdAt,
      updatedAt: combo.updatedAt
    };
  }

  async createCombo(payload: {
    name: string;
    sellingPrice: number;
    gstPercentage: number;
    imageUrl?: string;
    note?: string;
    items: ComboPayloadItem[];
  }) {
    const name = payload.name.trim();
    await this.validateUniqueComboName(name);

    const preparedItems = await this.prepareComboItems(payload.items);
    const imageUrl = cleanOptionalText(payload.imageUrl) ?? null;
    const note = cleanOptionalText(payload.note) ?? null;

    const savedCombo = await AppDataSource.transaction(async (manager) => {
      const comboRepo = manager.getRepository(Combo);
      const comboItemRepo = manager.getRepository(ComboItem);

      const combo = comboRepo.create({
        name,
        sellingPrice: toMoney(payload.sellingPrice),
        gstPercentage: toMoney(payload.gstPercentage),
        imageUrl,
        note,
        isActive: true
      });
      const saved = await comboRepo.save(combo);

      const entities = preparedItems.map((row) =>
        comboItemRepo.create({
          comboId: saved.id,
          itemId: row.itemId,
          quantity: row.quantity
        })
      );
      await comboItemRepo.save(entities);
      return saved;
    });

    return this.getCombo(savedCombo.id);
  }

  async updateCombo(
    id: string,
    payload: {
      name?: string;
      sellingPrice?: number;
      gstPercentage?: number;
      imageUrl?: string;
      note?: string;
      isActive?: boolean;
      items?: ComboPayloadItem[];
    }
  ) {
    const existing = await this.getComboOrFail(id);

    if (payload.name !== undefined) {
      const name = payload.name.trim();
      await this.validateUniqueComboName(name, id);
      existing.name = name;
    }

    if (payload.sellingPrice !== undefined) {
      existing.sellingPrice = toMoney(payload.sellingPrice);
    }

    if (payload.gstPercentage !== undefined) {
      existing.gstPercentage = toMoney(payload.gstPercentage);
    }

    if (payload.imageUrl !== undefined) {
      existing.imageUrl = cleanOptionalText(payload.imageUrl) ?? null;
    }

    if (payload.note !== undefined) {
      existing.note = cleanOptionalText(payload.note) ?? null;
    }

    if (payload.isActive !== undefined) {
      existing.isActive = payload.isActive;
    }

    const preparedItems = payload.items ? await this.prepareComboItems(payload.items) : null;

    await AppDataSource.transaction(async (manager) => {
      const comboRepo = manager.getRepository(Combo);
      const comboItemRepo = manager.getRepository(ComboItem);

      await comboRepo.save(existing);
      if (preparedItems) {
        await comboItemRepo.delete({ comboId: id });
        const entities = preparedItems.map((row) =>
          comboItemRepo.create({
            comboId: id,
            itemId: row.itemId,
            quantity: row.quantity
          })
        );
        await comboItemRepo.save(entities);
      }
    });

    return this.getCombo(id);
  }

  async deleteCombo(id: string) {
    const combo = await this.getComboOrFail(id);
    await this.comboRepository.remove(combo);
    return combo;
  }

  async getMetaIngredients() {
    const ingredients = await this.ingredientRepository.find({
      where: { isActive: true },
      relations: { category: true },
      order: { name: "ASC" }
    });

    const ingredientIds = ingredients.map((ingredient) => ingredient.id);
    const stocks = ingredientIds.length
      ? await this.ingredientStockRepository.find({
          where: { ingredientId: In(ingredientIds) }
        })
      : [];

    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, toFixed(getNumericValue(stock.totalStock))]));
    const fallbackPriceMap = new Map(ingredients.map((ingredient) => [ingredient.id, getNumericValue(ingredient.perUnitPrice)]));
    const latestPriceMap = await getLatestIngredientPurchasePriceMap(ingredientIds, fallbackPriceMap);

    return ingredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      categoryId: ingredient.categoryId,
      categoryName: ingredient.category.name,
      unit: ingredient.unit,
      perUnitPrice: toFixed(latestPriceMap.get(ingredient.id) ?? getNumericValue(ingredient.perUnitPrice)),
      minStock: toFixed(getNumericValue(ingredient.minStock)),
      totalStock: stockMap.get(ingredient.id) ?? 0
    }));
  }

  async getMetaCategories() {
    const categories = await this.itemCategoryRepository.find({
      where: { isActive: true },
      order: { name: "ASC" }
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      isActive: category.isActive
    }));
  }

  async getMetaSauces() {
    const sauces = await this.sauceRecipeRepository.find({
      where: { isActive: true },
      order: { name: "ASC" }
    });

    return sauces.map((sauce) => {
      const batchQuantity = toFixed(getNumericValue(sauce.baseBatchQuantity));
      const batchCost = toFixed(getNumericValue(sauce.estimatedBatchCost));
      return {
        id: sauce.id,
        name: sauce.name,
        outputUnit: sauce.outputUnit,
        baseBatchQuantity: batchQuantity,
        estimatedBatchCost: batchCost,
        estimatedUnitCost: batchQuantity > 0 ? toMoney(batchCost / batchQuantity) : toMoney(batchCost)
      };
    });
  }

  async getMetaItems() {
    const items = await this.itemRepository.find({
      where: { isActive: true },
      relations: { category: true },
      order: { name: "ASC" }
    });

    const itemIds = items.map((item) => item.id);
    const [ingredientCounts, sauceCounts] = itemIds.length
      ? await Promise.all([
          this.itemIngredientRepository
            .createQueryBuilder("recipe")
            .select("recipe.itemId", "itemId")
            .addSelect("COUNT(*)", "count")
            .where("recipe.itemId IN (:...itemIds)", { itemIds })
            .groupBy("recipe.itemId")
            .getRawMany<{ itemId: string; count: string }>(),
          this.itemSauceRepository
            .createQueryBuilder("itemSauce")
            .select("itemSauce.itemId", "itemId")
            .addSelect("COUNT(*)", "count")
            .where("itemSauce.itemId IN (:...itemIds)", { itemIds })
            .groupBy("itemSauce.itemId")
            .getRawMany<{ itemId: string; count: string }>()
        ])
      : [[], []];

    const ingredientCountMap = new Map(ingredientCounts.map((entry) => [entry.itemId, Number(entry.count)]));
    const sauceCountMap = new Map(sauceCounts.map((entry) => [entry.itemId, Number(entry.count)]));

    return items.map((item) => ({
      id: item.id,
      name: item.name,
      categoryId: item.categoryId,
      categoryName: item.category.name,
      sellingPrice: toMoney(getNumericValue(item.sellingPrice)),
      gstPercentage: toMoney(getNumericValue(item.gstPercentage)),
      imageUrl: item.imageUrl,
      note: item.note,
      estimatedIngredientCost: toFixed(getNumericValue(item.estimatedIngredientCost)),
      ingredientCount: (ingredientCountMap.get(item.id) ?? 0) + (sauceCountMap.get(item.id) ?? 0),
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));
  }

  getMetaUnits() {
    return UNIT_META;
  }
}
