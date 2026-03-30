import { In, type EntityManager, type SelectQueryBuilder } from "typeorm";

import { UserRole } from "../../constants/roles";
import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { Ingredient } from "../ingredients/ingredient.entity";
import { IngredientStockLog } from "../ingredients/ingredient-stock-log.entity";
import { IngredientStock } from "../ingredients/ingredient-stock.entity";
import { IngredientStockLogType } from "../ingredients/ingredients.constants";
import { Item } from "../items/item.entity";
import { ItemIngredient } from "../items/item-ingredient.entity";
import { Product } from "../procurement/product.entity";
import { type DumpEntryType, type DumpIngredientImpact } from "./dump.constants";
import { DumpEntry } from "./dump.entity";

type DumpUserContext = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
};

type CreateDumpEntryInput = {
  entryDate?: string;
  entryType: DumpEntryType;
  sourceId: string;
  quantity: number;
  quantityUnit?: string;
  note?: string;
};

type DumpAdminListFilters = {
  dateFrom?: string;
  dateTo?: string;
  entryType?: DumpEntryType;
  search?: string;
  page: number;
  limit: number;
};

type DumpAdminStatsFilters = {
  dateFrom?: string;
  dateTo?: string;
  entryType?: DumpEntryType;
  search?: string;
};

type DumpRecordDto = {
  id: string;
  entryDate: string;
  entryType: DumpEntryType;
  sourceName: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  baseUnit: string;
  lossAmount: number;
  ingredientImpacts: DumpIngredientImpact[];
  note: string | null;
  createdByUserId: string;
  createdByUserName: string;
  createdByUsername: string;
  createdAt: Date;
  updatedAt: Date;
};

type UnitMeta = {
  group: string;
  factorToBase: number;
};

const UNIT_META: Record<string, UnitMeta> = {
  mcg: { group: "weight", factorToBase: 0.000001 },
  mg: { group: "weight", factorToBase: 0.001 },
  g: { group: "weight", factorToBase: 1 },
  kg: { group: "weight", factorToBase: 1000 },
  quintal: { group: "weight", factorToBase: 100000 },
  ton: { group: "weight", factorToBase: 1000000 },
  ml: { group: "volume", factorToBase: 1 },
  cl: { group: "volume", factorToBase: 10 },
  dl: { group: "volume", factorToBase: 100 },
  l: { group: "volume", factorToBase: 1000 },
  gallon: { group: "volume", factorToBase: 3785.411784 },
  teaspoon: { group: "volume", factorToBase: 5 },
  tablespoon: { group: "volume", factorToBase: 15 },
  cup: { group: "volume", factorToBase: 240 },
  pcs: { group: "count", factorToBase: 1 },
  piece: { group: "count", factorToBase: 1 },
  count: { group: "count", factorToBase: 1 },
  unit: { group: "count", factorToBase: 1 },
  units: { group: "count", factorToBase: 1 },
  pair: { group: "count", factorToBase: 2 },
  dozen: { group: "count", factorToBase: 12 },
  tray: { group: "count", factorToBase: 1 },
  tin: { group: "count", factorToBase: 1 },
  plate: { group: "plate", factorToBase: 1 },
  pack: { group: "pack", factorToBase: 1 },
  packet: { group: "packet", factorToBase: 1 },
  box: { group: "box", factorToBase: 1 },
  bottle: { group: "bottle", factorToBase: 1 },
  can: { group: "can", factorToBase: 1 },
  jar: { group: "jar", factorToBase: 1 },
  tub: { group: "tub", factorToBase: 1 },
  pouch: { group: "pouch", factorToBase: 1 },
  roll: { group: "roll", factorToBase: 1 },
  bag: { group: "bag", factorToBase: 1 },
  sack: { group: "sack", factorToBase: 1 },
  bundle: { group: "bundle", factorToBase: 1 },
  carton: { group: "carton", factorToBase: 1 },
  crate: { group: "crate", factorToBase: 1 },
  loaf: { group: "loaf", factorToBase: 1 },
  block: { group: "block", factorToBase: 1 },
  custom: { group: "custom", factorToBase: 1 },
  item: { group: "item", factorToBase: 1 },
  items: { group: "item", factorToBase: 1 }
};

