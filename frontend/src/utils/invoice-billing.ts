import type { CatalogSnapshot } from "@/types/pos-catalog";

type InvoiceDraftLine = {
  lineType: "item" | "add_on" | "combo" | "product" | "custom";
  referenceId?: string | null;
  nameSnapshot: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  gstPercentage?: number;
  lineTotal?: number;
  meta?: Record<string, unknown> | null;
};

type UsageEventDraft = {
  idempotencyKey: string;
  ingredientId: string | null;
  ingredientNameSnapshot: string;
  consumedQuantity: number;
  baseUnit: string;
  allocatedQuantity: number;
  overusedQuantity: number;
  usageDate: string;
  deviceId: string | null;
  meta: Record<string, unknown> | null;
};

const roundMoney = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
const roundQty = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(6));

export const createDraftId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const computeLineSubtotal = (line: InvoiceDraftLine) => {
  const quantity = Math.max(0, Number(line.quantity) || 0);
  const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
  const discountAmount = Math.max(0, Number(line.discountAmount) || 0);
  return roundMoney(Math.max(unitPrice * quantity - discountAmount, 0));
};

const computeLineTax = (line: InvoiceDraftLine) => {
  const taxable = computeLineSubtotal(line);
  const gstPercentage = Math.max(0, Number(line.gstPercentage) || 0);
  return roundMoney((taxable * gstPercentage) / 100);
};

export const computeInvoiceTotals = (input: {
  lines: InvoiceDraftLine[];
  couponDiscountAmount?: number;
  manualDiscountAmount?: number;
}) => {
  const subtotal = roundMoney(input.lines.reduce((sum, line) => sum + computeLineSubtotal(line), 0));
  const taxAmount = roundMoney(input.lines.reduce((sum, line) => sum + computeLineTax(line), 0));
  const couponDiscountAmount = roundMoney(Math.max(0, Number(input.couponDiscountAmount) || 0));
  const manualDiscountAmount = roundMoney(Math.max(0, Number(input.manualDiscountAmount) || 0));
  const totalAmount = roundMoney(Math.max(0, subtotal + taxAmount - couponDiscountAmount - manualDiscountAmount));

  return {
    subtotal,
    itemDiscountAmount: 0,
    couponDiscountAmount,
    manualDiscountAmount,
    taxAmount,
    totalAmount
  };
};

export const hydrateInvoiceLines = (lines: InvoiceDraftLine[]) =>
  lines.map((line) => ({
    ...line,
    quantity: Math.max(0, Number(line.quantity) || 0),
    unitPrice: roundMoney(Math.max(0, Number(line.unitPrice) || 0)),
    discountAmount: roundMoney(Math.max(0, Number(line.discountAmount) || 0)),
    gstPercentage: roundMoney(Math.max(0, Number(line.gstPercentage) || 0)),
    lineTotal: roundMoney(computeLineSubtotal(line)),
    meta: line.meta ?? null
  }));

export const buildUsageEventsForInvoice = (
  lines: Array<{
    lineType: "item" | "add_on" | "combo" | "product" | "custom";
    referenceId?: string | null;
    quantity: number;
  }>,
  snapshot: CatalogSnapshot,
  options?: { usageDate?: string; deviceId?: string | null; invoiceNumber?: string }
): UsageEventDraft[] => {
  const itemRecipesByItem = new Map<string, typeof snapshot.itemRecipes>();
  for (const recipe of snapshot.itemRecipes) {
    const existing = itemRecipesByItem.get(recipe.itemId);
    if (existing) {
      existing.push(recipe);
    } else {
      itemRecipesByItem.set(recipe.itemId, [recipe]);
    }
  }

  const addOnRecipesById = new Map<string, typeof snapshot.addOnRecipes>();
  for (const recipe of snapshot.addOnRecipes) {
    const existing = addOnRecipesById.get(recipe.addOnId);
    if (existing) {
      existing.push(recipe);
    } else {
      addOnRecipesById.set(recipe.addOnId, [recipe]);
    }
  }

  const comboItemsByCombo = new Map<string, typeof snapshot.comboItems>();
  for (const comboItem of snapshot.comboItems) {
    const existing = comboItemsByCombo.get(comboItem.comboId);
    if (existing) {
      existing.push(comboItem);
    } else {
      comboItemsByCombo.set(comboItem.comboId, [comboItem]);
    }
  }

  const usageMap = new Map<
    string,
    {
      ingredientId: string;
      ingredientNameSnapshot: string;
      baseUnit: string;
      consumedQuantity: number;
    }
  >();

  const appendUsage = (recipe: {
    ingredientId: string;
    ingredientName: string;
    ingredientBaseUnit: string;
    normalizedQuantity: number;
  }, multiplier: number) => {
    const key = recipe.ingredientId;
    const consumed = roundQty(recipe.normalizedQuantity * multiplier);
    const existing = usageMap.get(key);
    if (!existing) {
      usageMap.set(key, {
        ingredientId: recipe.ingredientId,
        ingredientNameSnapshot: recipe.ingredientName,
        baseUnit: recipe.ingredientBaseUnit,
        consumedQuantity: consumed
      });
      return;
    }
    existing.consumedQuantity = roundQty(existing.consumedQuantity + consumed);
  };

  for (const line of lines) {
    const quantity = Math.max(0, Number(line.quantity) || 0);
    if (!line.referenceId || quantity <= 0) {
      continue;
    }

    if (line.lineType === "item") {
      const recipes = itemRecipesByItem.get(line.referenceId) ?? [];
      for (const recipe of recipes) {
        appendUsage(recipe, quantity);
      }
    }

    if (line.lineType === "combo") {
      const comboItems = comboItemsByCombo.get(line.referenceId) ?? [];
      for (const comboItem of comboItems) {
        const recipes = itemRecipesByItem.get(comboItem.itemId) ?? [];
        const multiplier = quantity * Number(comboItem.quantity);
        for (const recipe of recipes) {
          appendUsage(recipe, multiplier);
        }
      }
    }

    if (line.lineType === "add_on") {
      const recipes = addOnRecipesById.get(line.referenceId) ?? [];
      for (const recipe of recipes) {
        appendUsage(recipe, quantity);
      }
    }
  }

  const stockByIngredientId = new Map(
    (snapshot.ingredientStocks ?? []).map((stock) => [stock.ingredientId, stock])
  );
  const allocationByIngredientId = new Map(
    snapshot.allocations.map((allocation) => [allocation.ingredientId, allocation])
  );

  const usageDate = options?.usageDate ?? new Date().toISOString().slice(0, 10);
  return [...usageMap.values()].map((entry) => {
    const consumedQuantity = roundQty(entry.consumedQuantity);
    const stock = stockByIngredientId.get(entry.ingredientId);
    const allocation = allocationByIngredientId.get(entry.ingredientId);
    const availableQuantity = roundQty(
      Math.max(Number(stock?.availableQuantity ?? allocation?.remainingQuantity ?? 0), 0)
    );
    const overusedQuantity = roundQty(Math.max(consumedQuantity - availableQuantity, 0));

    return {
      idempotencyKey: createDraftId(),
      ingredientId: entry.ingredientId,
      ingredientNameSnapshot: entry.ingredientNameSnapshot,
      consumedQuantity,
      baseUnit: entry.baseUnit,
      allocatedQuantity: availableQuantity,
      overusedQuantity,
      usageDate,
      deviceId: options?.deviceId ?? null,
      meta: options?.invoiceNumber
        ? {
            invoiceNumber: options.invoiceNumber
          }
        : null
    };
  });
};
