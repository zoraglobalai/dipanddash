import { MoreThan, MoreThanOrEqual } from "typeorm";

import { UserRole } from "../../constants/roles";
import { AppDataSource } from "../../database/data-source";
import { DailyAllocation } from "../ingredients/daily-allocation.entity";
import { Ingredient } from "../ingredients/ingredient.entity";
import { IngredientStock } from "../ingredients/ingredient-stock.entity";
import { PosBillingControl } from "../ingredients/pos-billing-control.entity";
import { ItemCategory } from "../items/item-category.entity";
import { ItemIngredient } from "../items/item-ingredient.entity";
import { Item } from "../items/item.entity";
import { AddOnIngredient } from "../items/add-on-ingredient.entity";
import { AddOn } from "../items/add-on.entity";
import { ComboItem } from "../items/combo-item.entity";
import { Combo } from "../items/combo.entity";
import { UNIT_META } from "../items/items.units";
import { Coupon } from "../offers/coupon.entity";
import { Product } from "../procurement/product.entity";

const latestIso = (values: Array<Date | null | undefined>) => {
  const valid = values.filter((value): value is Date => Boolean(value));
  if (!valid.length) {
    return new Date().toISOString();
  }
  return valid.sort((a, b) => b.getTime() - a.getTime())[0].toISOString();
};

export class PosCatalogService {
  private readonly itemCategoryRepository = AppDataSource.getRepository(ItemCategory);
  private readonly itemRepository = AppDataSource.getRepository(Item);
  private readonly itemIngredientRepository = AppDataSource.getRepository(ItemIngredient);
  private readonly addOnRepository = AppDataSource.getRepository(AddOn);
  private readonly addOnIngredientRepository = AppDataSource.getRepository(AddOnIngredient);
  private readonly comboRepository = AppDataSource.getRepository(Combo);
  private readonly comboItemRepository = AppDataSource.getRepository(ComboItem);
  private readonly couponRepository = AppDataSource.getRepository(Coupon);
  private readonly ingredientRepository = AppDataSource.getRepository(Ingredient);
  private readonly ingredientStockRepository = AppDataSource.getRepository(IngredientStock);
  private readonly dailyAllocationRepository = AppDataSource.getRepository(DailyAllocation);
  private readonly posBillingControlRepository = AppDataSource.getRepository(PosBillingControl);
  private readonly productRepository = AppDataSource.getRepository(Product);

  private async getLatestVersion() {
    const [item, addOn, combo, coupon, ingredient, stock, allocation, control, product] = await Promise.all([
      this.itemRepository.findOne({ where: {}, order: { updatedAt: "DESC" } }),
      this.addOnRepository.findOne({ where: {}, order: { updatedAt: "DESC" } }),
      this.comboRepository.findOne({ where: {}, order: { updatedAt: "DESC" } }),
      this.couponRepository.findOne({ where: {}, order: { updatedAt: "DESC" } }),
      this.ingredientRepository.findOne({ where: {}, order: { updatedAt: "DESC" } }),
      this.ingredientStockRepository.findOne({ where: {}, order: { lastUpdatedAt: "DESC" } }),
      this.dailyAllocationRepository.findOne({ where: {}, order: { updatedAt: "DESC" } }),
      this.posBillingControlRepository.findOne({ where: {}, order: { updatedAt: "DESC" } }),
      this.productRepository.findOne({ where: {}, order: { updatedAt: "DESC" } })
    ]);

    return latestIso([
      item?.updatedAt,
      addOn?.updatedAt,
      combo?.updatedAt,
      coupon?.updatedAt,
      ingredient?.updatedAt,
      stock?.lastUpdatedAt,
      allocation?.updatedAt,
      control?.updatedAt,
      product?.updatedAt
    ]);
  }

