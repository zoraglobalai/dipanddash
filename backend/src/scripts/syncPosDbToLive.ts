import "reflect-metadata";

import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { Repository } from "typeorm";

import { UserRole } from "../constants/roles";
import { AppDataSource } from "../database/data-source";
import { initDataSource } from "../database/init-data-source";
import { Customer } from "../modules/customers/customer.entity";
import { GamingBooking } from "../modules/gaming/gaming-booking.entity";
import { GAMING_RESOURCE_LABELS } from "../modules/gaming/gaming.constants";
import { Invoice } from "../modules/invoices/invoice.entity";
import { InvoiceUsageEvent } from "../modules/invoices/invoice-usage-event.entity";
import { PosSyncService } from "../modules/pos-sync/pos-sync.service";
import { SyncReceipt } from "../modules/pos-sync/sync-receipt.entity";
import { User } from "../modules/users/user.entity";

type SyncEventType = "customer_upsert" | "invoice_upsert" | "usage_event" | "gaming_booking_upsert";

type SyncEvent = {
  eventType: SyncEventType;
  idempotencyKey: string;
  deviceId?: string;
  payload: Record<string, unknown>;
};

type SyncContext = {
  userId: string;
  role: UserRole;
};

type CliOptions = {
  posDbPath?: string;
  userId?: string;
  dryRun: boolean;
  chunkSize: number;
};

type GenericRow = Record<string, unknown>;

type QueueEventRow = {
  event: SyncEvent;
  createdAtMs: number;
  sourceQueueId: string | null;
};

type ExistingSets = {
  invoiceNumbers: Set<string>;
  bookingNumbers: Set<string>;
  customerPhones: Set<string>;
  usageEventKeys: Set<string>;
  receiptKeys: Set<string>;
};

type FallbackDefaults = {
  deviceId: string;
  branchId: string | null;
  runToken: string;
};

type SqliteStatement = {
  all: (...params: unknown[]) => unknown[];
};

type SqliteDatabase = {
  prepare: (query: string) => SqliteStatement;
  close: () => void;
};

const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string, options?: { readonly?: boolean }) => SqliteDatabase;
};

const EVENT_TYPES: readonly SyncEventType[] = [
  "customer_upsert",
  "invoice_upsert",
  "usage_event",
  "gaming_booking_upsert"
];
const INVOICE_ORDER_TYPES = ["takeaway", "dine_in", "delivery", "snooker"] as const;
const INVOICE_STATUSES = ["pending", "paid", "cancelled", "refunded"] as const;
const KITCHEN_STATUSES = ["not_sent", "queued", "preparing", "ready", "served"] as const;
const PAYMENT_MODES = ["cash", "card", "upi", "mixed"] as const;
const LINE_TYPES = ["item", "add_on", "combo", "product", "custom"] as const;
const GAMING_TYPES = ["snooker", "console"] as const;
const GAMING_STATUSES = ["upcoming", "ongoing", "completed", "cancelled"] as const;
const GAMING_PAYMENT_STATUSES = ["pending", "paid", "refunded"] as const;
const GAMING_PAYMENT_MODES = ["cash", "card", "upi", "mixed"] as const;
const FOOD_INVOICE_STATUSES = ["none", "pending", "paid", "cancelled"] as const;

const DEFAULT_CHUNK_SIZE = 100;
const QUERY_CHUNK_SIZE = 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cleanText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizePhone = (value: unknown) => {
  const input = cleanText(value) ?? "";
  return input.replace(/[^\d+]/g, "").trim();
};

const truncate = (value: string | null | undefined, max: number): string | null => {
  if (!value) {
    return null;
  }
  return value.length > max ? value.slice(0, max) : value;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toMoney = (value: unknown, fallback = 0) => Number(toNumber(value, fallback).toFixed(2));

const toDateMs = (value: unknown) => {
  const text = cleanText(value);
  if (!text) {
    return 0;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const toIsoDateTime = (value: unknown, fallbackIso: string) => {
  const text = cleanText(value);
  if (!text) {
    return fallbackIso;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return fallbackIso;
  }
  return date.toISOString();
};

const isUuid = (value: string | null | undefined) =>
  Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );

const parseJson = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const asEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  const text = cleanText(value);
  if (text && allowed.includes(text as T)) {
    return text as T;
  }
  return fallback;
};

const hashValue = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 16);

const makeSyntheticId = (prefix: string, seed: string, runToken: string) =>
  `${prefix}_${runToken}_${hashValue(seed)}`;

const chunkArray = <T>(input: T[], size: number) => {
  if (!input.length) {
    return [] as T[][];
  }
  const safeSize = Math.max(1, size);
  const chunks: T[][] = [];
  for (let index = 0; index < input.length; index += safeSize) {
    chunks.push(input.slice(index, index + safeSize));
  }
  return chunks;
};

const uniqueStrings = (values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    seen.add(trimmed);
  }
  return [...seen];
};

const readRows = (db: SqliteDatabase, query: string): GenericRow[] => {
  try {
    const rows = db.prepare(query).all();
    return rows.filter(isRecord);
  } catch {
    return [];
  }
};

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    dryRun: false,
    chunkSize: DEFAULT_CHUNK_SIZE
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith("--chunk-size=")) {
      const parsed = Number(arg.split("=")[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.chunkSize = Math.floor(parsed);
      }
      continue;
    }
    if (arg === "--chunk-size") {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.chunkSize = Math.floor(parsed);
        index += 1;
      }
      continue;
    }

    if (arg.startsWith("--user-id=")) {
      options.userId = arg.split("=")[1]?.trim();
      continue;
    }
    if (arg === "--user-id") {
      options.userId = argv[index + 1]?.trim();
      index += 1;
      continue;
    }

    if (arg.startsWith("--pos-db=")) {
      options.posDbPath = arg.split("=")[1]?.trim();
      continue;
    }
    if (arg === "--pos-db") {
      options.posDbPath = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
  }

  options.chunkSize = Math.max(1, options.chunkSize);
  return options;
};

