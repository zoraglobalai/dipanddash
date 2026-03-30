import { env } from "@/config/env";
import { roundMoney } from "@/utils/currency";
import { makeId } from "@/utils/idempotency";
import type {
  CartLine,
  CartTotals,
  CatalogSnapshot,
  InvoicePaymentInput,
  InvoiceUpsertPayload,
  PosOrder,
  UsageEventDraft
} from "@/types/pos";

const computeLineSubtotal = (line: CartLine) => {
  const base = line.unitPrice * line.quantity;
  const addOnsTotal = line.addOns.reduce(
    (sum, addOn) => sum + addOn.unitPrice * addOn.quantity * line.quantity,
    0
  );
  return roundMoney(base + addOnsTotal);
};

const computeLineTax = (line: CartLine) => {
  const taxable = computeLineSubtotal(line);
  return roundMoney((taxable * line.gstPercentage) / 100);
};

export const posBillingService = {
  computeTotals(input: {
    lines: CartLine[];
    couponDiscountAmount?: number;
    manualDiscountAmount?: number;
  }): CartTotals {
    const subtotal = roundMoney(input.lines.reduce((sum, line) => sum + computeLineSubtotal(line), 0));
    const taxAmount = roundMoney(input.lines.reduce((sum, line) => sum + computeLineTax(line), 0));
    const couponDiscountAmount = roundMoney(input.couponDiscountAmount ?? 0);
    const manualDiscountAmount = roundMoney(input.manualDiscountAmount ?? 0);
    const totalAmount = roundMoney(Math.max(0, subtotal + taxAmount - couponDiscountAmount - manualDiscountAmount));

    return {
      subtotal,
      itemDiscountAmount: 0,
      couponDiscountAmount,
      manualDiscountAmount,
      taxAmount,
      totalAmount
    };
  },

  buildUsageEvents(order: PosOrder, snapshot: CatalogSnapshot): UsageEventDraft[] {
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
      const consumed = recipe.normalizedQuantity * multiplier;
      const existing = usageMap.get(key);
      if (!existing) {
        usageMap.set(key, {
          ingredientId: recipe.ingredientId,
          ingredientNameSnapshot: recipe.ingredientName,
          baseUnit: recipe.ingredientBaseUnit,
          consumedQuantity: consumed
        });
      } else {
        existing.consumedQuantity += consumed;
      }
    };

    for (const line of order.lines) {
      if (line.lineType === "item") {
        const recipes = itemRecipesByItem.get(line.refId) ?? [];
        for (const recipe of recipes) {
          appendUsage(recipe, line.quantity);
        }
      }

      if (line.lineType === "combo") {
        const comboItems = comboItemsByCombo.get(line.refId) ?? [];
        for (const comboItem of comboItems) {
          const itemRecipes = itemRecipesByItem.get(comboItem.itemId) ?? [];
          const multiplier = line.quantity * comboItem.quantity;
          for (const recipe of itemRecipes) {
            appendUsage(recipe, multiplier);
          }
        }
      }

      if (line.lineType === "add_on") {
        const addOnRecipes = addOnRecipesById.get(line.refId) ?? [];
        for (const recipe of addOnRecipes) {
          appendUsage(recipe, line.quantity);
        }
      }

      for (const addOn of line.addOns) {
        const addOnRecipes = addOnRecipesById.get(addOn.addOnId) ?? [];
        for (const recipe of addOnRecipes) {
          appendUsage(recipe, line.quantity * addOn.quantity);
        }
      }
    }

    const stockByIngredientId = new Map(
      (snapshot.ingredientStocks ?? []).map((stock) => [stock.ingredientId, stock])
    );
    const allocationByIngredientId = new Map(snapshot.allocations.map((allocation) => [allocation.ingredientId, allocation]));

    const usageDate = new Date().toISOString().slice(0, 10);
    return [...usageMap.values()].map((entry) => {
      const consumedQuantity = Number(entry.consumedQuantity.toFixed(6));
      const stock = stockByIngredientId.get(entry.ingredientId);
      const allocation = allocationByIngredientId.get(entry.ingredientId);
      const availableQuantity = Number((stock?.availableQuantity ?? allocation?.remainingQuantity ?? 0).toFixed(6));
      const overusedQuantity = Number(Math.max(consumedQuantity - availableQuantity, 0).toFixed(6));

      return {
        idempotencyKey: makeId(),
        ingredientId: entry.ingredientId,
        ingredientNameSnapshot: entry.ingredientNameSnapshot,
        consumedQuantity,
        baseUnit: entry.baseUnit,
        allocatedQuantity: availableQuantity,
        overusedQuantity,
        usageDate,
        deviceId: env.deviceId,
        meta: {
          localInvoiceNumber: order.invoiceNumber
        }
      };
    });
  },

  buildInvoiceSyncPayload(input: {
    order: PosOrder;
    payments: InvoicePaymentInput[];
    snapshot: CatalogSnapshot;
    forceStatus?: "pending" | "paid" | "cancelled" | "refunded";
  }): InvoiceUpsertPayload {
    const { order, payments, snapshot, forceStatus } = input;
    const status = forceStatus ?? "paid";
    const usageEvents = status === "paid" ? this.buildUsageEvents(order, snapshot) : [];

    const lines = order.lines.map((line) => {
      const lineSubtotal = computeLineSubtotal(line);
      const lineMeta: Record<string, unknown> = {};
      if (line.addOns.length) {
        lineMeta.addOns = line.addOns;
      }
      if (line.isComplimentary) {
        lineMeta.isComplimentary = true;
        lineMeta.complimentaryReason = line.complimentaryReason ?? "Free item";
        lineMeta.complimentarySourceCouponId = line.complimentarySourceCouponId ?? null;
      }
      return {
        lineType: line.lineType,
        referenceId: line.refId,
        nameSnapshot: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: 0,
        gstPercentage: line.gstPercentage,
        lineTotal: lineSubtotal,
        meta: Object.keys(lineMeta).length ? lineMeta : null
      };
    });

    return {
      invoiceNumber: order.invoiceNumber,
      orderReference: order.localOrderId,
      customerId: order.customer?.serverId ?? null,
      customerPhone: order.customer?.phone ?? null,
      customerName: order.customer?.name ?? null,
      branchId: env.branchId,
      deviceId: env.deviceId,
      orderType: order.orderType,
      tableLabel: order.tableLabel,
      kitchenStatus: order.kitchenStatus,
      status,
      paymentMode: payments.length > 1 ? "mixed" : payments[0]?.mode ?? "cash",
      subtotal: order.totals.subtotal,
      itemDiscountAmount: order.totals.itemDiscountAmount,
      couponDiscountAmount: order.totals.couponDiscountAmount,
      manualDiscountAmount: order.totals.manualDiscountAmount,
      taxAmount: order.totals.taxAmount,
      totalAmount: order.totals.totalAmount,
      couponCode: order.appliedOffer?.couponCode ?? null,
      notes: order.notes,
      customerSnapshot: order.customer
        ? {
            name: order.customer.name,
            phone: order.customer.phone
          }
        : null,
      totalsSnapshot: order.totals,
      linesSnapshot: {
        count: order.lines.length,
        hasComplimentaryLine: order.lines.some((line) => line.isComplimentary),
        appliedOffer: order.appliedOffer
      },
      sourceCreatedAt: order.createdAt,
      lines,
      payments: payments.map((payment) => ({
        ...payment,
        status: "success"
      })),
      usageEvents
    };
  }
};
