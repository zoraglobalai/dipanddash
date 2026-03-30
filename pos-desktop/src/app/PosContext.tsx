import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";

import { catalogService } from "@/services/catalog.service";
import { closingService } from "@/services/closing.service";
import { attendanceService } from "@/services/attendance.service";
import { customersService } from "@/services/customers.service";
import { posBillingService } from "@/services/invoice-builder.service";
import { ordersRepository } from "@/db/repositories/orders.repository";
import { syncQueueRepository } from "@/db/repositories/sync-queue.repository";
import { settingsRepository } from "@/db/repositories/settings.repository";
import { env } from "@/config/env";
import { makeId, makeInvoiceNumber } from "@/utils/idempotency";
import { formatQuantityWithUnit } from "@/utils/quantity";
import type {
  CartLine,
  CatalogAddOn,
  CatalogCombo,
  CatalogItem,
  CatalogProduct,
  CatalogSnapshot,
  CustomerRecord,
  ClosingStatus,
  InvoicePaymentInput,
  KitchenStatus,
  OrderChannel,
  OrderType,
  PendingBillSummary,
  PosOrder,
  RecentBillSummary,
  SyncQueueRow
} from "@/types/pos";

type PosContextValue = {
  catalog: CatalogSnapshot | null;
  currentOrder: PosOrder;
  pendingBills: PendingBillSummary[];
  recentBills: RecentBillSummary[];
  completedBills: RecentBillSummary[];
  kitchenOrders: PosOrder[];
  isBootstrapping: boolean;
  allocationWarning: string | null;
  closingStatus: ClosingStatus | null;
  isPunchedIn: boolean | null;
  setOrderType: (orderType: OrderType) => void;
  setOrderChannel: (orderChannel: OrderChannel | null) => void;
  setTableLabel: (tableLabel: string) => void;
  attachCustomer: (customer: CustomerRecord | null) => void;
  addItem: (item: CatalogItem) => void;
  addCombo: (combo: CatalogCombo) => void;
  addProduct: (product: CatalogProduct) => void;
  addStandaloneAddOn: (addOn: CatalogAddOn) => void;
  addAddOnToLine: (lineId: string, addOn: CatalogAddOn) => void;
  removeAddOnFromLine: (lineId: string, addOnId: string) => void;
  updateLineQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  applyCouponCode: (couponCode: string) => { ok: boolean; message: string };
  setManualDiscount: (value: number) => void;
  saveAsPending: () => Promise<void>;
  sendToKitchen: () => Promise<{ ok: boolean; message: string }>;
  updateKitchenStatus: (localOrderId: string, kitchenStatus: KitchenStatus) => Promise<void>;
  resumePending: (localOrderId: string) => Promise<void>;
  clearOrder: () => void;
  completePayment: (input: {
    mode: InvoicePaymentInput["mode"];
    receivedAmount?: number;
    referenceNo?: string;
  }) => Promise<void>;
  quickCreateCustomer: (input: { name: string; phone: string; email?: string }) => Promise<CustomerRecord>;
  searchCustomers: (query: string) => Promise<CustomerRecord[]>;
  findCustomerByPhone: (phone: string) => Promise<CustomerRecord | null>;
  getOrderById: (localOrderId: string) => Promise<PosOrder | null>;
  refreshPendingBills: () => Promise<void>;
  refreshRecentBills: () => Promise<void>;
  refreshCompletedBills: () => Promise<void>;
  refreshKitchenOrders: () => Promise<void>;
  refreshClosingStatus: () => Promise<void>;
  refreshCatalogSnapshot: () => Promise<void>;
  refreshShiftStatus: () => Promise<void>;
  clearAllocationWarning: () => void;
};

const PosContext = createContext<PosContextValue | undefined>(undefined);

const createDraftOrder = (orderType: OrderType = "takeaway", orderChannel: OrderChannel | null = null): PosOrder => {
  const now = new Date().toISOString();
  return {
    localOrderId: makeId(),
    serverInvoiceId: null,
    invoiceNumber: makeInvoiceNumber(),
    orderType,
    orderChannel,
    tableLabel: null,
    kitchenStatus: "not_sent",
    status: "draft",
    paymentMode: null,
    customer: null,
    lines: [],
    appliedOffer: null,
    manualDiscountAmount: 0,
    notes: null,
    totals: {
      subtotal: 0,
      itemDiscountAmount: 0,
      couponDiscountAmount: 0,
      manualDiscountAmount: 0,
      taxAmount: 0,
      totalAmount: 0
    },
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending"
  };
};

