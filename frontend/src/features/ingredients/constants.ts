import type { IngredientUnit } from "@/types/ingredient";

export const INGREDIENT_UNITS: IngredientUnit[] = [
  "mcg",
  "mg",
  "g",
  "kg",
  "quintal",
  "ton",
  "ml",
  "cl",
  "dl",
  "l",
  "gallon",
  "pcs",
  "piece",
  "count",
  "unit",
  "units",
  "pair",
  "dozen",
  "tray",
  "plate",
  "pack",
  "packet",
  "box",
  "bottle",
  "can",
  "jar",
  "tub",
  "pouch",
  "roll",
  "bag",
  "sack",
  "bundle",
  "carton",
  "crate",
  "loaf",
  "block",
  "cup",
  "tablespoon",
  "teaspoon",
  "custom"
];

export const INGREDIENT_UNIT_OPTIONS = INGREDIENT_UNITS.map((unit) => ({
  label: unit.toUpperCase(),
  value: unit
}));
