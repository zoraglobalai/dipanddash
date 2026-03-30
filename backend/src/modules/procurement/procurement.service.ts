import { EntityManager, In } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { DailyAllocation } from "../ingredients/daily-allocation.entity";
import { IngredientCategory } from "../ingredients/ingredient-category.entity";
import { Ingredient } from "../ingredients/ingredient.entity";
import { IngredientStockLogType } from "../ingredients/ingredients.constants";
import { IngredientStockLog } from "../ingredients/ingredient-stock-log.entity";
import { IngredientStock } from "../ingredients/ingredient-stock.entity";
import { Product } from "./product.entity";
import {
  PURCHASE_ORDER_TYPES,
  type PurchaseLineType,
  type ProductUnit,
  type PurchaseOrderType
} from "./procurement.constants";
import { PurchaseOrderLine } from "./purchase-order-line.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import { Supplier } from "./supplier.entity";
import {
  convertPurchaseQuantityToBase,
  getCompatibleIngredientUnits,
  getCompatibleProductUnits
} from "./procurement.units";
import { getLatestIngredientPurchasePriceMap } from "./ingredient-costing";

type PaginationFilters = {
  page: number;
  limit: number;
};

type SupplierListFilters = PaginationFilters & {
  search?: string;
  includeInactive?: boolean;
};

type ProductListFilters = PaginationFilters & {
  search?: string;
  category?: string;
  supplierId?: string;
  includeInactive?: boolean;
};

type PurchaseOrderListFilters = PaginationFilters & {
  search?: string;
  supplierId?: string;
  purchaseType?: PurchaseOrderType;
  dateFrom?: string;
  dateTo?: string;
};

type ProcurementMetaFilters = {
  date?: string;
  ingredientCategoryId?: string;
  ingredientSearch?: string;
  productSearch?: string;
};

type ProcurementStatsFilters = {
  dateFrom?: string;
  dateTo?: string;
};

type CreateSupplierPayload = {
  name: string;
  storeName?: string;
  phone: string;
  address?: string;
  isActive?: boolean;
};

type UpdateSupplierPayload = Partial<CreateSupplierPayload>;

type CreateProductPayload = {
  name: string;
  category: string;
  sku?: string;
  packSize?: string;
  unit: ProductUnit;
  currentStock: number;
  minStock: number;
  purchaseUnitPrice: number;
  defaultSupplierId?: string | null;
  isActive?: boolean;
};

type UpdateProductPayload = Partial<CreateProductPayload>;

type PurchaseOrderLinePayload = {
  lineType: PurchaseLineType;
  ingredientId?: string;
  productId?: string;
  quantity: number;
  quantityUnit?: string;
  unitPrice: number;
  note?: string;
};

type CreatePurchaseOrderPayload = {
  supplierId: string;
  purchaseDate?: string;
  note?: string;
  invoiceImageUrl?: string;
  lines: PurchaseOrderLinePayload[];
};

const toNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toFixedQuantity = (value: number) => Number(value.toFixed(3));
const toFixedPrice = (value: number) => Number(value.toFixed(2));

const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const getStockStatus = (currentStock: number, minStock: number) =>
  currentStock <= minStock ? "LOW_STOCK" : "HEALTHY";

const normalizeText = (value: string) => value.trim();

export class ProcurementService {
  private readonly supplierRepository = AppDataSource.getRepository(Supplier);
  private readonly productRepository = AppDataSource.getRepository(Product);
  private readonly ingredientRepository = AppDataSource.getRepository(Ingredient);
  private readonly ingredientCategoryRepository = AppDataSource.getRepository(IngredientCategory);
  private readonly ingredientStockRepository = AppDataSource.getRepository(IngredientStock);
  private readonly allocationRepository = AppDataSource.getRepository(DailyAllocation);
  private readonly purchaseOrderRepository = AppDataSource.getRepository(PurchaseOrder);
  private readonly purchaseOrderLineRepository = AppDataSource.getRepository(PurchaseOrderLine);