const CLOSING_STATUS_CACHE_KEY = "pos_closing_status_cache";

const recomputeOrder = (order: PosOrder) => {
  const totals = posBillingService.computeTotals({
    lines: order.lines,
    couponDiscountAmount: order.appliedOffer?.discountAmount ?? 0,
    manualDiscountAmount: order.manualDiscountAmount
  });

  return {
    ...order,
    totals,
    updatedAt: new Date().toISOString()
  } satisfies PosOrder;
};

const applyUsageToCatalogSnapshot = (
  snapshot: CatalogSnapshot,
  usageEvents: Array<{ ingredientId: string | null; consumedQuantity: number }>
) => {
  const stockMap = new Map((snapshot.ingredientStocks ?? []).map((stock) => [stock.ingredientId, stock]));
  const nextIngredientStocks = [...(snapshot.ingredientStocks ?? [])];
  const allocationMap = new Map(snapshot.allocations.map((allocation) => [allocation.ingredientId, allocation]));
  const nextAllocations = [...snapshot.allocations];

  for (const event of usageEvents) {
    if (!event.ingredientId || event.consumedQuantity <= 0) {
      continue;
    }

    const consumed = Number(event.consumedQuantity.toFixed(6));

    const existingStock = stockMap.get(event.ingredientId);
    if (existingStock) {
      const nextAvailable = Number(Math.max(existingStock.availableQuantity - consumed, 0).toFixed(6));
      const nextStock = {
        ...existingStock,
        availableQuantity: nextAvailable,
        updatedAt: new Date().toISOString()
      };
      stockMap.set(event.ingredientId, nextStock);
      const stockIdx = nextIngredientStocks.findIndex((row) => row.ingredientId === event.ingredientId);
      if (stockIdx >= 0) {
        nextIngredientStocks[stockIdx] = nextStock;
      }
    }

    const existing = allocationMap.get(event.ingredientId);
    if (!existing) {
      continue;
    }

    const nextUsed = Number((existing.usedQuantity + consumed).toFixed(6));
    const nextRemaining = Number(Math.max(existing.remainingQuantity - consumed, 0).toFixed(6));

    const nextAllocation = {
      ...existing,
      usedQuantity: nextUsed,
      remainingQuantity: nextRemaining,
      updatedAt: new Date().toISOString()
    };

    allocationMap.set(event.ingredientId, nextAllocation);
    const idx = nextAllocations.findIndex((row) => row.id === existing.id);
    if (idx >= 0) {
      nextAllocations[idx] = nextAllocation;
    }
  }

  return {
    ...snapshot,
    ingredientStocks: nextIngredientStocks,
    allocations: nextAllocations
  };
};

