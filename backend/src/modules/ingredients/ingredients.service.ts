import { In, QueryFailedError } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { DailyAllocation } from "./daily-allocation.entity";
import { IngredientCategory } from "./ingredient-category.entity";
import { Ingredient } from "./ingredient.entity";
import { IngredientStockLog } from "./ingredient-stock-log.entity";
import { IngredientStock } from "./ingredient-stock.entity";
import { IngredientStockLogType, type IngredientUnit } from "./ingredients.constants";
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

const getStartOfDay = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getEndOfDay = (date: Date) => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
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

    const [allocations, usageRows, stocks] = await Promise.all([
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
      })
    ]);

    const allocationMap = new Map(allocations.map((allocation) => [allocation.ingredientId, allocation]));
    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, toFixedQuantity(getNumericValue(stock.totalStock))]));
    const usageMap = new Map(
      usageRows.map((row) => [row.ingredientId, toFixedQuantity(getNumericValue(row.usedQuantity))])
    );

    return ingredients.map((ingredient) => {
      const allocation = allocationMap.get(ingredient.id);
      const currentStock = stockMap.get(ingredient.id) ?? 0;
      const allocatedQuantity = toFixedQuantity(getNumericValue(allocation?.allocatedQuantity));
      const allocationUsed = toFixedQuantity(getNumericValue(allocation?.usedQuantity));
      const usageUsed = usageMap.get(ingredient.id) ?? 0;
      const usedQuantity = toFixedQuantity(Math.max(allocationUsed, usageUsed));
      const hasAllocation = allocatedQuantity > 0;
      const openingQuantity = hasAllocation ? allocatedQuantity : toFixedQuantity(currentStock + usedQuantity);
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

    const [reports, yesterdayUsageCount] = await Promise.all([
      this.closingReportRepository.find({
        where: {
          staffId: userId,
          reportDate: In([previousDate, today])
        }
      }),
      this.usageEventRepository
        .createQueryBuilder("usage")
        .where("usage.staffId = :staffId", { staffId: userId })
        .andWhere("usage.usageDate = :usageDate", { usageDate: previousDate })
        .getCount()
    ]);

    const hasClosedPreviousBusinessDate = reports.some((report) => report.reportDate === previousDate);
    const hasClosedTodayBusinessDate = reports.some((report) => report.reportDate === today);
    const pendingCarryForward = !hasClosedPreviousBusinessDate && yesterdayUsageCount > 0;

    const pendingCloseDate = pendingCarryForward ? previousDate : hasClosedTodayBusinessDate ? null : today;

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

    if (pendingCarryForward) {
      return {
        canTakeOrders: false,
        reason: `Previous business day (${previousDate}) closing is pending. Submit that closing first to continue billing.`,
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
        reason: "Today closing already submitted. Billing will unlock on the next business day.",
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
    const [todaySubmissionCount, draftItems] = await Promise.all([
      this.closingReportRepository
        .createQueryBuilder("report")
        .where("report.staffId = :staffId", { staffId: userId })
        .andWhere("report.submittedAt BETWEEN :start AND :end", {
          start: getStartOfDay(new Date()),
          end: getEndOfDay(new Date())
        })
        .getCount(),
      this.getClosingDraftItems(gate.pendingCloseDate ?? gate.today)
    ]);

    return {
      canTakeOrders: gate.canTakeOrders,
      reason: gate.reason,
      pendingCloseDate: gate.pendingCloseDate,
      hasClosedPreviousBusinessDate: gate.hasClosedPreviousBusinessDate,
      hasClosedTodayBusinessDate: gate.hasClosedTodayBusinessDate,
      todayClosingCount: todaySubmissionCount,
      maxClosingsPerDay: 2,
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

    const todaySubmissionCount = await this.closingReportRepository
      .createQueryBuilder("report")
      .where("report.staffId = :staffId", { staffId: userId })
      .andWhere("report.submittedAt BETWEEN :start AND :end", {
        start: getStartOfDay(new Date()),
        end: getEndOfDay(new Date())
      })
      .getCount();

    if (todaySubmissionCount >= 2) {
      throw new AppError(409, "Maximum 2 closings are allowed per day.");
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
      closingSlot: todaySubmissionCount + 1,
      isCarryForwardClosing: reportDate === gate.previousDate,
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
      (report.items ?? []).map((item) => ({
        reportItemId: `${report.id}-${item.ingredientId}`,
        reportId: report.id,
        reportDate: report.reportDate,
        staffId: report.staffId,
        staffName: report.staff?.fullName ?? "-",
        submittedAt: report.submittedAt,
        ingredientId: item.ingredientId,
        ingredientName: item.ingredientName,
        unit: item.unit,
        openingStockQuantity: toFixedQuantity(getNumericValue(item.allocatedQuantity)),
        purchaseStockQuantity: toFixedQuantity(
          purchaseByKey.get(movementKey(item.ingredientId, report.reportDate)) ?? 0
        ),
        transferredInQuantity: toFixedQuantity(
          transferInByKey.get(movementKey(item.ingredientId, report.reportDate)) ?? 0
        ),
        transferredOutQuantity: toFixedQuantity(
          transferOutByKey.get(movementKey(item.ingredientId, report.reportDate)) ?? 0
        ),
        consumptionQuantity: toFixedQuantity(getNumericValue(item.usedQuantity)),
        dumpQuantity: toFixedQuantity(dumpByKey.get(movementKey(item.ingredientId, report.reportDate)) ?? 0),
        expectedStockQuantity: toFixedQuantity(getNumericValue(item.expectedRemainingQuantity)),
        enteredStockQuantity: toFixedQuantity(getNumericValue(item.reportedRemainingQuantity)),
        allocatedQuantity: toFixedQuantity(getNumericValue(item.allocatedQuantity)),
        usedQuantity: toFixedQuantity(getNumericValue(item.usedQuantity)),
        expectedRemainingQuantity: toFixedQuantity(getNumericValue(item.expectedRemainingQuantity)),
        reportedRemainingQuantity: toFixedQuantity(getNumericValue(item.reportedRemainingQuantity)),
        varianceQuantity: toFixedQuantity(getNumericValue(item.varianceQuantity)),
        isMismatch: Math.abs(getNumericValue(item.varianceQuantity)) > 0.0001
      }))
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