const resolvePosDbPath = (rawPath?: string) => {
  const candidates = rawPath
    ? [
        path.resolve(process.cwd(), rawPath),
        path.resolve(process.cwd(), "..", rawPath)
      ]
    : [
        path.resolve(process.cwd(), "pos.db"),
        path.resolve(process.cwd(), "..", "pos.db")
      ];

  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error(
      `pos.db not found. Checked: ${candidates.join(", ")}`
    );
  }
  return match;
};

const loadExistingValueSet = async <T extends object>(input: {
  repository: Repository<T>;
  alias: string;
  property: string;
  values: string[];
}) => {
  const set = new Set<string>();
  const values = uniqueStrings(input.values);
  for (const batch of chunkArray(values, QUERY_CHUNK_SIZE)) {
    const rows = await input.repository
      .createQueryBuilder(input.alias)
      .select(`${input.alias}.${input.property}`, "value")
      .where(`${input.alias}.${input.property} IN (:...values)`, { values: batch })
      .getRawMany<{ value: string | null }>();

    rows.forEach((row) => {
      const value = cleanText(row.value);
      if (value) {
        set.add(value);
      }
    });
  }
  return set;
};

const loadAllCustomerPhoneSet = async (repository: Repository<Customer>) => {
  const rows = await repository
    .createQueryBuilder("customer")
    .select("customer.phone", "phone")
    .getRawMany<{ phone: string }>();

  const set = new Set<string>();
  rows.forEach((row) => {
    const normalized = normalizePhone(row.phone);
    if (normalized) {
      set.add(normalized);
    }
  });
  return set;
};

const extractInvoiceNumber = (event: SyncEvent) => {
  if (event.eventType !== "invoice_upsert") {
    return null;
  }
  return truncate(cleanText(event.payload.invoiceNumber), 40);
};

const extractBookingNumber = (event: SyncEvent) => {
  if (event.eventType !== "gaming_booking_upsert") {
    return null;
  }
  return truncate(cleanText(event.payload.bookingNumber), 64);
};

const extractCustomerPhone = (event: SyncEvent) => {
  if (event.eventType !== "customer_upsert") {
    return null;
  }
  return normalizePhone(event.payload.phone);
};

const normalizeQueueEvent = (row: GenericRow, defaultDeviceId: string): QueueEventRow | null => {
  const payloadParsed = parseJson(row.payload_json);
  if (!isRecord(payloadParsed)) {
    return null;
  }

  const eventTypeRaw = cleanText(payloadParsed.eventType) ?? cleanText(row.event_type);
  if (!eventTypeRaw || !EVENT_TYPES.includes(eventTypeRaw as SyncEventType)) {
    return null;
  }
  const eventType = eventTypeRaw as SyncEventType;

  const idempotencyKey = truncate(
    cleanText(payloadParsed.idempotencyKey) ?? cleanText(row.idempotency_key),
    120
  );
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return null;
  }

  if (!isRecord(payloadParsed.payload)) {
    return null;
  }

  const deviceId = truncate(cleanText(payloadParsed.deviceId) ?? defaultDeviceId, 80) ?? defaultDeviceId;
  const createdAtMs = toDateMs(row.created_at) || Date.now();
  const sourceQueueId = cleanText(row.id);

  return {
    sourceQueueId,
    createdAtMs,
    event: {
      eventType,
      idempotencyKey,
      deviceId,
      payload: payloadParsed.payload
    }
  };
};

const parseAddOnsMeta = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const addOnId = truncate(cleanText(entry.addOnId), 80);
      const name = truncate(cleanText(entry.name), 120);
      if (!addOnId || !name) {
        return null;
      }

      return {
        addOnId,
        name,
        unitPrice: toMoney(entry.unitPrice),
        gstPercentage: toNumber(entry.gstPercentage, 0),
        quantity: Math.max(1, Math.floor(toNumber(entry.quantity, 1)))
      };
    })
    .filter((entry): entry is { addOnId: string; name: string; unitPrice: number; gstPercentage: number; quantity: number } =>
      Boolean(entry)
    );
};

const buildFallbackCustomerEvent = (
  row: GenericRow,
  defaults: FallbackDefaults
): SyncEvent | null => {
  const phone = normalizePhone(row.phone);
  const name = truncate(cleanText(row.name), 120) ?? "Customer";
  if (!phone || phone.length < 8) {
    return null;
  }

  const localId = cleanText(row.local_id) ?? phone;
  return {
    eventType: "customer_upsert",
    idempotencyKey: makeSyntheticId("posdb_customer", localId, defaults.runToken),
    deviceId: defaults.deviceId,
    payload: {
      name,
      phone,
      email: truncate(cleanText(row.email), 160) ?? undefined,
      notes: truncate(cleanText(row.notes), 600) ?? undefined,
      sourceDeviceId: defaults.deviceId
    }
  };
};