const GROUP_UNIT_OPTIONS: Record<string, string[]> = {
  weight: ["mcg", "mg", "g", "kg", "quintal", "ton"],
  volume: ["ml", "cl", "dl", "l", "teaspoon", "tablespoon", "cup", "gallon"],
  count: ["pcs", "piece", "count", "unit", "units", "pair", "dozen", "tray", "tin"],
  item: ["item"]
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toQuantity = (value: number) => Number(value.toFixed(3));
const toMoney = (value: number) => Number(value.toFixed(2));

const cleanText = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeUnit = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const resolveUnitOptions = (baseUnit: string) => {
  const normalizedBase = normalizeUnit(baseUnit);
  const meta = UNIT_META[normalizedBase];
  if (!meta) {
    return normalizedBase ? [normalizedBase] : [];
  }
  const groupOptions = GROUP_UNIT_OPTIONS[meta.group];
  if (groupOptions?.length) {
    return groupOptions;
  }
  return [normalizedBase];
};

const convertQuantityUnit = (quantity: number, fromUnit: string, toUnit: string) => {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) {
    return null;
  }
  if (from === to) {
    return toQuantity(quantity);
  }
  const fromMeta = UNIT_META[from];
  const toMeta = UNIT_META[to];
  if (!fromMeta || !toMeta) {
    return null;
  }
  if (fromMeta.group !== toMeta.group) {
    return null;
  }
  const base = quantity * fromMeta.factorToBase;
  return toQuantity(base / toMeta.factorToBase);
};

const todayDate = () => new Date().toISOString().slice(0, 10);

