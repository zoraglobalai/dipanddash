import { AppDataSource } from "../../database/data-source";
import { PurchaseOrderLine } from "./purchase-order-line.entity";

type IngredientPurchaseRow = {
  ingredientId: string;
  stockAdded: string;
  lineTotal: string;
};

const toNumber = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toFixed = (value: number, digits: number) => Number(toNumber(value).toFixed(digits));

const getIngredientPurchaseRows = async (ingredientIds: string[]) => {
  if (!ingredientIds.length) {
    return [] as IngredientPurchaseRow[];
  }

  return AppDataSource.getRepository(PurchaseOrderLine)
    .createQueryBuilder("line")
    .leftJoin("line.purchaseOrder", "purchaseOrder")
    .select("line.ingredientId", "ingredientId")
    .addSelect("line.stockAdded", "stockAdded")
    .addSelect("line.lineTotal", "lineTotal")
    .where("line.lineType = :lineType", { lineType: "ingredient" })
    .andWhere("line.ingredientId IN (:...ingredientIds)", { ingredientIds })
    .andWhere("line.ingredientId IS NOT NULL")
    .andWhere("line.stockAdded > 0")
    .orderBy("purchaseOrder.purchaseDate", "DESC")
    .addOrderBy("line.createdAt", "DESC")
    .getRawMany<IngredientPurchaseRow>();
};

export const getLatestIngredientPurchasePriceMap = async (
  ingredientIds: string[],
  fallbackPriceByIngredient: Map<string, number> = new Map()
) => {
  const rows = await getIngredientPurchaseRows(ingredientIds);
  const latestPriceMap = new Map<string, number>();

  for (const row of rows) {
    const ingredientId = row.ingredientId;
    if (!ingredientId || latestPriceMap.has(ingredientId)) {
      continue;
    }

    const stockAdded = toNumber(row.stockAdded);
    if (stockAdded <= 0) {
      continue;
    }

    const lineTotal = toNumber(row.lineTotal);
    latestPriceMap.set(ingredientId, toFixed(lineTotal / stockAdded, 3));
  }

  for (const ingredientId of ingredientIds) {
    if (!latestPriceMap.has(ingredientId)) {
      latestPriceMap.set(ingredientId, toFixed(fallbackPriceByIngredient.get(ingredientId) ?? 0, 3));
    }
  }

  return latestPriceMap;
};

export const getIngredientValuationMapFromCurrentStock = async (input: {
  ingredientIds: string[];
  stockByIngredient: Map<string, number>;
  fallbackPriceByIngredient?: Map<string, number>;
}) => {
  const { ingredientIds, stockByIngredient, fallbackPriceByIngredient = new Map() } = input;
  const rows = await getIngredientPurchaseRows(ingredientIds);
  const rowsByIngredient = new Map<string, Array<{ stockAdded: number; lineTotal: number }>>();

  rows.forEach((row) => {
    const ingredientId = row.ingredientId;
    if (!ingredientId) {
      return;
    }

    const stockAdded = toNumber(row.stockAdded);
    const lineTotal = toNumber(row.lineTotal);
    if (stockAdded <= 0) {
      return;
    }

    const currentRows = rowsByIngredient.get(ingredientId) ?? [];
    currentRows.push({ stockAdded, lineTotal });
    rowsByIngredient.set(ingredientId, currentRows);
  });

  const valuationMap = new Map<string, number>();

  ingredientIds.forEach((ingredientId) => {
    let remainingStock = Math.max(toNumber(stockByIngredient.get(ingredientId)), 0);
    let valuation = 0;
    const purchaseRows = rowsByIngredient.get(ingredientId) ?? [];

    for (const row of purchaseRows) {
      if (remainingStock <= 0) {
        break;
      }

      const perUnitCost = row.lineTotal / row.stockAdded;
      const quantityForThisCost = Math.min(remainingStock, row.stockAdded);
      valuation += quantityForThisCost * perUnitCost;
      remainingStock -= quantityForThisCost;
    }

    if (remainingStock > 0) {
      valuation += remainingStock * toNumber(fallbackPriceByIngredient.get(ingredientId));
    }

    valuationMap.set(ingredientId, toFixed(valuation, 2));
  });

  return valuationMap;
};

