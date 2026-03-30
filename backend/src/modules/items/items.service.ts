import { In } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { Ingredient } from "../ingredients/ingredient.entity";
import { IngredientStock } from "../ingredients/ingredient-stock.entity";
import { type IngredientUnit } from "../ingredients/ingredients.constants";
import { AddOn } from "./add-on.entity";
import { AddOnIngredient } from "./add-on-ingredient.entity";
import { Combo } from "./combo.entity";
import { ComboItem } from "./combo-item.entity";
import { ItemCategory } from "./item-category.entity";
import { Item } from "./item.entity";
import { ItemIngredient } from "./item-ingredient.entity";
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

type RecipePayload = {
  ingredientId: string;
  quantity: number;
  unit: IngredientUnit;
};

type ComboPayloadItem = {
  itemId: string;
  quantity: number;
};

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
  private readonly itemRepository = AppDataSource.getRepository(Item);
  private readonly itemIngredientRepository = AppDataSource.getRepository(ItemIngredient);
  private readonly addOnRepository = AppDataSource.getRepository(AddOn);
  private readonly addOnIngredientRepository = AppDataSource.getRepository(AddOnIngredient);
  private readonly comboRepository = AppDataSource.getRepository(Combo);
  private readonly comboItemRepository = AppDataSource.getRepository(ComboItem);
  private readonly ingredientRepository = AppDataSource.getRepository(Ingredient);
  private readonly ingredientStockRepository = AppDataSource.getRepository(IngredientStock);

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
        normalizedQuantity: toFixed(normalizedQuantity, 6),
        costContribution: toFixed(costContribution)
      };
    });

    return {
      rows,
      totalEstimatedCost: toFixed(totalEstimatedCost)
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
    const ingredientCounts = itemIds.length
      ? await this.itemIngredientRepository
          .createQueryBuilder("recipe")
          .select("recipe.itemId", "itemId")
          .addSelect("COUNT(*)", "count")
          .where("recipe.itemId IN (:...itemIds)", { itemIds })
          .groupBy("recipe.itemId")
          .getRawMany<{ itemId: string; count: string }>()
      : [];

    const countMap = new Map(ingredientCounts.map((entry) => [entry.itemId, Number(entry.count)]));

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
        ingredientCount: countMap.get(item.id) ?? 0,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      })),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async getItem(id: string) {
    const item = await this.getItemOrFail(id);
    const recipeRows = await this.itemIngredientRepository.find({
      where: { itemId: id },
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
    ingredients: RecipePayload[];
  }) {
    await this.getActiveItemCategoryOrFail(payload.categoryId);
    const name = payload.name.trim();
    await this.validateUniqueItemName(name);

    const preparedRecipe = await this.prepareRecipeRows(payload.ingredients);
    const imageUrl = cleanOptionalText(payload.imageUrl) ?? null;
    const note = cleanOptionalText(payload.note) ?? null;

    const savedItem = await AppDataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(Item);
      const recipeRepo = manager.getRepository(ItemIngredient);

      const item = itemRepo.create({
        name,
        categoryId: payload.categoryId,
        sellingPrice: toMoney(payload.sellingPrice),
        gstPercentage: toMoney(payload.gstPercentage),
        imageUrl,
        note,
        estimatedIngredientCost: toFixed(preparedRecipe.totalEstimatedCost),
        isActive: true
      });

      const saved = await itemRepo.save(item);
      const recipeEntities = preparedRecipe.rows.map((row) =>
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

    const preparedRecipe = payload.ingredients ? await this.prepareRecipeRows(payload.ingredients) : null;
    if (preparedRecipe) {
      existing.estimatedIngredientCost = toFixed(preparedRecipe.totalEstimatedCost);
    }

    await AppDataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(Item);
      const recipeRepo = manager.getRepository(ItemIngredient);

      await itemRepo.save(existing);

      if (preparedRecipe) {
        await recipeRepo.delete({ itemId: id });
        const recipeEntities = preparedRecipe.rows.map((row) =>
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

  async getMetaItems() {
    const items = await this.itemRepository.find({
      where: { isActive: true },
      relations: { category: true },
      order: { name: "ASC" }
    });

    const itemIds = items.map((item) => item.id);
    const ingredientCounts = itemIds.length
      ? await this.itemIngredientRepository
          .createQueryBuilder("recipe")
          .select("recipe.itemId", "itemId")
          .addSelect("COUNT(*)", "count")
          .where("recipe.itemId IN (:...itemIds)", { itemIds })
          .groupBy("recipe.itemId")
          .getRawMany<{ itemId: string; count: string }>()
      : [];

    const countMap = new Map(ingredientCounts.map((entry) => [entry.itemId, Number(entry.count)]));

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
      ingredientCount: countMap.get(item.id) ?? 0,
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));
  }

  getMetaUnits() {
    return UNIT_META;
  }
}
