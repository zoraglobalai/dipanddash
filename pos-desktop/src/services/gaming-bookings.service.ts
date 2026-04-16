import { env } from "@/config/env";
import { gamingBookingsRepository } from "@/db/repositories/gaming-bookings.repository";
import { syncQueueRepository } from "@/db/repositories/sync-queue.repository";
import { apiClient } from "@/lib/api-client";
import { makeId } from "@/utils/idempotency";
import type {
  GamingBooking,
  GamingBookingListFilter,
  GamingBookingStatus,
  GamingBookingType,
  GamingCustomerMember,
  GamingPaymentMode,
  GamingPaymentStatus,
  GamingResourceCode,
  StaffSession,
  SyncQueueRow
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
  primaryCustomerName?: string | null;
  primaryCustomerPhone?: string | null;
  checkInAt: string;
  checkOutAt: string | null;
  hourlyRate: number;
  finalAmount: number;
  systemCalculatedAmount?: number;
  extraMemberCount?: number;
  extraMemberCharge?: number;
  amountOverrideReason?: string | null;
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
  staffUsername?: string;
  createdAt: string;
  updatedAt: string;
};

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
const SERVER_PULL_INTERVAL_MS = 8000;
const AMOUNT_DIFF_THRESHOLD = 0.01;

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
const hasAmountDiff = (left: number, right: number) => Math.abs(left - right) > AMOUNT_DIFF_THRESHOLD;

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

const buildSyncEvent = (booking: GamingBooking, idempotencyKey: string) => ({
  eventType: "gaming_booking_upsert" as const,
  idempotencyKey,
  deviceId: env.deviceId,
  payload: {
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
    finalAmount: booking.finalAmount,
    systemCalculatedAmount: booking.systemCalculatedAmount,
    extraMemberCount: booking.extraMemberCount,
    extraMemberCharge: booking.extraMemberCharge,
    amountOverrideReason: booking.amountOverrideReason ?? undefined,
    foodOrderReference: booking.foodOrderReference ?? undefined,
    foodInvoiceNumber: booking.foodInvoiceNumber ?? undefined,
    foodInvoiceStatus: booking.foodInvoiceStatus,
    foodAndBeverageAmount: booking.foodAndBeverageAmount,
    staffId: booking.staffId
  }
});

