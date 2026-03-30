export type PaymentMode = "cash" | "card" | "upi" | "mixed";
export type OrderType = "takeaway" | "dine_in" | "delivery" | "snooker";
export type OrderChannel = "dine-in" | "take-away" | "swiggy" | "zomato" | "snooker";
export type PosLineType = "item" | "add_on" | "combo" | "product";
export type PosOrderStatus = "draft" | "pending" | "paid" | "cancelled";
export type SyncStatus = "pending" | "syncing" | "synced" | "failed" | "needs_attention";
export type KitchenStatus = "not_sent" | "queued" | "preparing" | "ready" | "served";

export type StaffSession = {
  userId: string;
  username: string;
  fullName: string;
  role: string;
  assignedReports: string[];
  assignedModules: string[];
};

export type CustomerRecord = {
  localId: string;
  serverId: string | null;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type CatalogCategory = {
  id: string;
  name: string;
  isActive: boolean;
};

export type CatalogItem = {
  id: string;
  name: string;
  categoryId: string;
  sellingPrice: number;
  gstPercentage: number;
  isActive: boolean;
};

export type CatalogAddOn = {
  id: string;
  name: string;
  sellingPrice: number;
  gstPercentage: number;
  isActive: boolean;
};

export type CatalogCombo = {
  id: string;
  name: string;
  sellingPrice: number;
  gstPercentage: number;
  isActive: boolean;
};

export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  unit: string;
  sellingPrice: number;
  currentStock: number;
  isActive: boolean;
};

export type CatalogRecipe = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientBaseUnit: string;
  quantity: number;
  unit: string;
  normalizedQuantity: number;
  costContribution: number;
};

export type CatalogItemRecipe = CatalogRecipe & {
  itemId: string;
};

export type CatalogAddOnRecipe = CatalogRecipe & {
  addOnId: string;
};

export type CatalogComboItem = {
  id: string;
  comboId: string;
  itemId: string;
  itemName: string;
  quantity: number;
};

export type CatalogOffer = {
  id: string;
  couponCode: string;
  discountType: "percentage" | "fixed_amount" | "free_item";
  discountValue: number | null;
  minimumOrderAmount: number | null;
  maximumDiscountAmount: number | null;
  maxUses: number | null;
  firstTimeUserOnly: boolean;
  validFrom: string;
  validUntil: string;
  freeItemCategoryId: string | null;
  freeItemId: string | null;
  isActive: boolean;
};

export type CatalogAllocation = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  date: string;
  allocatedQuantity: number;
  usedQuantity: number;
  remainingQuantity: number;
  updatedAt: string;
};

export type CatalogIngredientStock = {
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  availableQuantity: number;
  updatedAt: string;
};

export type CatalogSnapshot = {
  version: string;
  generatedAt: string;
  categories: CatalogCategory[];
  items: CatalogItem[];
  itemRecipes: CatalogItemRecipe[];
  addOns: CatalogAddOn[];
  addOnRecipes: CatalogAddOnRecipe[];
  combos: CatalogCombo[];
  comboItems: CatalogComboItem[];
  products: CatalogProduct[];
  offers: CatalogOffer[];
  ingredientStocks?: CatalogIngredientStock[];
  allocations: CatalogAllocation[];
  controls: {
    isBillingEnabled: boolean;
    enforceDailyAllocation: boolean;
    reason: string | null;
    updatedAt: string | null;
  };
};

export type CartAddOnSelection = {
  addOnId: string;
  name: string;
  unitPrice: number;
  gstPercentage: number;
  quantity: number;
};

export type CartLine = {
  lineId: string;
  lineType: PosLineType;
  refId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  gstPercentage: number;
  addOns: CartAddOnSelection[];
  notes: string | null;
  isComplimentary?: boolean;
  complimentaryReason?: string | null;
  complimentarySourceCouponId?: string | null;
};

