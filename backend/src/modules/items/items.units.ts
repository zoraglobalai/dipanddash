import { INGREDIENT_UNITS, type IngredientUnit } from "../ingredients/ingredients.constants";

type UnitGroup =
  | "weight"
  | "volume"
  | "count"
  | "plate"
  | "pack"
  | "packet"
  | "box"
  | "bottle"
  | "can"
  | "jar"
  | "tub"
  | "pouch"
  | "roll"
  | "bag"
  | "sack"
  | "bundle"
  | "carton"
  | "crate"
  | "loaf"
  | "block"
  | "custom";

type UnitDefinition = {
  group: UnitGroup;
  factorToBase: number;
};

const UNITS: Record<IngredientUnit, UnitDefinition> = {
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
  custom: { group: "custom", factorToBase: 1 }
};

const toSafeNumber = (value: number) => Number.isFinite(value) ? value : 0;

export const normalizeUnitValue = (value: number, decimals = 6) =>
  Number(toSafeNumber(value).toFixed(decimals));

export const areUnitsCompatible = (fromUnit: IngredientUnit, toUnit: IngredientUnit) => {
  return UNITS[fromUnit].group === UNITS[toUnit].group;
};

export const convertIngredientQuantity = (
  quantity: number,
  fromUnit: IngredientUnit,
  toUnit: IngredientUnit
) => {
  if (!Number.isFinite(quantity)) {
    return 0;
  }

  if (!areUnitsCompatible(fromUnit, toUnit)) {
    return null;
  }

  const normalized = quantity * UNITS[fromUnit].factorToBase;
  return normalizeUnitValue(normalized / UNITS[toUnit].factorToBase);
};

export const getUnitGroup = (unit: IngredientUnit) => UNITS[unit].group;

export const UNIT_META = INGREDIENT_UNITS.map((unit) => ({
  value: unit,
  label: unit.toUpperCase(),
  group: getUnitGroup(unit)
}));

