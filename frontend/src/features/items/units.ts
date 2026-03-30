import type { IngredientUnit } from "@/types/ingredient";
import type { ItemUnitMeta } from "@/types/item";

const FACTOR_TO_BASE: Record<IngredientUnit, number> = {
  mcg: 0.000001,
  mg: 0.001,
  g: 1,
  kg: 1000,
  quintal: 100000,
  ton: 1000000,
  ml: 1,
  cl: 10,
  dl: 100,
  l: 1000,
  gallon: 3785.411784,
  teaspoon: 5,
  tablespoon: 15,
  cup: 240,
  pcs: 1,
  piece: 1,
  count: 1,
  unit: 1,
  units: 1,
  pair: 2,
  dozen: 12,
  tray: 1,
  plate: 1,
  pack: 1,
  packet: 1,
  box: 1,
  bottle: 1,
  can: 1,
  jar: 1,
  tub: 1,
  pouch: 1,
  roll: 1,
  bag: 1,
  sack: 1,
  bundle: 1,
  carton: 1,
  crate: 1,
  loaf: 1,
  block: 1,
  custom: 1
};

const getUnitGroup = (unit: IngredientUnit, units: ItemUnitMeta[]) =>
  units.find((entry) => entry.value === unit)?.group ?? unit;

export const getCompatibleUnits = (baseUnit: IngredientUnit, units: ItemUnitMeta[]): IngredientUnit[] => {
  const baseGroup = getUnitGroup(baseUnit, units);
  return units.filter((unit) => unit.group === baseGroup).map((unit) => unit.value);
};

export const convertQuantity = (
  quantity: number,
  fromUnit: IngredientUnit,
  toUnit: IngredientUnit,
  units: ItemUnitMeta[]
): number | null => {
  const fromGroup = getUnitGroup(fromUnit, units);
  const toGroup = getUnitGroup(toUnit, units);
  if (fromGroup !== toGroup) {
    return null;
  }

  const fromFactor = FACTOR_TO_BASE[fromUnit];
  const toFactor = FACTOR_TO_BASE[toUnit];
  if (!fromFactor || !toFactor || !Number.isFinite(quantity)) {
    return null;
  }

  return Number(((quantity * fromFactor) / toFactor).toFixed(6));
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