const buildFallbackInvoiceEvent = (
  row: GenericRow,
  defaults: FallbackDefaults
): SyncEvent | null => {
  const invoiceNumber = truncate(cleanText(row.invoice_number), 40);
  if (!invoiceNumber) {
    return null;
  }

  const rawStatus = cleanText(row.status)?.toLowerCase();
  if (rawStatus === "draft") {
    return null;
  }

  const nowIso = new Date().toISOString();
  const linesRaw = parseJson(row.lines_json);
  const linesArray = Array.isArray(linesRaw) ? linesRaw.filter(isRecord) : [];

  const lines = linesArray.map((line, index) => {
    const lineType = asEnum(line.lineType, LINE_TYPES, "custom");
    const referenceIdRaw = truncate(cleanText(line.refId) ?? cleanText(line.referenceId), 120);
    const referenceId = isUuid(referenceIdRaw) ? referenceIdRaw : null;
    const nameSnapshot = truncate(cleanText(line.name) ?? cleanText(line.nameSnapshot), 180) ?? `Line ${index + 1}`;
    const quantity = Math.max(0.001, Number(toNumber(line.quantity, 1).toFixed(3)));
    const unitPrice = toMoney(line.unitPrice, 0);
    const gstPercentage = Number(toNumber(line.gstPercentage, 0).toFixed(2));
    const addOns = parseAddOnsMeta(line.addOns);
    const addOnTotal = addOns.reduce(
      (sum, addOn) => sum + addOn.unitPrice * addOn.quantity * quantity,
      0
    );
    const computedLineTotal = toMoney(unitPrice * quantity + addOnTotal, 0);
    const lineTotal = toMoney(line.lineTotal, computedLineTotal);

    const lineMeta: Record<string, unknown> = {};
    if (addOns.length) {
      lineMeta.addOns = addOns;
    }
    if (line.isComplimentary === true) {
      lineMeta.isComplimentary = true;
      const reason = truncate(cleanText(line.complimentaryReason), 180);
      if (reason) {
        lineMeta.complimentaryReason = reason;
      }
    }

    return {
      lineType,
      referenceId,
      nameSnapshot,
      quantity,
      unitPrice,
      discountAmount: 0,
      gstPercentage,
      lineTotal,
      meta: Object.keys(lineMeta).length ? lineMeta : null
    };
  });

  const totalsRaw = parseJson(row.totals_json);
  const totals = isRecord(totalsRaw) ? totalsRaw : {};
  const subtotalFallback = toMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0), 0);
  const subtotal = toMoney(totals.subtotal, subtotalFallback);
  const itemDiscountAmount = toMoney(totals.itemDiscountAmount, 0);
  const couponDiscountAmount = toMoney(totals.couponDiscountAmount, 0);
  const manualDiscountAmount = toMoney(totals.manualDiscountAmount, 0);
  const taxAmount = toMoney(totals.taxAmount, 0);
  const totalFallback = toMoney(
    Math.max(0, subtotal + taxAmount - itemDiscountAmount - couponDiscountAmount - manualDiscountAmount),
    0
  );
  const totalAmount = toMoney(totals.totalAmount, totalFallback);

  const paymentRaw = parseJson(row.payment_json);
  const payment = isRecord(paymentRaw) ? paymentRaw : {};
  const paymentMode = asEnum(payment.mode, PAYMENT_MODES, "cash");
  const orderType = asEnum(row.order_type, INVOICE_ORDER_TYPES, "takeaway");
  const status = asEnum(rawStatus, INVOICE_STATUSES, "paid");
  const kitchenStatus = asEnum(
    row.kitchen_status,
    KITCHEN_STATUSES,
    status === "paid" ? "served" : "queued"
  );
  const createdAtIso = toIsoDateTime(row.created_at, nowIso);

  const snapshotRaw = parseJson(row.customer_snapshot_json);
  const customerSnapshot = isRecord(snapshotRaw) ? snapshotRaw : null;
  const customerName = truncate(cleanText(customerSnapshot?.name), 120);
  const customerPhone = truncate(normalizePhone(customerSnapshot?.phone), 20);

  const offerRaw = parseJson(row.offer_json);
  const appliedOffer = isRecord(offerRaw) ? offerRaw : null;
  const couponCode = truncate(cleanText(appliedOffer?.couponCode), 60);

  const localOrderId = truncate(cleanText(row.local_order_id), 80) ?? invoiceNumber;
  return {
    eventType: "invoice_upsert",
    idempotencyKey: makeSyntheticId("posdb_invoice", `${invoiceNumber}:${localOrderId}`, defaults.runToken),
    deviceId: defaults.deviceId,
    payload: {
      invoiceNumber,
      orderReference: localOrderId,
      customerId: null,
      customerPhone: customerPhone ?? null,
      customerName: customerName ?? null,
      branchId: defaults.branchId,
      deviceId: defaults.deviceId,
      orderType,
      tableLabel: truncate(cleanText(row.table_label), 40),
      kitchenStatus,
      status,
      paymentMode,
      subtotal,
      itemDiscountAmount,
      couponDiscountAmount,
      manualDiscountAmount,
      taxAmount,
      totalAmount,
      couponCode: couponCode ?? null,
      notes: truncate(cleanText(row.notes), 800),
      customerSnapshot:
        customerSnapshot && (customerName || customerPhone)
          ? {
              ...customerSnapshot,
              name: customerName ?? customerSnapshot.name ?? null,
              phone: customerPhone ?? customerSnapshot.phone ?? null
            }
          : null,
      totalsSnapshot: {
        subtotal,
        itemDiscountAmount,
        couponDiscountAmount,
        manualDiscountAmount,
        taxAmount,
        totalAmount
      },
      linesSnapshot: {
        count: lines.length,
        appliedOffer
      },
      sourceCreatedAt: createdAtIso,
      lines,
      payments: [],
      usageEvents: []
    }
  };
};

const derivePaymentModeFromBreakdown = (breakdown: { cash: number; card: number; upi: number }) => {
  const active = (["cash", "card", "upi"] as const).filter((mode) => breakdown[mode] > 0.01);
  if (active.length === 0) {
    return null;
  }
  if (active.length === 1) {
    return active[0];
  }
  return "mixed";
};