export type AppliedOffer = {
  couponCode: string;
  couponId: string;
  discountType: "percentage" | "fixed_amount" | "free_item";
  discountAmount: number;
  freeItemId?: string | null;
  freeItemName?: string | null;
  complimentaryLineId?: string | null;
};

export type CartTotals = {
  subtotal: number;
  itemDiscountAmount: number;
  couponDiscountAmount: number;
  manualDiscountAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export type PosOrder = {
  localOrderId: string;
  serverInvoiceId: string | null;
  invoiceNumber: string;
  orderType: OrderType;
  orderChannel: OrderChannel | null;
  tableLabel: string | null;
  kitchenStatus: KitchenStatus;
  status: PosOrderStatus;
  paymentMode: PaymentMode | null;
  customer: CustomerRecord | null;
  lines: CartLine[];
  appliedOffer: AppliedOffer | null;
  manualDiscountAmount: number;
  notes: string | null;
  totals: CartTotals;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type InvoicePaymentInput = {
  mode: PaymentMode;
  amount: number;
  receivedAmount?: number | null;
  changeAmount?: number | null;
  referenceNo?: string | null;
  paidAt: string;
};

export type UsageEventDraft = {
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

export type GamingBookingType = "snooker" | "console";
export type GamingBookingStatus = "upcoming" | "ongoing" | "completed" | "cancelled";
export type GamingPaymentStatus = "pending" | "paid" | "refunded";
export type GamingPaymentMode = "cash" | "upi" | "card";
export type GamingResourceCode =
  | "board_1"
  | "board_2"
  | "board_3"
  | "board_4"
  | "board_5"
  | "board_6"
  | "ps2"
  | "ps4"
  | "ps5"
  | "xbox";

export type GamingCustomerMember = {
  name: string;
  phone: string;
};

export type GamingBooking = {
  localBookingId: string;
  serverBookingId: string | null;
  bookingNumber: string;
  bookingType: GamingBookingType;
  resourceCode: GamingResourceCode;
  resourceCodes: GamingResourceCode[];
  resourceLabel: string;
  playerCount: number;
  customers: GamingCustomerMember[];
  primaryCustomerName: string;
  primaryCustomerPhone: string;
  checkInAt: string;
  checkOutAt: string | null;
  hourlyRate: number;
  finalAmount: number;
  status: GamingBookingStatus;
  paymentStatus: GamingPaymentStatus;
  paymentMode: GamingPaymentMode | null;
  foodOrderReference: string | null;
  foodInvoiceNumber: string | null;
  foodInvoiceStatus: "none" | "pending" | "paid" | "cancelled";
  foodAndBeverageAmount: number;
  note: string | null;
  bookingChannel: string | null;
  sourceDeviceId: string | null;
  staffId: string;
  staffName: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type GamingBookingListFilter = {
  status?: GamingBookingStatus | "all";
  paymentStatus?: GamingPaymentStatus | "all";
  bookingType?: GamingBookingType | "all";
  search?: string;
};

export type InvoiceUpsertPayload = {
  invoiceNumber: string;
  orderReference: string | null;
  customerId: string | null;
  customerPhone: string | null;
  customerName: string | null;
  branchId: string | null;
  deviceId: string | null;
  orderType: OrderType;
  tableLabel: string | null;
  kitchenStatus: KitchenStatus;
  status: "pending" | "paid" | "cancelled" | "refunded";
  paymentMode: PaymentMode;
  subtotal: number;
  itemDiscountAmount: number;
  couponDiscountAmount: number;
  manualDiscountAmount: number;
  taxAmount: number;
  totalAmount: number;
  couponCode: string | null;
  notes: string | null;
  customerSnapshot: Record<string, unknown> | null;
  totalsSnapshot: Record<string, unknown> | null;
  linesSnapshot: Record<string, unknown> | null;
  sourceCreatedAt: string;
  lines: Array<{
    lineType: "item" | "add_on" | "combo" | "product" | "custom";
    referenceId: string | null;
    nameSnapshot: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    gstPercentage: number;
    lineTotal: number;
    meta: Record<string, unknown> | null;
  }>;
  payments: Array<{
    mode: PaymentMode;
    status?: "success" | "failed" | "refunded";
    amount: number;
    receivedAmount?: number | null;
    changeAmount?: number | null;
    referenceNo?: string | null;
    paidAt?: string;
  }>;
  usageEvents: UsageEventDraft[];
};

export type SyncQueueEvent =
  | {
      eventType: "customer_upsert";
      idempotencyKey: string;
      deviceId: string;
      payload: {
        name: string;
        phone: string;
        email?: string;
        notes?: string;
        sourceDeviceId?: string;
      };
    }
  | {
      eventType: "invoice_upsert";
      idempotencyKey: string;
      deviceId: string;
      payload: InvoiceUpsertPayload;
    }
  | {
      eventType: "usage_event";
      idempotencyKey: string;
      deviceId: string;
      payload: {
        invoiceId?: string | null;
        ingredientId?: string | null;
        ingredientNameSnapshot: string;
        consumedQuantity: number;
        baseUnit: string;
        allocatedQuantity?: number;
        overusedQuantity?: number;
        usageDate: string;
        deviceId?: string | null;
        meta?: Record<string, unknown> | null;
      };
    }
  | {
      eventType: "gaming_booking_upsert";
      idempotencyKey: string;
      deviceId: string;
      payload: {
        bookingNumber: string;
        bookingType: GamingBookingType;
        resourceCode: GamingResourceCode;
        resourceCodes?: GamingResourceCode[];
        playerCount?: number;
        checkInAt?: string;
        checkOutAt?: string;
        hourlyRate: number;
        customers: GamingCustomerMember[];
        bookingChannel?: string;
        note?: string;
        sourceDeviceId?: string;
        status?: GamingBookingStatus;
        paymentStatus?: GamingPaymentStatus;
        paymentMode?: GamingPaymentMode;
        finalAmount?: number;
        foodOrderReference?: string;
        foodInvoiceNumber?: string;
        foodInvoiceStatus?: "none" | "pending" | "paid" | "cancelled";
        foodAndBeverageAmount?: number;
        staffId?: string;
      };
    };

export type SyncQueueRow = {
  id: string;
  idempotencyKey: string;
  eventType: SyncQueueEvent["eventType"];
  payload: SyncQueueEvent;
  status: SyncStatus;
  retryCount: number;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PendingBillSummary = {
  localOrderId: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  orderType: OrderType;
  orderChannel: OrderChannel | null;
  tableLabel: string | null;
  kitchenStatus: KitchenStatus;
  totalAmount: number;
  lineCount: number;
  updatedAt: string;
};

export type RecentBillSummary = {
  localOrderId: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  orderType: OrderType;
  orderChannel: OrderChannel | null;
  tableLabel: string | null;
  kitchenStatus: KitchenStatus;
  status: PosOrderStatus;
  paymentMode: PaymentMode | null;
  totalAmount: number;
  lineCount: number;
  updatedAt: string;
};

export type ClosingDraftRow = {
  ingredientId: string;
  ingredientName: string;
  categoryName: string;
  unit: string;
  allocatedQuantity: number;
  usedQuantity: number;
  expectedRemainingQuantity: number;
};

export type ClosingStatus = {
  canTakeOrders: boolean;
  reason: string | null;
  pendingCloseDate: string | null;
  hasClosedPreviousBusinessDate: boolean;
  hasClosedTodayBusinessDate: boolean;
  todayClosingCount: number;
  maxClosingsPerDay: number;
  posBillingControl: {
    isBillingEnabled: boolean;
    enforceDailyAllocation: boolean;
    reason: string | null;
  };
  draft: {
    reportDate: string;
    rows: ClosingDraftRow[];
  };
};

export type ClosingReportSummary = {
  id: string;
  staffId: string;
  staffName: string;
  reportDate: string;
  closingSlot: number;
  isCarryForwardClosing: boolean;
  totalIngredients: number;
  totalExpectedRemaining: number;
  totalReportedRemaining: number;
  totalVariance: number;
  note: string | null;
  submittedAt: string;
};

export const CASH_AUDIT_DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export type CashAuditLastInfo = {
  hasAudit: boolean;
  lastAuditAt: string | null;
  lastAuditDate: string | null;
  lastAuditedBy: string | null;
};

export type CashAuditEntry = {
  id: string;
  auditDate: string;
  countedAmount: number;
  staffCashTakenAmount: number;
  enteredCashAmount: number;
  enteredCardAmount: number;
  enteredUpiAmount: number;
  enteredTotalAmount: number;
  expectedCashAmount: number;
  expectedCardAmount: number;
  expectedUpiAmount: number;
  expectedTotalAmount: number;
  differenceCashAmount: number;
  differenceCardAmount: number;
  differenceUpiAmount: number;
  differenceTotalAmount: number;
  excessAmount: number;
  totalPieces: number;
  createdAt: string;
  approvedByAdminName: string;
};

export type CashAuditExpectedBreakdown = {
  auditDate: string;
  section?: "dip_and_dash" | "gaming";
  expectedCashAmount: number;
  expectedCardAmount: number;
  expectedUpiAmount: number;
  expectedTotalAmount: number;
};

export type DumpEntryType = "ingredient" | "item" | "product";

export type DumpEntryOptions = {
  ingredients: Array<{
    id: string;
    name: string;
    unit: string;
    baseUnit: string;
    unitOptions: string[];
    currentStock: number;
    perUnitPrice: number;
  }>;
  items: Array<{
    id: string;
    name: string;
    baseUnit: string;
    unitOptions: string[];
    estimatedIngredientCost: number;
  }>;
  products: Array<{
    id: string;
    name: string;
    unit: string;
    baseUnit: string;
    unitOptions: string[];
    currentStock: number;
    purchaseUnitPrice: number;
  }>;
};

export type DumpIngredientImpact = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lossAmount: number;
};

export type DumpEntryRecord = {
  id: string;
  entryDate: string;
  entryType: DumpEntryType;
  sourceName: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  baseUnit: string;
  lossAmount: number;
  ingredientImpacts: DumpIngredientImpact[];
  note: string | null;
  createdByUserId: string;
  createdByUserName: string;
  createdByUsername: string;
  createdAt: string;
  updatedAt: string;
};

export type OutletTransferLineType = "ingredient" | "product" | "item";

export type OutletTransferOutlet = {
  id: string;
  outletCode: string;
  outletName: string;
  location: string;
};

export type OutletTransferOptionRow = {
  id: string;
  name: string;
  unit: string;
  unitPrice: number;
  availableStock: number;
};

export type OutletTransferOptions = {
  outlets: OutletTransferOutlet[];
  ingredients: OutletTransferOptionRow[];
  products: OutletTransferOptionRow[];
  items: OutletTransferOptionRow[];
};

export type OutletTransferLineImpact = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
};

export type OutletTransferRecordLine = {
  lineType: OutletTransferLineType;
  sourceId: string;
  sourceName: string;
  quantity: number;
  unit: string;
  lineValue: number;
  impacts: OutletTransferLineImpact[];
};

export type OutletTransferRecord = {
  id: string;
  transferNumber: string;
  transferDate: string;
  fromOutletId: string;
  fromOutletName: string;
  toOutletId: string;
  toOutletName: string;
  lineCount: number;
  totalQuantity: number;
  totalValue: number;
  note: string | null;
  lines: OutletTransferRecordLine[];
  createdByUserId: string;
  createdByUserName: string;
  createdByUsername: string;
  createdAt: string;
  updatedAt: string;
};

export type OutletTransferListResponse = {
  records: OutletTransferRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    totalTransfers: number;
    totalLines: number;
    totalValue: number;
  };
};
