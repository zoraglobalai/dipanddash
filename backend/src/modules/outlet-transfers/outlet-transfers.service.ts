import { In, type EntityManager, type SelectQueryBuilder } from "typeorm";

import { UserRole } from "../../constants/roles";
import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { Ingredient } from "../ingredients/ingredient.entity";
import { IngredientStock } from "../ingredients/ingredient-stock.entity";
import { ItemIngredient } from "../items/item-ingredient.entity";
import { Item } from "../items/item.entity";
import { Outlet } from "../outlets/outlet.entity";
import { Product } from "../procurement/product.entity";
import { OutletIngredientStock } from "./outlet-ingredient-stock.entity";
import { OutletProductStock } from "./outlet-product-stock.entity";
import { type OutletTransferLineImpact, type OutletTransferLineSnapshot, type OutletTransferLineType } from "./outlet-transfer.constants";
import { OutletTransfer } from "./outlet-transfer.entity";

type TransferActor = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
};

type TransferLineInput = {
  lineType: OutletTransferLineType;
  sourceId: string;
  quantity: number;
};

type CreateTransferInput = {
  transferDate?: string;
  fromOutletId: string;
  toOutletId: string;
  note?: string;
  lines: TransferLineInput[];
};

type TransferListFilters = {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  outletId?: string;
  fromOutletId?: string;
  toOutletId?: string;
  page: number;
  limit: number;
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

const normalizeText = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const getTodayDate = () => new Date().toISOString().slice(0, 10);

const parseTransferDate = (value?: string) => {
  const transferDate = value ?? getTodayDate();
  const parsed = new Date(`${transferDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(422, "Transfer date must be in YYYY-MM-DD format.");
  }
  return transferDate;
};

export class OutletTransfersService {
  private readonly outletRepository = AppDataSource.getRepository(Outlet);
  private readonly ingredientRepository = AppDataSource.getRepository(Ingredient);
  private readonly productRepository = AppDataSource.getRepository(Product);
  private readonly itemRepository = AppDataSource.getRepository(Item);
  private readonly itemIngredientRepository = AppDataSource.getRepository(ItemIngredient);
  private readonly ingredientStockRepository = AppDataSource.getRepository(IngredientStock);
  private readonly outletIngredientStockRepository = AppDataSource.getRepository(OutletIngredientStock);
  private readonly outletProductStockRepository = AppDataSource.getRepository(OutletProductStock);
  private readonly transferRepository = AppDataSource.getRepository(OutletTransfer);

  private ensureRoleAllowed(role: UserRole) {
    const allowed = [UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF, UserRole.SNOOKER_STAFF];
    if (!allowed.includes(role)) {
      throw new AppError(403, "You are not allowed to perform outlet transfers.");
    }
  }

  private async ensurePrimaryOutletSeeded() {
    const [ingredientStockCount, productStockCount] = await Promise.all([
      this.outletIngredientStockRepository.count(),
      this.outletProductStockRepository.count()
    ]);

    if (ingredientStockCount > 0 && productStockCount > 0) {
      return;
    }

    const primaryOutlet = await this.outletRepository.createQueryBuilder("outlet").orderBy("outlet.outletCode", "ASC").getOne();
    if (!primaryOutlet) {
      return;
    }

    if (ingredientStockCount === 0) {
      const baseStocks = await this.ingredientStockRepository.find();
      if (baseStocks.length) {
        const rows = baseStocks.map((row) => ({
          outletId: primaryOutlet.id,
          ingredientId: row.ingredientId,
          totalStock: toQuantity(toNumber(row.totalStock))
        }));
        await this.outletIngredientStockRepository.upsert(rows, ["outletId", "ingredientId"]);
      }
    }

    if (productStockCount === 0) {
      const products = await this.productRepository.find();
      if (products.length) {
        const rows = products.map((row) => ({
          outletId: primaryOutlet.id,
          productId: row.id,
          totalStock: toQuantity(toNumber(row.currentStock))
        }));
        await this.outletProductStockRepository.upsert(rows, ["outletId", "productId"]);
      }
    }
  }

  private async getOrCreateOutletIngredientStock(
    manager: EntityManager,
    outletId: string,
    ingredientId: string
  ) {
    const existing = await manager.findOne(OutletIngredientStock, { where: { outletId, ingredientId } });
    if (existing) {
      return existing;
    }
    const created = manager.create(OutletIngredientStock, {
      outletId,
      ingredientId,
      totalStock: 0
    });
    return manager.save(OutletIngredientStock, created);
  }

  private async getOrCreateOutletProductStock(manager: EntityManager, outletId: string, productId: string) {
    const existing = await manager.findOne(OutletProductStock, { where: { outletId, productId } });
    if (existing) {
      return existing;
    }
    const created = manager.create(OutletProductStock, {
      outletId,
      productId,
      totalStock: 0
    });
    return manager.save(OutletProductStock, created);
  }

  private assertSufficientStock(
    currentStock: number,
    requiredQuantity: number,
    sourceName: string,
    unit: string,
    outletName: string
  ) {
    if (requiredQuantity <= 0) {
      throw new AppError(422, "Quantity must be greater than zero.");
    }
    if (currentStock < requiredQuantity) {
      throw new AppError(
        409,
        `Insufficient stock in ${outletName} for ${sourceName}. Available ${toQuantity(currentStock)} ${unit}, requested ${toQuantity(requiredQuantity)} ${unit}.`
      );
    }
  }

  private async generateTransferNumber(manager: EntityManager) {
    const rows = await manager
      .createQueryBuilder(OutletTransfer, "transfer")
      .select("transfer.transferNumber", "transferNumber")
      .where("transfer.transferNumber LIKE :prefix", { prefix: "OTR%" })
      .getRawMany<{ transferNumber: string }>();

    const maxNumber = rows.reduce((max, row) => {
      const parsed = Number(row.transferNumber.replace("OTR", ""));
      if (!Number.isFinite(parsed)) {
        return max;
      }
      return Math.max(max, parsed);
    }, 0);

    return `OTR${String(maxNumber + 1).padStart(6, "0")}`;
  }

  private mapTransferRecord(transfer: OutletTransfer) {
    const lines = Array.isArray(transfer.lines) ? transfer.lines : [];
    return {
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      transferDate: transfer.transferDate,
      fromOutletId: transfer.fromOutletId,
      fromOutletName: transfer.fromOutletName,
      toOutletId: transfer.toOutletId,
      toOutletName: transfer.toOutletName,
      lineCount: transfer.lineCount,
      totalQuantity: toQuantity(toNumber(transfer.totalQuantity)),
      totalValue: toMoney(toNumber(transfer.totalValue)),
      note: normalizeText(transfer.note),
      lines: lines.map((line) => ({
        lineType: line.lineType,
        sourceId: line.sourceId,
        sourceName: line.sourceName,
        quantity: toQuantity(toNumber(line.quantity)),
        unit: line.unit,
        lineValue: toMoney(toNumber(line.lineValue)),
        impacts: (line.impacts ?? []).map((impact) => ({
          ingredientId: impact.ingredientId,
          ingredientName: impact.ingredientName,
          quantity: toQuantity(toNumber(impact.quantity)),
          unit: impact.unit
        }))
      })),
      createdByUserId: transfer.createdByUserId,
      createdByUserName: transfer.createdByUser?.fullName ?? "-",
      createdByUsername: transfer.createdByUser?.username ?? "-",
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt
    };
  }

  private applyListFilters(query: SelectQueryBuilder<OutletTransfer>, filters: Omit<TransferListFilters, "page" | "limit">) {
    if (filters.dateFrom) {
      query.andWhere("transfer.transferDate >= :dateFrom", { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      query.andWhere("transfer.transferDate <= :dateTo", { dateTo: filters.dateTo });
    }
    if (filters.outletId) {
      query.andWhere("(transfer.fromOutletId = :outletId OR transfer.toOutletId = :outletId)", {
        outletId: filters.outletId
      });
    }
    if (filters.fromOutletId) {
      query.andWhere("transfer.fromOutletId = :fromOutletId", { fromOutletId: filters.fromOutletId });
    }
    if (filters.toOutletId) {
      query.andWhere("transfer.toOutletId = :toOutletId", { toOutletId: filters.toOutletId });
    }
    if (filters.search) {
      query.andWhere(
        `(
          LOWER(transfer.transferNumber) LIKE LOWER(:search)
          OR LOWER(transfer.fromOutletName) LIKE LOWER(:search)
          OR LOWER(transfer.toOutletName) LIKE LOWER(:search)
          OR LOWER(COALESCE(transfer.note, '')) LIKE LOWER(:search)
          OR LOWER(createdByUser.fullName) LIKE LOWER(:search)
          OR LOWER(createdByUser.username) LIKE LOWER(:search)
        )`,
        { search: `%${filters.search}%` }
      );
    }
  }

  async getTransferOptions(fromOutletId?: string) {
    await this.ensurePrimaryOutletSeeded();

    const outlets = await this.outletRepository.find({
      where: { isActive: true },
      order: { outletCode: "ASC" }
    });

    const safeFromOutletId = fromOutletId && outlets.some((outlet) => outlet.id === fromOutletId) ? fromOutletId : null;

    const [ingredients, products, items] = await Promise.all([
      this.ingredientRepository.find({ where: { isActive: true }, order: { name: "ASC" } }),
      this.productRepository.find({ where: { isActive: true }, order: { name: "ASC" } }),
      this.itemRepository.find({ where: { isActive: true }, order: { name: "ASC" } })
    ]);

    const ingredientIds = ingredients.map((row) => row.id);
    const productIds = products.map((row) => row.id);
    const itemIds = items.map((row) => row.id);

    const [ingredientStocks, productStocks, recipes] = await Promise.all([
      safeFromOutletId && ingredientIds.length
        ? this.outletIngredientStockRepository.find({ where: { outletId: safeFromOutletId, ingredientId: In(ingredientIds) } })
        : [],
      safeFromOutletId && productIds.length
        ? this.outletProductStockRepository.find({ where: { outletId: safeFromOutletId, productId: In(productIds) } })
        : [],
      itemIds.length
        ? this.itemIngredientRepository.find({
            where: { itemId: In(itemIds) },
            relations: { ingredient: true }
          })
        : []
    ]);

    const ingredientStockMap = new Map(ingredientStocks.map((row) => [row.ingredientId, toQuantity(toNumber(row.totalStock))]));
    const productStockMap = new Map(productStocks.map((row) => [row.productId, toQuantity(toNumber(row.totalStock))]));
    const recipeMap = new Map<string, ItemIngredient[]>();
    recipes.forEach((recipe) => {
      const bucket = recipeMap.get(recipe.itemId) ?? [];
      bucket.push(recipe);
      recipeMap.set(recipe.itemId, bucket);
    });

    return {
      outlets: outlets.map((outlet) => ({
        id: outlet.id,
        outletCode: outlet.outletCode,
        outletName: outlet.outletName,
        location: outlet.location
      })),
      ingredients: ingredients.map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        unitPrice: toMoney(toNumber(ingredient.perUnitPrice)),
        availableStock: toQuantity(ingredientStockMap.get(ingredient.id) ?? 0)
      })),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        unit: product.unit,
        unitPrice: toMoney(toNumber(product.purchaseUnitPrice)),
        availableStock: toQuantity(productStockMap.get(product.id) ?? 0)
      })),
      items: items.map((item) => {
        const itemRecipes = (recipeMap.get(item.id) ?? []).filter((recipe) => Boolean(recipe.ingredient?.isActive));
        const availability = itemRecipes.reduce((minValue, recipe) => {
          const required = toQuantity(toNumber(recipe.normalizedQuantity));
          if (required <= 0) {
            return minValue;
          }
          const ingredientStock = toQuantity(ingredientStockMap.get(recipe.ingredientId) ?? 0);
          const possible = ingredientStock / required;
          return Math.min(minValue, possible);
        }, Number.POSITIVE_INFINITY);
        return {
          id: item.id,
          name: item.name,
          unit: "item",
          unitPrice: toMoney(toNumber(item.estimatedIngredientCost)),
          availableStock: Number.isFinite(availability) ? toQuantity(Math.max(0, availability)) : 0
        };
      })
    };
  }

  async createTransfer(actor: TransferActor, payload: CreateTransferInput) {
    this.ensureRoleAllowed(actor.role);
    await this.ensurePrimaryOutletSeeded();

    if (payload.fromOutletId === payload.toOutletId) {
      throw new AppError(422, "From outlet and To outlet must be different.");
    }

    if (!payload.lines.length) {
      throw new AppError(422, "At least one transfer line is required.");
    }

    const transferDate = parseTransferDate(payload.transferDate);
    const note = normalizeText(payload.note);

    const savedTransferId = await AppDataSource.transaction(async (manager) => {
      const [fromOutlet, toOutlet] = await Promise.all([
        manager.findOne(Outlet, { where: { id: payload.fromOutletId, isActive: true } }),
        manager.findOne(Outlet, { where: { id: payload.toOutletId, isActive: true } })
      ]);

      const primaryOutlet = await manager
        .createQueryBuilder(Outlet, "outlet")
        .where("outlet.isActive = true")
        .orderBy("outlet.outletCode", "ASC")
        .getOne();
      const primaryOutletId = primaryOutlet?.id ?? null;

      if (!fromOutlet || !toOutlet) {
        throw new AppError(404, "Source or destination outlet not found.");
      }

      const snapshots: OutletTransferLineSnapshot[] = [];
      let totalQuantity = 0;
      let totalValue = 0;

      for (const line of payload.lines) {
        const requestedQuantity = toQuantity(toNumber(line.quantity));
        if (requestedQuantity <= 0) {
          throw new AppError(422, "Transfer quantity must be greater than zero.");
        }

        if (line.lineType === "ingredient") {
          const ingredient = await manager.findOne(Ingredient, { where: { id: line.sourceId, isActive: true } });
          if (!ingredient) {
            throw new AppError(404, "Ingredient not found.");
          }

          const [sourceStockRow, destinationStockRow] = await Promise.all([
            this.getOrCreateOutletIngredientStock(manager, fromOutlet.id, ingredient.id),
            this.getOrCreateOutletIngredientStock(manager, toOutlet.id, ingredient.id)
          ]);

          const sourceStock = toQuantity(toNumber(sourceStockRow.totalStock));
          this.assertSufficientStock(sourceStock, requestedQuantity, ingredient.name, ingredient.unit, fromOutlet.outletName);

          sourceStockRow.totalStock = toQuantity(sourceStock - requestedQuantity);
          destinationStockRow.totalStock = toQuantity(toNumber(destinationStockRow.totalStock) + requestedQuantity);
          await manager.save(OutletIngredientStock, [sourceStockRow, destinationStockRow]);

          if (primaryOutletId && (fromOutlet.id === primaryOutletId || toOutlet.id === primaryOutletId)) {
            const centralStock = await manager.findOne(IngredientStock, { where: { ingredientId: ingredient.id } });
            if (centralStock) {
              const currentCentralStock = toQuantity(toNumber(centralStock.totalStock));
              if (fromOutlet.id === primaryOutletId) {
                centralStock.totalStock = toQuantity(currentCentralStock - requestedQuantity);
              }
              if (toOutlet.id === primaryOutletId) {
                centralStock.totalStock = toQuantity(currentCentralStock + requestedQuantity);
              }
              centralStock.lastUpdatedAt = new Date();
              await manager.save(IngredientStock, centralStock);
            }
          }

          const lineValue = toMoney(requestedQuantity * toMoney(toNumber(ingredient.perUnitPrice)));
          snapshots.push({
            lineType: "ingredient",
            sourceId: ingredient.id,
            sourceName: ingredient.name,
            quantity: requestedQuantity,
            unit: ingredient.unit,
            lineValue
          });
          totalQuantity = toQuantity(totalQuantity + requestedQuantity);
          totalValue = toMoney(totalValue + lineValue);
          continue;
        }

        if (line.lineType === "product") {
          const product = await manager.findOne(Product, { where: { id: line.sourceId, isActive: true } });
          if (!product) {
            throw new AppError(404, "Product not found.");
          }

          const [sourceStockRow, destinationStockRow] = await Promise.all([
            this.getOrCreateOutletProductStock(manager, fromOutlet.id, product.id),
            this.getOrCreateOutletProductStock(manager, toOutlet.id, product.id)
          ]);

          const sourceStock = toQuantity(toNumber(sourceStockRow.totalStock));
          this.assertSufficientStock(sourceStock, requestedQuantity, product.name, product.unit, fromOutlet.outletName);

          sourceStockRow.totalStock = toQuantity(sourceStock - requestedQuantity);
          destinationStockRow.totalStock = toQuantity(toNumber(destinationStockRow.totalStock) + requestedQuantity);
          await manager.save(OutletProductStock, [sourceStockRow, destinationStockRow]);

          if (primaryOutletId && (fromOutlet.id === primaryOutletId || toOutlet.id === primaryOutletId)) {
            const currentGlobalStock = toQuantity(toNumber(product.currentStock));
            if (fromOutlet.id === primaryOutletId) {
              product.currentStock = toQuantity(currentGlobalStock - requestedQuantity);
            }
            if (toOutlet.id === primaryOutletId) {
              product.currentStock = toQuantity(currentGlobalStock + requestedQuantity);
            }
            await manager.save(Product, product);
          }

          const lineValue = toMoney(requestedQuantity * toMoney(toNumber(product.purchaseUnitPrice)));
          snapshots.push({
            lineType: "product",
            sourceId: product.id,
            sourceName: product.name,
            quantity: requestedQuantity,
            unit: product.unit,
            lineValue
          });
          totalQuantity = toQuantity(totalQuantity + requestedQuantity);
          totalValue = toMoney(totalValue + lineValue);
          continue;
        }

        if (!Number.isInteger(requestedQuantity)) {
          throw new AppError(422, "Item transfer quantity must be a whole number.");
        }

        const item = await manager.findOne(Item, { where: { id: line.sourceId, isActive: true } });
        if (!item) {
          throw new AppError(404, "Item not found.");
        }

        const recipes = await manager.find(ItemIngredient, {
          where: { itemId: item.id },
          relations: { ingredient: true }
        });
        if (!recipes.length) {
          throw new AppError(422, `Item ${item.name} has no ingredient recipe mapping.`);
        }

        const impacts: OutletTransferLineImpact[] = [];
        const planned: Array<{
          ingredient: Ingredient;
          quantity: number;
          sourceStock: OutletIngredientStock;
          destinationStock: OutletIngredientStock;
        }> = [];

        for (const recipe of recipes) {
          if (!recipe.ingredient?.id || !recipe.ingredient.isActive) {
            continue;
          }
          const ingredientQuantity = toQuantity(toNumber(recipe.normalizedQuantity) * requestedQuantity);
          if (ingredientQuantity <= 0) {
            continue;
          }

          const [sourceStock, destinationStock] = await Promise.all([
            this.getOrCreateOutletIngredientStock(manager, fromOutlet.id, recipe.ingredient.id),
            this.getOrCreateOutletIngredientStock(manager, toOutlet.id, recipe.ingredient.id)
          ]);

          const available = toQuantity(toNumber(sourceStock.totalStock));
          this.assertSufficientStock(available, ingredientQuantity, recipe.ingredient.name, recipe.ingredient.unit, fromOutlet.outletName);

          planned.push({
            ingredient: recipe.ingredient,
            quantity: ingredientQuantity,
            sourceStock,
            destinationStock
          });
        }

        if (!planned.length) {
          throw new AppError(422, `No active ingredient mappings found for ${item.name}.`);
        }

        let lineValue = 0;
        for (const row of planned) {
          const sourceStockQuantity = toQuantity(toNumber(row.sourceStock.totalStock));
          row.sourceStock.totalStock = toQuantity(sourceStockQuantity - row.quantity);
          row.destinationStock.totalStock = toQuantity(toNumber(row.destinationStock.totalStock) + row.quantity);

          const ingredientPrice = toMoney(toNumber(row.ingredient.perUnitPrice));
          lineValue = toMoney(lineValue + row.quantity * ingredientPrice);
          impacts.push({
            ingredientId: row.ingredient.id,
            ingredientName: row.ingredient.name,
            quantity: row.quantity,
            unit: row.ingredient.unit
          });

          if (primaryOutletId && (fromOutlet.id === primaryOutletId || toOutlet.id === primaryOutletId)) {
            const centralStock = await manager.findOne(IngredientStock, { where: { ingredientId: row.ingredient.id } });
            if (centralStock) {
              const currentCentralStock = toQuantity(toNumber(centralStock.totalStock));
              if (fromOutlet.id === primaryOutletId) {
                centralStock.totalStock = toQuantity(currentCentralStock - row.quantity);
              }
              if (toOutlet.id === primaryOutletId) {
                centralStock.totalStock = toQuantity(currentCentralStock + row.quantity);
              }
              centralStock.lastUpdatedAt = new Date();
              await manager.save(IngredientStock, centralStock);
            }
          }
        }

        await manager.save(OutletIngredientStock, planned.flatMap((row) => [row.sourceStock, row.destinationStock]));

        snapshots.push({
          lineType: "item",
          sourceId: item.id,
          sourceName: item.name,
          quantity: requestedQuantity,
          unit: "item",
          lineValue,
          impacts
        });
        totalQuantity = toQuantity(totalQuantity + requestedQuantity);
        totalValue = toMoney(totalValue + lineValue);
      }

      const transferNumber = await this.generateTransferNumber(manager);
      const transfer = manager.create(OutletTransfer, {
        transferNumber,
        transferDate,
        fromOutletId: fromOutlet.id,
        fromOutletName: fromOutlet.outletName,
        toOutletId: toOutlet.id,
        toOutletName: toOutlet.outletName,
        lines: snapshots,
        lineCount: snapshots.length,
        totalQuantity,
        totalValue,
        note,
        createdByUserId: actor.id
      });
      const saved = await manager.save(OutletTransfer, transfer);
      return saved.id;
    });

    const transfer = await this.transferRepository.findOne({
      where: { id: savedTransferId },
      relations: { createdByUser: true }
    });
    if (!transfer) {
      throw new AppError(500, "Transfer saved but failed to load.");
    }

    return this.mapTransferRecord(transfer);
  }

  async listTransfers(filters: TransferListFilters) {
    await this.ensurePrimaryOutletSeeded();

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.transferRepository
      .createQueryBuilder("transfer")
      .leftJoinAndSelect("transfer.createdByUser", "createdByUser")
      .orderBy("transfer.createdAt", "DESC");

    this.applyListFilters(query, filters);

    const [rows, total] = await Promise.all([
      query.clone().offset(offset).limit(limit).getMany(),
      query.getCount()
    ]);

    const aggregateQuery = this.transferRepository
      .createQueryBuilder("transfer")
      .leftJoin("transfer.createdByUser", "createdByUser");
    this.applyListFilters(aggregateQuery, filters);

    const aggregateRow = await aggregateQuery
      .select("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(transfer.totalValue), 0)", "totalValue")
      .addSelect("COALESCE(SUM(transfer.lineCount), 0)", "lineCount")
      .getRawOne<{ count: string; totalValue: string; lineCount: string }>();

    return {
      records: rows.map((row) => this.mapTransferRecord(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      },
      stats: {
        totalTransfers: Number(aggregateRow?.count ?? 0),
        totalLines: Number(aggregateRow?.lineCount ?? 0),
        totalValue: toMoney(toNumber(aggregateRow?.totalValue ?? 0))
      }
    };
  }
}