export const PosProvider = ({ children }: PropsWithChildren) => {
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [currentOrder, setCurrentOrder] = useState<PosOrder>(createDraftOrder());
  const [pendingBills, setPendingBills] = useState<PendingBillSummary[]>([]);
  const [recentBills, setRecentBills] = useState<RecentBillSummary[]>([]);
  const [completedBills, setCompletedBills] = useState<RecentBillSummary[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<PosOrder[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [allocationWarning, setAllocationWarning] = useState<string | null>(null);
  const [closingStatus, setClosingStatus] = useState<ClosingStatus | null>(null);
  const [isPunchedIn, setIsPunchedIn] = useState<boolean | null>(null);

  const refreshPendingBills = useCallback(async () => {
    const pending = await ordersRepository.listPendingBills();
    setPendingBills(pending);
  }, []);

  const refreshRecentBills = useCallback(async () => {
    const recent = await ordersRepository.listRecentBills(5);
    setRecentBills(recent);
  }, []);

  const refreshCompletedBills = useCallback(async () => {
    const completed = await ordersRepository.listCompletedBills(500);
    setCompletedBills(completed);
  }, []);

  const refreshKitchenOrders = useCallback(async () => {
    const rows = await ordersRepository.listKitchenOrders(500);
    setKitchenOrders(rows);
  }, []);

  const refreshClosingStatus = useCallback(async () => {
    try {
      const status = await closingService.getStatus();
      setClosingStatus(status);
      await settingsRepository.set(CLOSING_STATUS_CACHE_KEY, JSON.stringify(status));
    } catch {
      const cached = await settingsRepository.get(CLOSING_STATUS_CACHE_KEY);
      if (!cached) {
        setClosingStatus(null);
        return;
      }
      try {
        setClosingStatus(JSON.parse(cached) as ClosingStatus);
      } catch {
        setClosingStatus(null);
      }
    }
  }, []);

  const refreshCatalogSnapshot = useCallback(async () => {
    const snapshot = await catalogService.ensureSnapshot();
    setCatalog(snapshot ?? null);
    await refreshClosingStatus();
  }, [refreshClosingStatus]);

  const refreshShiftStatus = useCallback(async () => {
    try {
      const response = await attendanceService.getMyRecords({
        page: 1,
        limit: 1
      });
      const hasOpenShift = response.data.summary.currentlyPunchedIn > 0;
      setIsPunchedIn(hasOpenShift);
    } catch {
      setIsPunchedIn(null);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true);
      try {
        const snapshot = await catalogService.ensureSnapshot();
        setCatalog(snapshot ?? null);
        await refreshPendingBills();
        await refreshRecentBills();
        await refreshCompletedBills();
        await refreshKitchenOrders();
        await refreshClosingStatus();
        await refreshShiftStatus();
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, [refreshClosingStatus, refreshCompletedBills, refreshKitchenOrders, refreshPendingBills, refreshRecentBills, refreshShiftStatus]);

  const validateAllocationForLines = useCallback(
    (lines: CartLine[], invoiceNumber: string) => {
      if (!catalog) {
        return {
          ok: false as const,
          message: "Menu is still syncing. Please wait a moment."
        };
      }

      if (catalog.controls && !catalog.controls.isBillingEnabled) {
        return {
          ok: false as const,
          message:
            catalog.controls.reason?.trim() ||
            "POS billing is currently disabled by admin. Please contact administrator."
        };
      }

      if (closingStatus && !closingStatus.canTakeOrders) {
        return {
          ok: false as const,
          message: closingStatus.reason || "Order taking is locked until closing is completed."
        };
      }

      if (isPunchedIn !== true) {
        return {
          ok: false as const,
          message:
            isPunchedIn === false
              ? "You are punched out. Please punch in from Attendance to take orders."
              : "Unable to verify attendance state. Please refresh Attendance and punch in before taking orders."
        };
      }

      const usageEvents = posBillingService.buildUsageEvents(
        {
          ...createDraftOrder(),
          invoiceNumber,
          lines
        },
        catalog
      );

      if (!usageEvents.length) {
        return {
          ok: true as const
        };
      }

      const stockByIngredient = new Map(
        (catalog.ingredientStocks ?? []).map((stock) => [stock.ingredientId, stock.availableQuantity])
      );
      const allocationFallback = new Map(
        catalog.allocations.map((allocation) => [allocation.ingredientId, allocation.remainingQuantity])
      );

      if (!stockByIngredient.size && !allocationFallback.size) {
        return {
          ok: true as const
        };
      }

      const zeroStockIngredients = new Set<string>();
      const insufficientIngredients: string[] = [];

      for (const usage of usageEvents) {
        const ingredientId = usage.ingredientId;
        if (!ingredientId) {
          continue;
        }

        const availableQuantity =
          Number(stockByIngredient.get(ingredientId) ?? allocationFallback.get(ingredientId) ?? 0);
        if (availableQuantity <= 0) {
          zeroStockIngredients.add(usage.ingredientNameSnapshot);
          continue;
        }

        if (usage.consumedQuantity > availableQuantity + 0.000001) {
          insufficientIngredients.push(
            `${usage.ingredientNameSnapshot} (required ${formatQuantityWithUnit(usage.consumedQuantity, usage.baseUnit)}, available ${formatQuantityWithUnit(availableQuantity, usage.baseUnit)})`
          );
        }
      }

      if (zeroStockIngredients.size || insufficientIngredients.length) {
        const chunks: string[] = [];
        if (zeroStockIngredients.size) {
          chunks.push(
            `Out of stock: ${[...zeroStockIngredients].join(", ")}`
          );
        }
        if (insufficientIngredients.length) {
          chunks.push(`Insufficient stock: ${insufficientIngredients.join(", ")}`);
        }
        return {
          ok: false as const,
          message: `${chunks.join(". ")}. Please refill stock and try again.`
        };
      }

      return {
        ok: true as const
      };
    },
    [catalog, closingStatus, isPunchedIn]
  );

  const setOrderType = useCallback((orderType: OrderType) => {
    setCurrentOrder((previous) =>
      recomputeOrder({
        ...previous,
        orderType,
        tableLabel: orderType === "dine_in" ? previous.tableLabel : null
      })
    );
  }, []);

  const setOrderChannel = useCallback((orderChannel: OrderChannel | null) => {
    setCurrentOrder((previous) =>
      recomputeOrder({
        ...previous,
        orderChannel
      })
    );
  }, []);

  const setTableLabel = useCallback((tableLabel: string) => {
    setCurrentOrder((previous) =>
      recomputeOrder({
        ...previous,
        tableLabel: tableLabel.trim().length ? tableLabel.trim() : null
      })
    );
  }, []);

  const attachCustomer = useCallback((customer: CustomerRecord | null) => {
    setCurrentOrder((previous) => recomputeOrder({ ...previous, customer }));
  }, []);

  const addItem = useCallback((item: CatalogItem) => {
    setCurrentOrder((previous) => {
      const lines = [
        ...previous.lines,
        {
          lineId: makeId(),
          lineType: "item",
          refId: item.id,
          name: item.name,
          quantity: 1,
          unitPrice: item.sellingPrice,
          gstPercentage: item.gstPercentage,
          addOns: [],
          notes: null
        } satisfies CartLine
      ];

      const guard = validateAllocationForLines(lines, previous.invoiceNumber);
      if (!guard.ok) {
        setAllocationWarning(guard.message);
        return previous;
      }

      return recomputeOrder({ ...previous, lines });
    });
  }, [validateAllocationForLines]);

  const addCombo = useCallback((combo: CatalogCombo) => {
    setCurrentOrder((previous) => {
      const lines = [
        ...previous.lines,
        {
          lineId: makeId(),
          lineType: "combo",
          refId: combo.id,
          name: combo.name,
          quantity: 1,
          unitPrice: combo.sellingPrice,
          gstPercentage: combo.gstPercentage,
          addOns: [],
          notes: null
        } satisfies CartLine
      ];

      const guard = validateAllocationForLines(lines, previous.invoiceNumber);
      if (!guard.ok) {
        setAllocationWarning(guard.message);
        return previous;
      }

      return recomputeOrder({ ...previous, lines });
    });
  }, [validateAllocationForLines]);

  const addProduct = useCallback((product: CatalogProduct) => {
    setCurrentOrder((previous) => {
      const lines = [
        ...previous.lines,
        {
          lineId: makeId(),
          lineType: "product",
          refId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.sellingPrice,
          gstPercentage: 0,
          addOns: [],
          notes: null
        } satisfies CartLine
      ];

      return recomputeOrder({ ...previous, lines });
    });
  }, []);

  const addStandaloneAddOn = useCallback((addOn: CatalogAddOn) => {
    setCurrentOrder((previous) => {
      const existing = previous.lines.find((line) => line.refId === addOn.id && line.lineType === "add_on");
      const lines = existing
        ? previous.lines.map((line) =>
            line.lineId === existing.lineId ? { ...line, quantity: line.quantity + 1 } : line
          )
        : [
            ...previous.lines,
            {
              lineId: makeId(),
              lineType: "add_on",
              refId: addOn.id,
              name: addOn.name,
              quantity: 1,
              unitPrice: addOn.sellingPrice,
              gstPercentage: addOn.gstPercentage,
              addOns: [],
              notes: null
            } satisfies CartLine
          ];

      const guard = validateAllocationForLines(lines, previous.invoiceNumber);
      if (!guard.ok) {
        setAllocationWarning(guard.message);
        return previous;
      }

      return recomputeOrder({ ...previous, lines });
    });
  }, [validateAllocationForLines]);

  const addAddOnToLine = useCallback((lineId: string, addOn: CatalogAddOn) => {
    setCurrentOrder((previous) => {
      const lines = previous.lines.map((line) => {
        if (line.lineId !== lineId) {
          return line;
        }
        const existingAddOn = line.addOns.find((entry) => entry.addOnId === addOn.id);
        if (existingAddOn) {
          return {
            ...line,
            addOns: line.addOns.map((entry) =>
              entry.addOnId === addOn.id ? { ...entry, quantity: entry.quantity + 1 } : entry
            )
          };
        }
        return {
          ...line,
          addOns: [
            ...line.addOns,
            {
              addOnId: addOn.id,
              name: addOn.name,
              quantity: 1,
              unitPrice: addOn.sellingPrice,
              gstPercentage: addOn.gstPercentage
            }
          ]
        };
      });

      const guard = validateAllocationForLines(lines, previous.invoiceNumber);
      if (!guard.ok) {
        setAllocationWarning(guard.message);
        return previous;
      }

      return recomputeOrder({ ...previous, lines });
    });
  }, [validateAllocationForLines]);

  const removeAddOnFromLine = useCallback((lineId: string, addOnId: string) => {
    setCurrentOrder((previous) => {
      const lines = previous.lines.map((line) => {
        if (line.lineId !== lineId) {
          return line;
        }
        return {
          ...line,
          addOns: line.addOns
            .map((entry) =>
              entry.addOnId === addOnId ? { ...entry, quantity: Math.max(entry.quantity - 1, 0) } : entry
            )
            .filter((entry) => entry.quantity > 0)
        };
      });
      return recomputeOrder({ ...previous, lines });
    });
  }, []);

  const updateLineQuantity = useCallback((lineId: string, quantity: number) => {
    setCurrentOrder((previous) => {
      const currentLine = previous.lines.find((line) => line.lineId === lineId);
      const lines = previous.lines
        .map((line) => (line.lineId === lineId ? { ...line, quantity: Math.max(0, quantity) } : line))
        .filter((line) => line.quantity > 0);

      const nextLine = lines.find((line) => line.lineId === lineId);
      const isIncreasing =
        Boolean(currentLine) && Boolean(nextLine) && (nextLine?.quantity ?? 0) > (currentLine?.quantity ?? 0);
      if (isIncreasing) {
        const guard = validateAllocationForLines(lines, previous.invoiceNumber);
        if (!guard.ok) {
          setAllocationWarning(guard.message);
          return previous;
        }
      }

      return recomputeOrder({ ...previous, lines });
    });
  }, [validateAllocationForLines]);

  const removeLine = useCallback((lineId: string) => {
    setCurrentOrder((previous) =>
      recomputeOrder({ ...previous, lines: previous.lines.filter((line) => line.lineId !== lineId) })
    );
  }, []);

  const applyCouponCode = useCallback(
    (couponCode: string) => {
      if (!catalog) {
        return { ok: false, message: "Catalog not loaded yet" };
      }

      const now = Date.now();
      const offer = catalog.offers.find((entry) => entry.couponCode.toLowerCase() === couponCode.toLowerCase());
      if (!offer || !offer.isActive) {
        return { ok: false, message: "Invalid or inactive coupon" };
      }

      if (new Date(offer.validFrom).getTime() > now || new Date(offer.validUntil).getTime() < now) {
        return { ok: false, message: "Coupon is outside validity window" };
      }

      let discountAmount = 0;
      const subtotal = currentOrder.totals.subtotal;
      if (offer.minimumOrderAmount && subtotal < offer.minimumOrderAmount) {
        return { ok: false, message: `Minimum order should be ${offer.minimumOrderAmount}` };
      }

      const freeItem =
        offer.discountType === "free_item" && offer.freeItemId
          ? catalog.items.find((entry) => entry.id === offer.freeItemId && entry.isActive)
          : null;

      if (offer.discountType === "free_item" && !freeItem) {
        return {
          ok: false,
          message: "Free item is not available in active catalog right now"
        };
      }

      if (offer.discountType === "percentage" && offer.discountValue) {
        discountAmount = (subtotal * offer.discountValue) / 100;
        if (offer.maximumDiscountAmount !== null && offer.maximumDiscountAmount !== undefined) {
          discountAmount = Math.min(discountAmount, offer.maximumDiscountAmount);
        }
      } else if (offer.discountType === "fixed_amount" && offer.discountValue) {
        discountAmount = Math.min(offer.discountValue, subtotal);
      } else if (offer.discountType === "free_item") {
        discountAmount = 0;
      }

      setCurrentOrder((previous) => {
        const baseLines = previous.lines.filter((line) => !line.isComplimentary);
        let nextLines = baseLines;
        let complimentaryLineId: string | null = null;

        if (offer.discountType === "free_item" && freeItem) {
          const complimentaryLine = {
            lineId: makeId(),
            lineType: "item",
            refId: freeItem.id,
            name: `${freeItem.name} (Free Item)`,
            quantity: 1,
            unitPrice: 0,
            gstPercentage: 0,
            addOns: [],
            notes: null,
            isComplimentary: true,
            complimentaryReason: `Free item via ${offer.couponCode}`,
            complimentarySourceCouponId: offer.id
          } satisfies CartLine;

          nextLines = [...baseLines, complimentaryLine];
          complimentaryLineId = complimentaryLine.lineId;
        }

        const guard = validateAllocationForLines(nextLines, previous.invoiceNumber);
        if (!guard.ok) {
          setAllocationWarning(guard.message);
          return previous;
        }

        return recomputeOrder({
          ...previous,
          lines: nextLines,
          appliedOffer: {
            couponCode: offer.couponCode,
            couponId: offer.id,
            discountType: offer.discountType,
            discountAmount,
            freeItemId: freeItem?.id ?? null,
            freeItemName: freeItem?.name ?? null,
            complimentaryLineId
          }
        });
      });

      return { ok: true, message: "Coupon applied" };
    },
    [catalog, currentOrder.totals.subtotal, validateAllocationForLines]
  );

  const setManualDiscount = useCallback((value: number) => {
    setCurrentOrder((previous) =>
      recomputeOrder({
        ...previous,
        manualDiscountAmount: Math.max(0, value)
      })
    );
  }, []);

  const clearOrder = useCallback(() => {
    setCurrentOrder((previous) => createDraftOrder(previous.orderType, previous.orderChannel));
  }, []);

  const saveAsPending = useCallback(async () => {
    if (!currentOrder.lines.length) {
      return;
    }
    const pendingOrder = recomputeOrder({
      ...currentOrder,
      status: "pending",
      paymentMode: null
    });
    await ordersRepository.save(pendingOrder);
    await ordersRepository.upsertPendingBill({
      localOrderId: pendingOrder.localOrderId,
      invoiceNumber: pendingOrder.invoiceNumber,
      customerName: pendingOrder.customer?.name ?? "Walk-in",
      customerPhone: pendingOrder.customer?.phone ?? "-",
      orderType: pendingOrder.orderType,
      orderChannel: pendingOrder.orderChannel,
      tableLabel: pendingOrder.tableLabel,
      kitchenStatus: pendingOrder.kitchenStatus,
      totalAmount: pendingOrder.totals.totalAmount,
      lineCount: pendingOrder.lines.length,
      updatedAt: new Date().toISOString()
    });
    await refreshPendingBills();
    await refreshRecentBills();
    await refreshCompletedBills();
    await refreshKitchenOrders();
    setCurrentOrder(createDraftOrder(currentOrder.orderType, currentOrder.orderChannel));
  }, [currentOrder, refreshCompletedBills, refreshKitchenOrders, refreshPendingBills, refreshRecentBills]);

  const sendToKitchen = useCallback(async () => {
    if (!catalog || !currentOrder.lines.length || !currentOrder.customer) {
      return { ok: false, message: "Select customer and add items before sending to kitchen." };
    }

    if (currentOrder.orderType === "dine_in" && !currentOrder.tableLabel) {
      return { ok: false, message: "Please enter table number/name for dine-in order." };
    }

    const allocationGuard = validateAllocationForLines(currentOrder.lines, currentOrder.invoiceNumber);
    if (!allocationGuard.ok) {
      setAllocationWarning(allocationGuard.message);
      return { ok: false, message: allocationGuard.message };
    }

    const now = new Date().toISOString();
    const queuedOrder = recomputeOrder({
      ...currentOrder,
      status: "pending",
      kitchenStatus: "queued",
      paymentMode: null,
      syncStatus: "pending",
      updatedAt: now
    });

    await ordersRepository.save(queuedOrder);
    await ordersRepository.upsertPendingBill({
      localOrderId: queuedOrder.localOrderId,
      invoiceNumber: queuedOrder.invoiceNumber,
      customerName: queuedOrder.customer?.name ?? "Walk-in",
      customerPhone: queuedOrder.customer?.phone ?? "-",
      orderType: queuedOrder.orderType,
      orderChannel: queuedOrder.orderChannel,
      tableLabel: queuedOrder.tableLabel,
      kitchenStatus: queuedOrder.kitchenStatus,
      totalAmount: queuedOrder.totals.totalAmount,
      lineCount: queuedOrder.lines.length,
      updatedAt: queuedOrder.updatedAt
    });

    const payload = posBillingService.buildInvoiceSyncPayload({
      order: queuedOrder,
      payments: [],
      snapshot: catalog,
      forceStatus: "pending"
    });

    const idempotencyKey = makeId();
    await syncQueueRepository.enqueue({
      id: makeId(),
      idempotencyKey,
      eventType: "invoice_upsert",
      payload: {
        eventType: "invoice_upsert",
        idempotencyKey,
        deviceId: env.deviceId,
        payload
      },
      status: "pending",
      retryCount: 0,
      lastError: null,
      nextRetryAt: null,
      createdAt: now,
      updatedAt: now
    });

    await refreshPendingBills();
    await refreshRecentBills();
    await refreshCompletedBills();
    await refreshKitchenOrders();
    setCurrentOrder(createDraftOrder(currentOrder.orderType, currentOrder.orderChannel));
    return { ok: true, message: "Order sent to kitchen." };
  }, [
    catalog,
    currentOrder,
    refreshCompletedBills,
    refreshKitchenOrders,
    refreshPendingBills,
    refreshRecentBills,
    validateAllocationForLines
  ]);

  const updateKitchenStatus = useCallback(
    async (localOrderId: string, kitchenStatus: KitchenStatus) => {
      const existing = await ordersRepository.getById(localOrderId);
      if (!existing) {
        return;
      }

      setKitchenOrders((previous) =>
        previous.map((order) =>
          order.localOrderId === localOrderId ? { ...order, kitchenStatus, updatedAt: new Date().toISOString() } : order
        )
      );
      setPendingBills((previous) =>
        previous.map((bill) =>
          bill.localOrderId === localOrderId ? { ...bill, kitchenStatus, updatedAt: new Date().toISOString() } : bill
        )
      );

      const updated = recomputeOrder({
        ...existing,
        kitchenStatus,
        status: existing.status === "draft" ? "pending" : existing.status
      });
      await ordersRepository.save(updated);

      if (catalog) {
        const idempotencyKey = makeId();
        const payload = posBillingService.buildInvoiceSyncPayload({
          order: updated,
          payments: [],
          snapshot: catalog,
          forceStatus: updated.status === "paid" ? "paid" : "pending"
        });
        await syncQueueRepository.enqueue({
          id: makeId(),
          idempotencyKey,
          eventType: "invoice_upsert",
          payload: {
            eventType: "invoice_upsert",
            idempotencyKey,
            deviceId: env.deviceId,
            payload
          },
          status: "pending",
          retryCount: 0,
          lastError: null,
          nextRetryAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      await Promise.all([refreshKitchenOrders(), refreshRecentBills(), refreshPendingBills()]);
    },
    [catalog, refreshKitchenOrders, refreshPendingBills, refreshRecentBills]
  );

  const resumePending = useCallback(
    async (localOrderId: string) => {
      const order = await ordersRepository.getById(localOrderId);
      if (!order) {
        return;
      }
      setCurrentOrder(order);
      await ordersRepository.removePendingBill(localOrderId);
      await refreshPendingBills();
      await refreshRecentBills();
      await refreshCompletedBills();
      await refreshKitchenOrders();
    },
    [refreshCompletedBills, refreshKitchenOrders, refreshPendingBills, refreshRecentBills]
  );

  const completePayment = useCallback(
    async (input: { mode: InvoicePaymentInput["mode"]; receivedAmount?: number; referenceNo?: string }) => {
      if (!catalog || currentOrder.lines.length === 0) {
        return;
      }

      const allocationGuard = validateAllocationForLines(currentOrder.lines, currentOrder.invoiceNumber);
      if (!allocationGuard.ok) {
        setAllocationWarning(allocationGuard.message);
        return;
      }

      const now = new Date().toISOString();
      const payment: InvoicePaymentInput = {
        mode: input.mode,
        amount: currentOrder.totals.totalAmount,
        receivedAmount: input.mode === "cash" ? input.receivedAmount ?? currentOrder.totals.totalAmount : null,
        changeAmount:
          input.mode === "cash"
            ? Math.max((input.receivedAmount ?? currentOrder.totals.totalAmount) - currentOrder.totals.totalAmount, 0)
            : null,
        referenceNo: input.referenceNo ?? null,
        paidAt: now
      };

      const paidOrder = recomputeOrder({
        ...currentOrder,
        status: "paid",
        kitchenStatus: "served",
        paymentMode: input.mode,
        syncStatus: "pending",
        updatedAt: now
      });

      await ordersRepository.save(paidOrder);
      await ordersRepository.removePendingBill(paidOrder.localOrderId);

      const payload = posBillingService.buildInvoiceSyncPayload({
        order: paidOrder,
        payments: [payment],
        snapshot: catalog,
        forceStatus: "paid"
      });

      const usageEvents = posBillingService.buildUsageEvents(paidOrder, catalog);

      const idempotencyKey = makeId();
      const queueRow: SyncQueueRow = {
        id: makeId(),
        idempotencyKey,
        eventType: "invoice_upsert",
        payload: {
          eventType: "invoice_upsert",
          idempotencyKey,
          deviceId: env.deviceId,
          payload
        },
        status: "pending",
        retryCount: 0,
        lastError: null,
        nextRetryAt: null,
        createdAt: now,
        updatedAt: now
      };
      await syncQueueRepository.enqueue(queueRow);
      setCatalog((previous) => (previous ? applyUsageToCatalogSnapshot(previous, usageEvents) : previous));
      await refreshPendingBills();
      await refreshRecentBills();
      await refreshCompletedBills();
      await refreshKitchenOrders();
      setCurrentOrder(createDraftOrder(currentOrder.orderType, currentOrder.orderChannel));
    },
    [
      catalog,
      currentOrder,
      refreshCompletedBills,
      refreshKitchenOrders,
      refreshPendingBills,
      refreshRecentBills,
      validateAllocationForLines
    ]
  );

  const quickCreateCustomer = useCallback(async (input: { name: string; phone: string; email?: string }) => {
    const created = await customersService.quickCreate(input);
    setCurrentOrder((previous) => recomputeOrder({ ...previous, customer: created }));
    return created;
  }, []);

  const searchCustomers = useCallback(async (query: string) => customersService.search(query), []);
  const findCustomerByPhone = useCallback(async (phone: string) => customersService.findByPhone(phone), []);
  const getOrderById = useCallback(async (localOrderId: string) => ordersRepository.getById(localOrderId), []);
  const clearAllocationWarning = useCallback(() => setAllocationWarning(null), []);

  const value = useMemo<PosContextValue>(
    () => ({
      catalog,
      currentOrder,
      pendingBills,
      recentBills,
      completedBills,
      kitchenOrders,
      isBootstrapping,
      allocationWarning,
      closingStatus,
      isPunchedIn,
      setOrderType,
      setOrderChannel,
      setTableLabel,
      attachCustomer,
      addItem,
      addCombo,
      addProduct,
      addStandaloneAddOn,
      addAddOnToLine,
      removeAddOnFromLine,
      updateLineQuantity,
      removeLine,
      applyCouponCode,
      setManualDiscount,
      saveAsPending,
      sendToKitchen,
      updateKitchenStatus,
      resumePending,
      clearOrder,
      completePayment,
      quickCreateCustomer,
      searchCustomers,
      findCustomerByPhone,
      getOrderById,
      refreshPendingBills,
      refreshRecentBills,
      refreshCompletedBills,
      refreshKitchenOrders,
      refreshClosingStatus,
      refreshCatalogSnapshot,
      refreshShiftStatus,
      clearAllocationWarning
    }),
    [
      catalog,
      currentOrder,
      pendingBills,
      recentBills,
      completedBills,
      kitchenOrders,
      isBootstrapping,
      allocationWarning,
      closingStatus,
      isPunchedIn,
      setOrderType,
      setOrderChannel,
      setTableLabel,
      attachCustomer,
      addItem,
      addCombo,
      addProduct,
      addStandaloneAddOn,
      addAddOnToLine,
      removeAddOnFromLine,
      updateLineQuantity,
      removeLine,
      applyCouponCode,
      setManualDiscount,
      saveAsPending,
      sendToKitchen,
      updateKitchenStatus,
      resumePending,
      clearOrder,
      completePayment,
      quickCreateCustomer,
      searchCustomers,
      findCustomerByPhone,
      getOrderById,
      refreshPendingBills,
      refreshRecentBills,
      refreshCompletedBills,
      refreshKitchenOrders,
      refreshClosingStatus,
      refreshCatalogSnapshot,
      refreshShiftStatus,
      clearAllocationWarning
    ]
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
};

export const usePos = () => {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error("usePos must be used inside PosProvider");
  }
  return context;
};