const queueBookingSync = async (booking: GamingBooking) => {
  const eventId = makeId();
  const queueRow: SyncQueueRow = {
    id: makeId(),
    idempotencyKey: eventId,
    eventType: "gaming_booking_upsert",
    payload: buildSyncEvent(booking, eventId),
    status: "pending",
    retryCount: 0,
    lastError: null,
    nextRetryAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await syncQueueRepository.enqueue(queueRow);
};

const sanitizeCustomers = (customers: Array<{ name: string; phone: string }>): GamingCustomerMember[] => {
  const sanitized = customers
    .map((entry) => ({ name: entry.name.trim(), phone: normalizePhone(entry.phone) }))
    .filter((entry) => entry.name.length > 0 && entry.phone.length > 0);

  if (!sanitized.length) {
    throw new Error("Add at least one customer with name and phone.");
  }
  return sanitized;
};

const sanitizePayment = (input: { paymentStatus?: GamingPaymentStatus; paymentMode?: GamingPaymentMode | null }) => {
  const paymentStatus = input.paymentStatus ?? "pending";
  const paymentMode = input.paymentMode ?? null;

  if (paymentStatus === "paid" && !paymentMode) {
    throw new Error("Select payment mode when status is paid.");
  }

  return {
    paymentStatus,
    paymentMode: paymentStatus === "paid" ? paymentMode : null
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

const UNSYNCED_STATUSES = new Set<GamingBooking["syncStatus"]>(["pending", "syncing", "failed", "needs_attention"]);
let lastServerPullAt = 0;

const toLocalBookingFromServer = (
  serverBooking: GamingBookingApiRow,
  existingLocal: GamingBooking | null
): GamingBooking => {
  const resourceCodes =
    serverBooking.resourceCodes?.length
      ? serverBooking.resourceCodes
      : normalizeResourceCodes(serverBooking.bookingType, { resourceCode: serverBooking.resourceCode });
  const customers = serverBooking.customers?.length ? serverBooking.customers : [{ name: "-", phone: "-" }];
  const playerCount = sanitizePlayerCount(serverBooking.customerCount ?? customers.length, customers.length);
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
  const extraMemberCount = Math.max(
    0,
    Math.floor(Number(serverBooking.extraMemberCount ?? getExtraMemberCount(serverBooking.bookingType, playerCount)))
  );
  const extraMemberCharge = roundCurrency(
    Math.max(0, Number(serverBooking.extraMemberCharge ?? getExtraMemberCharge(serverBooking.bookingType, playerCount)))
  );

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
    finalAmount: roundCurrency(Math.max(0, Number(serverBooking.finalAmount) || 0)),
    systemCalculatedAmount,
    extraMemberCount,
    extraMemberCharge,
    amountOverrideReason: cleanText(serverBooking.amountOverrideReason),
    status: serverBooking.status,
    paymentStatus: serverBooking.paymentStatus,
    paymentMode: serverBooking.paymentMode ?? null,
    foodOrderReference: cleanText(serverBooking.foodOrderReference),
    foodInvoiceNumber: cleanText(serverBooking.foodInvoiceNumber),
    foodInvoiceStatus: serverBooking.foodInvoiceStatus ?? "none",
    foodAndBeverageAmount: roundCurrency(Math.max(0, Number(serverBooking.foodAndBeverageAmount ?? 0))),
    note: cleanText(serverBooking.note),
    bookingChannel: cleanText(serverBooking.bookingChannel),
    sourceDeviceId: cleanText(serverBooking.sourceDeviceId),
    staffId: serverBooking.staffId,
    staffName: serverBooking.staffName || serverBooking.staffUsername || existingLocal?.staffName || "-",
    syncStatus: existingLocal && UNSYNCED_STATUSES.has(existingLocal.syncStatus) ? existingLocal.syncStatus : "synced",
    createdAt: serverBooking.createdAt,
    updatedAt: serverBooking.updatedAt
  };
};

export const gamingBookingsService = {
  async pullBookingsFromServer(force = false) {
    const now = Date.now();
    if (!force && now - lastServerPullAt < SERVER_PULL_INTERVAL_MS) {
      return;
    }

    const existingRows = await gamingBookingsRepository.list(undefined, 2000);
    const existingByBookingNumber = new Map(existingRows.map((row) => [row.bookingNumber, row]));
    const existingByServerId = new Map(
      existingRows.filter((row) => row.serverBookingId).map((row) => [row.serverBookingId as string, row])
    );

    let page = 1;
    let totalPages = 1;
    const limit = 200;
    do {
      const response = await apiClient.get<ApiSuccess<GamingBookingsListResponse>>("/gaming/bookings", {
        params: { page, limit }
      });
      const payload = response.data.data;

      for (const serverRow of payload.bookings) {
        const existing =
          existingByServerId.get(serverRow.id) ??
          existingByBookingNumber.get(serverRow.bookingNumber) ??
          null;
        if (existing && UNSYNCED_STATUSES.has(existing.syncStatus)) {
          continue;
        }
        const localRow = toLocalBookingFromServer(serverRow, existing);
        await gamingBookingsRepository.save(localRow);
        existingByBookingNumber.set(localRow.bookingNumber, localRow);
        if (localRow.serverBookingId) {
          existingByServerId.set(localRow.serverBookingId, localRow);
        }
      }

      totalPages = payload.pagination.totalPages || 1;
      page += 1;
    } while (page <= totalPages);

    lastServerPullAt = now;
  },

  getResourcesByType(bookingType: GamingBookingType) {
    return bookingType === "snooker" ? SNOOKER_RESOURCES : CONSOLE_RESOURCES;
  },

  async assertResourcesAvailable(resourceCodes: GamingResourceCode[], excludeLocalBookingId?: string) {
    try {
      await this.pullBookingsFromServer(true);
    } catch {
      // ignore: offline or server unavailable; local guard still applies.
    }
    const occupied = await gamingBookingsRepository.list({ status: "ongoing" }, 600);
    const upcoming = await gamingBookingsRepository.list({ status: "upcoming" }, 600);
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
    try {
      await this.pullBookingsFromServer(options?.forceServerSync ?? false);
    } catch {
      // no-op: fallback to local snapshot when offline.
    }
    return gamingBookingsRepository.list(filters, limit);
  },

  async listActiveBookings() {
    return this.listBookings({ status: "ongoing" }, 200);
  },

  async getResourceAvailability(bookingType?: GamingBookingType) {
    try {
      await this.pullBookingsFromServer(false);
    } catch {
      // no-op
    }
    const active = await gamingBookingsRepository.list({ status: "ongoing" }, 200);
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
      foodOrderReference?: string;
      foodInvoiceNumber?: string;
      foodInvoiceStatus?: "none" | "pending" | "paid" | "cancelled";
      foodAndBeverageAmount?: number;
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
    const payment = sanitizePayment({ paymentStatus: input.paymentStatus, paymentMode: input.paymentMode });
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
      primaryCustomerName: customers[0].name,
      primaryCustomerPhone: customers[0].phone,
      checkInAt,
      checkOutAt: null,
      hourlyRate,
      finalAmount: 0,
      systemCalculatedAmount,
      extraMemberCount,
      extraMemberCharge,
      amountOverrideReason: null,
      status,
      paymentStatus: payment.paymentStatus,
      paymentMode: payment.paymentMode,
      foodOrderReference: input.foodOrderReference?.trim() || null,
      foodInvoiceNumber: input.foodInvoiceNumber?.trim() || null,
      foodInvoiceStatus: input.foodInvoiceStatus ?? "none",
      foodAndBeverageAmount,
      note: input.note?.trim() || null,
      bookingChannel: input.bookingChannel?.trim() || "desktop",
      sourceDeviceId: env.deviceId,
      staffId: session.userId,
      staffName: session.fullName,
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending"
    };

    await gamingBookingsRepository.save(booking);
    await queueBookingSync(booking);
    return booking;
  },

  async checkoutBooking(
    localBookingId: string,
    input: {
      checkOutAt?: string;
      finalAmount?: number;
      systemCalculatedAmount?: number;
      extraMemberCount?: number;
      extraMemberCharge?: number;
      amountOverrideReason?: string;
      paymentStatus?: "pending" | "paid";
      paymentMode?: GamingPaymentMode;
    }
  ) {
    const booking = await gamingBookingsRepository.getById(localBookingId);
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
    const payment = sanitizePayment({
      paymentStatus: input.paymentStatus ?? booking.paymentStatus,
      paymentMode: input.paymentMode ?? booking.paymentMode
    });
    const systemCalculatedAmount = roundCurrency(
      Math.max(
        0,
        typeof input.systemCalculatedAmount === "number" && Number.isFinite(input.systemCalculatedAmount)
          ? Number(input.systemCalculatedAmount)
          : computed + (Number(booking.foodAndBeverageAmount) || 0)
      )
    );
    const nextFinalAmount = roundCurrency(
      Math.max(
        0,
        typeof input.finalAmount === "number" && Number.isFinite(input.finalAmount)
          ? Number(input.finalAmount)
          : systemCalculatedAmount
      )
    );
    const overrideReason = cleanText(input.amountOverrideReason);
    if (hasAmountDiff(nextFinalAmount, systemCalculatedAmount) && !overrideReason) {
      throw new Error("Please enter reason for changing system amount.");
    }

    const nextBooking: GamingBooking = {
      ...booking,
      checkOutAt,
      status: "completed",
      paymentStatus: payment.paymentStatus,
      paymentMode: payment.paymentMode,
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
      amountOverrideReason: hasAmountDiff(nextFinalAmount, systemCalculatedAmount) ? overrideReason : null,
      foodOrderReference: booking.foodOrderReference,
      foodInvoiceNumber: booking.foodInvoiceNumber,
      foodInvoiceStatus: booking.foodInvoiceStatus,
      foodAndBeverageAmount: booking.foodAndBeverageAmount,
      updatedAt: nowIso(),
      syncStatus: "pending"
    };

    await gamingBookingsRepository.save(nextBooking);
    await queueBookingSync(nextBooking);
    return nextBooking;
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
      finalAmount?: number;
      systemCalculatedAmount?: number;
      extraMemberCount?: number;
      extraMemberCharge?: number;
      amountOverrideReason?: string;
    }
  ) {
    const booking = await gamingBookingsRepository.getById(localBookingId);
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

    const payment = sanitizePayment({
      paymentStatus: input.paymentStatus ?? booking.paymentStatus,
      paymentMode: input.paymentMode ?? booking.paymentMode
    });
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
    const nextFinalAmount =
      typeof input.finalAmount === "number" && Number.isFinite(input.finalAmount)
      ? roundCurrency(Math.max(0, Number(input.finalAmount)))
      : booking.finalAmount;
    const nextOverrideReason = cleanText(input.amountOverrideReason ?? booking.amountOverrideReason);
    const shouldValidateOverride =
      input.finalAmount !== undefined || input.systemCalculatedAmount !== undefined || input.amountOverrideReason !== undefined;
    if (shouldValidateOverride && hasAmountDiff(nextFinalAmount, nextSystemCalculatedAmount) && !nextOverrideReason) {
      throw new Error("Please enter reason for changing system amount.");
    }

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
      amountOverrideReason: shouldValidateOverride
        ? hasAmountDiff(nextFinalAmount, nextSystemCalculatedAmount)
          ? nextOverrideReason
          : null
        : booking.amountOverrideReason,
      status: nextStatus,
      note: input.note === undefined ? booking.note : input.note.trim() || null,
      paymentStatus: payment.paymentStatus,
      paymentMode: payment.paymentMode,
      foodOrderReference: booking.foodOrderReference,
      foodInvoiceNumber: booking.foodInvoiceNumber,
      foodInvoiceStatus: booking.foodInvoiceStatus,
      foodAndBeverageAmount: booking.foodAndBeverageAmount,
      updatedAt: nowIso(),
      syncStatus: "pending"
    };
    nextBooking.primaryCustomerName = nextBooking.customers[0]?.name ?? booking.primaryCustomerName;
    nextBooking.primaryCustomerPhone = nextBooking.customers[0]?.phone ?? booking.primaryCustomerPhone;

    await gamingBookingsRepository.save(nextBooking);
    await queueBookingSync(nextBooking);
    return nextBooking;
  },

  async updatePaymentStatus(localBookingId: string, paymentStatus: GamingPaymentStatus, paymentMode?: GamingPaymentMode) {
    const booking = await gamingBookingsRepository.getById(localBookingId);
    if (!booking) {
      throw new Error("Booking not found.");
    }
    if (booking.status === "completed") {
      throw new Error("Payment status cannot be changed after checkout.");
    }
    const payment = sanitizePayment({ paymentStatus, paymentMode: paymentMode ?? booking.paymentMode });

    const nextBooking: GamingBooking = {
      ...booking,
      paymentStatus: payment.paymentStatus,
      paymentMode: payment.paymentMode,
      foodOrderReference: booking.foodOrderReference,
      foodInvoiceNumber: booking.foodInvoiceNumber,
      foodInvoiceStatus: booking.foodInvoiceStatus,
      foodAndBeverageAmount: booking.foodAndBeverageAmount,
      updatedAt: nowIso(),
      syncStatus: "pending"
    };
    await gamingBookingsRepository.save(nextBooking);
    await queueBookingSync(nextBooking);
    return nextBooking;
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
    const booking = await gamingBookingsRepository.getById(localBookingId);
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
      updatedAt: nowIso(),
      syncStatus: "pending"
    };

    await gamingBookingsRepository.save(nextBooking);
    await queueBookingSync(nextBooking);
    return nextBooking;
  },

  getLiveAmount(booking: GamingBooking) {
    if (booking.status === "completed") {
      return booking.finalAmount;
    }
    return computeCalculatedAmount(booking);
  },

  async getDashboardSnapshot() {
    try {
      await this.pullBookingsFromServer(false);
    } catch {
      // no-op
    }
    const all = await gamingBookingsRepository.list(undefined, 500);
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