const buildFallbackGamingEvent = (
  row: GenericRow,
  defaults: FallbackDefaults
): SyncEvent | null => {
  const bookingNumber = truncate(cleanText(row.booking_number), 64);
  if (!bookingNumber) {
    return null;
  }

  const bookingType = asEnum(row.booking_type, GAMING_TYPES, "snooker");
  const resourceCode = truncate(cleanText(row.resource_code)?.toLowerCase(), 40);
  if (!resourceCode) {
    return null;
  }

  const resourceCodesRaw = parseJson(row.resource_codes_json);
  const resourceCodesFromJson = Array.isArray(resourceCodesRaw)
    ? resourceCodesRaw
        .map((value) => truncate(cleanText(value)?.toLowerCase(), 40))
        .filter((value): value is string => Boolean(value))
    : [];
  const resourceCodes = [...new Set(resourceCodesFromJson.length ? resourceCodesFromJson : [resourceCode])];

  const customersRaw = parseJson(row.customers_json);
  const customersFromJson = Array.isArray(customersRaw)
    ? customersRaw
        .filter(isRecord)
        .map((entry) => ({
          name: truncate(cleanText(entry.name), 120),
          phone: truncate(normalizePhone(entry.phone), 20)
        }))
        .filter(
          (entry): entry is { name: string; phone: string } =>
            typeof entry.name === "string" &&
            entry.name.length > 0 &&
            typeof entry.phone === "string" &&
            entry.phone.length >= 8
        )
    : [];

  const primaryName = truncate(cleanText(row.primary_customer_name), 120);
  const primaryPhone = truncate(normalizePhone(row.primary_customer_phone), 20);

  let customers = customersFromJson;
  if (!customers.length && primaryName && primaryPhone && primaryPhone.length >= 8) {
    customers = [{ name: primaryName, phone: primaryPhone }];
  }
  if (!customers.length) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const checkInAt = toIsoDateTime(row.check_in_at, nowIso);
  const checkOutAtText = cleanText(row.check_out_at);
  const checkOutAt = checkOutAtText ? toIsoDateTime(checkOutAtText, nowIso) : undefined;

  let status = asEnum(
    row.status,
    GAMING_STATUSES,
    checkOutAt ? "completed" : "ongoing"
  );
  if (checkOutAt && (status === "upcoming" || status === "ongoing")) {
    status = "completed";
  }

  const hourlyRate = toMoney(row.hourly_rate, 0);
  const systemCalculatedAmount = toMoney(row.system_calculated_amount, 0);
  const finalAmount = toMoney(
    row.final_amount,
    status === "completed" ? systemCalculatedAmount : 0
  );
  const paidBreakdown = {
    cash: toMoney(row.paid_cash_amount, 0),
    card: toMoney(row.paid_card_amount, 0),
    upi: toMoney(row.paid_upi_amount, 0)
  };
  const targetPayable = status === "completed" ? Math.max(finalAmount, systemCalculatedAmount) : systemCalculatedAmount;
  const paidTotal = toMoney(paidBreakdown.cash + paidBreakdown.card + paidBreakdown.upi, 0);

  let paymentStatus = asEnum(
    row.payment_status,
    GAMING_PAYMENT_STATUSES,
    paidTotal > 0 ? "paid" : "pending"
  );
  let paymentMode = asEnum(row.payment_mode, GAMING_PAYMENT_MODES, "cash");

  if (paymentStatus === "paid") {
    if (targetPayable <= 0) {
      paidBreakdown.cash = 0;
      paidBreakdown.card = 0;
      paidBreakdown.upi = 0;
      paymentMode = "cash";
    } else if (Math.abs(paidTotal - targetPayable) > 0.01) {
      const resolvedMode =
        paymentMode !== "mixed" ? paymentMode : derivePaymentModeFromBreakdown(paidBreakdown) ?? "cash";
      paidBreakdown.cash = 0;
      paidBreakdown.card = 0;
      paidBreakdown.upi = 0;
      const resolvedModeKey = resolvedMode as "cash" | "card" | "upi";
      paidBreakdown[resolvedModeKey] = targetPayable;
      paymentMode = resolvedModeKey;
    } else {
      paymentMode = derivePaymentModeFromBreakdown(paidBreakdown) ?? paymentMode;
    }
  } else {
    paymentMode = "cash";
    paidBreakdown.cash = 0;
    paidBreakdown.card = 0;
    paidBreakdown.upi = 0;
  }

  const amountOverrideReason = truncate(cleanText(row.amount_override_reason), 500);
  const effectiveOverrideReason =
    status === "completed" && Math.abs(finalAmount - systemCalculatedAmount) > 0.01
      ? amountOverrideReason ?? "Imported from pos.db"
      : amountOverrideReason;

  const rawStaffId = truncate(cleanText(row.staff_id), 64);
  const staffId = isUuid(rawStaffId) ? rawStaffId : undefined;

  return {
    eventType: "gaming_booking_upsert",
    idempotencyKey: makeSyntheticId(
      "posdb_gaming",
      `${bookingNumber}:${cleanText(row.local_booking_id) ?? bookingNumber}`,
      defaults.runToken
    ),
    deviceId: defaults.deviceId,
    payload: {
      bookingNumber,
      bookingType,
      resourceCode,
      resourceCodes,
      playerCount: Math.max(1, Math.floor(toNumber(row.player_count, customers.length || 1))),
      checkInAt,
      checkOutAt,
      hourlyRate,
      customers,
      bookingChannel: truncate(cleanText(row.booking_channel), 40) ?? "desktop",
      note: truncate(cleanText(row.note), 1200) ?? undefined,
      sourceDeviceId: truncate(cleanText(row.source_device_id), 80) ?? defaults.deviceId,
      status,
      paymentStatus,
      paymentMode,
      paymentBreakdown:
        paymentStatus === "paid"
          ? {
              cash: paidBreakdown.cash,
              card: paidBreakdown.card,
              upi: paidBreakdown.upi
            }
          : undefined,
      finalAmount,
      systemCalculatedAmount,
      extraMemberCount: Math.max(0, Math.floor(toNumber(row.extra_member_count, 0))),
      extraMemberCharge: toMoney(row.extra_member_charge, 0),
      amountOverrideReason: effectiveOverrideReason ?? undefined,
      foodOrderReference: truncate(cleanText(row.food_order_reference), 80) ?? undefined,
      foodInvoiceNumber: truncate(cleanText(row.food_invoice_number), 64) ?? undefined,
      foodInvoiceStatus: asEnum(row.food_invoice_status, FOOD_INVOICE_STATUSES, "none"),
      foodAndBeverageAmount: toMoney(row.food_and_beverage_amount, 0),
      staffId
    }
  };
};