const parseEntryDateOrThrow = (value?: string) => {
  const resolved = value ?? todayDate();
  const parsed = new Date(`${resolved}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(422, "Entry date must be in YYYY-MM-DD format.");
  }
  return resolved;
};

export class DumpService {
  private readonly dumpRepository = AppDataSource.getRepository(DumpEntry);
  private readonly ingredientRepository = AppDataSource.getRepository(Ingredient);
  private readonly ingredientStockRepository = AppDataSource.getRepository(IngredientStock);
  private readonly itemRepository = AppDataSource.getRepository(Item);
  private readonly productRepository = AppDataSource.getRepository(Product);

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

  private async createIngredientStockLog(
    manager: EntityManager,
    payload: { ingredientId: string; quantity: number; note?: string }
  ) {
    const quantity = Math.abs(toQuantity(payload.quantity));
    if (quantity <= 0) {
      return;
    }
    const log = manager.create(IngredientStockLog, {
      ingredientId: payload.ingredientId,
      type: IngredientStockLogType.ADJUST,
      quantity,
      note: cleanText(payload.note)
    });
    await manager.save(IngredientStockLog, log);
  }

  private assertHasStockOrThrow(currentStock: number, deductionQuantity: number, label: string, unit: string) {
    if (deductionQuantity <= 0) {
      throw new AppError(422, "Quantity must be greater than zero.");
    }
    if (currentStock < deductionQuantity) {
      throw new AppError(
        409,
        `Insufficient stock for ${label}. Available ${toQuantity(currentStock)} ${unit}, requested ${toQuantity(deductionQuantity)} ${unit}.`
      );
    }
  }

  private normalizeIngredientImpacts(raw: unknown): DumpIngredientImpact[] {
    const rows = Array.isArray(raw) ? raw : [];
    return rows
      .map((row) => {
        const value = row as Partial<DumpIngredientImpact>;
        if (!value || typeof value !== "object") {
          return null;
        }
        return {
          ingredientId: String(value.ingredientId ?? ""),
          ingredientName: String(value.ingredientName ?? "-"),
          quantity: toQuantity(toNumber(value.quantity)),
          unit: String(value.unit ?? ""),
          unitPrice: toMoney(toNumber(value.unitPrice)),
          lossAmount: toMoney(toNumber(value.lossAmount))
        } satisfies DumpIngredientImpact;
      })
      .filter((value): value is DumpIngredientImpact => value !== null && value.ingredientId.length > 0);
  }

  private mapRecord(entry: DumpEntry): DumpRecordDto {
    const baseUnit = normalizeUnit(entry.baseUnit) || normalizeUnit(entry.unit);
    return {
      id: entry.id,
      entryDate: entry.entryDate,
      entryType: entry.entryType,
      sourceName: entry.sourceName,
      quantity: toQuantity(toNumber(entry.quantity)),
      unit: normalizeUnit(entry.unit),
      baseQuantity: toQuantity(toNumber(entry.baseQuantity)),
      baseUnit,
      lossAmount: toMoney(toNumber(entry.lossAmount)),
      ingredientImpacts: this.normalizeIngredientImpacts(entry.ingredientImpacts),
      note: cleanText(entry.note),
      createdByUserId: entry.createdByUserId,
      createdByUserName: entry.createdByUser?.fullName ?? "-",
      createdByUsername: entry.createdByUser?.username ?? "-",
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    };
  }

  private applyFilters(
    query: SelectQueryBuilder<DumpEntry>,
    filters: { dateFrom?: string; dateTo?: string; entryType?: DumpEntryType; search?: string }
  ) {
    if (filters.dateFrom) {
      query.andWhere("dump.entryDate >= :dateFrom", { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      query.andWhere("dump.entryDate <= :dateTo", { dateTo: filters.dateTo });
    }
    if (filters.entryType) {
      query.andWhere("dump.entryType = :entryType", { entryType: filters.entryType });
    }
    if (filters.search) {
      query.andWhere(
        `(
          LOWER(dump.sourceName) LIKE LOWER(:search)
          OR LOWER(COALESCE(dump.note, '')) LIKE LOWER(:search)
          OR LOWER(createdByUser.fullName) LIKE LOWER(:search)
          OR LOWER(createdByUser.username) LIKE LOWER(:search)
        )`,
        { search: `%${filters.search}%` }
      );
    }
  }

  async getEntryOptions() {
    const [ingredients, items, products] = await Promise.all([
      this.ingredientRepository.find({
        where: { isActive: true },
        order: { name: "ASC" }
      }),
      this.itemRepository.find({
        where: { isActive: true },
        order: { name: "ASC" }
      }),
      this.productRepository.find({
        where: { isActive: true },
        order: { name: "ASC" }
      })
    ]);

    const ingredientIds = ingredients.map((ingredient) => ingredient.id);
    const ingredientStocks = ingredientIds.length
      ? await this.ingredientStockRepository.find({ where: { ingredientId: In(ingredientIds) } })
      : [];
    const stockMap = new Map(ingredientStocks.map((row) => [row.ingredientId, toQuantity(toNumber(row.totalStock))]));

    return {
      ingredients: ingredients.map((ingredient) => {
        const baseUnit = normalizeUnit(ingredient.unit);
        return {
          id: ingredient.id,
          name: ingredient.name,
          unit: baseUnit,
          baseUnit,
          unitOptions: resolveUnitOptions(baseUnit),
          currentStock: stockMap.get(ingredient.id) ?? 0,
          perUnitPrice: toMoney(toNumber(ingredient.perUnitPrice))
        };
      }),
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        baseUnit: "item",
        unitOptions: ["item"],
        estimatedIngredientCost: toMoney(toNumber(item.estimatedIngredientCost))
      })),
      products: products.map((product) => {
        const baseUnit = normalizeUnit(product.unit);
        return {
          id: product.id,
          name: product.name,
          unit: baseUnit,
          baseUnit,
          unitOptions: resolveUnitOptions(baseUnit),
          currentStock: toQuantity(toNumber(product.currentStock)),
          purchaseUnitPrice: toMoney(toNumber(product.purchaseUnitPrice))
        };
      })
    };
  }

  async createEntry(actor: DumpUserContext, payload: CreateDumpEntryInput) {
    if (![UserRole.ADMIN, UserRole.STAFF].includes(actor.role)) {
      throw new AppError(403, "Only Dip & Dash staff/admin can submit dump entry.");
    }

    const entryDate = parseEntryDateOrThrow(payload.entryDate);
    const enteredQuantity = toQuantity(toNumber(payload.quantity));
    if (enteredQuantity <= 0) {
      throw new AppError(422, "Quantity must be greater than zero.");
    }

    const savedId = await AppDataSource.transaction(async (manager) => {
      let sourceName = "";
      let unit = "";
      let baseQuantity = enteredQuantity;
      let baseUnit = "";
      let lossAmount = 0;
      let ingredientImpacts: DumpIngredientImpact[] = [];
      let ingredientId: string | null = null;
      let itemId: string | null = null;
      let productId: string | null = null;

      if (payload.entryType === "ingredient") {
        const ingredient = await manager.findOne(Ingredient, {
          where: { id: payload.sourceId, isActive: true }
        });
        if (!ingredient) {
          throw new AppError(404, "Ingredient not found.");
        }

        baseUnit = normalizeUnit(ingredient.unit);
        const enteredUnit = normalizeUnit(payload.quantityUnit) || baseUnit;
        const allowedUnits = resolveUnitOptions(baseUnit);
        if (!allowedUnits.includes(enteredUnit)) {
          throw new AppError(422, `Selected quantity unit is not valid for ${ingredient.name}.`);
        }
        const convertedBaseQuantity = convertQuantityUnit(enteredQuantity, enteredUnit, baseUnit);
        if (convertedBaseQuantity === null || convertedBaseQuantity <= 0) {
          throw new AppError(422, "Unable to convert entered quantity to ingredient base unit.");
        }

        const stock = await this.getOrCreateIngredientStock(manager, ingredient.id);
        const currentStock = toQuantity(toNumber(stock.totalStock));
        this.assertHasStockOrThrow(currentStock, convertedBaseQuantity, ingredient.name, baseUnit);

        stock.totalStock = toQuantity(currentStock - convertedBaseQuantity);
        stock.lastUpdatedAt = new Date();
        await manager.save(IngredientStock, stock);
        await this.createIngredientStockLog(manager, {
          ingredientId: ingredient.id,
          quantity: convertedBaseQuantity,
          note: `Dump/Wastage deduction (${enteredQuantity} ${enteredUnit} => ${convertedBaseQuantity} ${baseUnit})`
        });

        const unitPrice = toMoney(toNumber(ingredient.perUnitPrice));
        const impactLoss = toMoney(convertedBaseQuantity * unitPrice);
        ingredientImpacts = [
          {
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            quantity: convertedBaseQuantity,
            unit: baseUnit,
            unitPrice,
            lossAmount: impactLoss
          }
        ];

        sourceName = ingredient.name;
        unit = enteredUnit;
        baseQuantity = convertedBaseQuantity;
        lossAmount = impactLoss;
        ingredientId = ingredient.id;
      }

      if (payload.entryType === "item") {
        const item = await manager.findOne(Item, { where: { id: payload.sourceId, isActive: true } });
        if (!item) {
          throw new AppError(404, "Item not found.");
        }

        baseUnit = "item";
        const enteredUnit = normalizeUnit(payload.quantityUnit) || "item";
        if (enteredUnit !== "item") {
          throw new AppError(422, "Item wastage quantity unit must be in item count.");
        }

        const recipes = await manager.find(ItemIngredient, {
          where: { itemId: item.id },
          relations: { ingredient: true }
        });
        if (!recipes.length) {
          throw new AppError(422, "This item has no ingredient recipe mapping.");
        }

        const planned = [];
        for (const recipe of recipes) {
          const ingredient = recipe.ingredient;
          if (!ingredient?.id || !ingredient.isActive) {
            continue;
          }
          const requiredQuantity = toQuantity(toNumber(recipe.normalizedQuantity) * enteredQuantity);
          if (requiredQuantity <= 0) {
            continue;
          }
          const stock = await this.getOrCreateIngredientStock(manager, ingredient.id);
          planned.push({ ingredient, stock, requiredQuantity });
        }

        if (!planned.length) {
          throw new AppError(422, "No active ingredient recipe rows found for this item.");
        }

        for (const row of planned) {
          const currentStock = toQuantity(toNumber(row.stock.totalStock));
          this.assertHasStockOrThrow(currentStock, row.requiredQuantity, row.ingredient.name, normalizeUnit(row.ingredient.unit));
        }

        let runningLoss = 0;
        const impacts: DumpIngredientImpact[] = [];
        for (const row of planned) {
          const ingredientBaseUnit = normalizeUnit(row.ingredient.unit);
          const currentStock = toQuantity(toNumber(row.stock.totalStock));
          row.stock.totalStock = toQuantity(currentStock - row.requiredQuantity);
          row.stock.lastUpdatedAt = new Date();
          await manager.save(IngredientStock, row.stock);
          await this.createIngredientStockLog(manager, {
            ingredientId: row.ingredient.id,
            quantity: row.requiredQuantity,
            note: `Dump/Wastage from item ${item.name} (${enteredQuantity} item)`
          });

          const unitPrice = toMoney(toNumber(row.ingredient.perUnitPrice));
          const ingredientLoss = toMoney(row.requiredQuantity * unitPrice);
          runningLoss = toMoney(runningLoss + ingredientLoss);
          impacts.push({
            ingredientId: row.ingredient.id,
            ingredientName: row.ingredient.name,
            quantity: row.requiredQuantity,
            unit: ingredientBaseUnit,
            unitPrice,
            lossAmount: ingredientLoss
          });
        }

        sourceName = item.name;
        unit = "item";
        baseQuantity = enteredQuantity;
        lossAmount = runningLoss;
        ingredientImpacts = impacts;
        itemId = item.id;
      }

      if (payload.entryType === "product") {
        const product = await manager.findOne(Product, { where: { id: payload.sourceId, isActive: true } });
        if (!product) {
          throw new AppError(404, "Product not found.");
        }

        baseUnit = normalizeUnit(product.unit);
        const enteredUnit = normalizeUnit(payload.quantityUnit) || baseUnit;
        const allowedUnits = resolveUnitOptions(baseUnit);
        if (!allowedUnits.includes(enteredUnit)) {
          throw new AppError(422, `Selected quantity unit is not valid for ${product.name}.`);
        }

        const convertedBaseQuantity = convertQuantityUnit(enteredQuantity, enteredUnit, baseUnit);
        if (convertedBaseQuantity === null || convertedBaseQuantity <= 0) {
          throw new AppError(422, "Unable to convert entered quantity to product base unit.");
        }

        const currentStock = toQuantity(toNumber(product.currentStock));
        this.assertHasStockOrThrow(currentStock, convertedBaseQuantity, product.name, baseUnit);
        product.currentStock = toQuantity(currentStock - convertedBaseQuantity);
        await manager.save(Product, product);

        sourceName = product.name;
        unit = enteredUnit;
        baseQuantity = convertedBaseQuantity;
        lossAmount = toMoney(convertedBaseQuantity * toMoney(toNumber(product.purchaseUnitPrice)));
        productId = product.id;
      }

      const entry = manager.create(DumpEntry, {
        entryDate,
        entryType: payload.entryType,
        ingredientId,
        itemId,
        productId,
        sourceName,
        quantity: enteredQuantity,
        unit,
        baseQuantity,
        baseUnit,
        lossAmount,
        ingredientImpacts,
        note: cleanText(payload.note),
        createdByUserId: actor.id
      });

      const saved = await manager.save(DumpEntry, entry);
      return saved.id;
    });

    const hydrated = await this.dumpRepository.findOne({
      where: { id: savedId },
      relations: { createdByUser: true }
    });

    if (!hydrated) {
      throw new AppError(500, "Dump entry saved but failed to load.");
    }

    return this.mapRecord(hydrated);
  }

  async listAdminRecords(filters: DumpAdminListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.dumpRepository
      .createQueryBuilder("dump")
      .leftJoinAndSelect("dump.createdByUser", "createdByUser")
      .orderBy("dump.createdAt", "DESC");

    this.applyFilters(query, filters);

    const [rows, total] = await Promise.all([
      query.clone().offset(offset).limit(limit).getMany(),
      query.getCount()
    ]);

    return {
      records: rows.map((row) => this.mapRecord(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async getAdminStats(filters: DumpAdminStatsFilters) {
    const query = this.dumpRepository
      .createQueryBuilder("dump")
      .leftJoinAndSelect("dump.createdByUser", "createdByUser")
      .orderBy("dump.createdAt", "DESC");
    this.applyFilters(query, filters);

    const rows = await query.getMany();

    const totalEntries = rows.length;
    const totalLossAmount = toMoney(rows.reduce((sum, row) => sum + toNumber(row.lossAmount), 0));
    const totalQuantity = toQuantity(rows.reduce((sum, row) => sum + toNumber(row.baseQuantity), 0));
    const ingredientEntryCount = rows.filter((row) => row.entryType === "ingredient").length;
    const itemEntryCount = rows.filter((row) => row.entryType === "item").length;
    const productEntryCount = rows.filter((row) => row.entryType === "product").length;
    const totalIngredientImpactRows = rows.reduce(
      (sum, row) => sum + this.normalizeIngredientImpacts(row.ingredientImpacts).length,
      0
    );
    const uniqueStaffCount = new Set(rows.map((row) => row.createdByUserId)).size;

    const topSourceMap = new Map<string, { sourceName: string; lossAmount: number; entryCount: number }>();
    rows.forEach((row) => {
      const key = `${row.entryType}:${row.sourceName}`;
      const existing = topSourceMap.get(key) ?? {
        sourceName: row.sourceName,
        lossAmount: 0,
        entryCount: 0
      };
      existing.entryCount += 1;
      existing.lossAmount = toMoney(existing.lossAmount + toNumber(row.lossAmount));
      topSourceMap.set(key, existing);
    });

    const topLossSources = [...topSourceMap.values()].sort((a, b) => b.lossAmount - a.lossAmount).slice(0, 5);
    const latestEntryAt = rows.length ? rows[0].createdAt : null;

    return {
      totalEntries,
      totalLossAmount,
      totalQuantity,
      ingredientEntryCount,
      itemEntryCount,
      productEntryCount,
      uniqueStaffCount,
      totalIngredientImpactRows,
      latestEntryAt,
      topLossSources
    };
  }
}
