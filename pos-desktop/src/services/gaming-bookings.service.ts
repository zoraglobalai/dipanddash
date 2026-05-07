import { env } from "@/config/env";
import { apiClient } from "@/lib/api-client";
import { makeId } from "@/utils/idempotency";
import type {
  GamingBooking,
  GamingBookingListFilter,
  GamingBookingStatus,
  GamingBookingType,
  GamingPaymentChannel,
  GamingCustomerMember,
  GamingDiscountType,
  GamingPaymentMode,
  GamingPaymentStatus,
  GamingResourceCode,
  StaffSession
} from "@/types/pos";

type ApiSuccess<T> = {
  success: boolean;
  message: string;
  data: T;
};

type GamingBookingApiRow = {
  id: string;
  bookingNumber: string;
  bookingType: GamingBookingType;
  resourceCode: GamingResourceCode;
  resourceCodes?: GamingResourceCode[];
  resourceLabel: string;
  customers: GamingCustomerMember[];
  customerCount?: number;
  playerCount?: number;
  primaryCustomerName?: string | null;
  primaryCustomerPhone?: string | null;
  checkInAt: string;
  checkOutAt: string | null;
  hourlyRate: number;
  finalAmount: number;
  systemCalculatedAmount?: number;
  extraMemberCount?: number;
  extraMemberCharge?: number;
  discountType?: GamingDiscountType;
  discountValue?: number;
  discountAmount?: number;
  amountOverrideReason?: string | null;
  status: GamingBookingStatus;
  paymentStatus: GamingPaymentStatus;
  paymentMode: GamingPaymentMode | null;
  paymentReference?: string | null;
  paymentBreakdown?: {
    cash?: number;
    card?: number;
    upi?: number;
    total?: number;
  };
  foodOrderReference: string | null;
  foodInvoiceNumber: string | null;
  foodInvoiceStatus: "none" | "pending" | "paid" | "cancelled";
  foodAndBeverageAmount: number;
  note: string | null;
  bookingChannel: string | null;
  sourceDeviceId: string | null;
  staffId: string;
  staffName: string;
  staffUsername?: string;
  createdAt: string;
  updatedAt: string;
};

type PaymentBreakdown = Record<GamingPaymentChannel, number>;
type PaymentBreakdownInput = Partial<Record<GamingPaymentChannel, number>>;

type GamingBookingsListResponse = {
  bookings: GamingBookingApiRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const SNOOKER_RESOURCES: Array<{ code: GamingResourceCode; label: string }> = [
  { code: "board_1", label: "Snooker Board 1" },
  { code: "board_2", label: "Snooker Board 2" },
  { code: "board_3", label: "Snooker Board 3" },
  { code: "board_4", label: "Snooker Board 4" },
  { code: "board_5", label: "Snooker Board 5" },
  { code: "board_6", label: "Snooker Board 6" }
];

const CONSOLE_RESOURCES: Array<{ code: GamingResourceCode; label: string }> = [
  { code: "ps2", label: "PlayStation 2" },
  { code: "ps4", label: "PlayStation 4" },
  { code: "ps5", label: "PlayStation 5" },
  { code: "xbox", label: "Xbox" }
];

const ALL_RESOURCES = [...SNOOKER_RESOURCES, ...CONSOLE_RESOURCES];

const SNOOKER_INCLUDED_MEMBERS = 4;
const EXTRA_MEMBER_CHARGE = 50;
const AMOUNT_DIFF_THRESHOLD = 0.01;
const GAMING_PAYMENT_CHANNELS: readonly GamingPaymentChannel[] = ["cash", "card", "upi"];
const EMPTY_PAYMENT_BREAKDOWN: PaymentBreakdown = {
  cash: 0,
  card: 0,
  upi: 0
};

const normalizePhone = (value: string) => value.replace(/[^\d+]/g, "").trim();
const roundCurrency = (value: number) => Number(value.toFixed(2));
const nowIso = () => new Date().toISOString();
const cleanText = (value?: string | null) => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};
const extractPaymentReferenceFromNote = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/(?:UPI Ref|Txn Ref):\s*([^|]+)/i);
  return match?.[1]?.trim() || null;
};
const stripPaymentReferenceFromNote = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/\s*\|?\s*(?:UPI Ref|Txn Ref):\s*[^|]+/gi, "").trim();
  return cleaned.length ? cleaned : null;
};
const attachPaymentReferenceToNote = (baseNote: string | null, paymentReference: string | null) => {
  const withoutReference = stripPaymentReferenceFromNote(baseNote);
  if (!paymentReference) {
    return withoutReference;
  }
  return withoutReference ? `${withoutReference} | Txn Ref: ${paymentReference}` : `Txn Ref: ${paymentReference}`;
};
const hasDigitalPaymentBreakdown = (breakdown: PaymentBreakdown) =>
  breakdown.card > AMOUNT_DIFF_THRESHOLD || breakdown.upi > AMOUNT_DIFF_THRESHOLD;
const hasAmountDiff = (left: number, right: number) => Math.abs(left - right) > AMOUNT_DIFF_THRESHOLD;

const normalizePaymentBreakdown = (input?: PaymentBreakdownInput | null): PaymentBreakdown => {
  const normalized: PaymentBreakdown = { ...EMPTY_PAYMENT_BREAKDOWN };
  if (!input) {
    return normalized;
  }
  GAMING_PAYMENT_CHANNELS.forEach((mode) => {
    normalized[mode] = roundCurrency(Math.max(0, Number(input[mode] ?? 0) || 0));
  });
  return normalized;
};

const getPaymentBreakdownTotal = (value: PaymentBreakdown) =>
  roundCurrency(value.cash + value.card + value.upi);

const derivePaymentModeFromBreakdown = (breakdown: PaymentBreakdown): GamingPaymentMode | null => {
  const activeModes = GAMING_PAYMENT_CHANNELS.filter((mode) => breakdown[mode] > AMOUNT_DIFF_THRESHOLD);
  if (!activeModes.length) {
    return null;
  }
  if (activeModes.length === 1) {
    return activeModes[0];
  }
  return "mixed";
};

const getCollectibleAmount = (
  booking: Pick<GamingBooking, "status" | "finalAmount" | "systemCalculatedAmount"> & { discountAmount?: number }
) => {
  const finalAmount = roundCurrency(Math.max(0, Number(booking.finalAmount) || 0));
  const systemAmount = roundCurrency(Math.max(0, Number(booking.systemCalculatedAmount) || 0));
  if (booking.status === "completed") {
    return finalAmount > 0 ? finalAmount : getDiscountedAmount(systemAmount, Number(booking.discountAmount ?? 0));
  }
  return getDiscountedAmount(systemAmount, Number(booking.discountAmount ?? 0));
};

