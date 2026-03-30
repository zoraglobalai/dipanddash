import { INGREDIENT_UNITS, type IngredientUnit } from "../ingredients/ingredients.constants";
import { PRODUCT_UNITS, type ProductUnit } from "./procurement.constants";

type UnitGroup = "weight" | "volume" | "count" | "pack" | "box" | "bottle" | "can" | "jar" | "tray" | "bag" | "custom";

type UnitMeta = {
  group: UnitGroup;
  factorToBase: number;
};

const INGREDIENT_UNIT_META: Record<IngredientUnit, UnitMeta> = {
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
  cup: { group: "volume", factorToBase: 240 },
  tablespoon: { group: "volume", factorToBase: 15 },
  teaspoon: { group: "volume", factorToBase: 5 },
  pcs: { group: "count", factorToBase: 1 },
  piece: { group: "count", factorToBase: 1 },
  count: { group: "count", factorToBase: 1 },
  unit: { group: "count", factorToBase: 1 },
  units: { group: "count", factorToBase: 1 },
  pair: { group: "count", factorToBase: 2 },
  dozen: { group: "count", factorToBase: 12 },
  plate: { group: "count", factorToBase: 1 },
  tray: { group: "tray", factorToBase: 1 },
  pack: { group: "pack", factorToBase: 1 },
  packet: { group: "pack", factorToBase: 1 },
  box: { group: "box", factorToBase: 1 },
  bottle: { group: "bottle", factorToBase: 1 },
  can: { group: "can", factorToBase: 1 },
  jar: { group: "jar", factorToBase: 1 },
  tub: { group: "jar", factorToBase: 1 },
  pouch: { group: "pack", factorToBase: 1 },
  roll: { group: "pack", factorToBase: 1 },
  bag: { group: "bag", factorToBase: 1 },
  sack: { group: "bag", factorToBase: 1 },
  bundle: { group: "pack", factorToBase: 1 },
  carton: { group: "box", factorToBase: 1 },
  crate: { group: "box", factorToBase: 1 },
  loaf: { group: "pack", factorToBase: 1 },
  block: { group: "pack", factorToBase: 1 },
  custom: { group: "custom", factorToBase: 1 }
};

const PRODUCT_UNIT_META: Record<ProductUnit, UnitMeta> = {
  pcs: { group: "count", factorToBase: 1 },
  unit: { group: "count", factorToBase: 1 },
  count: { group: "count", factorToBase: 1 },
  pack: { group: "pack", factorToBase: 1 },
  packet: { group: "pack", factorToBase: 1 },
  box: { group: "box", factorToBase: 1 },
  tin: { group: "can", factorToBase: 1 },
  bottle: { group: "bottle", factorToBase: 1 },
  can: { group: "can", factorToBase: 1 },
  jar: { group: "jar", factorToBase: 1 },
  tray: { group: "tray", factorToBase: 1 },
  bag: { group: "bag", factorToBase: 1 },
  carton: { group: "box", factorToBase: 1 },
  crate: { group: "box", factorToBase: 1 },
  g: { group: "weight", factorToBase: 1 },
  kg: { group: "weight", factorToBase: 1000 },
  ml: { group: "volume", factorToBase: 1 },
  l: { group: "volume", factorToBase: 1000 },
  custom: { group: "custom", factorToBase: 1 }
};

const isIngredientUnit = (unit: string): unit is IngredientUnit =>
  (INGREDIENT_UNITS as readonly string[]).includes(unit);

const isProductUnit = (unit: string): unit is ProductUnit =>
  (PRODUCT_UNITS as readonly string[]).includes(unit);

export const getCompatibleIngredientUnits = (baseUnit: string) => {
  if (!isIngredientUnit(baseUnit)) {
    return [baseUnit];
  }
  const baseGroup = INGREDIENT_UNIT_META[baseUnit].group;
  return INGREDIENT_UNITS.filter((unit) => INGREDIENT_UNIT_META[unit].group === baseGroup);
};

export const getCompatibleProductUnits = (baseUnit: string) => {
  if (!isProductUnit(baseUnit)) {
    return [baseUnit];
  }
  const baseGroup = PRODUCT_UNIT_META[baseUnit].group;
  return PRODUCT_UNITS.filter((unit) => PRODUCT_UNIT_META[unit].group === baseGroup);
};

const convertByMap = (quantity: number, fromMeta: UnitMeta, toMeta: UnitMeta) => {
  if (!Number.isFinite(quantity)) {
    return 0;
  }
  if (fromMeta.group !== toMeta.group) {
    return null;
  }
  const baseQuantity = quantity * fromMeta.factorToBase;
  return baseQuantity / toMeta.factorToBase;
};

export const convertIngredientQuantityToUnit = (
  quantity: number,
  fromUnit: string,
  toUnit: string
) => {
  if (!isIngredientUnit(fromUnit) || !isIngredientUnit(toUnit)) {
    return null;
  }
  return convertByMap(quantity, INGREDIENT_UNIT_META[fromUnit], INGREDIENT_UNIT_META[toUnit]);
};

export const convertProductQuantityToUnit = (
  quantity: number,
  fromUnit: string,
  toUnit: string
) => {
  if (!isProductUnit(fromUnit) || !isProductUnit(toUnit)) {
    return null;
  }
  return convertByMap(quantity, PRODUCT_UNIT_META[fromUnit], PRODUCT_UNIT_META[toUnit]);
};

export const convertPurchaseQuantityToBase = (
  lineType: "ingredient" | "product",
  quantity: number,
  fromUnit: string,
  baseUnit: string
) =>
  lineType === "ingredient"
    ? convertIngredientQuantityToUnit(quantity, fromUnit, baseUnit)
    : convertProductQuantityToUnit(quantity, fromUnit, baseUnit);