const importGamingEventDirect = async (input: {
  event: SyncEvent;
  context: SyncContext;
  bookingRepository: Repository<GamingBooking>;
  userRepository: Repository<User>;
}) => {
  const { event, context, bookingRepository, userRepository } = input;
  const payload = event.payload;

  const bookingNumber = truncate(cleanText(payload.bookingNumber), 64);
  if (!bookingNumber) {
    return { success: false, message: "Direct gaming import skipped: booking number missing." };
  }

  const existing = await bookingRepository.findOne({ where: { bookingNumber } });
  if (existing) {
    return { success: true, duplicate: true, message: "Booking already exists in live DB." };
  }

  const bookingType = asEnum(payload.bookingType, GAMING_TYPES, "snooker");
  const resourceCode = truncate(cleanText(payload.resourceCode)?.toLowerCase(), 40);
  if (!resourceCode) {
    return { success: false, message: `Direct gaming import failed for ${bookingNumber}: resource code missing.` };
  }

  const resourceCodes = Array.isArray(payload.resourceCodes)
    ? payload.resourceCodes
        .map((value) => truncate(cleanText(value)?.toLowerCase(), 40))
        .filter((value): value is string => Boolean(value))
    : [];
  const normalizedResourceCodes = [...new Set(resourceCodes.length ? resourceCodes : [resourceCode])];

  const rawCustomers = Array.isArray(payload.customers) ? payload.customers.filter(isRecord) : [];
  const customerGroup = rawCustomers
    .map((entry) => ({
      name: truncate(cleanText(entry.name), 120),
      phone: truncate(normalizePhone(entry.phone), 20)
    }))
    .filter(
      (entry): entry is { name: string; phone: string } =>
        typeof entry.name === "string" &&
        entry.name.length > 0 &&
        typeof entry.phone === "string" &&
        entry.phone.length >= 8
    );

  if (!customerGroup.length) {
    return { success: false, message: `Direct gaming import failed for ${bookingNumber}: valid customers missing.` };
  }

  const primaryCustomer = customerGroup.find((member) => member.phone.length >= 8) ?? customerGroup[0];
  const nowIso = new Date().toISOString();
  const checkInAt = toIsoDateTime(payload.checkInAt, nowIso);
  const checkOutAtText = cleanText(payload.checkOutAt);
  const checkOutAt = checkOutAtText ? toIsoDateTime(checkOutAtText, nowIso) : null;
  const status = asEnum(
    payload.status,
    GAMING_STATUSES,
    checkOutAt ? "completed" : "ongoing"
  );

  const systemCalculatedAmount = toMoney(payload.systemCalculatedAmount, 0);
  const finalAmount = toMoney(payload.finalAmount, status === "completed" ? systemCalculatedAmount : 0);
  const targetAmount = status === "completed" ? Math.max(finalAmount, systemCalculatedAmount) : systemCalculatedAmount;
  const syncedPlayerCount = Math.max(1, Math.floor(toNumber(payload.playerCount, customerGroup.length)));
  const syncedExtraMemberCount = Math.max(0, Math.floor(toNumber(payload.extraMemberCount, 0)));
  const inferredPlayerCountFromExtra =
    bookingType === "snooker" && syncedExtraMemberCount > 0
      ? Math.max(1, normalizedResourceCodes.length) * 4 + syncedExtraMemberCount
      : syncedPlayerCount;
  const playerCount = Math.max(syncedPlayerCount, customerGroup.length, inferredPlayerCountFromExtra);

  let paymentStatus = asEnum(payload.paymentStatus, GAMING_PAYMENT_STATUSES, "pending");
  const paymentBreakdownInput = isRecord(payload.paymentBreakdown) ? payload.paymentBreakdown : {};
  const paymentBreakdown = {
    cash: toMoney(paymentBreakdownInput.cash, 0),
    card: toMoney(paymentBreakdownInput.card, 0),
    upi: toMoney(paymentBreakdownInput.upi, 0)
  };
  let paymentMode = asEnum(payload.paymentMode, GAMING_PAYMENT_MODES, "cash");

  const currentPaidTotal = toMoney(paymentBreakdown.cash + paymentBreakdown.card + paymentBreakdown.upi, 0);
  if (paymentStatus === "paid") {
    if (targetAmount <= 0) {
      paymentBreakdown.cash = 0;
      paymentBreakdown.card = 0;
      paymentBreakdown.upi = 0;
      paymentMode = "cash";
    } else if (Math.abs(currentPaidTotal - targetAmount) > 0.01) {
      const resolvedMode =
        paymentMode !== "mixed" ? paymentMode : derivePaymentModeFromBreakdown(paymentBreakdown) ?? "cash";
      const resolvedModeKey = resolvedMode as "cash" | "card" | "upi";
      paymentBreakdown.cash = 0;
      paymentBreakdown.card = 0;
      paymentBreakdown.upi = 0;
      paymentBreakdown[resolvedModeKey] = targetAmount;
      paymentMode = resolvedModeKey;
    } else {
      paymentMode = derivePaymentModeFromBreakdown(paymentBreakdown) ?? paymentMode;
    }
  } else {
    paymentStatus = "pending";
    paymentBreakdown.cash = 0;
    paymentBreakdown.card = 0;
    paymentBreakdown.upi = 0;
  }

  const requestedStaffId = truncate(cleanText(payload.staffId), 64);
  let staffId = context.userId;
  if (requestedStaffId && isUuid(requestedStaffId)) {
    const staff = await userRepository.findOne({ where: { id: requestedStaffId, isActive: true } });
    if (staff) {
      staffId = staff.id;
    }
  }

  const primaryLabel = GAMING_RESOURCE_LABELS[normalizedResourceCodes[0]] ?? normalizedResourceCodes[0];
  const resourceLabel =
    normalizedResourceCodes.length > 1
      ? `${primaryLabel} +${normalizedResourceCodes.length - 1}`
      : primaryLabel;

  const booking = bookingRepository.create({
    bookingNumber,
    bookingType,
    resourceCode,
    resourceCodes: normalizedResourceCodes,
    resourceLabel: truncate(resourceLabel, 120) ?? resourceCode,
    customerGroup,
    primaryCustomerName: primaryCustomer.name,
    primaryCustomerPhone: primaryCustomer.phone,
    checkInAt: new Date(checkInAt),
    checkOutAt: checkOutAt ? new Date(checkOutAt) : null,
    hourlyRate: toMoney(payload.hourlyRate, 0),
    playerCount,
    finalAmount,
    systemCalculatedAmount,
    extraMemberCount: syncedExtraMemberCount,
    extraMemberCharge: toMoney(payload.extraMemberCharge, 0),
    amountOverrideReason: truncate(cleanText(payload.amountOverrideReason), 500),
    status,
    paymentStatus,
    paymentMode: paymentStatus === "paid" ? paymentMode : null,
    paidCashAmount: paymentBreakdown.cash,
    paidCardAmount: paymentBreakdown.card,
    paidUpiAmount: paymentBreakdown.upi,
    foodOrderReference: truncate(cleanText(payload.foodOrderReference), 80),
    foodInvoiceNumber: truncate(cleanText(payload.foodInvoiceNumber), 64),
    foodInvoiceStatus: asEnum(payload.foodInvoiceStatus, FOOD_INVOICE_STATUSES, "none"),
    foodAndBeverageAmount: toMoney(payload.foodAndBeverageAmount, 0),
    bookingChannel: truncate(cleanText(payload.bookingChannel), 40) ?? "desktop",
    sourceDeviceId: truncate(cleanText(payload.sourceDeviceId), 80) ?? event.deviceId ?? null,
    note: truncate(cleanText(payload.note), 1200),
    staffId
  });

  await bookingRepository.save(booking);
  return { success: true, duplicate: false, message: "Imported via direct insert fallback." };
};