const normalizeDiscount = (
  input: {
    discountType?: GamingDiscountType | null;
    discountValue?: number | null;
    discountAmount?: number | null;
  },
  systemAmount: number
) => {
  const safeSystemAmount = roundCurrency(Math.max(0, systemAmount));
  const type = input.discountType ?? (Number(input.discountAmount ?? 0) > AMOUNT_DIFF_THRESHOLD ? "manual" : "none");
  if (type === "percentage") {
    const value = roundCurrency(Math.min(100, Math.max(0, Number(input.discountValue ?? 0) || 0)));
    return {
      discountType: "percentage" as const,
      discountValue: value,
      discountAmount: roundCurrency(Math.min(safeSystemAmount, (safeSystemAmount * value) / 100))
    };
  }
  if (type === "manual") {
    const value = roundCurrency(Math.max(0, Number(input.discountValue ?? input.discountAmount ?? 0) || 0));
    return {
      discountType: "manual" as const,
      discountValue: value,
      discountAmount: roundCurrency(Math.min(safeSystemAmount, value))
    };
  }
  return {
    discountType: "none" as const,
    discountValue: 0,
    discountAmount: 0
  };
};

type GamingBookingResponse = {
  booking: GamingBookingApiRow;
};

const getDiscountedAmount = (systemAmount: number, discountAmount: number) =>
  roundCurrency(Math.max(0, roundCurrency(systemAmount) - roundCurrency(Math.max(0, discountAmount))));

const getPaymentBreakdownFromBooking = (
  booking: Pick<GamingBooking, "paidCashAmount" | "paidCardAmount" | "paidUpiAmount">
) =>
  normalizePaymentBreakdown({
    cash: booking.paidCashAmount,
    card: booking.paidCardAmount,
    upi: booking.paidUpiAmount
  });

