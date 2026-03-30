import type { GroupBase } from "react-select";

import type { AppSelectOption } from "@/components/ui/select";
import type { IngredientCategory } from "@/types/ingredient";
import type { ItemCategory, ItemListItem, ItemMetaIngredient } from "@/types/item";
import type { OfferItemCategoryMeta, OfferItemMeta } from "@/types/offer";

export const mapIngredientCategoriesToOptions = (
  categories: IngredientCategory[]
): AppSelectOption[] =>
  categories.map((category) => ({
    value: category.id,
    label: category.name,
    description: category.description || undefined
  }));

export const mapItemCategoriesToOptions = (categories: ItemCategory[]): AppSelectOption[] =>
  categories.map((category) => ({
    value: category.id,
    label: category.name,
    description: category.description || undefined
  }));

export const mapItemsToOptions = (items: ItemListItem[]): AppSelectOption[] =>
  items.map((item) => ({
    value: item.id,
    label: item.name,
    description: item.categoryName,
    searchText: `${item.name} ${item.categoryName}`
  }));

export const mapOfferItemCategoriesToOptions = (
  categories: OfferItemCategoryMeta[]
): AppSelectOption[] =>
  categories.map((category) => ({
    value: category.id,
    label: category.name
  }));

export const mapOfferItemsToOptions = (items: OfferItemMeta[]): AppSelectOption[] =>
  items.map((item) => ({
    value: item.id,
    label: item.name,
    description: item.categoryName,
    searchText: `${item.name} ${item.categoryName}`
  }));

export const groupIngredientsByCategory = (
  ingredients: ItemMetaIngredient[]
): GroupBase<AppSelectOption>[] => {
  const groupedMap = new Map<string, AppSelectOption[]>();
  const categoryNameMap = new Map<string, string>();

  ingredients.forEach((ingredient) => {
    categoryNameMap.set(ingredient.categoryId, ingredient.categoryName);
    const current = groupedMap.get(ingredient.categoryId) ?? [];
    current.push({
      value: ingredient.id,
      label: ingredient.name,
      description: `${ingredient.unit.toUpperCase()} | INR ${ingredient.perUnitPrice}`,
      searchText: `${ingredient.name} ${ingredient.categoryName} ${ingredient.unit}`
    });
    groupedMap.set(ingredient.categoryId, current);
  });

  return Array.from(groupedMap.entries())
    .map(([categoryId, options]) => ({
      label: categoryNameMap.get(categoryId) ?? "Ungrouped",
      options: options.sort((a, b) => a.label.localeCompare(b.label))
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