const selectContextUser = async (userId?: string) => {
  const repository = AppDataSource.getRepository(User);
  if (userId) {
    const user = await repository.findOne({ where: { id: userId, isActive: true } });
    if (!user) {
      throw new Error(`Active user not found for --user-id=${userId}`);
    }
    return user;
  }

  const rolePriority: UserRole[] = [
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.STAFF,
    UserRole.SNOOKER_STAFF
  ];

  for (const role of rolePriority) {
    const user = await repository.findOne({
      where: { role, isActive: true },
      order: { createdAt: "ASC" }
    });
    if (user) {
      return user;
    }
  }

  throw new Error("No active user found to run POS sync import.");
};

const tryGetSetting = (settings: Map<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = settings.get(key);
    const cleaned = cleanText(value);
    if (cleaned) {
      return cleaned;
    }
  }
  return null;
};

const run = async () => {
  const options = parseArgs(process.argv.slice(2));
  const posDbPath = resolvePosDbPath(options.posDbPath);
  const runToken = `${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

  await initDataSource();
  const contextUser = await selectContextUser(options.userId);
  const context: SyncContext = { userId: contextUser.id, role: contextUser.role };

  const db = new DatabaseSync(posDbPath, { readonly: true });
  try {
    const queueRows = readRows(
      db,
      "SELECT * FROM sync_queue ORDER BY datetime(created_at) ASC, created_at ASC"
    );
    const customerRows = readRows(
      db,
      "SELECT * FROM customers_local ORDER BY datetime(updated_at) DESC, updated_at DESC"
    );
    const orderRows = readRows(
      db,
      "SELECT * FROM orders_local ORDER BY datetime(updated_at) DESC, updated_at DESC"
    );
    const gamingRows = readRows(
      db,
      "SELECT * FROM gaming_bookings_local ORDER BY datetime(updated_at) DESC, updated_at DESC"
    );
    const settingsRows = readRows(db, "SELECT * FROM app_settings");

    const settingsMap = new Map<string, string>();
    settingsRows.forEach((row) => {
      const key = cleanText(row.key);
      const value = cleanText(row.value);
      if (key && value !== null) {
        settingsMap.set(key, value);
      }
    });

    const defaults: FallbackDefaults = {
      runToken,
      deviceId:
        tryGetSetting(settingsMap, ["deviceId", "device_id", "DEVICE_ID"]) ??
        "pos-db-import",
      branchId: tryGetSetting(settingsMap, ["branchId", "branch_id", "BRANCH_ID"])
    };

    const parsedQueueRows = queueRows
      .map((row) => normalizeQueueEvent(row, defaults.deviceId))
      .filter((row): row is QueueEventRow => Boolean(row))
      .sort((left, right) => left.createdAtMs - right.createdAtMs);

    const queueInvoiceNumbers = parsedQueueRows.map((row) => extractInvoiceNumber(row.event));
    const queueBookingNumbers = parsedQueueRows.map((row) => extractBookingNumber(row.event));
    const queueCustomerPhones = parsedQueueRows.map((row) => extractCustomerPhone(row.event));
    const queueUsageKeys = parsedQueueRows
      .filter((row) => row.event.eventType === "usage_event")
      .map((row) => row.event.idempotencyKey);
    const queueIdempotencyKeys = parsedQueueRows.map((row) => row.event.idempotencyKey);

    const localInvoiceNumbers = orderRows.map((row) => truncate(cleanText(row.invoice_number), 40));
    const localBookingNumbers = gamingRows.map((row) => truncate(cleanText(row.booking_number), 64));
    const localCustomerPhones = customerRows.map((row) => normalizePhone(row.phone));

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const bookingRepository = AppDataSource.getRepository(GamingBooking);
    const usageRepository = AppDataSource.getRepository(InvoiceUsageEvent);
    const receiptRepository = AppDataSource.getRepository(SyncReceipt);
    const customerRepository = AppDataSource.getRepository(Customer);

    const [existingInvoiceNumbers, existingBookingNumbers, existingUsageKeys, existingReceiptKeys, existingCustomerPhones] =
      await Promise.all([
        loadExistingValueSet({
          repository: invoiceRepository,
          alias: "invoice",
          property: "invoiceNumber",
          values: [...queueInvoiceNumbers, ...localInvoiceNumbers].filter(
            (value): value is string => Boolean(value)
          )
        }),
        loadExistingValueSet({
          repository: bookingRepository,
          alias: "booking",
          property: "bookingNumber",
          values: [...queueBookingNumbers, ...localBookingNumbers].filter(
            (value): value is string => Boolean(value)
          )
        }),
        loadExistingValueSet({
          repository: usageRepository,
          alias: "usage",
          property: "idempotencyKey",
          values: queueUsageKeys
        }),
        loadExistingValueSet({
          repository: receiptRepository,
          alias: "receipt",
          property: "idempotencyKey",
          values: queueIdempotencyKeys
        }),
        loadAllCustomerPhoneSet(customerRepository)
      ]);

    const existing: ExistingSets = {
      invoiceNumbers: existingInvoiceNumbers,
      bookingNumbers: existingBookingNumbers,
      customerPhones: existingCustomerPhones,
      usageEventKeys: existingUsageKeys,
      receiptKeys: existingReceiptKeys
    };

    const plannedInvoiceNumbers = new Set(existing.invoiceNumbers);
    const plannedBookingNumbers = new Set(existing.bookingNumbers);
    const plannedCustomerPhones = new Set(existing.customerPhones);
    const plannedUsageKeys = new Set(existing.usageEventKeys);
    const plannedIdempotencyKeys = new Set<string>();

    const skippedCounters = new Map<string, number>();
    const bumpSkip = (reason: string) => {
      skippedCounters.set(reason, (skippedCounters.get(reason) ?? 0) + 1);
    };

    const selectedQueueEvents: SyncEvent[] = [];
    for (const row of parsedQueueRows) {
      const event = row.event;
      const baseId = event.idempotencyKey;

      if (event.eventType === "customer_upsert") {
        const phone = normalizePhone(event.payload.phone);
        const name = truncate(cleanText(event.payload.name), 120) ?? "Customer";
        if (!phone || phone.length < 8) {
          bumpSkip("queue_customer_invalid_phone");
          continue;
        }
        if (plannedCustomerPhones.has(phone)) {
          bumpSkip("queue_customer_exists");
          continue;
        }

        const eventToQueue: SyncEvent = {
          ...event,
          idempotencyKey:
            existing.receiptKeys.has(baseId) || plannedIdempotencyKeys.has(baseId)
              ? makeSyntheticId("retry_customer", `${baseId}:${phone}`, runToken)
              : baseId,
          payload: {
            ...event.payload,
            name,
            phone
          }
        };

        plannedCustomerPhones.add(phone);
        plannedIdempotencyKeys.add(eventToQueue.idempotencyKey);
        selectedQueueEvents.push(eventToQueue);
        continue;
      }

      if (event.eventType === "invoice_upsert") {
        const invoiceNumber = truncate(cleanText(event.payload.invoiceNumber), 40);
        if (!invoiceNumber) {
          bumpSkip("queue_invoice_missing_number");
          continue;
        }
        if (plannedInvoiceNumbers.has(invoiceNumber)) {
          bumpSkip("queue_invoice_exists");
          continue;
        }

        const eventToQueue: SyncEvent = {
          ...event,
          idempotencyKey:
            existing.receiptKeys.has(baseId) || plannedIdempotencyKeys.has(baseId)
              ? makeSyntheticId("retry_invoice", `${baseId}:${invoiceNumber}`, runToken)
              : baseId,
          payload: {
            ...event.payload,
            invoiceNumber
          }
        };

        plannedInvoiceNumbers.add(invoiceNumber);
        plannedIdempotencyKeys.add(eventToQueue.idempotencyKey);
        selectedQueueEvents.push(eventToQueue);
        continue;
      }

      if (event.eventType === "gaming_booking_upsert") {
        const bookingNumber = truncate(cleanText(event.payload.bookingNumber), 64);
        if (!bookingNumber) {
          bumpSkip("queue_gaming_missing_number");
          continue;
        }
        if (plannedBookingNumbers.has(bookingNumber)) {
          bumpSkip("queue_gaming_exists");
          continue;
        }

        const eventToQueue: SyncEvent = {
          ...event,
          idempotencyKey:
            existing.receiptKeys.has(baseId) || plannedIdempotencyKeys.has(baseId)
              ? makeSyntheticId("retry_gaming", `${baseId}:${bookingNumber}`, runToken)
              : baseId,
          payload: {
            ...event.payload,
            bookingNumber
          }
        };

        plannedBookingNumbers.add(bookingNumber);
        plannedIdempotencyKeys.add(eventToQueue.idempotencyKey);
        selectedQueueEvents.push(eventToQueue);
        continue;
      }

      const usageId = truncate(cleanText(event.idempotencyKey), 120);
      if (!usageId || usageId.length < 8) {
        bumpSkip("queue_usage_missing_idempotency");
        continue;
      }
      if (plannedUsageKeys.has(usageId)) {
        bumpSkip("queue_usage_exists");
        continue;
      }

      const eventToQueue: SyncEvent = {
        ...event,
        idempotencyKey:
          existing.receiptKeys.has(baseId) || plannedIdempotencyKeys.has(baseId)
            ? makeSyntheticId("retry_usage", `${baseId}:${usageId}`, runToken)
            : baseId
      };

      plannedUsageKeys.add(eventToQueue.idempotencyKey);
      plannedIdempotencyKeys.add(eventToQueue.idempotencyKey);
      selectedQueueEvents.push(eventToQueue);
    }

    const selectedFallbackCustomerEvents: SyncEvent[] = [];
    for (const row of customerRows) {
      const event = buildFallbackCustomerEvent(row, defaults);
      if (!event) {
        bumpSkip("fallback_customer_invalid");
        continue;
      }
      const phone = extractCustomerPhone(event);
      if (!phone || phone.length < 8) {
        bumpSkip("fallback_customer_invalid_phone");
        continue;
      }
      if (plannedCustomerPhones.has(phone)) {
        bumpSkip("fallback_customer_exists");
        continue;
      }

      plannedCustomerPhones.add(phone);
      plannedIdempotencyKeys.add(event.idempotencyKey);
      selectedFallbackCustomerEvents.push(event);
    }

    const latestOrderByInvoice = new Map<string, GenericRow>();
    for (const row of orderRows) {
      const invoiceNumber = truncate(cleanText(row.invoice_number), 40);
      if (!invoiceNumber) {
        continue;
      }
      const current = latestOrderByInvoice.get(invoiceNumber);
      if (!current || toDateMs(row.updated_at) > toDateMs(current.updated_at)) {
        latestOrderByInvoice.set(invoiceNumber, row);
      }
    }

    const selectedFallbackInvoiceEvents: SyncEvent[] = [];
    for (const row of latestOrderByInvoice.values()) {
      const event = buildFallbackInvoiceEvent(row, defaults);
      if (!event) {
        bumpSkip("fallback_invoice_invalid");
        continue;
      }

      const invoiceNumber = extractInvoiceNumber(event);
      if (!invoiceNumber) {
        bumpSkip("fallback_invoice_missing_number");
        continue;
      }
      if (plannedInvoiceNumbers.has(invoiceNumber)) {
        bumpSkip("fallback_invoice_exists");
        continue;
      }

      plannedInvoiceNumbers.add(invoiceNumber);
      plannedIdempotencyKeys.add(event.idempotencyKey);
      selectedFallbackInvoiceEvents.push(event);
    }

    const latestGamingByBooking = new Map<string, GenericRow>();
    for (const row of gamingRows) {
      const bookingNumber = truncate(cleanText(row.booking_number), 64);
      if (!bookingNumber) {
        continue;
      }
      const current = latestGamingByBooking.get(bookingNumber);
      if (!current || toDateMs(row.updated_at) > toDateMs(current.updated_at)) {
        latestGamingByBooking.set(bookingNumber, row);
      }
    }

    const selectedFallbackGamingEvents: SyncEvent[] = [];
    for (const row of latestGamingByBooking.values()) {
      const event = buildFallbackGamingEvent(row, defaults);
      if (!event) {
        bumpSkip("fallback_gaming_invalid");
        continue;
      }

      const bookingNumber = extractBookingNumber(event);
      if (!bookingNumber) {
        bumpSkip("fallback_gaming_missing_number");
        continue;
      }
      if (plannedBookingNumbers.has(bookingNumber)) {
        bumpSkip("fallback_gaming_exists");
        continue;
      }

      plannedBookingNumbers.add(bookingNumber);
      plannedIdempotencyKeys.add(event.idempotencyKey);
      selectedFallbackGamingEvents.push(event);
    }

    const selectedEvents: SyncEvent[] = [
      ...selectedQueueEvents,
      ...selectedFallbackCustomerEvents,
      ...selectedFallbackInvoiceEvents,
      ...selectedFallbackGamingEvents
    ];

    const headerLines = [
      `Using POS DB: ${posDbPath}`,
      `Live context user: ${contextUser.username} (${contextUser.role})`,
      `Queue rows parsed: ${parsedQueueRows.length}`,
      `Fallback rows - customers: ${customerRows.length}, orders: ${latestOrderByInvoice.size}, gaming: ${latestGamingByBooking.size}`,
      `Selected events - queue: ${selectedQueueEvents.length}, fallback customers: ${selectedFallbackCustomerEvents.length}, fallback invoices: ${selectedFallbackInvoiceEvents.length}, fallback gaming: ${selectedFallbackGamingEvents.length}`,
      `Total events to process: ${selectedEvents.length}`
    ];
    headerLines.forEach((line) => console.log(line));

    if (skippedCounters.size) {
      console.log("Skipped breakdown:");
      [...skippedCounters.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([reason, count]) => {
          console.log(`  - ${reason}: ${count}`);
        });
    }

    if (options.dryRun || !selectedEvents.length) {
      console.log(options.dryRun ? "Dry run completed. No changes written." : "Nothing to sync.");
      return;
    }

    const syncService = new PosSyncService();
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalDuplicates = 0;
    const failedResults: Array<{ eventType: string; idempotencyKey: string; message: string }> = [];

    const userRepository = AppDataSource.getRepository(User);
    for (const batch of chunkArray(selectedEvents, options.chunkSize)) {
      const batchByIdempotency = new Map(batch.map((event) => [event.idempotencyKey, event]));
      const response = await syncService.processBatch(
        batch as Parameters<PosSyncService["processBatch"]>[0],
        context as Parameters<PosSyncService["processBatch"]>[1]
      );

      totalProcessed += response.summary.total;
      totalSuccess += response.summary.successful;
      totalFailed += response.summary.failed;
      totalDuplicates += response.summary.duplicates;

      for (const result of response.results.filter((entry) => !entry.success)) {
        const sourceEvent = batchByIdempotency.get(result.idempotencyKey);
        const canFallbackToDirectGamingInsert =
          result.eventType === "gaming_booking_upsert" &&
          sourceEvent?.eventType === "gaming_booking_upsert" &&
          /occupied/i.test(result.message);

        if (canFallbackToDirectGamingInsert && sourceEvent) {
          const directResult = await importGamingEventDirect({
            event: sourceEvent,
            context,
            bookingRepository,
            userRepository
          });

          if (directResult.success) {
            totalFailed -= 1;
            totalSuccess += 1;
            if (directResult.duplicate) {
              totalDuplicates += 1;
            }
            continue;
          }
        }

        failedResults.push({
          eventType: result.eventType,
          idempotencyKey: result.idempotencyKey,
          message: result.message
        });
      }
    }

    console.log("Sync completed:");
    console.log(`  - processed: ${totalProcessed}`);
    console.log(`  - successful: ${totalSuccess}`);
    console.log(`  - failed: ${totalFailed}`);
    console.log(`  - duplicates: ${totalDuplicates}`);

    if (failedResults.length) {
      console.log("Failed event samples:");
      failedResults.slice(0, 15).forEach((result) => {
        console.log(`  - ${result.eventType} | ${result.idempotencyKey} | ${result.message}`);
      });
      if (failedResults.length > 15) {
        console.log(`  ...and ${failedResults.length - 15} more`);
      }
    }
  } finally {
    db.close();
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