  async getSnapshot(input?: { sinceVersion?: string; allocationDate?: string; actorRole?: UserRole }) {
    const now = new Date();
    const version = await this.getLatestVersion();
    const sinceDate = input?.sinceVersion ? new Date(input.sinceVersion) : null;
    const whereUpdatedSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

    const [categories, items, itemIngredients, addOns, addOnIngredients, combos, comboItems, coupons, allocationRows, control, products, activeIngredients, stockRows] =
      await Promise.all([
        this.itemCategoryRepository.find({
          where: whereUpdatedSince ? { updatedAt: MoreThanOrEqual(whereUpdatedSince) } : {},
          order: { name: "ASC" }
        }),
        this.itemRepository.find({
          where: whereUpdatedSince ? { updatedAt: MoreThanOrEqual(whereUpdatedSince) } : {},
          order: { name: "ASC" }
        }),
        this.itemIngredientRepository.find({
          relations: { ingredient: true }
        }),
        this.addOnRepository.find({
          where: whereUpdatedSince ? { updatedAt: MoreThanOrEqual(whereUpdatedSince) } : {},
          order: { name: "ASC" }
        }),
        this.addOnIngredientRepository.find({
          relations: { ingredient: true }
        }),
        this.comboRepository.find({
          where: whereUpdatedSince ? { updatedAt: MoreThanOrEqual(whereUpdatedSince) } : {},
          order: { name: "ASC" }
        }),
        this.comboItemRepository.find({
          relations: { item: true }
        }),
        this.couponRepository.find({
          where: {
            isActive: true,
            validUntil: MoreThanOrEqual(now)
          },
          order: { updatedAt: "DESC" }
        }),
        this.dailyAllocationRepository.find({
          where: { remainingQuantity: MoreThan(0) },
          relations: { ingredient: true },
          order: { date: "DESC", updatedAt: "DESC" }
        }),
        this.posBillingControlRepository.findOne({
          where: {},
          order: { updatedAt: "DESC" }
        }),
        this.productRepository.find({
          where: { isActive: true },
          order: { name: "ASC" }
        }),
        this.ingredientRepository.find({
          where: { isActive: true },
          order: { name: "ASC" }
        }),
        this.ingredientStockRepository.find({
          where: {},
          order: { lastUpdatedAt: "DESC" }
        })
      ]);

    const isSnookerStaff = input?.actorRole === UserRole.SNOOKER_STAFF;
    const visibleItems = isSnookerStaff ? [] : items;
    const visibleItemIngredients = isSnookerStaff ? [] : itemIngredients;
    const visibleAddOns = isSnookerStaff ? [] : addOns;
    const visibleAddOnIngredients = isSnookerStaff ? [] : addOnIngredients;
    const visibleCombos = isSnookerStaff ? [] : combos;
    const visibleComboItems = isSnookerStaff ? [] : comboItems;
    const visibleProducts = products.filter((product) =>
      isSnookerStaff
        ? product.targetSection === "gaming" || product.targetSection === "both"
        : product.targetSection === "dip_and_dash" || product.targetSection === "both"
    );

    const allocationPoolMap = new Map<
      string,
      {
        id: string;
        ingredientId: string;
        ingredientName: string;
        ingredientUnit: string;
        date: string;
        allocatedQuantity: number;
        usedQuantity: number;
        remainingQuantity: number;
        updatedAt: string;
      }
    >();

    allocationRows.forEach((allocation) => {
      if (!allocation.ingredient?.isActive) {
        return;
      }

      const remainingQuantity = Number(allocation.remainingQuantity);
      if (remainingQuantity <= 0) {
        return;
      }

      const existing = allocationPoolMap.get(allocation.ingredientId);
      if (!existing) {
        allocationPoolMap.set(allocation.ingredientId, {
          id: allocation.id,
          ingredientId: allocation.ingredientId,
          ingredientName: allocation.ingredient.name,
          ingredientUnit: allocation.ingredient.unit,
          date: allocation.date,
          allocatedQuantity: remainingQuantity,
          usedQuantity: 0,
          remainingQuantity,
          updatedAt: allocation.updatedAt.toISOString()
        });
        return;
      }

      const nextRemaining = Number((existing.remainingQuantity + remainingQuantity).toFixed(6));
      allocationPoolMap.set(allocation.ingredientId, {
        ...existing,
        allocatedQuantity: nextRemaining,
        remainingQuantity: nextRemaining
      });
    });

    const allocations = [...allocationPoolMap.values()].sort((left, right) =>
      left.ingredientName.localeCompare(right.ingredientName)
    );

    const stockByIngredientId = new Map(stockRows.map((stock) => [stock.ingredientId, stock]));
    const ingredientStocks = activeIngredients
      .map((ingredient) => {
        const stock = stockByIngredientId.get(ingredient.id);
        const availableQuantity = Number(Number(stock?.totalStock ?? 0).toFixed(6));
        return {
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          ingredientUnit: ingredient.unit,
          availableQuantity,
          updatedAt: (stock?.lastUpdatedAt ?? ingredient.updatedAt).toISOString()
        };
      })
      .sort((left, right) => left.ingredientName.localeCompare(right.ingredientName));

    return {
      version,
      generatedAt: new Date().toISOString(),
      units: UNIT_META,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        isActive: category.isActive,
        updatedAt: category.updatedAt
      })),
      items: visibleItems.map((item) => ({
        id: item.id,
        name: item.name,
        categoryId: item.categoryId,
        sellingPrice: Number(item.sellingPrice),
        gstPercentage: Number(item.gstPercentage),
        isActive: item.isActive,
        note: item.note,
        updatedAt: item.updatedAt
      })),
      itemRecipes: visibleItemIngredients.map((recipe) => ({
        id: recipe.id,
        itemId: recipe.itemId,
        ingredientId: recipe.ingredientId,
        ingredientName: recipe.ingredient.name,
        ingredientBaseUnit: recipe.ingredient.unit,
        quantity: Number(recipe.quantity),
        unit: recipe.unit,
        normalizedQuantity: Number(recipe.normalizedQuantity),
        costContribution: Number(recipe.costContribution),
        updatedAt: recipe.updatedAt
      })),
      addOns: visibleAddOns.map((addOn) => ({
        id: addOn.id,
        name: addOn.name,
        sellingPrice: Number(addOn.sellingPrice),
        gstPercentage: Number(addOn.gstPercentage),
        isActive: addOn.isActive,
        updatedAt: addOn.updatedAt
      })),
      addOnRecipes: visibleAddOnIngredients.map((recipe) => ({
        id: recipe.id,
        addOnId: recipe.addOnId,
        ingredientId: recipe.ingredientId,
        ingredientName: recipe.ingredient.name,
        ingredientBaseUnit: recipe.ingredient.unit,
        quantity: Number(recipe.quantity),
        unit: recipe.unit,
        normalizedQuantity: Number(recipe.normalizedQuantity),
        costContribution: Number(recipe.costContribution),
        updatedAt: recipe.updatedAt
      })),
      combos: visibleCombos.map((combo) => ({
        id: combo.id,
        name: combo.name,
        sellingPrice: Number(combo.sellingPrice),
        gstPercentage: Number(combo.gstPercentage),
        isActive: combo.isActive,
        updatedAt: combo.updatedAt
      })),
      comboItems: visibleComboItems.map((comboItem) => ({
        id: comboItem.id,
        comboId: comboItem.comboId,
        itemId: comboItem.itemId,
        itemName: comboItem.item.name,
        quantity: Number(comboItem.quantity),
        updatedAt: comboItem.updatedAt
      })),
      products: visibleProducts.map((product) => ({
        ...(function resolveSectionStocks() {
          const totalStock = Number(product.currentStock);
          const dipAndDashStock = Number(product.dipAndDashStock);
          const gamingStock = Number(product.gamingStock);

          const normalizedTotal = Number.isFinite(totalStock) ? Number(totalStock.toFixed(3)) : 0;
          const normalizedDip = Number.isFinite(dipAndDashStock) ? Number(dipAndDashStock.toFixed(3)) : 0;
          const normalizedGaming = Number.isFinite(gamingStock) ? Number(gamingStock.toFixed(3)) : 0;

          let currentStock = normalizedTotal;
          if (isSnookerStaff) {
            currentStock =
              product.targetSection === "both"
                ? normalizedGaming
                : product.targetSection === "gaming"
                  ? normalizedTotal
                  : 0;
          } else {
            currentStock =
              product.targetSection === "both"
                ? normalizedDip
                : product.targetSection === "dip_and_dash"
                  ? normalizedTotal
                  : 0;
          }

          return {
            currentStock,
            dipAndDashAssignedStock: normalizedDip,
            gamingAssignedStock: normalizedGaming
          };
        })(),
        id: product.id,
        name: product.name,
        category: product.category,
        unit: product.unit,
        sellingPrice: Number(product.sellingPrice),
        purchaseUnitPrice: Number(product.purchaseUnitPrice),
        targetSection: product.targetSection,
        isActive: product.isActive,
        updatedAt: product.updatedAt
      })),
      offers: coupons.map((coupon) => ({
        id: coupon.id,
        couponCode: coupon.couponCode,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue === null ? null : Number(coupon.discountValue),
        minimumOrderAmount:
          coupon.minimumOrderAmount === null ? null : Number(coupon.minimumOrderAmount),
        maximumDiscountAmount:
          coupon.maximumDiscountAmount === null ? null : Number(coupon.maximumDiscountAmount),
        maxUses: coupon.maxUses,
        usagePerUserLimit: coupon.usagePerUserLimit,
        firstTimeUserOnly: coupon.firstTimeUserOnly,
        validFrom: coupon.validFrom,
        validUntil: coupon.validUntil,
        freeItemCategoryId: coupon.freeItemCategoryId,
        freeItemId: coupon.freeItemId,
        isActive: coupon.isActive,
        updatedAt: coupon.updatedAt
      })),
      ingredientStocks,
      allocations,
      controls: {
        isBillingEnabled: control?.isBillingEnabled ?? true,
        enforceDailyAllocation: false,
        reason: control?.reason ?? null,
        updatedAt: control?.updatedAt?.toISOString?.() ?? null
      }
    };
  }
}