  private async getSupplierOrFail(id: string) {
    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) {
      throw new AppError(404, "Supplier not found");
    }
    return supplier;
  }

  private async getProductOrFail(id: string) {
    const product = await this.productRepository.findOne({ where: { id }, relations: { defaultSupplier: true } });
    if (!product) {
      throw new AppError(404, "Product not found");
    }
    return product;
  }

  private async ensureSupplierExists(supplierId: string | null | undefined) {
    if (!supplierId) {
      return null;
    }

    const supplier = await this.supplierRepository.findOne({
      where: { id: supplierId, isActive: true }
    });
    if (!supplier) {
      throw new AppError(404, "Default supplier not found or inactive");
    }

    return supplier;
  }

  private async ensureSupplierNameUnique(name: string, ignoreId?: string) {
    const query = this.supplierRepository
      .createQueryBuilder("supplier")
      .where("LOWER(supplier.name) = LOWER(:name)", { name });

    if (ignoreId) {
      query.andWhere("supplier.id != :ignoreId", { ignoreId });
    }

    const existing = await query.getOne();
    if (existing) {
      throw new AppError(409, "Supplier with this name already exists");
    }
  }

  private async ensureProductNameUnique(name: string, ignoreId?: string) {
    const query = this.productRepository
      .createQueryBuilder("product")
      .where("LOWER(product.name) = LOWER(:name)", { name });

    if (ignoreId) {
      query.andWhere("product.id != :ignoreId", { ignoreId });
    }

    const existing = await query.getOne();
    if (existing) {
      throw new AppError(409, "Product with this name already exists");
    }
  }

  private mapSupplierSummary(
    supplier: Supplier,
    metrics?: { purchaseOrdersCount?: number; totalPurchasedAmount?: number; lastPurchaseDate?: string | null }
  ) {
    return {
      id: supplier.id,
      name: supplier.name,
      storeName: supplier.storeName,
      phone: supplier.phone,
      address: supplier.address,
      isActive: supplier.isActive,
      purchaseOrdersCount: metrics?.purchaseOrdersCount ?? 0,
      totalPurchasedAmount: toFixedPrice(metrics?.totalPurchasedAmount ?? 0),
      lastPurchaseDate: metrics?.lastPurchaseDate ?? null,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt
    };
  }

  private mapProductSummary(
    product: Product,
    metrics?: {
      purchasedQuantity?: number;
      purchaseOrdersCount?: number;
      totalPurchasedAmount?: number;
      recentPurchaseDate?: string | null;
    }
  ) {
    const currentStock = toFixedQuantity(toNumber(product.currentStock));
    const minStock = toFixedQuantity(toNumber(product.minStock));
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      sku: product.sku,
      packSize: product.packSize,
      unit: product.unit,
      currentStock,
      minStock,
      purchaseUnitPrice: toFixedPrice(toNumber(product.purchaseUnitPrice)),
      defaultSupplierId: product.defaultSupplierId,
      defaultSupplierName: product.defaultSupplier?.name ?? null,
      isActive: product.isActive,
      stockStatus: getStockStatus(currentStock, minStock),
      valuation: toFixedPrice(currentStock * toNumber(product.purchaseUnitPrice)),
      purchasedQuantity: toFixedQuantity(metrics?.purchasedQuantity ?? 0),
      purchaseOrdersCount: metrics?.purchaseOrdersCount ?? 0,
      totalPurchasedAmount: toFixedPrice(metrics?.totalPurchasedAmount ?? 0),
      recentPurchaseDate: metrics?.recentPurchaseDate ?? null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };
  }

  private async generatePurchaseNumber(manager: EntityManager, date: string) {
    const compactDate = date.replaceAll("-", "");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
      const purchaseNumber = `PO-${compactDate}-${suffix}`;
      const existing = await manager.findOne(PurchaseOrder, { where: { purchaseNumber } });
      if (!existing) {
        return purchaseNumber;
      }
    }

    throw new AppError(500, "Unable to generate purchase number right now. Please try again.");
  }

  private resolvePurchaseType(lines: PurchaseOrderLinePayload[]): PurchaseOrderType {
    const hasIngredient = lines.some((line) => line.lineType === "ingredient");
    const hasProduct = lines.some((line) => line.lineType === "product");

    if (hasIngredient && hasProduct) {
      return PURCHASE_ORDER_TYPES[2];
    }
    if (hasIngredient) {
      return PURCHASE_ORDER_TYPES[0];
    }
    return PURCHASE_ORDER_TYPES[1];
  }

  async listSuppliers(filters: SupplierListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.supplierRepository.createQueryBuilder("supplier").orderBy("supplier.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("supplier.isActive = true");
    }

    if (filters.search) {
      query.andWhere(
        "(LOWER(supplier.name) LIKE LOWER(:search) OR LOWER(COALESCE(supplier.storeName, '')) LIKE LOWER(:search) OR LOWER(supplier.phone) LIKE LOWER(:search) OR LOWER(COALESCE(supplier.address, '')) LIKE LOWER(:search))",
        { search: `%${filters.search}%` }
      );
    }

    const [suppliers, total] = await Promise.all([query.skip(offset).take(limit).getMany(), query.getCount()]);
    const supplierIds = suppliers.map((supplier) => supplier.id);

    const metricsRows = supplierIds.length
      ? await this.purchaseOrderRepository
          .createQueryBuilder("purchaseOrder")
          .select("purchaseOrder.supplierId", "supplierId")
          .addSelect("COUNT(*)", "orderCount")
          .addSelect("COALESCE(SUM(purchaseOrder.totalAmount), 0)", "totalAmount")
          .addSelect("MAX(purchaseOrder.purchaseDate)", "lastPurchaseDate")
          .where("purchaseOrder.supplierId IN (:...supplierIds)", { supplierIds })
          .groupBy("purchaseOrder.supplierId")
          .getRawMany<{
            supplierId: string;
            orderCount: string;
            totalAmount: string;
            lastPurchaseDate: string | null;
          }>()
      : [];

    const metricsMap = new Map(
      metricsRows.map((row) => [
        row.supplierId,
        {
          purchaseOrdersCount: Number(row.orderCount),
          totalPurchasedAmount: toNumber(row.totalAmount),
          lastPurchaseDate: row.lastPurchaseDate
        }
      ])
    );

    const [summaryRow, statusRows] = await Promise.all([
      this.purchaseOrderRepository
        .createQueryBuilder("purchaseOrder")
        .select("COUNT(*)", "count")
        .addSelect("COALESCE(SUM(purchaseOrder.totalAmount), 0)", "amount")
        .getRawOne<{ count: string; amount: string }>(),
      this.supplierRepository
        .createQueryBuilder("supplier")
        .select("supplier.isActive", "isActive")
        .addSelect("COUNT(*)", "count")
        .groupBy("supplier.isActive")
        .getRawMany<{ isActive: boolean; count: string }>()
    ]);

    const activeSuppliers = statusRows.find((row) => row.isActive === true);
    const inactiveSuppliers = statusRows.find((row) => row.isActive === false);

    return {
      suppliers: suppliers.map((supplier) => this.mapSupplierSummary(supplier, metricsMap.get(supplier.id))),
      pagination: getPaginationMeta(page, limit, total),
      stats: {
        totalSuppliers: total,
        activeSuppliers: Number(activeSuppliers?.count ?? 0),
        inactiveSuppliers: Number(inactiveSuppliers?.count ?? 0),
        totalPurchaseOrders: Number(summaryRow?.count ?? 0),
        totalPurchasedAmount: toFixedPrice(toNumber(summaryRow?.amount ?? 0))
      }
    };
  }

  async createSupplier(payload: CreateSupplierPayload) {
    const name = normalizeText(payload.name);
    await this.ensureSupplierNameUnique(name);

    const supplier = this.supplierRepository.create({
      name,
      storeName: payload.storeName ? normalizeText(payload.storeName) : null,
      phone: normalizeText(payload.phone),
      address: payload.address ? normalizeText(payload.address) : null,
      isActive: payload.isActive ?? true
    });

    const saved = await this.supplierRepository.save(supplier);
    return this.mapSupplierSummary(saved);
  }

  async updateSupplier(id: string, payload: UpdateSupplierPayload) {
    const supplier = await this.getSupplierOrFail(id);

    if (payload.name) {
      const name = normalizeText(payload.name);
      await this.ensureSupplierNameUnique(name, id);
      supplier.name = name;
    }

    if (payload.phone !== undefined) {
      supplier.phone = normalizeText(payload.phone);
    }

    if (payload.storeName !== undefined) {
      supplier.storeName = payload.storeName ? normalizeText(payload.storeName) : null;
    }

    if (payload.address !== undefined) {
      supplier.address = payload.address ? normalizeText(payload.address) : null;
    }

    if (payload.isActive !== undefined) {
      supplier.isActive = payload.isActive;
    }

    const saved = await this.supplierRepository.save(supplier);
    return this.mapSupplierSummary(saved);
  }

  async deleteSupplier(id: string) {
    const supplier = await this.getSupplierOrFail(id);
    const [purchaseOrderCount, defaultProductCount] = await Promise.all([
      this.purchaseOrderRepository.count({ where: { supplierId: id } }),
      this.productRepository.count({ where: { defaultSupplierId: id } })
    ]);

    if (purchaseOrderCount > 0) {
      throw new AppError(409, "Cannot delete supplier because purchase orders are linked to this supplier.");
    }

    if (defaultProductCount > 0) {
      throw new AppError(409, "Cannot delete supplier because products are using it as default supplier.");
    }

    await this.supplierRepository.remove(supplier);
    return this.mapSupplierSummary(supplier);
  }

  async listProducts(filters: ProductListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.defaultSupplier", "defaultSupplier")
      .orderBy("product.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("product.isActive = true");
    }

    if (filters.search) {
      query.andWhere(
        "(LOWER(product.name) LIKE LOWER(:search) OR LOWER(COALESCE(product.sku, '')) LIKE LOWER(:search) OR LOWER(COALESCE(product.packSize, '')) LIKE LOWER(:search))",
        { search: `%${filters.search}%` }
      );
    }

    if (filters.category) {
      query.andWhere("LOWER(product.category) LIKE LOWER(:category)", { category: `%${filters.category}%` });
    }

    if (filters.supplierId) {
      query.andWhere("product.defaultSupplierId = :supplierId", { supplierId: filters.supplierId });
    }

    const [products, total] = await Promise.all([query.skip(offset).take(limit).getMany(), query.getCount()]);
    const productIds = products.map((product) => product.id);

    const metricsRows = productIds.length
      ? await this.purchaseOrderLineRepository
          .createQueryBuilder("line")
          .leftJoin("line.purchaseOrder", "purchaseOrder")
          .select("line.productId", "productId")
          .addSelect("COUNT(DISTINCT line.purchaseOrderId)", "ordersCount")
          .addSelect("COALESCE(SUM(line.stockAdded), 0)", "qty")
          .addSelect("COALESCE(SUM(line.lineTotal), 0)", "amount")
          .addSelect("MAX(purchaseOrder.purchaseDate)", "recentPurchaseDate")
          .where("line.lineType = :lineType", { lineType: "product" })
          .andWhere("line.productId IN (:...productIds)", { productIds })
          .groupBy("line.productId")
          .getRawMany<{
            productId: string;
            ordersCount: string;
            qty: string;
            amount: string;
            recentPurchaseDate: string | null;
          }>()
      : [];

    const metricsMap = new Map(
      metricsRows.map((row) => [
        row.productId,
        {
          purchasedQuantity: toNumber(row.qty),
          purchaseOrdersCount: Number(row.ordersCount),
          totalPurchasedAmount: toNumber(row.amount),
          recentPurchaseDate: row.recentPurchaseDate
        }
      ])
    );

    const [countRows, valuationRow, topPurchasedRows] = await Promise.all([
      this.productRepository
        .createQueryBuilder("product")
        .select("product.isActive", "isActive")
        .addSelect("COUNT(*)", "count")
        .groupBy("product.isActive")
        .getRawMany<{ isActive: boolean; count: string }>(),
      this.productRepository
        .createQueryBuilder("product")
        .select("COALESCE(SUM(product.currentStock * product.purchaseUnitPrice), 0)", "valuation")
        .addSelect("COUNT(*) FILTER (WHERE product.currentStock <= product.minStock)", "lowStock")
        .getRawOne<{ valuation: string; lowStock: string }>(),
      this.purchaseOrderLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.product", "product")
        .select("line.productId", "productId")
        .addSelect("product.name", "name")
        .addSelect("product.unit", "unit")
        .addSelect("COALESCE(SUM(line.stockAdded), 0)", "qty")
        .where("line.lineType = :lineType", { lineType: "product" })
        .groupBy("line.productId")
        .addGroupBy("product.name")
        .addGroupBy("product.unit")
        .orderBy("COALESCE(SUM(line.stockAdded), 0)", "DESC")
        .limit(5)
        .getRawMany<{ productId: string; name: string; unit: string; qty: string }>()
    ]);

    const activeProducts = countRows.find((row) => row.isActive === true);
    const inactiveProducts = countRows.find((row) => row.isActive === false);

    const totalsFromMetrics = metricsRows.reduce(
      (acc, current) => {
        acc.purchasedQuantity += toNumber(current.qty);
        acc.totalPurchasedAmount += toNumber(current.amount);
        return acc;
      },
      { purchasedQuantity: 0, totalPurchasedAmount: 0 }
    );

    return {
      products: products.map((product) => this.mapProductSummary(product, metricsMap.get(product.id))),
      pagination: getPaginationMeta(page, limit, total),
      stats: {
        totalProducts: total,
        activeProducts: Number(activeProducts?.count ?? 0),
        inactiveProducts: Number(inactiveProducts?.count ?? 0),
        lowStockProducts: Number(valuationRow?.lowStock ?? 0),
        stockValuation: toFixedPrice(toNumber(valuationRow?.valuation ?? 0)),
        totalPurchasedQuantity: toFixedQuantity(totalsFromMetrics.purchasedQuantity),
        totalPurchasedAmount: toFixedPrice(totalsFromMetrics.totalPurchasedAmount),
        topPurchasedProducts: topPurchasedRows.map((row) => ({
          productId: row.productId,
          name: row.name,
          unit: row.unit,
          quantity: toFixedQuantity(toNumber(row.qty))
        }))
      }
    };
  }

  async createProduct(payload: CreateProductPayload) {
    const name = normalizeText(payload.name);
    await this.ensureProductNameUnique(name);
    await this.ensureSupplierExists(payload.defaultSupplierId);

    const product = this.productRepository.create({
      name,
      category: normalizeText(payload.category),
      sku: payload.sku ? normalizeText(payload.sku) : null,
      packSize: payload.packSize ? normalizeText(payload.packSize) : null,
      unit: payload.unit,
      currentStock: toFixedQuantity(payload.currentStock ?? 0),
      minStock: toFixedQuantity(payload.minStock ?? 0),
      purchaseUnitPrice: toFixedPrice(payload.purchaseUnitPrice),
      defaultSupplierId: payload.defaultSupplierId ?? null,
      isActive: payload.isActive ?? true
    });

    const saved = await this.productRepository.save(product);
    const hydrated = await this.productRepository.findOne({
      where: { id: saved.id },
      relations: { defaultSupplier: true }
    });
    return this.mapProductSummary(hydrated ?? saved);
  }

  async updateProduct(id: string, payload: UpdateProductPayload) {
    const product = await this.getProductOrFail(id);

    if (payload.name) {
      const name = normalizeText(payload.name);
      await this.ensureProductNameUnique(name, id);
      product.name = name;
    }

    if (payload.category !== undefined) {
      product.category = normalizeText(payload.category);
    }

    if (payload.sku !== undefined) {
      product.sku = payload.sku ? normalizeText(payload.sku) : null;
    }

    if (payload.packSize !== undefined) {
      product.packSize = payload.packSize ? normalizeText(payload.packSize) : null;
    }

    if (payload.unit !== undefined) {
      product.unit = payload.unit;
    }

    if (payload.currentStock !== undefined) {
      product.currentStock = toFixedQuantity(payload.currentStock);
    }

    if (payload.minStock !== undefined) {
      product.minStock = toFixedQuantity(payload.minStock);
    }

    if (payload.purchaseUnitPrice !== undefined) {
      product.purchaseUnitPrice = toFixedPrice(payload.purchaseUnitPrice);
    }

    if (payload.defaultSupplierId !== undefined) {
      await this.ensureSupplierExists(payload.defaultSupplierId);
      product.defaultSupplierId = payload.defaultSupplierId ?? null;
    }

    if (payload.isActive !== undefined) {
      product.isActive = payload.isActive;
    }

    const saved = await this.productRepository.save(product);
    const hydrated = await this.productRepository.findOne({
      where: { id: saved.id },
      relations: { defaultSupplier: true }
    });
    return this.mapProductSummary(hydrated ?? saved);
  }

  async deleteProduct(id: string) {
    const product = await this.getProductOrFail(id);
    const linkedPurchases = await this.purchaseOrderLineRepository.count({ where: { productId: id } });

    if (linkedPurchases > 0) {
      throw new AppError(409, "Cannot delete product because purchase history exists for this product.");
    }

    await this.productRepository.remove(product);
    return this.mapProductSummary(product);
  }

  private async getOrCreateIngredientStock(manager: EntityManager, ingredientId: string) {
    const existingStock = await manager.findOne(IngredientStock, { where: { ingredientId } });
    if (existingStock) {
      return existingStock;
    }

    const created = manager.create(IngredientStock, {
      ingredientId,
      totalStock: 0,
      lastUpdatedAt: new Date()
    });
    return manager.save(IngredientStock, created);
  }

  private async applyPurchaseLines(
    manager: EntityManager,
    lines: PurchaseOrderLinePayload[],
    purchaseNumber: string,
    supplierName: string
  ) {
    const lineEntities: PurchaseOrderLine[] = [];
    let totalAmount = 0;

    for (const line of lines) {
      const enteredQuantity = toFixedQuantity(line.quantity);
      const unitPrice = toFixedPrice(line.unitPrice);
      const lineTotal = toFixedPrice(enteredQuantity * unitPrice);

      if (line.lineType === "ingredient") {
        const ingredientId = line.ingredientId;
        if (!ingredientId) {
          throw new AppError(422, "Ingredient is required for ingredient purchase line");
        }

        const ingredient = await manager.findOne(Ingredient, {
          where: { id: ingredientId, isActive: true },
          relations: { category: true }
        });
        if (!ingredient) {
          throw new AppError(404, "Ingredient not found or inactive");
        }

        const enteredUnit = (line.quantityUnit || ingredient.unit).trim().toLowerCase();
        const convertedAdded = convertPurchaseQuantityToBase(
          "ingredient",
          enteredQuantity,
          enteredUnit,
          ingredient.unit
        );
        if (convertedAdded === null) {
          throw new AppError(
            422,
            `Unit ${enteredUnit} is not compatible with ingredient base unit ${ingredient.unit}.`
          );
        }
        const stockAdded = toFixedQuantity(convertedAdded);

        const stock = await this.getOrCreateIngredientStock(manager, ingredient.id);
        const stockBefore = toFixedQuantity(toNumber(stock.totalStock));
        const stockAfter = toFixedQuantity(stockBefore + stockAdded);
        stock.totalStock = stockAfter;
        stock.lastUpdatedAt = new Date();
        await manager.save(IngredientStock, stock);

        const stockLog = manager.create(IngredientStockLog, {
          ingredientId: ingredient.id,
          type: IngredientStockLogType.ADD,
          quantity: stockAdded,
          note: line.note?.trim() || `Purchased via ${purchaseNumber} from ${supplierName}.`
        });
        await manager.save(IngredientStockLog, stockLog);

        const lineEntity = manager.create(PurchaseOrderLine, {
          lineType: "ingredient",
          ingredientId: ingredient.id,
          productId: null,
          itemNameSnapshot: ingredient.name,
          categoryNameSnapshot: ingredient.category?.name ?? null,
          unit: ingredient.unit,
          stockBefore,
          stockAdded,
          enteredQuantity,
          enteredUnit,
          stockAfter,
          unitPrice,
          lineTotal,
          unitPriceUpdated: false
        });
        lineEntities.push(lineEntity);
        totalAmount += lineTotal;
        continue;
      }

      const productId = line.productId;
      if (!productId) {
        throw new AppError(422, "Product is required for product purchase line");
      }

      const product = await manager.findOne(Product, {
        where: { id: productId, isActive: true }
      });
      if (!product) {
        throw new AppError(404, "Product not found or inactive");
      }

      const enteredUnit = (line.quantityUnit || product.unit).trim().toLowerCase();
      const convertedAdded = convertPurchaseQuantityToBase("product", enteredQuantity, enteredUnit, product.unit);
      if (convertedAdded === null) {
        throw new AppError(422, `Unit ${enteredUnit} is not compatible with product base unit ${product.unit}.`);
      }
      const stockAdded = toFixedQuantity(convertedAdded);

      const stockBefore = toFixedQuantity(toNumber(product.currentStock));
      const stockAfter = toFixedQuantity(stockBefore + stockAdded);
      product.currentStock = stockAfter;

      await manager.save(Product, product);

      const lineEntity = manager.create(PurchaseOrderLine, {
        lineType: "product",
        ingredientId: null,
        productId: product.id,
        itemNameSnapshot: product.name,
        categoryNameSnapshot: product.category,
        unit: product.unit,
        stockBefore,
        stockAdded,
        enteredQuantity,
        enteredUnit,
        stockAfter,
        unitPrice,
        lineTotal,
        unitPriceUpdated: false
      });
      lineEntities.push(lineEntity);
      totalAmount += lineTotal;
    }

    return {
      lineEntities,
      totalAmount: toFixedPrice(totalAmount)
    };
  }

  private async rollbackPurchaseOrderLines(manager: EntityManager, lines: PurchaseOrderLine[], purchaseNumber: string) {
    for (const line of lines) {
      const rollbackQuantity = toFixedQuantity(toNumber(line.stockAdded));

      if (line.lineType === "ingredient" && line.ingredientId) {
        const ingredient = await manager.findOne(Ingredient, {
          where: { id: line.ingredientId }
        });
        if (!ingredient) {
          throw new AppError(404, `Ingredient not found for rollback: ${line.itemNameSnapshot}`);
        }

        const stock = await this.getOrCreateIngredientStock(manager, ingredient.id);
        const stockBefore = toFixedQuantity(toNumber(stock.totalStock));
        const stockAfter = toFixedQuantity(stockBefore - rollbackQuantity);

        if (stockAfter < 0) {
          throw new AppError(
            409,
            `Cannot edit purchase order ${purchaseNumber} because stock for ${line.itemNameSnapshot} is already consumed.`
          );
        }

        stock.totalStock = stockAfter;
        stock.lastUpdatedAt = new Date();
        await manager.save(IngredientStock, stock);

        const rollbackLog = manager.create(IngredientStockLog, {
          ingredientId: ingredient.id,
          type: IngredientStockLogType.ADJUST,
          quantity: toFixedQuantity(-rollbackQuantity),
          note: `Rollback from purchase edit ${purchaseNumber}`
        });
        await manager.save(IngredientStockLog, rollbackLog);

        continue;
      }

      if (line.lineType === "product" && line.productId) {
        const product = await manager.findOne(Product, {
          where: { id: line.productId }
        });
        if (!product) {
          throw new AppError(404, `Product not found for rollback: ${line.itemNameSnapshot}`);
        }

        const stockBefore = toFixedQuantity(toNumber(product.currentStock));
        const stockAfter = toFixedQuantity(stockBefore - rollbackQuantity);
        if (stockAfter < 0) {
          throw new AppError(
            409,
            `Cannot edit purchase order ${purchaseNumber} because stock for ${line.itemNameSnapshot} is already consumed.`
          );
        }

        product.currentStock = stockAfter;
        await manager.save(Product, product);
      }
    }
  }

  async createPurchaseOrder(payload: CreatePurchaseOrderPayload, createdByUserId: string | null) {
    const purchaseDate = payload.purchaseDate || getTodayDate();
    const purchaseType = this.resolvePurchaseType(payload.lines);

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const supplier = await queryRunner.manager.findOne(Supplier, {
        where: { id: payload.supplierId, isActive: true }
      });
      if (!supplier) {
        throw new AppError(404, "Supplier not found or inactive");
      }

      const purchaseNumber = await this.generatePurchaseNumber(queryRunner.manager, purchaseDate);
      const { lineEntities, totalAmount } = await this.applyPurchaseLines(
        queryRunner.manager,
        payload.lines,
        purchaseNumber,
        supplier.name
      );

      const order = queryRunner.manager.create(PurchaseOrder, {
        purchaseNumber,
        supplierId: payload.supplierId,
        purchaseDate,
        purchaseType,
        totalAmount,
        note: payload.note?.trim() || null,
        invoiceImageUrl: payload.invoiceImageUrl?.trim() || null,
        createdByUserId
      });
      const savedOrder = await queryRunner.manager.save(PurchaseOrder, order);

      lineEntities.forEach((lineEntity) => {
        lineEntity.purchaseOrderId = savedOrder.id;
      });
      await queryRunner.manager.save(PurchaseOrderLine, lineEntities);

      await queryRunner.commitTransaction();
      return this.getPurchaseOrderById(savedOrder.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updatePurchaseOrder(id: string, payload: CreatePurchaseOrderPayload) {
    const purchaseDate = payload.purchaseDate || getTodayDate();
    const purchaseType = this.resolvePurchaseType(payload.lines);

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingOrder = await queryRunner.manager.findOne(PurchaseOrder, {
        where: { id },
        relations: { lines: true }
      });
      if (!existingOrder) {
        throw new AppError(404, "Purchase order not found");
      }

      const supplier = await queryRunner.manager.findOne(Supplier, {
        where: { id: payload.supplierId, isActive: true }
      });
      if (!supplier) {
        throw new AppError(404, "Supplier not found or inactive");
      }

      await this.rollbackPurchaseOrderLines(queryRunner.manager, existingOrder.lines, existingOrder.purchaseNumber);

      await queryRunner.manager.delete(PurchaseOrderLine, { purchaseOrderId: existingOrder.id });

      const { lineEntities, totalAmount } = await this.applyPurchaseLines(
        queryRunner.manager,
        payload.lines,
        existingOrder.purchaseNumber,
        supplier.name
      );

      existingOrder.supplierId = payload.supplierId;
      existingOrder.purchaseDate = purchaseDate;
      existingOrder.purchaseType = purchaseType;
      existingOrder.totalAmount = totalAmount;
      existingOrder.note = payload.note?.trim() || null;
      existingOrder.invoiceImageUrl = payload.invoiceImageUrl?.trim() || null;

      const savedOrder = await queryRunner.manager.save(PurchaseOrder, existingOrder);

      lineEntities.forEach((lineEntity) => {
        lineEntity.purchaseOrderId = savedOrder.id;
      });
      await queryRunner.manager.save(PurchaseOrderLine, lineEntities);

      await queryRunner.commitTransaction();
      return this.getPurchaseOrderById(savedOrder.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async listPurchaseOrders(filters: PurchaseOrderListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.purchaseOrderRepository
      .createQueryBuilder("purchaseOrder")
      .leftJoinAndSelect("purchaseOrder.supplier", "supplier")
      .leftJoinAndSelect("purchaseOrder.createdByUser", "createdByUser")
      .orderBy("purchaseOrder.createdAt", "DESC");

    if (filters.search) {
      query.andWhere(
        "(LOWER(purchaseOrder.purchaseNumber) LIKE LOWER(:search) OR LOWER(supplier.name) LIKE LOWER(:search))",
        { search: `%${filters.search}%` }
      );
    }

    if (filters.supplierId) {
      query.andWhere("purchaseOrder.supplierId = :supplierId", { supplierId: filters.supplierId });
    }

    if (filters.purchaseType) {
      query.andWhere("purchaseOrder.purchaseType = :purchaseType", { purchaseType: filters.purchaseType });
    }

    if (filters.dateFrom) {
      query.andWhere("purchaseOrder.purchaseDate >= :dateFrom", { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      query.andWhere("purchaseOrder.purchaseDate <= :dateTo", { dateTo: filters.dateTo });
    }

    const [orders, total] = await Promise.all([query.skip(offset).take(limit).getMany(), query.getCount()]);

    const orderIds = orders.map((order) => order.id);
    const lineCountRows = orderIds.length
      ? await this.purchaseOrderLineRepository
          .createQueryBuilder("line")
          .select("line.purchaseOrderId", "purchaseOrderId")
          .addSelect("line.lineType", "lineType")
          .addSelect("COUNT(*)", "count")
          .where("line.purchaseOrderId IN (:...orderIds)", { orderIds })
          .groupBy("line.purchaseOrderId")
          .addGroupBy("line.lineType")
          .getRawMany<{ purchaseOrderId: string; lineType: string; count: string }>()
      : [];

    const lineCountMap = new Map<string, { total: number; ingredient: number; product: number }>();
    for (const row of lineCountRows) {
      const current = lineCountMap.get(row.purchaseOrderId) ?? { total: 0, ingredient: 0, product: 0 };
      const count = Number(row.count);
      current.total += count;
      if (row.lineType === "ingredient") {
        current.ingredient += count;
      } else if (row.lineType === "product") {
        current.product += count;
      }
      lineCountMap.set(row.purchaseOrderId, current);
    }

    const totalsQuery = this.purchaseOrderRepository
      .createQueryBuilder("purchaseOrder")
      .leftJoin("purchaseOrder.supplier", "supplier");

    if (filters.search) {
      totalsQuery.andWhere(
        "(LOWER(purchaseOrder.purchaseNumber) LIKE LOWER(:search) OR LOWER(supplier.name) LIKE LOWER(:search))",
        { search: `%${filters.search}%` }
      );
    }

    if (filters.supplierId) {
      totalsQuery.andWhere("purchaseOrder.supplierId = :supplierId", { supplierId: filters.supplierId });
    }

    if (filters.purchaseType) {
      totalsQuery.andWhere("purchaseOrder.purchaseType = :purchaseType", { purchaseType: filters.purchaseType });
    }

    if (filters.dateFrom) {
      totalsQuery.andWhere("purchaseOrder.purchaseDate >= :dateFrom", { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      totalsQuery.andWhere("purchaseOrder.purchaseDate <= :dateTo", { dateTo: filters.dateTo });
    }

    const totalsRow = await totalsQuery
      .select("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(purchaseOrder.totalAmount), 0)", "totalAmount")
      .getRawOne<{ count: string; totalAmount: string }>();

    return {
      orders: orders.map((order) => {
        const lineCounts = lineCountMap.get(order.id) ?? { total: 0, ingredient: 0, product: 0 };
        return {
          id: order.id,
          purchaseNumber: order.purchaseNumber,
          purchaseDate: order.purchaseDate,
          purchaseType: order.purchaseType,
          supplierId: order.supplierId,
          supplierName: order.supplier?.name ?? "-",
          lineCount: lineCounts.total,
          ingredientLineCount: lineCounts.ingredient,
          productLineCount: lineCounts.product,
          totalAmount: toFixedPrice(toNumber(order.totalAmount)),
          note: order.note,
          invoiceImageUrl: order.invoiceImageUrl,
          createdByUserId: order.createdByUserId,
          createdByUserName: order.createdByUser?.fullName ?? null,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        };
      }),
      pagination: getPaginationMeta(page, limit, total),
      stats: {
        totalOrders: Number(totalsRow?.count ?? 0),
        totalAmount: toFixedPrice(toNumber(totalsRow?.totalAmount ?? 0))
      }
    };
  }

  async getPurchaseOrderById(id: string) {
    const order = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: {
        supplier: true,
        createdByUser: true,
        lines: {
          ingredient: true,
          product: true
        }
      },
      order: {
        lines: {
          createdAt: "ASC"
        }
      }
    });

    if (!order) {
      throw new AppError(404, "Purchase order not found");
    }

    return {
      id: order.id,
      purchaseNumber: order.purchaseNumber,
      purchaseDate: order.purchaseDate,
      purchaseType: order.purchaseType,
      supplierId: order.supplierId,
      supplierName: order.supplier?.name ?? "-",
      supplierPhone: order.supplier?.phone ?? "-",
      note: order.note,
      invoiceImageUrl: order.invoiceImageUrl,
      totalAmount: toFixedPrice(toNumber(order.totalAmount)),
      createdByUserId: order.createdByUserId,
      createdByUserName: order.createdByUser?.fullName ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      lines: order.lines.map((line) => ({
        id: line.id,
        lineType: line.lineType,
        ingredientId: line.ingredientId,
        productId: line.productId,
        itemNameSnapshot: line.itemNameSnapshot,
        categoryNameSnapshot: line.categoryNameSnapshot,
        unit: line.unit,
        stockBefore: toFixedQuantity(toNumber(line.stockBefore)),
        stockAdded: toFixedQuantity(toNumber(line.stockAdded)),
        enteredQuantity:
          line.enteredQuantity === null || line.enteredQuantity === undefined
            ? null
            : toFixedQuantity(toNumber(line.enteredQuantity)),
        enteredUnit: line.enteredUnit,
        stockAfter: toFixedQuantity(toNumber(line.stockAfter)),
        unitPrice: toFixedPrice(toNumber(line.unitPrice)),
        lineTotal: toFixedPrice(toNumber(line.lineTotal)),
        unitPriceUpdated: line.unitPriceUpdated,
        createdAt: line.createdAt
      }))
    };
  }

  async getMeta(filters: ProcurementMetaFilters) {
    const date = filters.date || getTodayDate();

    const ingredientQuery = this.ingredientRepository
      .createQueryBuilder("ingredient")
      .leftJoinAndSelect("ingredient.category", "category")
      .where("ingredient.isActive = true")
      .orderBy("ingredient.name", "ASC");

    if (filters.ingredientCategoryId) {
      ingredientQuery.andWhere("ingredient.categoryId = :categoryId", { categoryId: filters.ingredientCategoryId });
    }

    if (filters.ingredientSearch) {
      ingredientQuery.andWhere(
        "(LOWER(ingredient.name) LIKE LOWER(:search) OR LOWER(category.name) LIKE LOWER(:search))",
        { search: `%${filters.ingredientSearch}%` }
      );
    }

    const productQuery = this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.defaultSupplier", "defaultSupplier")
      .where("product.isActive = true")
      .orderBy("product.name", "ASC");

    if (filters.productSearch) {
      productQuery.andWhere(
        "(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.category) LIKE LOWER(:search) OR LOWER(COALESCE(product.sku, '')) LIKE LOWER(:search))",
        { search: `%${filters.productSearch}%` }
      );
    }

    const [suppliers, categories, ingredients, products] = await Promise.all([
      this.supplierRepository
        .createQueryBuilder("supplier")
        .where("supplier.isActive = true")
        .orderBy("supplier.name", "ASC")
        .getMany(),
      this.ingredientCategoryRepository
        .createQueryBuilder("category")
        .where("category.isActive = true")
        .orderBy("category.name", "ASC")
        .getMany(),
      ingredientQuery.getMany(),
      productQuery.getMany()
    ]);

    const ingredientIds = ingredients.map((ingredient) => ingredient.id);
    const [stockRows, allocationRows] = await Promise.all([
      ingredientIds.length
        ? this.ingredientStockRepository.find({
            where: {
              ingredientId: In(ingredientIds)
            }
          })
        : [],
      ingredientIds.length
        ? this.allocationRepository.find({
            where: {
              ingredientId: In(ingredientIds),
              date
            }
          })
        : []
    ]);

    const stockMap = new Map(stockRows.map((stock) => [stock.ingredientId, toNumber(stock.totalStock)]));
    const allocationMap = new Map(allocationRows.map((allocation) => [allocation.ingredientId, allocation]));
    const fallbackIngredientPriceMap = new Map(
      ingredients.map((ingredient) => [ingredient.id, toNumber(ingredient.perUnitPrice)])
    );
    const latestIngredientPriceMap = await getLatestIngredientPurchasePriceMap(
      ingredientIds,
      fallbackIngredientPriceMap
    );

    return {
      date,
      suppliers: suppliers.map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        storeName: supplier.storeName,
        phone: supplier.phone,
        address: supplier.address
      })),
      ingredientCategories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description
      })),
      ingredients: ingredients.map((ingredient) => {
        const allocation = allocationMap.get(ingredient.id);
        const currentStock = toFixedQuantity(stockMap.get(ingredient.id) ?? 0);
        const allocatedToday = toFixedQuantity(toNumber(allocation?.allocatedQuantity));
        const usedToday = toFixedQuantity(toNumber(allocation?.usedQuantity));
        const remainingToday = toFixedQuantity(toNumber(allocation?.remainingQuantity));

        return {
          id: ingredient.id,
          name: ingredient.name,
          categoryId: ingredient.categoryId,
          categoryName: ingredient.category?.name ?? "-",
          unit: ingredient.unit,
          unitOptions: getCompatibleIngredientUnits(ingredient.unit),
          perUnitPrice: toFixedPrice(
            latestIngredientPriceMap.get(ingredient.id) ?? toNumber(ingredient.perUnitPrice)
          ),
          currentStock,
          minStock: toFixedQuantity(toNumber(ingredient.minStock)),
          allocatedToday,
          usedToday,
          pendingToday: remainingToday,
          stockStatus: getStockStatus(currentStock, toNumber(ingredient.minStock))
        };
      }),
      products: products.map((product) => {
        const currentStock = toFixedQuantity(toNumber(product.currentStock));
        const minStock = toFixedQuantity(toNumber(product.minStock));

        return {
          id: product.id,
          name: product.name,
          category: product.category,
          sku: product.sku,
          packSize: product.packSize,
          unit: product.unit,
          unitOptions: getCompatibleProductUnits(product.unit),
          purchaseUnitPrice: toFixedPrice(toNumber(product.purchaseUnitPrice)),
          currentStock,
          minStock,
          stockStatus: getStockStatus(currentStock, minStock),
          defaultSupplierId: product.defaultSupplierId,
          defaultSupplierName: product.defaultSupplier?.name ?? null
        };
      })
    };
  }

  async getStats(filters: ProcurementStatsFilters) {
    const purchaseQuery = this.purchaseOrderRepository.createQueryBuilder("purchaseOrder");
    if (filters.dateFrom) {
      purchaseQuery.andWhere("purchaseOrder.purchaseDate >= :dateFrom", { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      purchaseQuery.andWhere("purchaseOrder.purchaseDate <= :dateTo", { dateTo: filters.dateTo });
    }

    const [supplierCount, productCount, purchaseSummary, productPurchaseSummary, recentPurchases] = await Promise.all([
      this.supplierRepository.count(),
      this.productRepository.count(),
      purchaseQuery
        .clone()
        .select("COUNT(*)", "count")
        .addSelect("COALESCE(SUM(purchaseOrder.totalAmount), 0)", "amount")
        .getRawOne<{ count: string; amount: string }>(),
      this.purchaseOrderLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.purchaseOrder", "purchaseOrder")
        .select("COALESCE(SUM(line.stockAdded), 0)", "qty")
        .addSelect("COALESCE(SUM(line.lineTotal), 0)", "amount")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere(filters.dateFrom ? "purchaseOrder.purchaseDate >= :dateFrom" : "1=1", { dateFrom: filters.dateFrom })
        .andWhere(filters.dateTo ? "purchaseOrder.purchaseDate <= :dateTo" : "1=1", { dateTo: filters.dateTo })
        .getRawOne<{ qty: string; amount: string }>(),
      this.purchaseOrderRepository.find({
        relations: { supplier: true, createdByUser: true },
        order: { createdAt: "DESC" },
        take: 6
      })
    ]);

    return {
      summary: {
        totalSuppliers: supplierCount,
        totalProducts: productCount,
        totalPurchaseOrders: Number(purchaseSummary?.count ?? 0),
        totalPurchaseAmount: toFixedPrice(toNumber(purchaseSummary?.amount ?? 0)),
        totalProductPurchasedQuantity: toFixedQuantity(toNumber(productPurchaseSummary?.qty ?? 0)),
        totalProductPurchasedAmount: toFixedPrice(toNumber(productPurchaseSummary?.amount ?? 0))
      },
      recentPurchases: recentPurchases.map((order) => ({
        id: order.id,
        purchaseNumber: order.purchaseNumber,
        purchaseDate: order.purchaseDate,
        purchaseType: order.purchaseType,
        supplierName: order.supplier?.name ?? "-",
        totalAmount: toFixedPrice(toNumber(order.totalAmount)),
        createdByUserName: order.createdByUser?.fullName ?? null,
        createdAt: order.createdAt
      }))
    };
  }
}