const buildBookingNumber = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GM-${y}${m}${d}-${hh}${mm}-${random}`;
};

const getResourceLabel = (resourceCode: GamingResourceCode) =>
  ALL_RESOURCES.find((entry) => entry.code === resourceCode)?.label ?? resourceCode;

const getExtraMemberCount = (bookingType: GamingBookingType, playerCount: number) => {
  if (bookingType !== "snooker") {
    return 0;
  }
  return Math.max(0, playerCount - SNOOKER_INCLUDED_MEMBERS);
};

const getExtraMemberCharge = (bookingType: GamingBookingType, playerCount: number) =>
  roundCurrency(getExtraMemberCount(bookingType, playerCount) * EXTRA_MEMBER_CHARGE);

const computeCalculatedAmount = (
  booking: Pick<GamingBooking, "checkInAt" | "checkOutAt" | "hourlyRate" | "status" | "bookingType" | "playerCount">
) => {
  const checkInAt = new Date(booking.checkInAt);
  const end =
    booking.checkOutAt !== null
      ? new Date(booking.checkOutAt)
      : booking.status === "upcoming"
        ? checkInAt
        : new Date();
  const diffMs = end.getTime() - checkInAt.getTime();
  if (diffMs <= 0) {
    return getExtraMemberCharge(booking.bookingType, booking.playerCount);
  }
  const minutes = Math.ceil(diffMs / 60000);
  const baseAmount = roundCurrency((minutes / 60) * booking.hourlyRate);
  return roundCurrency(baseAmount + getExtraMemberCharge(booking.bookingType, booking.playerCount));
};

const computeSystemCalculatedAmount = (
  booking: Pick<GamingBooking, "checkInAt" | "checkOutAt" | "hourlyRate" | "status" | "bookingType" | "playerCount" | "foodAndBeverageAmount">
) => roundCurrency(computeCalculatedAmount(booking) + Math.max(0, Number(booking.foodAndBeverageAmount) || 0));

const buildServerBookingPayload = (booking: GamingBooking) => ({
  bookingNumber: booking.bookingNumber,
  bookingType: booking.bookingType,
  resourceCode: booking.resourceCode,
  resourceCodes: booking.resourceCodes,
  playerCount: booking.playerCount,
  checkInAt: booking.checkInAt,
  checkOutAt: booking.checkOutAt ?? undefined,
  hourlyRate: booking.hourlyRate,
  customers: booking.customers,
  bookingChannel: booking.bookingChannel ?? undefined,
  note: booking.note ?? undefined,
  sourceDeviceId: booking.sourceDeviceId ?? undefined,
  status: booking.status,
  paymentStatus: booking.paymentStatus,
  paymentMode: booking.paymentMode ?? undefined,
  paymentReference: booking.paymentReference ?? extractPaymentReferenceFromNote(booking.note) ?? undefined,
  paymentBreakdown:
    booking.paymentStatus === "paid"
      ? {
          cash: roundCurrency(Math.max(0, booking.paidCashAmount || 0)),
          card: roundCurrency(Math.max(0, booking.paidCardAmount || 0)),
          upi: roundCurrency(Math.max(0, booking.paidUpiAmount || 0))
        }
      : undefined,
  finalAmount: booking.finalAmount,
  systemCalculatedAmount: booking.systemCalculatedAmount,
  extraMemberCount: booking.extraMemberCount,
  extraMemberCharge: booking.extraMemberCharge,
  discountType: booking.discountType ?? "none",
  discountValue: booking.discountValue ?? 0,
  discountAmount: booking.discountAmount ?? 0,
  amountOverrideReason: booking.amountOverrideReason ?? undefined,
  foodOrderReference: booking.foodOrderReference ?? undefined,
  foodInvoiceNumber: booking.foodInvoiceNumber ?? undefined,
  foodInvoiceStatus: booking.foodInvoiceStatus,
  foodAndBeverageAmount: booking.foodAndBeverageAmount,
  staffId: booking.staffId
});

const findServerBookingIdByNumber = async (bookingNumber: string) => {
  const normalized = bookingNumber.trim();
  if (!normalized) {
    return null;
  }
  const response = await apiClient.get<ApiSuccess<GamingBookingsListResponse>>("/gaming/bookings", {
    params: {
      search: normalized,
      page: 1,
      limit: 20
    }
  });
  const exact = response.data.data.bookings.find((row) => row.bookingNumber === normalized);
  return exact?.id ?? null;
};

const sanitizeCustomers = (customers: Array<{ name: string; phone: string }>): GamingCustomerMember[] => {
  const sanitized = customers
    .map((entry) => ({ name: entry.name.trim(), phone: normalizePhone(entry.phone) }))
    .filter((entry) => entry.name.length > 0 || entry.phone.length > 0);

  if (!sanitized.length || !sanitized.some((entry) => entry.name.length > 0 && entry.phone.length >= 8)) {
    throw new Error("Add at least one customer with name and phone.");
  }
  if (sanitized.some((entry) => (entry.name.length > 0 || entry.phone.length > 0) && (entry.name.length === 0 || entry.phone.length < 8))) {
    throw new Error("Each filled customer row must include name and a valid phone number.");
  }
  return sanitized;
};

const resolvePrimaryCustomer = (customers: GamingCustomerMember[]) =>
  customers.find((entry) => entry.name.length > 0 && entry.phone.length >= 8) ??
  customers.find((entry) => entry.name.length > 0) ??
  customers[0] ?? { name: "-", phone: "-" };

const sanitizePayment = (
  input: {
    paymentStatus?: GamingPaymentStatus;
    paymentMode?: GamingPaymentMode | null;
    paymentBreakdown?: PaymentBreakdownInput;
  },
  fallback: {
    paymentStatus: GamingPaymentStatus;
    paymentMode: GamingPaymentMode | null;
    paymentBreakdown: PaymentBreakdown;
  },
  targetAmount: number
) => {
  const paymentStatus = input.paymentStatus ?? fallback.paymentStatus;
  const paymentMode = input.paymentMode ?? null;

  if (paymentStatus !== "paid") {
    return {
      paymentStatus,
      paymentMode: null,
      paymentBreakdown: { ...EMPTY_PAYMENT_BREAKDOWN }
    };
  }

  const explicitBreakdown = normalizePaymentBreakdown(input.paymentBreakdown);
  let resolvedBreakdown =
    getPaymentBreakdownTotal(explicitBreakdown) > AMOUNT_DIFF_THRESHOLD
      ? explicitBreakdown
      : { ...fallback.paymentBreakdown };

  const normalizedTarget = roundCurrency(Math.max(0, Number(targetAmount) || 0));
  if (getPaymentBreakdownTotal(resolvedBreakdown) <= AMOUNT_DIFF_THRESHOLD) {
    if (!paymentMode || paymentMode === "mixed") {
      throw new Error("Select payment mode or enter split breakdown for paid booking.");
    }
    resolvedBreakdown = {
      ...EMPTY_PAYMENT_BREAKDOWN,
      [paymentMode]: normalizedTarget
    };
  }

  const resolvedTotal = getPaymentBreakdownTotal(resolvedBreakdown);
  if (normalizedTarget > AMOUNT_DIFF_THRESHOLD && hasAmountDiff(resolvedTotal, normalizedTarget)) {
    throw new Error("Split total must match payable amount.");
  }

  const derivedPaymentMode = derivePaymentModeFromBreakdown(resolvedBreakdown);
  if (!derivedPaymentMode) {
    throw new Error("Split values are required for paid booking.");
  }
  if (paymentMode && paymentMode !== "mixed" && derivedPaymentMode !== paymentMode) {
    throw new Error("Payment mode and split amounts mismatch.");
  }

  return {
    paymentStatus,
    paymentMode: derivedPaymentMode,
    paymentBreakdown: resolvedBreakdown
  };
};

const sanitizePlayerCount = (input: unknown, fallbackFromCustomers: number) => {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return Math.max(1, fallbackFromCustomers);
  }
  return Math.max(1, Math.floor(parsed), fallbackFromCustomers);
};

const normalizeResourceCodes = (
  bookingType: GamingBookingType,
  input: { resourceCodes?: GamingResourceCode[]; resourceCode?: GamingResourceCode }
) => {
  const allowed = new Set(
    (bookingType === "snooker" ? SNOOKER_RESOURCES : CONSOLE_RESOURCES).map((entry) => entry.code)
  );
  const fromArray = (input.resourceCodes ?? []).filter((code) => allowed.has(code));
  const unique = [...new Set(fromArray)];
  if (unique.length) {
    return unique;
  }
  if (input.resourceCode && allowed.has(input.resourceCode)) {
    return [input.resourceCode];
  }
  return [];
};

const fetchServerBookings = async (filters?: GamingBookingListFilter, limit = 400): Promise<GamingBooking[]> => {
  const response = await apiClient.get<ApiSuccess<GamingBookingsListResponse>>("/gaming/bookings", {
    params: {
      search: filters?.search,
      status: filters?.status && filters.status !== "all" ? filters.status : undefined,
      paymentStatus: filters?.paymentStatus && filters.paymentStatus !== "all" ? filters.paymentStatus : undefined,
      bookingType: filters?.bookingType && filters.bookingType !== "all" ? filters.bookingType : undefined,
      page: 1,
      limit
    }
  });
  return response.data.data.bookings.map((row) => toLocalBookingFromServer(row, null));
};

const getCachedBooking = async (localBookingId: string): Promise<GamingBooking | null> => {
  const serverId = localBookingId.startsWith("server-") ? localBookingId.slice("server-".length) : null;
  const rows = await fetchServerBookings(undefined, 1000);
  return rows.find((row) => row.localBookingId === localBookingId || row.serverBookingId === serverId) ?? null;
};

const toLocalBookingFromServer = (
  serverBooking: GamingBookingApiRow,
  existingLocal: GamingBooking | null
): GamingBooking => {
  const resourceCodes =
    serverBooking.resourceCodes?.length
      ? serverBooking.resourceCodes
      : normalizeResourceCodes(serverBooking.bookingType, { resourceCode: serverBooking.resourceCode });
  const customers = serverBooking.customers?.length ? serverBooking.customers : [{ name: "-", phone: "-" }];
  const inferredPlayerCountFromExtra =
    serverBooking.bookingType === "snooker" && Number(serverBooking.extraMemberCount ?? 0) > 0
      ? SNOOKER_INCLUDED_MEMBERS * Math.max(1, resourceCodes.length) +
        Math.max(0, Math.floor(Number(serverBooking.extraMemberCount ?? 0)))
      : customers.length;
  const playerCount = sanitizePlayerCount(
    serverBooking.playerCount ?? serverBooking.customerCount ?? inferredPlayerCountFromExtra,
    customers.length
  );
  const gameAmountForSlot = computeCalculatedAmount({
    checkInAt: serverBooking.checkInAt,
    checkOutAt: serverBooking.checkOutAt,
    hourlyRate: Number(serverBooking.hourlyRate) || 0,
    bookingType: serverBooking.bookingType,
    playerCount,
    status: serverBooking.status
  });
  const systemCalculatedAmount = roundCurrency(
    Math.max(0, Number(serverBooking.systemCalculatedAmount ?? gameAmountForSlot + (serverBooking.foodAndBeverageAmount ?? 0)))
  );
  const discount = normalizeDiscount(
    {
      discountType: serverBooking.discountType,
      discountValue: serverBooking.discountValue,
      discountAmount: serverBooking.discountAmount
    },
    systemCalculatedAmount
  );
  const extraMemberCount = Math.max(
    0,
    Math.floor(Number(serverBooking.extraMemberCount ?? getExtraMemberCount(serverBooking.bookingType, playerCount)))
  );
  const extraMemberCharge = roundCurrency(
    Math.max(0, Number(serverBooking.extraMemberCharge ?? getExtraMemberCharge(serverBooking.bookingType, playerCount)))
  );
  const finalAmount = roundCurrency(Math.max(0, Number(serverBooking.finalAmount) || 0));
  const collectibleAmount = getCollectibleAmount({
    status: serverBooking.status,
    finalAmount,
    systemCalculatedAmount,
    discountAmount: discount.discountAmount
  });
  const serverBreakdown = normalizePaymentBreakdown({
    cash: serverBooking.paymentBreakdown?.cash,
    card: serverBooking.paymentBreakdown?.card,
    upi: serverBooking.paymentBreakdown?.upi
  });
  const normalizedBreakdown =
    serverBooking.paymentStatus === "paid" &&
    getPaymentBreakdownTotal(serverBreakdown) <= AMOUNT_DIFF_THRESHOLD &&
    serverBooking.paymentMode &&
    serverBooking.paymentMode !== "mixed"
      ? {
          ...EMPTY_PAYMENT_BREAKDOWN,
          [serverBooking.paymentMode]: collectibleAmount
        }
      : serverBreakdown;

  return {
    localBookingId: existingLocal?.localBookingId ?? `server-${serverBooking.id}`,
    serverBookingId: serverBooking.id,
    bookingNumber: serverBooking.bookingNumber,
    bookingType: serverBooking.bookingType,
    resourceCode: serverBooking.resourceCode,
    resourceCodes,
    resourceLabel: serverBooking.resourceLabel,
    playerCount,
    customers,
    primaryCustomerName: serverBooking.primaryCustomerName || customers[0]?.name || "-",
    primaryCustomerPhone: serverBooking.primaryCustomerPhone || customers[0]?.phone || "-",
    checkInAt: serverBooking.checkInAt,
    checkOutAt: serverBooking.checkOutAt,
    hourlyRate: roundCurrency(Math.max(0, Number(serverBooking.hourlyRate) || 0)),
    finalAmount,
    systemCalculatedAmount,
    extraMemberCount,
    extraMemberCharge,
    discountType: discount.discountType,
    discountValue: discount.discountValue,
    discountAmount: discount.discountAmount,
    amountOverrideReason: cleanText(serverBooking.amountOverrideReason),
    status: serverBooking.status,
    paymentStatus: serverBooking.paymentStatus,
    paymentMode: serverBooking.paymentMode ?? null,
    paymentReference: cleanText(serverBooking.paymentReference) ?? extractPaymentReferenceFromNote(serverBooking.note),
    paidCashAmount: normalizedBreakdown.cash,
    paidCardAmount: normalizedBreakdown.card,
    paidUpiAmount: normalizedBreakdown.upi,
    foodOrderReference: cleanText(serverBooking.foodOrderReference),
    foodInvoiceNumber: cleanText(serverBooking.foodInvoiceNumber),
    foodInvoiceStatus: serverBooking.foodInvoiceStatus ?? "none",
    foodAndBeverageAmount: roundCurrency(Math.max(0, Number(serverBooking.foodAndBeverageAmount ?? 0))),
    note: cleanText(serverBooking.note),
    bookingChannel: cleanText(serverBooking.bookingChannel),
    sourceDeviceId: cleanText(serverBooking.sourceDeviceId),
    staffId: serverBooking.staffId,
    staffName: serverBooking.staffName || serverBooking.staffUsername || existingLocal?.staffName || "-",
    syncStatus: "synced",
    createdAt: serverBooking.createdAt,
    updatedAt: serverBooking.updatedAt
  };
};

const pushBookingToServer = async (booking: GamingBooking) => {
  const payload = buildServerBookingPayload(booking);
  const serverBookingId = booking.serverBookingId ?? (await findServerBookingIdByNumber(booking.bookingNumber));
  const response =
    !serverBookingId
      ? await apiClient.post<ApiSuccess<GamingBookingResponse>>("/gaming/bookings", payload)
      : booking.status === "completed"
        ? await apiClient.patch<ApiSuccess<GamingBookingResponse>>(`/gaming/bookings/${serverBookingId}/checkout`, {
            checkOutAt: payload.checkOutAt,
            finalAmount: payload.finalAmount,
            systemCalculatedAmount: payload.systemCalculatedAmount,
            extraMemberCount: payload.extraMemberCount,
            extraMemberCharge: payload.extraMemberCharge,
            discountType: payload.discountType,
            discountValue: payload.discountValue,
            discountAmount: payload.discountAmount,
            amountOverrideReason: payload.amountOverrideReason,
            paymentStatus: payload.paymentStatus,
            paymentMode: payload.paymentMode,
            paymentReference: payload.paymentReference,
            paymentBreakdown: payload.paymentBreakdown
          })
        : await apiClient.patch<ApiSuccess<GamingBookingResponse>>(`/gaming/bookings/${serverBookingId}`, {
            customers: payload.customers,
            playerCount: payload.playerCount,
            paymentStatus: payload.paymentStatus,
            paymentMode: payload.paymentMode,
            paymentReference: payload.paymentReference,
            paymentBreakdown: payload.paymentBreakdown,
            finalAmount: payload.finalAmount,
            systemCalculatedAmount: payload.systemCalculatedAmount,
            extraMemberCount: payload.extraMemberCount,
            extraMemberCharge: payload.extraMemberCharge,
            amountOverrideReason: payload.amountOverrideReason,
            foodOrderReference: payload.foodOrderReference,
            foodInvoiceNumber: payload.foodInvoiceNumber,
            foodInvoiceStatus: payload.foodInvoiceStatus,
            foodAndBeverageAmount: payload.foodAndBeverageAmount,
            discountType: payload.discountType,
            discountValue: payload.discountValue,
            discountAmount: payload.discountAmount
          });

  return {
    ...toLocalBookingFromServer(response.data.data.booking, booking),
    syncStatus: "synced" as const
  };
};

export const gamingBookingsService = {
  async pullBookingsFromServer(force = false) {
    void force;
    await fetchServerBookings(undefined, 1);
  },

  getResourcesByType(bookingType: GamingBookingType) {
    return bookingType === "snooker" ? SNOOKER_RESOURCES : CONSOLE_RESOURCES;
  },

  async assertResourcesAvailable(resourceCodes: GamingResourceCode[], excludeLocalBookingId?: string) {
    const occupied = await fetchServerBookings({ status: "ongoing" }, 600);
    const upcoming = await fetchServerBookings({ status: "upcoming" }, 600);
    const conflict = [...occupied, ...upcoming].find(
      (booking) =>
        booking.localBookingId !== excludeLocalBookingId &&
        booking.status !== "completed" &&
        booking.status !== "cancelled" &&
        (booking.resourceCodes ?? [booking.resourceCode]).some((code) => resourceCodes.includes(code))
    );
    if (conflict) {
      const blocked = (conflict.resourceCodes ?? [conflict.resourceCode]).find((code) =>
        resourceCodes.includes(code)
      );
      throw new Error(`${getResourceLabel(blocked ?? conflict.resourceCode)} is currently occupied.`);
    }
  },

  async listBookings(filters?: GamingBookingListFilter, limit = 400, options?: { forceServerSync?: boolean }) {
    void options;
    return fetchServerBookings(filters, limit);
  },

  async listActiveBookings() {
    return this.listBookings({ status: "ongoing" }, 200);
  },

  async getResourceAvailability(bookingType?: GamingBookingType) {
    const active = await fetchServerBookings({ status: "ongoing" }, 200);
    const resources = bookingType ? this.getResourcesByType(bookingType) : ALL_RESOURCES;
    const activeByResource = new Map<GamingResourceCode, GamingBooking>();
    active.forEach((booking) => {
      const codes = (booking.resourceCodes?.length ? booking.resourceCodes : [booking.resourceCode]) as GamingResourceCode[];
      codes.forEach((code) => {
        if (!activeByResource.has(code)) {
          activeByResource.set(code, booking);
        }
      });
    });

    return resources.map((resource) => ({
      ...resource,
      isAvailable: !activeByResource.has(resource.code),
      activeBooking: activeByResource.get(resource.code) ?? null
    }));
  },

  async createBooking(
    input: {
      bookingType: GamingBookingType;
      resourceCode?: GamingResourceCode;
      resourceCodes?: GamingResourceCode[];
      playerCount?: number;
      customers: Array<{ name: string; phone: string }>;
      checkInAt?: string;
      hourlyRate: number;
      bookingChannel?: string;
      note?: string;
      status?: GamingBookingStatus;
      paymentStatus?: GamingPaymentStatus;
      paymentMode?: GamingPaymentMode;
      paymentReference?: string;
      paymentBreakdown?: PaymentBreakdownInput;
      foodOrderReference?: string;
      foodInvoiceNumber?: string;
      foodInvoiceStatus?: "none" | "pending" | "paid" | "cancelled";
      foodAndBeverageAmount?: number;
      discountType?: GamingDiscountType;
      discountValue?: number;
      discountAmount?: number;
    },
    session: StaffSession
  ) {
    const resourceCodes = normalizeResourceCodes(input.bookingType, input);
    if (!resourceCodes.length) {
      throw new Error("Select at least one board/console.");
    }
    await this.assertResourcesAvailable(resourceCodes);
    const primaryResourceCode = resourceCodes[0];
    const resourceLabel =
      resourceCodes.length > 1
        ? `${getResourceLabel(primaryResourceCode)} +${resourceCodes.length - 1}`
        : getResourceLabel(primaryResourceCode);
    const customers = sanitizeCustomers(input.customers);
    const playerCount = sanitizePlayerCount(input.playerCount, customers.length);
    const primaryCustomer = resolvePrimaryCustomer(customers);
    const checkInAt = input.checkInAt ? new Date(input.checkInAt).toISOString() : nowIso();
    const status =
      input.status ??
      (new Date(checkInAt).getTime() > Date.now() ? "upcoming" : "ongoing");
    const hourlyRate = roundCurrency(Math.max(0, Number(input.hourlyRate) || 0));
    const foodAndBeverageAmount = roundCurrency(Math.max(0, Number(input.foodAndBeverageAmount ?? 0)));
    const gameAmount = computeCalculatedAmount({
      checkInAt,
      checkOutAt: null,
      hourlyRate,
      bookingType: input.bookingType,
      playerCount,
      status
    });
    const extraMemberCount = getExtraMemberCount(input.bookingType, playerCount);
    const extraMemberCharge = getExtraMemberCharge(input.bookingType, playerCount);
    const systemCalculatedAmount = roundCurrency(gameAmount + foodAndBeverageAmount);
    const discount = normalizeDiscount(input, systemCalculatedAmount);
    const targetAmount = getCollectibleAmount({
      status,
      finalAmount: 0,
      systemCalculatedAmount,
      discountAmount: discount.discountAmount
    });
    const payment = sanitizePayment(
      {
        paymentStatus: input.paymentStatus,
        paymentMode: input.paymentMode ?? null,
        paymentBreakdown: input.paymentBreakdown
      },
      {
        paymentStatus: "pending",
        paymentMode: null,
        paymentBreakdown: { ...EMPTY_PAYMENT_BREAKDOWN }
      },
      targetAmount
    );
    const inputNote = cleanText(input.note);
    const inputPaymentReference = cleanText(input.paymentReference) ?? extractPaymentReferenceFromNote(inputNote);
    const initialPaymentReference =
      payment.paymentStatus === "paid" && hasDigitalPaymentBreakdown(payment.paymentBreakdown)
        ? inputPaymentReference
        : null;
    const initialNote =
      payment.paymentStatus === "paid" && hasDigitalPaymentBreakdown(payment.paymentBreakdown)
        ? attachPaymentReferenceToNote(inputNote, initialPaymentReference)
        : stripPaymentReferenceFromNote(inputNote);
    const now = nowIso();

    const booking: GamingBooking = {
      localBookingId: makeId(),
      serverBookingId: null,
      bookingNumber: buildBookingNumber(),
      bookingType: input.bookingType,
      resourceCode: primaryResourceCode,
      resourceCodes,
      resourceLabel,
      playerCount,
      customers,
      primaryCustomerName: primaryCustomer.name || "-",
      primaryCustomerPhone: primaryCustomer.phone || "-",
      checkInAt,
      checkOutAt: null,
      hourlyRate,
      finalAmount: 0,
      systemCalculatedAmount,
      extraMemberCount,
      extraMemberCharge,
      discountType: discount.discountType,
      discountValue: discount.discountValue,
      discountAmount: discount.discountAmount,
      amountOverrideReason: null,
      status,
      paymentStatus: payment.paymentStatus,
      paymentMode: payment.paymentMode,
      paymentReference: initialPaymentReference,
      paidCashAmount: payment.paymentBreakdown.cash,
      paidCardAmount: payment.paymentBreakdown.card,
      paidUpiAmount: payment.paymentBreakdown.upi,
      foodOrderReference: input.foodOrderReference?.trim() || null,
      foodInvoiceNumber: input.foodInvoiceNumber?.trim() || null,
      foodInvoiceStatus: input.foodInvoiceStatus ?? "none",
      foodAndBeverageAmount,
      note: initialNote,
      bookingChannel: input.bookingChannel?.trim() || "desktop",
      sourceDeviceId: env.deviceId,
      staffId: session.userId,
      staffName: session.fullName,
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending"
    };

    const syncedBooking = await pushBookingToServer(booking);
    return syncedBooking;
  },

  async checkoutBooking(
    localBookingId: string,
    input: {
      checkOutAt?: string;
      finalAmount?: number;
      systemCalculatedAmount?: number;
      extraMemberCount?: number;
      extraMemberCharge?: number;
      discountType?: GamingDiscountType;
      discountValue?: number;
      discountAmount?: number;
      amountOverrideReason?: string;
      paymentStatus?: "pending" | "paid";
      paymentMode?: GamingPaymentMode;
      paymentBreakdown?: PaymentBreakdownInput;
      paymentReference?: string;
    }
  ) {
    const booking = await getCachedBooking(localBookingId);
    if (!booking) {
      throw new Error("Booking not found.");
    }
    if (booking.status === "completed") {
      throw new Error("This booking is already checked out.");
    }

    const checkOutAt = input.checkOutAt ? new Date(input.checkOutAt).toISOString() : nowIso();
    const computed = computeCalculatedAmount({
      checkInAt: booking.checkInAt,
      checkOutAt,
      hourlyRate: booking.hourlyRate,
      bookingType: booking.bookingType,
      playerCount: booking.playerCount,
      status: "completed"
    });
    const systemCalculatedAmount = roundCurrency(
      Math.max(
        0,
        typeof input.systemCalculatedAmount === "number" && Number.isFinite(input.systemCalculatedAmount)
          ? Number(input.systemCalculatedAmount)
          : computed + (Number(booking.foodAndBeverageAmount) || 0)
      )
    );
    const discount = normalizeDiscount(
      {
        discountType: input.discountType ?? booking.discountType,
        discountValue: input.discountValue ?? booking.discountValue,
        discountAmount: input.discountAmount ?? booking.discountAmount
      },
      systemCalculatedAmount
    );
    const expectedFinalAmount = getDiscountedAmount(systemCalculatedAmount, discount.discountAmount);
    const nextFinalAmount = roundCurrency(
      Math.max(
        0,
        typeof input.finalAmount === "number" && Number.isFinite(input.finalAmount)
          ? Number(input.finalAmount)
          : expectedFinalAmount
      )
    );
    const overrideReason = cleanText(input.amountOverrideReason);
    if (hasAmountDiff(nextFinalAmount, expectedFinalAmount) && !overrideReason) {
      throw new Error("Please enter reason for changing discounted final amount.");
    }
    const payment = sanitizePayment(
      {
        paymentStatus: input.paymentStatus ?? booking.paymentStatus,
        paymentMode: input.paymentMode ?? booking.paymentMode,
        paymentBreakdown: input.paymentBreakdown
      },
      {
        paymentStatus: booking.paymentStatus,
        paymentMode: booking.paymentMode,
        paymentBreakdown: getPaymentBreakdownFromBooking(booking)
      },
      nextFinalAmount > 0 ? nextFinalAmount : expectedFinalAmount
    );
    const existingPaymentReference = extractPaymentReferenceFromNote(booking.note);
    const explicitPaymentReference =
      input.paymentReference !== undefined
        ? cleanText(input.paymentReference)
        : booking.paymentReference ?? existingPaymentReference;
    const nextPaymentReference =
      payment.paymentStatus === "paid" && hasDigitalPaymentBreakdown(payment.paymentBreakdown)
        ? explicitPaymentReference
        : null;
    const nextNote =
      payment.paymentStatus === "paid" && hasDigitalPaymentBreakdown(payment.paymentBreakdown)
        ? attachPaymentReferenceToNote(cleanText(booking.note), explicitPaymentReference)
        : stripPaymentReferenceFromNote(cleanText(booking.note));

    const nextBooking: GamingBooking = {
      ...booking,
      checkOutAt,
      status: "completed",
      paymentStatus: payment.paymentStatus,
      paymentMode: payment.paymentMode,
      paymentReference: nextPaymentReference,
      paidCashAmount: payment.paymentBreakdown.cash,
      paidCardAmount: payment.paymentBreakdown.card,
      paidUpiAmount: payment.paymentBreakdown.upi,
      finalAmount: nextFinalAmount,
      systemCalculatedAmount,
      extraMemberCount: Math.max(
        0,
        Math.floor(
          typeof input.extraMemberCount === "number" && Number.isFinite(input.extraMemberCount)
            ? Number(input.extraMemberCount)
            : getExtraMemberCount(booking.bookingType, booking.playerCount)
        )
      ),
      extraMemberCharge: roundCurrency(
        Math.max(
          0,
          typeof input.extraMemberCharge === "number" && Number.isFinite(input.extraMemberCharge)
            ? Number(input.extraMemberCharge)
            : getExtraMemberCharge(booking.bookingType, booking.playerCount)
        )
      ),
      discountType: discount.discountType,
      discountValue: discount.discountValue,
      discountAmount: discount.discountAmount,
      amountOverrideReason: hasAmountDiff(nextFinalAmount, expectedFinalAmount) ? overrideReason : null,
      foodOrderReference: booking.foodOrderReference,
      foodInvoiceNumber: booking.foodInvoiceNumber,
      foodInvoiceStatus: booking.foodInvoiceStatus,
      foodAndBeverageAmount: booking.foodAndBeverageAmount,
      note: nextNote,
      updatedAt: nowIso(),
      syncStatus: "pending"
    };

    const syncedBooking = await pushBookingToServer(nextBooking);
    return syncedBooking;
  },

  async updateBooking(
    localBookingId: string,
    input: {
      bookingType?: GamingBookingType;
      resourceCode?: GamingResourceCode;
      resourceCodes?: GamingResourceCode[];
      customers?: Array<{ name: string; phone: string }>;
      playerCount?: number;
      checkInAt?: string;
      hourlyRate?: number;
      status?: "upcoming" | "ongoing" | "cancelled";
      note?: string;
      paymentStatus?: "pending" | "paid";
      paymentMode?: GamingPaymentMode;
      paymentBreakdown?: PaymentBreakdownInput;
      paymentReference?: string;
      finalAmount?: number;
      systemCalculatedAmount?: number;
      extraMemberCount?: number;
      extraMemberCharge?: number;
      discountType?: GamingDiscountType;
      discountValue?: number;
      discountAmount?: number;
      amountOverrideReason?: string;
    }
  ) {
    const booking = await getCachedBooking(localBookingId);
    if (!booking) {
      throw new Error("Booking not found.");
    }
    if (booking.status === "completed") {
      throw new Error("Completed bookings cannot be edited.");
    }

    const nextBookingType = input.bookingType ?? booking.bookingType;
    const nextResourceCodes = normalizeResourceCodes(nextBookingType, {
      resourceCodes: input.resourceCodes ?? booking.resourceCodes,
      resourceCode: input.resourceCode ?? booking.resourceCode
    });
    if (!nextResourceCodes.length) {
      throw new Error("Select at least one board/console.");
    }
    const nextResourceCode = nextResourceCodes[0];
    if (
      nextBookingType !== booking.bookingType ||
      JSON.stringify(nextResourceCodes) !== JSON.stringify(booking.resourceCodes ?? [booking.resourceCode])
    ) {
      await this.assertResourcesAvailable(nextResourceCodes, booking.localBookingId);
    }

    const nextCustomers = input.customers?.length ? sanitizeCustomers(input.customers) : booking.customers;
    const nextPlayerCount = sanitizePlayerCount(
      input.playerCount === undefined ? booking.playerCount : input.playerCount,
      nextCustomers.length
    );
    const nextCheckInAt = input.checkInAt ? new Date(input.checkInAt).toISOString() : booking.checkInAt;
    const nextHourlyRate = roundCurrency(Math.max(0, Number(input.hourlyRate ?? booking.hourlyRate) || 0));
    const nextStatus = input.status ?? booking.status;
    const calculatedAmount = computeCalculatedAmount({
      checkInAt: nextCheckInAt,
      checkOutAt: booking.checkOutAt,
      hourlyRate: nextHourlyRate,
      bookingType: nextBookingType,
      playerCount: nextPlayerCount,
      status: nextStatus
    });
    const derivedSystemCalculatedAmount = roundCurrency(calculatedAmount + (Number(booking.foodAndBeverageAmount) || 0));
    const nextSystemCalculatedAmount = roundCurrency(
      Math.max(
        0,
        typeof input.systemCalculatedAmount === "number" && Number.isFinite(input.systemCalculatedAmount)
          ? Number(input.systemCalculatedAmount)
          : derivedSystemCalculatedAmount
      )
    );
    const discount = normalizeDiscount(
      {
        discountType: input.discountType ?? booking.discountType,
        discountValue: input.discountValue ?? booking.discountValue,
        discountAmount: input.discountAmount ?? booking.discountAmount
      },
      nextSystemCalculatedAmount
    );
    const expectedFinalAmount = getDiscountedAmount(nextSystemCalculatedAmount, discount.discountAmount);
    const nextFinalAmount =
      typeof input.finalAmount === "number" && Number.isFinite(input.finalAmount)
      ? roundCurrency(Math.max(0, Number(input.finalAmount)))
      : booking.finalAmount;
    const nextOverrideReason = cleanText(input.amountOverrideReason ?? booking.amountOverrideReason);
    const shouldValidateOverride =
      input.finalAmount !== undefined || input.systemCalculatedAmount !== undefined || input.amountOverrideReason !== undefined;
    if (shouldValidateOverride && hasAmountDiff(nextFinalAmount, expectedFinalAmount) && !nextOverrideReason) {
      throw new Error("Please enter reason for changing discounted final amount.");
    }
    const payment = sanitizePayment(
      {
        paymentStatus: input.paymentStatus ?? booking.paymentStatus,
        paymentMode: input.paymentMode ?? booking.paymentMode,
        paymentBreakdown: input.paymentBreakdown
      },
      {
        paymentStatus: booking.paymentStatus,
        paymentMode: booking.paymentMode,
        paymentBreakdown: getPaymentBreakdownFromBooking(booking)
      },
      getCollectibleAmount({
        status: nextStatus,
        finalAmount: nextFinalAmount,
        systemCalculatedAmount: nextSystemCalculatedAmount,
        discountAmount: discount.discountAmount
      })
    );
    const baseNote = input.note === undefined ? booking.note : input.note.trim() || null;
    const existingPaymentReference = booking.paymentReference ?? extractPaymentReferenceFromNote(baseNote);
    const explicitPaymentReference =
      input.paymentReference !== undefined ? cleanText(input.paymentReference) : existingPaymentReference;
    const nextPaymentReference =
      payment.paymentStatus === "paid" && hasDigitalPaymentBreakdown(payment.paymentBreakdown)
        ? explicitPaymentReference
        : null;
    const nextNote =
      payment.paymentStatus === "paid" && hasDigitalPaymentBreakdown(payment.paymentBreakdown)
        ? attachPaymentReferenceToNote(baseNote, explicitPaymentReference)
        : stripPaymentReferenceFromNote(baseNote);

    const nextBooking: GamingBooking = {
      ...booking,
      bookingType: nextBookingType,
      resourceCode: nextResourceCode,
      resourceCodes: nextResourceCodes,
      resourceLabel:
        nextResourceCodes.length > 1
          ? `${getResourceLabel(nextResourceCode)} +${nextResourceCodes.length - 1}`
          : getResourceLabel(nextResourceCode),
      customers: nextCustomers,
      playerCount: nextPlayerCount,
      checkInAt: nextCheckInAt,
      hourlyRate: nextHourlyRate,
      finalAmount: nextFinalAmount,
      systemCalculatedAmount: nextSystemCalculatedAmount,
      extraMemberCount: Math.max(
        0,
        Math.floor(
          typeof input.extraMemberCount === "number" && Number.isFinite(input.extraMemberCount)
            ? Number(input.extraMemberCount)
            : getExtraMemberCount(nextBookingType, nextPlayerCount)
        )
      ),
      extraMemberCharge: roundCurrency(
        Math.max(
          0,
          typeof input.extraMemberCharge === "number" && Number.isFinite(input.extraMemberCharge)
            ? Number(input.extraMemberCharge)
            : getExtraMemberCharge(nextBookingType, nextPlayerCount)
        )
      ),
      discountType: discount.discountType,
      discountValue: discount.discountValue,
      discountAmount: discount.discountAmount,
      amountOverrideReason: shouldValidateOverride
        ? hasAmountDiff(nextFinalAmount, expectedFinalAmount)
          ? nextOverrideReason
          : null
        : booking.amountOverrideReason,
      status: nextStatus,
      note: nextNote,
      paymentStatus: payment.paymentStatus,
      paymentMode: payment.paymentMode,
      paymentReference: nextPaymentReference,
      paidCashAmount: payment.paymentBreakdown.cash,
      paidCardAmount: payment.paymentBreakdown.card,
      paidUpiAmount: payment.paymentBreakdown.upi,
      foodOrderReference: booking.foodOrderReference,
      foodInvoiceNumber: booking.foodInvoiceNumber,
      foodInvoiceStatus: booking.foodInvoiceStatus,
      foodAndBeverageAmount: booking.foodAndBeverageAmount,
      updatedAt: nowIso(),
      syncStatus: "pending"
    };
    const primaryCustomer = resolvePrimaryCustomer(nextBooking.customers);
    nextBooking.primaryCustomerName = primaryCustomer.name || booking.primaryCustomerName;
    nextBooking.primaryCustomerPhone = primaryCustomer.phone || booking.primaryCustomerPhone;

    const syncedBooking = await pushBookingToServer(nextBooking);
    return syncedBooking;
  },

  async updatePaymentStatus(
    localBookingId: string,
    paymentStatus: GamingPaymentStatus,
    paymentMode?: GamingPaymentMode,
    paymentBreakdown?: PaymentBreakdownInput
  ) {
    const booking = await getCachedBooking(localBookingId);
    if (!booking) {
      throw new Error("Booking not found.");
    }
    if (booking.status === "completed") {
      throw new Error("Payment status cannot be changed after checkout.");
    }
    const payment = sanitizePayment(
      {
        paymentStatus,
        paymentMode: paymentMode ?? booking.paymentMode,
        paymentBreakdown
      },
      {
        paymentStatus: booking.paymentStatus,
        paymentMode: booking.paymentMode,
        paymentBreakdown: getPaymentBreakdownFromBooking(booking)
      },
      getCollectibleAmount(booking)
    );

    const nextBooking: GamingBooking = {
      ...booking,
      paymentStatus: payment.paymentStatus,
      paymentMode: payment.paymentMode,
      paymentReference:
        payment.paymentStatus === "paid" && hasDigitalPaymentBreakdown(payment.paymentBreakdown)
          ? booking.paymentReference ?? extractPaymentReferenceFromNote(booking.note)
          : null,
      paidCashAmount: payment.paymentBreakdown.cash,
      paidCardAmount: payment.paymentBreakdown.card,
      paidUpiAmount: payment.paymentBreakdown.upi,
      foodOrderReference: booking.foodOrderReference,
      foodInvoiceNumber: booking.foodInvoiceNumber,
      foodInvoiceStatus: booking.foodInvoiceStatus,
      foodAndBeverageAmount: booking.foodAndBeverageAmount,
      updatedAt: nowIso(),
      syncStatus: "pending"
    };
    const syncedBooking = await pushBookingToServer(nextBooking);
    return syncedBooking;
  },

  async updateFoodOrderLink(
    localBookingId: string,
    input: {
      foodOrderReference?: string | null;
      foodInvoiceNumber?: string | null;
      foodInvoiceStatus?: "none" | "pending" | "paid" | "cancelled";
      foodAndBeverageAmount?: number;
    }
  ) {
    const booking = await getCachedBooking(localBookingId);
    if (!booking) {
      throw new Error("Booking not found.");
    }
    if (booking.status === "completed") {
      throw new Error("Completed booking cannot be modified.");
    }

    const nextFoodAndBeverageAmount =
      input.foodAndBeverageAmount === undefined
        ? booking.foodAndBeverageAmount
        : roundCurrency(Math.max(0, Number(input.foodAndBeverageAmount ?? 0)));
    const nextSystemCalculatedAmount = computeSystemCalculatedAmount({
      checkInAt: booking.checkInAt,
      checkOutAt: booking.checkOutAt,
      hourlyRate: booking.hourlyRate,
      bookingType: booking.bookingType,
      playerCount: booking.playerCount,
      status: booking.status,
      foodAndBeverageAmount: nextFoodAndBeverageAmount
    });
    const discount = normalizeDiscount(
      {
        discountType: booking.discountType,
        discountValue: booking.discountValue,
        discountAmount: booking.discountAmount
      },
      nextSystemCalculatedAmount
    );

    const nextBooking: GamingBooking = {
      ...booking,
      foodOrderReference:
        input.foodOrderReference === undefined ? booking.foodOrderReference : input.foodOrderReference,
      foodInvoiceNumber:
        input.foodInvoiceNumber === undefined ? booking.foodInvoiceNumber : input.foodInvoiceNumber,
      foodInvoiceStatus:
        input.foodInvoiceStatus === undefined ? booking.foodInvoiceStatus : input.foodInvoiceStatus,
      foodAndBeverageAmount: nextFoodAndBeverageAmount,
      systemCalculatedAmount: nextSystemCalculatedAmount,
      discountType: discount.discountType,
      discountValue: discount.discountValue,
      discountAmount: discount.discountAmount,
      updatedAt: nowIso(),
      syncStatus: "pending"
    };

    const syncedBooking = await pushBookingToServer(nextBooking);
    return syncedBooking;
  },

  getLiveAmount(booking: GamingBooking) {
    if (booking.status === "completed") {
      return booking.finalAmount;
    }
    return getDiscountedAmount(computeCalculatedAmount(booking), booking.discountAmount ?? 0);
  },

  async getDashboardSnapshot() {
    const all = await fetchServerBookings(undefined, 500);
    const now = Date.now();

    const ongoing = all.filter((booking) => booking.status === "ongoing");
    const upcoming = all.filter((booking) => booking.status === "upcoming");
    const completed = all.filter((booking) => booking.status === "completed");
    const pendingPayments = all.filter((booking) => booking.paymentStatus === "pending");

    const endingSoon = ongoing.filter((booking) => {
      const elapsedMinutes = Math.ceil((now - new Date(booking.checkInAt).getTime()) / 60000);
      return elapsedMinutes >= 45;
    });

    return {
      ongoingCount: ongoing.length,
      upcomingCount: upcoming.length,
      completedCount: completed.length,
      pendingPaymentsCount: pendingPayments.length,
      activePlayers: ongoing.reduce((sum, booking) => sum + booking.playerCount, 0),
      endingSoonCount: endingSoon.length,
      upcomingBookings: upcoming
        .sort((a, b) => a.checkInAt.localeCompare(b.checkInAt))
        .slice(0, 8),
      ongoingBookings: ongoing
        .sort((a, b) => a.checkInAt.localeCompare(b.checkInAt))
        .slice(0, 8)
    };
  }
};
