import { AppDataSource } from "../../database/data-source";
import { UserRole } from "../../constants/roles";
import { AppError } from "../../errors/app-error";
import { InvoiceLine } from "../invoices/invoice-line.entity";
import { Product } from "../procurement/product.entity";
import { PurchaseOrderLine } from "../procurement/purchase-order-line.entity";
import { User } from "../users/user.entity";
import {
  ALL_GAMING_RESOURCES,
  CONSOLE_RESOURCES,
  GAMING_BOOKING_STATUSES,
  GAMING_BOOKING_TYPES,
  GAMING_PAYMENT_MODES,
  GAMING_PAYMENT_STATUSES,
  GAMING_RESOURCE_LABELS,
  SNOOKER_RESOURCES,
  type GamingPaymentMode,
  type GamingBookingStatus,
  type GamingBookingType,
  type GamingPaymentStatus
} from "./gaming.constants";
import { GamingBooking } from "./gaming-booking.entity";

type GamingContext = {
  userId: string;
  role: UserRole;
};

type PaginationInput = {
  page: number;
  limit: number;
};

type ListBookingsInput = PaginationInput & {
  search?: string;
  customerPhone?: string;
  bookingType?: GamingBookingType;
  status?: GamingBookingStatus;
  paymentStatus?: GamingPaymentStatus;
  resourceCode?: string;
  dateFrom?: string;
  dateTo?: string;
};

type BookingCustomerMember = {
  name: string;
  phone?: string;
};

type CreateBookingInput = {
  bookingNumber?: string;
  bookingType: GamingBookingType;
  resourceCode: string;
  resourceCodes?: string[];
  checkInAt?: string;
  hourlyRate: number;
  playerCount?: number;
  customers: BookingCustomerMember[];
  bookingChannel?: string;
  note?: string;
  sourceDeviceId?: string;
  status?: GamingBookingStatus;
  paymentStatus?: GamingPaymentStatus;
  paymentMode?: GamingPaymentMode;
  finalAmount?: number;
  systemCalculatedAmount?: number;
  extraMemberCount?: number;
  extraMemberCharge?: number;
  amountOverrideReason?: string;
  checkOutAt?: string;
  foodOrderReference?: string;
  foodInvoiceNumber?: string;
  foodInvoiceStatus?: "none" | "pending" | "paid" | "cancelled";
  foodAndBeverageAmount?: number;
  staffId?: string;
};

type UpdateBookingInput = {
  bookingType?: GamingBookingType;
  resourceCode?: string;
  resourceCodes?: string[];
  checkInAt?: string;
  checkOutAt?: string;
  hourlyRate?: number;
  playerCount?: number;
  customers?: BookingCustomerMember[];
  bookingChannel?: string;
  note?: string;
  status?: GamingBookingStatus;
  paymentStatus?: GamingPaymentStatus;
  paymentMode?: GamingPaymentMode;
  finalAmount?: number;
  systemCalculatedAmount?: number;
  extraMemberCount?: number;
  extraMemberCharge?: number;
  amountOverrideReason?: string;
  foodOrderReference?: string;
  foodInvoiceNumber?: string;
  foodInvoiceStatus?: "none" | "pending" | "paid" | "cancelled";
  foodAndBeverageAmount?: number;
};

const normalizePhone = (value: string) => value.replace(/[^\d+]/g, "").trim();
const SNOOKER_INCLUDED_MEMBERS = 4;
const SNOOKER_EXTRA_MEMBER_FEE = 50;
const AMOUNT_DIFF_THRESHOLD = 0.01;
const cleanText = (value?: string | null) => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundCurrency = (value: number) => Number(value.toFixed(2));

const parseDateOrThrow = (value: string | undefined | null, fieldName: string) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(422, `${fieldName} is invalid.`);
  }
  return parsed;
};

const getMinutesBetween = (start: Date, end: Date) => {
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.ceil(diffMs / 60000);
};

const isPrivileged = (role: UserRole) =>
  role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.ACCOUNTANT;

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const hasAmountDiff = (left: number, right: number) => Math.abs(left - right) > AMOUNT_DIFF_THRESHOLD;

const buildDateRange = (input: { dateFrom?: string; dateTo?: string }) => {
  const from = input.dateFrom ? parseDateOrThrow(`${input.dateFrom}T00:00:00.000Z`, "Date from") : null;
  const to = input.dateTo ? parseDateOrThrow(`${input.dateTo}T23:59:59.999Z`, "Date to") : null;
  if (from && to && from > to) {
    throw new AppError(422, "Date to must be on or after date from.");
  }
  return { from, to };
};

export class GamingService {
  private readonly bookingRepository = AppDataSource.getRepository(GamingBooking);
  private readonly userRepository = AppDataSource.getRepository(User);
  private readonly purchaseOrderLineRepository = AppDataSource.getRepository(PurchaseOrderLine);
  private readonly invoiceLineRepository = AppDataSource.getRepository(InvoiceLine);
  private readonly productRepository = AppDataSource.getRepository(Product);

  private validateResource(bookingType: GamingBookingType, resourceCode: string) {
    const normalized = resourceCode.trim().toLowerCase();
    if (!ALL_GAMING_RESOURCES.includes(normalized as (typeof ALL_GAMING_RESOURCES)[number])) {
      throw new AppError(422, "Selected board/console is invalid.");
    }
    if (bookingType === "snooker" && !SNOOKER_RESOURCES.includes(normalized as (typeof SNOOKER_RESOURCES)[number])) {
      throw new AppError(422, "Snooker booking must use one of the 6 snooker boards.");
    }
    if (bookingType === "console" && !CONSOLE_RESOURCES.includes(normalized as (typeof CONSOLE_RESOURCES)[number])) {
      throw new AppError(422, "Console booking must use PS2, PS4, PS5 or Xbox.");
    }
    return normalized;
  }

  private normalizeResourceCodes(
    bookingType: GamingBookingType,
    input: { resourceCode?: string; resourceCodes?: string[] }
  ) {
    const fromArray = (input.resourceCodes ?? [])
      .map((code) => this.validateResource(bookingType, code))
      .filter(Boolean);
    const uniqueArray = [...new Set(fromArray)];
    if (uniqueArray.length) {
      return uniqueArray;
    }
    if (input.resourceCode) {
      return [this.validateResource(bookingType, input.resourceCode)];
    }
    throw new AppError(422, "Select at least one board/console.");
  }

  private buildResourceLabel(resourceCodes: string[]) {
    if (!resourceCodes.length) {
      return "-";
    }
    if (resourceCodes.length === 1) {
      return GAMING_RESOURCE_LABELS[resourceCodes[0]] ?? resourceCodes[0];
    }
    const first = GAMING_RESOURCE_LABELS[resourceCodes[0]] ?? resourceCodes[0];
    return `${first} +${resourceCodes.length - 1}`;
  }

  private sanitizeCustomerGroup(customers: BookingCustomerMember[]) {
    const sanitized = customers
      .map((member) => ({
        name: member.name.trim(),
        phone: normalizePhone(member.phone ?? "")
      }))
      .filter((member) => member.name.length > 0);

    if (!sanitized.length) {
      throw new AppError(422, "Add customer name for each player.");
    }
    if (!sanitized.some((member) => member.phone.length >= 8)) {
      throw new AppError(422, "At least one customer contact number is required.");
    }
    return sanitized;
  }

  private resolvePrimaryCustomer(customerGroup: Array<{ name: string; phone?: string }>) {
    return customerGroup.find((member) => (member.phone?.length ?? 0) >= 8) ?? customerGroup[0] ?? null;
  }

  private sanitizePayment(input: { paymentStatus?: string; paymentMode?: string }, fallbackStatus: GamingPaymentStatus) {
    const paymentStatus =
      input.paymentStatus && GAMING_PAYMENT_STATUSES.includes(input.paymentStatus as GamingPaymentStatus)
        ? (input.paymentStatus as GamingPaymentStatus)
        : fallbackStatus;
    const paymentMode =
      input.paymentMode && GAMING_PAYMENT_MODES.includes(input.paymentMode as GamingPaymentMode)
        ? (input.paymentMode as GamingPaymentMode)
        : null;

    if (paymentStatus === "paid" && !paymentMode) {
      throw new AppError(422, "Select payment mode when status is paid.");
    }

    return {
      paymentStatus,
      paymentMode: paymentStatus === "paid" ? paymentMode : null
    };
  }

  private calculateExtraMemberBreakdown(input: {
    bookingType: GamingBookingType;
    customerCount: number;
    resourceCount?: number;
  }) {
    if (input.bookingType !== "snooker") {
      return {
        extraMemberCount: 0,
        extraMemberCharge: 0
      };
    }
    const normalizedResourceCount = Math.max(1, Math.floor(toNumber(input.resourceCount, 1)));
    const includedMembers = normalizedResourceCount * SNOOKER_INCLUDED_MEMBERS;
    const extraMemberCount = Math.max(0, input.customerCount - includedMembers);
    const extraMemberCharge = roundCurrency(extraMemberCount * SNOOKER_EXTRA_MEMBER_FEE);
    return {
      extraMemberCount,
      extraMemberCharge
    };
  }

  private buildSystemCalculatedAmount(input: {
    bookingType: GamingBookingType;
    customerCount: number;
    resourceCount?: number;
    gameAmount: number;
    foodAndBeverageAmount: number;
  }) {
    const breakdown = this.calculateExtraMemberBreakdown({
      bookingType: input.bookingType,
      customerCount: input.customerCount,
      resourceCount: input.resourceCount
    });
    return {
      ...breakdown,
      systemCalculatedAmount: roundCurrency(
        Math.max(0, input.gameAmount) + breakdown.extraMemberCharge + Math.max(0, input.foodAndBeverageAmount)
      )
    };
  }

  private assertAmountOverrideReason(finalAmount: number, systemCalculatedAmount: number, reason: string | null) {
    if (hasAmountDiff(finalAmount, systemCalculatedAmount) && !reason?.trim()) {
      throw new AppError(422, "Reason is required when final amount is changed from system amount.");
    }
  }

  private calculateAmount(input: { checkInAt: Date; checkOutAt: Date | null; hourlyRate: number; status: GamingBookingStatus }) {
    const now = new Date();
    const effectiveEnd = input.checkOutAt ?? (input.status === "upcoming" ? input.checkInAt : now);
    const minutes = getMinutesBetween(input.checkInAt, effectiveEnd);
    const amount = roundCurrency((minutes / 60) * input.hourlyRate);
    return { minutes, amount };
  }

  private toDto(booking: GamingBooking) {
    const hourlyRate = toNumber(booking.hourlyRate);
    const finalAmountStored = toNumber(booking.finalAmount);
    const storedFoodAmount = toNumber(booking.foodAndBeverageAmount);
    const resourceCodes = booking.resourceCodes?.length ? booking.resourceCodes : [booking.resourceCode];
    const computed = this.calculateAmount({
      checkInAt: booking.checkInAt,
      checkOutAt: booking.checkOutAt,
      hourlyRate,
      status: booking.status
    });
    const systemFromFormula = this.buildSystemCalculatedAmount({
      bookingType: booking.bookingType,
      customerCount: (booking.customerGroup ?? []).length,
      resourceCount: resourceCodes.length,
      gameAmount: computed.amount,
      foodAndBeverageAmount: storedFoodAmount
    });
    const systemCalculatedAmountStored = toNumber(booking.systemCalculatedAmount, systemFromFormula.systemCalculatedAmount);
    const extraMemberCountStored = Math.max(0, Math.floor(toNumber(booking.extraMemberCount, systemFromFormula.extraMemberCount)));
    const extraMemberChargeStored = roundCurrency(Math.max(0, toNumber(booking.extraMemberCharge, systemFromFormula.extraMemberCharge)));

    const fallbackFinalAmount = systemFromFormula.systemCalculatedAmount;
    const finalAmount =
      booking.status === "completed"
        ? (finalAmountStored > 0 ? finalAmountStored : fallbackFinalAmount)
        : fallbackFinalAmount;
    return {
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      bookingType: booking.bookingType,
      resourceCode: booking.resourceCode,
      resourceLabel: booking.resourceLabel,
      resourceCodes,
      resourceLabels: resourceCodes.map((code) => GAMING_RESOURCE_LABELS[code] ?? code),
      customers: booking.customerGroup ?? [],
      customerCount: (booking.customerGroup ?? []).length,
      primaryCustomerName: booking.primaryCustomerName,
      primaryCustomerPhone: booking.primaryCustomerPhone,
      checkInAt: booking.checkInAt,
      checkOutAt: booking.checkOutAt,
      hourlyRate,
      durationMinutes: computed.minutes,
      calculatedAmount: roundCurrency(computed.amount + extraMemberChargeStored),
      systemCalculatedAmount: systemCalculatedAmountStored,
      finalAmount,
      extraMemberCount: extraMemberCountStored,
      extraMemberCharge: extraMemberChargeStored,
      amountOverrideReason: cleanText(booking.amountOverrideReason),
      isAmountOverridden: hasAmountDiff(finalAmount, systemCalculatedAmountStored),
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentMode: booking.paymentMode,
      foodOrderReference: booking.foodOrderReference,
      foodInvoiceNumber: booking.foodInvoiceNumber,
      foodInvoiceStatus: booking.foodInvoiceStatus,
      foodAndBeverageAmount: storedFoodAmount,
      bookingChannel: booking.bookingChannel,
      sourceDeviceId: booking.sourceDeviceId,
      note: booking.note,
      staffId: booking.staffId,
      staffName: booking.staff?.fullName ?? "-",
      staffUsername: booking.staff?.username ?? "-",
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt
    };
  }

  private buildBookingNumber() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `GM-${y}${m}${d}-${hh}${mm}-${random}`;
  }

  private async assertResourcesAvailable(resourceCodes: string[], excludeBookingId?: string) {
    const query = this.bookingRepository
      .createQueryBuilder("booking")
      .where("booking.status IN (:...statuses)", { statuses: ["upcoming", "ongoing"] });

    if (excludeBookingId) {
      query.andWhere("booking.id != :excludeBookingId", { excludeBookingId });
    }

    const existingRows = await query.getMany();
    const existing = existingRows.find((booking) => {
      const bookingCodes = booking.resourceCodes?.length ? booking.resourceCodes : [booking.resourceCode];
      return bookingCodes.some((code) => resourceCodes.includes(code));
    });

    if (existing) {
      const bookingCodes = existing.resourceCodes?.length ? existing.resourceCodes : [existing.resourceCode];
      const blocked = bookingCodes.find((code) => resourceCodes.includes(code)) ?? bookingCodes[0];
      throw new AppError(409, `${GAMING_RESOURCE_LABELS[blocked] ?? blocked} is currently occupied. Choose another slot.`);
    }
  }

  async createBooking(input: CreateBookingInput, context: GamingContext) {
    const bookingType = input.bookingType;
    if (!GAMING_BOOKING_TYPES.includes(bookingType)) {
      throw new AppError(422, "Booking type is invalid.");
    }
    const resourceCodes = this.normalizeResourceCodes(bookingType, {
      resourceCode: input.resourceCode,
      resourceCodes: input.resourceCodes
    });
    const resourceCode = resourceCodes[0];
    const customerGroup = this.sanitizeCustomerGroup(input.customers);
    await this.assertResourcesAvailable(resourceCodes);

    const checkInAt = parseDateOrThrow(input.checkInAt, "Check-in time") ?? new Date();
    const status =
      input.status && GAMING_BOOKING_STATUSES.includes(input.status)
        ? input.status
        : checkInAt.getTime() > Date.now()
          ? "upcoming"
          : "ongoing";
    const checkOutAt = parseDateOrThrow(input.checkOutAt, "Check-out time");
    const payment = this.sanitizePayment(
      { paymentStatus: input.paymentStatus, paymentMode: input.paymentMode },
      "pending"
    );
    const hourlyRate = roundCurrency(Math.max(0, toNumber(input.hourlyRate)));

    const staffId = input.staffId && isPrivileged(context.role) ? input.staffId : context.userId;
    const staff = await this.userRepository.findOne({ where: { id: staffId, isActive: true } });
    if (!staff) {
      throw new AppError(404, "Staff member not found for this booking.");
    }

    const calculated = this.calculateAmount({
      checkInAt,
      checkOutAt,
      hourlyRate,
      status
    });
    const initialFoodAmount = roundCurrency(Math.max(0, toNumber(input.foodAndBeverageAmount)));
    const effectivePlayerCount = Math.max(1, Math.floor(toNumber(input.playerCount, customerGroup.length)));
    const systemSnapshot = this.buildSystemCalculatedAmount({
      bookingType,
      customerCount: effectivePlayerCount,
      resourceCount: resourceCodes.length,
      gameAmount: calculated.amount,
      foodAndBeverageAmount: initialFoodAmount
    });
    const overrideReason = cleanText(input.amountOverrideReason);
    const finalizedAmount = roundCurrency(
      Math.max(0, toNumber(input.finalAmount, status === "completed" ? systemSnapshot.systemCalculatedAmount : 0))
    );
    if (status === "completed") {
      this.assertAmountOverrideReason(finalizedAmount, systemSnapshot.systemCalculatedAmount, overrideReason);
    }

    const booking = this.bookingRepository.create({
      bookingNumber: cleanText(input.bookingNumber) ?? this.buildBookingNumber(),
      bookingType,
      resourceCode,
      resourceCodes,
      resourceLabel: this.buildResourceLabel(resourceCodes),
      customerGroup,
      primaryCustomerName: this.resolvePrimaryCustomer(customerGroup)?.name ?? null,
      primaryCustomerPhone: this.resolvePrimaryCustomer(customerGroup)?.phone ?? null,
      checkInAt,
      checkOutAt,
      hourlyRate,
      finalAmount: finalizedAmount,
      systemCalculatedAmount: systemSnapshot.systemCalculatedAmount,
      extraMemberCount: systemSnapshot.extraMemberCount,
      extraMemberCharge: systemSnapshot.extraMemberCharge,
      amountOverrideReason:
        status === "completed" && hasAmountDiff(finalizedAmount, systemSnapshot.systemCalculatedAmount)
          ? overrideReason
          : null,
      status,
      paymentStatus: payment.paymentStatus,
      paymentMode: payment.paymentMode,
      foodOrderReference: cleanText(input.foodOrderReference),
      foodInvoiceNumber: cleanText(input.foodInvoiceNumber),
      foodInvoiceStatus: input.foodInvoiceStatus ?? "none",
      foodAndBeverageAmount: initialFoodAmount,
      bookingChannel: cleanText(input.bookingChannel) ?? "desktop",
      sourceDeviceId: cleanText(input.sourceDeviceId),
      note: cleanText(input.note),
      staffId: staff.id
    });

    const saved = await this.bookingRepository.save(booking);
    const withStaff = await this.bookingRepository.findOne({
      where: { id: saved.id },
      relations: { staff: true }
    });
    if (!withStaff) {
      throw new AppError(500, "Unable to fetch booking after creation.");
    }
    return this.toDto(withStaff);
  }

  async updateBooking(id: string, input: UpdateBookingInput, context: GamingContext) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: { staff: true }
    });
    if (!booking) {
      throw new AppError(404, "Booking not found.");
    }
    const privilegedRole = isPrivileged(context.role);
    if (!privilegedRole && booking.staffId !== context.userId) {
      throw new AppError(403, "You can only edit your own bookings.");
    }
    if (!privilegedRole && booking.status === "completed") {
      throw new AppError(409, "Completed bookings cannot be edited.");
    }

    const isStaffRole = !privilegedRole;
    if (isStaffRole) {
      const restrictedLabels: string[] = [];
      if (input.bookingType !== undefined) restrictedLabels.push("booking type");
      if (input.resourceCode !== undefined) restrictedLabels.push("board/console");
      if (input.checkInAt !== undefined) restrictedLabels.push("check-in time");
      if (input.checkOutAt !== undefined) restrictedLabels.push("check-out time");
      if (input.hourlyRate !== undefined) restrictedLabels.push("hourly rate");
      if (input.status !== undefined) restrictedLabels.push("status");
      if (input.bookingChannel !== undefined) restrictedLabels.push("booking channel");
      if (input.note !== undefined) restrictedLabels.push("note");

      if (restrictedLabels.length > 0) {
        throw new AppError(
          403,
          `After check-in, you can update only customers/payment/F&B order details. Restricted fields: ${restrictedLabels.join(", ")}.`
        );
      }
    }

    const nextBookingType = isStaffRole ? booking.bookingType : input.bookingType ?? booking.bookingType;
    const nextResourceCodes = isStaffRole
      ? booking.resourceCodes?.length
        ? booking.resourceCodes
        : [booking.resourceCode]
      : this.normalizeResourceCodes(nextBookingType, {
          resourceCode: input.resourceCode ?? booking.resourceCode,
          resourceCodes: input.resourceCodes ?? booking.resourceCodes
        });
    const nextResourceCode = nextResourceCodes[0];
    const nextCheckInAt = isStaffRole
      ? booking.checkInAt
      : parseDateOrThrow(input.checkInAt, "Check-in time") ?? booking.checkInAt;
    const nextStatus = isStaffRole ? booking.status : input.status ?? booking.status;
    const nextCheckOutAt = isStaffRole
      ? booking.checkOutAt
      : parseDateOrThrow(input.checkOutAt, "Check-out time") ?? booking.checkOutAt;

    if (nextCheckOutAt && nextCheckOutAt < nextCheckInAt) {
      throw new AppError(422, "Check-out time must be after check-in time.");
    }

    if (
      JSON.stringify(nextResourceCodes) !==
        JSON.stringify(booking.resourceCodes?.length ? booking.resourceCodes : [booking.resourceCode]) ||
      nextBookingType !== booking.bookingType
    ) {
      if (nextStatus === "upcoming" || nextStatus === "ongoing") {
        await this.assertResourcesAvailable(nextResourceCodes, booking.id);
      }
    }

    const payment = this.sanitizePayment(
      {
        paymentStatus: input.paymentStatus ?? booking.paymentStatus,
        paymentMode: input.paymentMode ?? booking.paymentMode ?? undefined
      },
      booking.paymentStatus
    );

    booking.bookingType = nextBookingType;
    booking.resourceCode = nextResourceCode;
    booking.resourceCodes = nextResourceCodes;
    booking.resourceLabel = this.buildResourceLabel(nextResourceCodes);
    booking.checkInAt = nextCheckInAt;
    booking.checkOutAt = nextCheckOutAt;
    booking.status = nextStatus;
    booking.hourlyRate = isStaffRole
      ? booking.hourlyRate
      : roundCurrency(Math.max(0, toNumber(input.hourlyRate, toNumber(booking.hourlyRate))));
    booking.bookingChannel = isStaffRole
      ? booking.bookingChannel
      : cleanText(input.bookingChannel) ?? booking.bookingChannel;
    booking.note = isStaffRole ? booking.note : cleanText(input.note);
    booking.paymentStatus = payment.paymentStatus;
    booking.paymentMode = payment.paymentMode;
    booking.foodOrderReference =
      input.foodOrderReference === undefined ? booking.foodOrderReference : cleanText(input.foodOrderReference);
    booking.foodInvoiceNumber =
      input.foodInvoiceNumber === undefined ? booking.foodInvoiceNumber : cleanText(input.foodInvoiceNumber);
    booking.foodInvoiceStatus = input.foodInvoiceStatus ?? booking.foodInvoiceStatus;
    const nextFoodAndBeverageAmount =
      input.foodAndBeverageAmount !== undefined
        ? roundCurrency(Math.max(0, toNumber(input.foodAndBeverageAmount)))
        : roundCurrency(Math.max(0, toNumber(booking.foodAndBeverageAmount)));
    booking.foodAndBeverageAmount = nextFoodAndBeverageAmount;

    const nextCustomerGroup = input.customers?.length ? this.sanitizeCustomerGroup(input.customers) : booking.customerGroup ?? [];
    if (input.customers?.length) {
      booking.customerGroup = nextCustomerGroup;
      booking.primaryCustomerName = this.resolvePrimaryCustomer(nextCustomerGroup)?.name ?? null;
      booking.primaryCustomerPhone = this.resolvePrimaryCustomer(nextCustomerGroup)?.phone ?? null;
    }

    const recalculatedGameAmount = this.calculateAmount({
      checkInAt: booking.checkInAt,
      checkOutAt: booking.checkOutAt,
      hourlyRate: toNumber(booking.hourlyRate),
      status: booking.status
    }).amount;
    const existingPlayerCountBaseline =
      booking.bookingType === "snooker"
        ? Math.max(
            nextCustomerGroup.length,
            SNOOKER_INCLUDED_MEMBERS * Math.max(1, nextResourceCodes.length) +
              Math.max(0, Math.floor(toNumber(booking.extraMemberCount)))
          )
        : nextCustomerGroup.length;
    const effectivePlayerCount =
      input.playerCount !== undefined
        ? Math.max(1, Math.floor(toNumber(input.playerCount, existingPlayerCountBaseline)))
        : existingPlayerCountBaseline;
    const derivedSystemSnapshot = this.buildSystemCalculatedAmount({
      bookingType: booking.bookingType,
      customerCount: effectivePlayerCount,
      resourceCount: nextResourceCodes.length,
      gameAmount: recalculatedGameAmount,
      foodAndBeverageAmount: booking.foodAndBeverageAmount
    });

    booking.systemCalculatedAmount = roundCurrency(
      Math.max(0, toNumber(input.systemCalculatedAmount, derivedSystemSnapshot.systemCalculatedAmount))
    );
    booking.extraMemberCount = Math.max(0, Math.floor(toNumber(input.extraMemberCount, derivedSystemSnapshot.extraMemberCount)));
    booking.extraMemberCharge = roundCurrency(
      Math.max(0, toNumber(input.extraMemberCharge, derivedSystemSnapshot.extraMemberCharge))
    );

    if (input.finalAmount !== undefined) {
      const nextFinalAmount = roundCurrency(Math.max(0, toNumber(input.finalAmount)));
      const overrideReason = cleanText(input.amountOverrideReason);
      this.assertAmountOverrideReason(nextFinalAmount, booking.systemCalculatedAmount, overrideReason);
      booking.finalAmount = nextFinalAmount;
      booking.amountOverrideReason =
        hasAmountDiff(nextFinalAmount, booking.systemCalculatedAmount) && overrideReason ? overrideReason : null;
    } else if (booking.status === "completed" && toNumber(booking.finalAmount) <= 0) {
      booking.finalAmount = booking.systemCalculatedAmount;
    }

    if (booking.status === "completed") {
      const overrideReason = cleanText(input.amountOverrideReason ?? booking.amountOverrideReason);
      this.assertAmountOverrideReason(toNumber(booking.finalAmount), booking.systemCalculatedAmount, overrideReason);
      booking.amountOverrideReason =
        hasAmountDiff(toNumber(booking.finalAmount), booking.systemCalculatedAmount) && overrideReason
          ? overrideReason
          : null;
      if (!booking.checkOutAt) {
        booking.checkOutAt = new Date();
      }
    } else if (input.amountOverrideReason !== undefined && input.finalAmount === undefined) {
      booking.amountOverrideReason = cleanText(input.amountOverrideReason);
    }

    const saved = await this.bookingRepository.save(booking);
    const withStaff = await this.bookingRepository.findOne({
      where: { id: saved.id },
      relations: { staff: true }
    });
    if (!withStaff) {
      throw new AppError(500, "Unable to fetch booking after update.");
    }
    return this.toDto(withStaff);
  }

  async checkoutBooking(
    id: string,
    input: {
      checkOutAt?: string;
      finalAmount?: number;
      systemCalculatedAmount?: number;
      extraMemberCount?: number;
      extraMemberCharge?: number;
      amountOverrideReason?: string;
      paymentStatus?: "pending" | "paid";
      paymentMode?: GamingPaymentMode;
    },
    context: GamingContext
  ) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: { staff: true }
    });
    if (!booking) {
      throw new AppError(404, "Booking not found.");
    }
    if (!isPrivileged(context.role) && booking.staffId !== context.userId) {
      throw new AppError(403, "You can only checkout your own bookings.");
    }
    if (booking.status === "completed") {
      throw new AppError(409, "Booking is already checked out.");
    }

    const checkOutAt = parseDateOrThrow(input.checkOutAt, "Check-out time") ?? new Date();
    if (checkOutAt < booking.checkInAt) {
      throw new AppError(422, "Check-out time must be after check-in time.");
    }

    const payment = this.sanitizePayment(
      {
        paymentStatus: input.paymentStatus ?? booking.paymentStatus,
        paymentMode: input.paymentMode ?? booking.paymentMode ?? undefined
      },
      booking.paymentStatus
    );

    const hourlyRate = toNumber(booking.hourlyRate);
    const calculated = this.calculateAmount({
      checkInAt: booking.checkInAt,
      checkOutAt,
      hourlyRate,
      status: "completed"
    });
    const derivedSystemSnapshot = this.buildSystemCalculatedAmount({
      bookingType: booking.bookingType,
      customerCount: (booking.customerGroup ?? []).length,
      resourceCount: (booking.resourceCodes?.length ? booking.resourceCodes : [booking.resourceCode]).length,
      gameAmount: calculated.amount,
      foodAndBeverageAmount: toNumber(booking.foodAndBeverageAmount)
    });
    const systemCalculatedAmount = roundCurrency(
      Math.max(0, toNumber(input.systemCalculatedAmount, derivedSystemSnapshot.systemCalculatedAmount))
    );
    const extraMemberCount = Math.max(0, Math.floor(toNumber(input.extraMemberCount, derivedSystemSnapshot.extraMemberCount)));
    const extraMemberCharge = roundCurrency(
      Math.max(0, toNumber(input.extraMemberCharge, derivedSystemSnapshot.extraMemberCharge))
    );
    const finalAmount = roundCurrency(Math.max(0, toNumber(input.finalAmount, systemCalculatedAmount)));
    const amountOverrideReason = cleanText(input.amountOverrideReason);
    this.assertAmountOverrideReason(finalAmount, systemCalculatedAmount, amountOverrideReason);

    booking.checkOutAt = checkOutAt;
    booking.status = "completed";
    booking.finalAmount = finalAmount;
    booking.systemCalculatedAmount = systemCalculatedAmount;
    booking.extraMemberCount = extraMemberCount;
    booking.extraMemberCharge = extraMemberCharge;
    booking.amountOverrideReason = hasAmountDiff(finalAmount, systemCalculatedAmount) ? amountOverrideReason : null;
    booking.paymentStatus = payment.paymentStatus;
    booking.paymentMode = payment.paymentMode;

    const saved = await this.bookingRepository.save(booking);
    const withStaff = await this.bookingRepository.findOne({
      where: { id: saved.id },
      relations: { staff: true }
    });
    if (!withStaff) {
      throw new AppError(500, "Unable to fetch booking after checkout.");
    }
    return this.toDto(withStaff);
  }

  async updatePaymentStatus(
    id: string,
    paymentStatus: "pending" | "paid",
    paymentMode: GamingPaymentMode | undefined,
    context: GamingContext
  ) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: { staff: true }
    });
    if (!booking) {
      throw new AppError(404, "Booking not found.");
    }
    if (!isPrivileged(context.role) && booking.staffId !== context.userId) {
      throw new AppError(403, "You can only update your own bookings.");
    }
    if (booking.status === "completed") {
      throw new AppError(409, "Payment status cannot be changed after checkout.");
    }

    const payment = this.sanitizePayment(
      { paymentStatus, paymentMode: paymentMode ?? booking.paymentMode ?? undefined },
      booking.paymentStatus
    );
    booking.paymentStatus = payment.paymentStatus;
    booking.paymentMode = payment.paymentMode;
    const saved = await this.bookingRepository.save(booking);
    return this.toDto(saved);
  }

  async deleteBooking(id: string, context: GamingContext) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: { staff: true }
    });
    if (!booking) {
      throw new AppError(404, "Booking not found.");
    }
    if (!isPrivileged(context.role)) {
      throw new AppError(403, "Only admin or manager roles can delete bookings.");
    }

    await this.bookingRepository.remove(booking);
    return { id };
  }

  async listBookings(filters: ListBookingsInput, _context: GamingContext) {
    const query = this.bookingRepository
      .createQueryBuilder("booking")
      .leftJoinAndSelect("booking.staff", "staff");

    if (filters.bookingType) {
      query.andWhere("booking.bookingType = :bookingType", { bookingType: filters.bookingType });
    }
    if (filters.status) {
      query.andWhere("booking.status = :status", { status: filters.status });
    }
    if (filters.paymentStatus) {
      query.andWhere("booking.paymentStatus = :paymentStatus", { paymentStatus: filters.paymentStatus });
    }
    if (filters.resourceCode?.trim()) {
      const normalizedCode = filters.resourceCode.trim().toLowerCase();
      query.andWhere(
        "(booking.resourceCode = :resourceCode OR booking.resourceCodes @> :resourceCodes::jsonb)",
        {
          resourceCode: normalizedCode,
          resourceCodes: JSON.stringify([normalizedCode])
        }
      );
    }
    if (filters.search?.trim()) {
      const search = `%${filters.search.trim()}%`;
      query.andWhere(
        "(booking.bookingNumber ILIKE :search OR booking.primaryCustomerName ILIKE :search OR booking.primaryCustomerPhone ILIKE :search OR booking.resourceLabel ILIKE :search OR staff.fullName ILIKE :search)",
        { search }
      );
    }
    if (filters.customerPhone?.trim()) {
      const customerPhone = normalizePhone(filters.customerPhone);
      query.andWhere(
        "(booking.primaryCustomerPhone = :customerPhone OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(booking.\"customerGroup\", '[]'::jsonb)) AS customer WHERE regexp_replace(COALESCE(customer->>'phone', ''), '[^0-9+]', '', 'g') = :customerPhone))",
        { customerPhone }
      );
    }

    const dateRange = buildDateRange(filters);
    if (dateRange.from) {
      query.andWhere("booking.checkInAt >= :dateFrom", { dateFrom: dateRange.from });
    }
    if (dateRange.to) {
      query.andWhere("booking.checkInAt <= :dateTo", { dateTo: dateRange.to });
    }

    const total = await query.getCount();
    const bookings = await query
      .clone()
      .orderBy("booking.checkInAt", "DESC")
      .addOrderBy("booking.createdAt", "DESC")
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getMany();

    return {
      bookings: bookings.map((booking) => this.toDto(booking)),
      pagination: getPaginationMeta(filters.page, filters.limit, total)
    };
  }

  async getStats(input: { dateFrom?: string; dateTo?: string }, context: GamingContext) {
    const query = this.bookingRepository
      .createQueryBuilder("booking")
      .leftJoinAndSelect("booking.staff", "staff");

    if (!isPrivileged(context.role)) {
      query.andWhere("booking.staffId = :staffId", { staffId: context.userId });
    }

    const dateRange = buildDateRange(input);
    if (dateRange.from) {
      query.andWhere("booking.checkInAt >= :dateFrom", { dateFrom: dateRange.from });
    }
    if (dateRange.to) {
      query.andWhere("booking.checkInAt <= :dateTo", { dateTo: dateRange.to });
    }

    const [bookings, gamingPurchaseSummary, gamingSalesSummary, gamingStockValuation] = await Promise.all([
      query.getMany(),
      this.purchaseOrderLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.product", "product")
        .leftJoin("line.purchaseOrder", "purchaseOrder")
        .select("COALESCE(SUM(line.stockAdded), 0)", "quantity")
        .addSelect("COALESCE(SUM(line.lineTotal), 0)", "amount")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere("product.targetSection IN (:...sections)", { sections: ["gaming", "both"] })
        .andWhere(dateRange.from ? "purchaseOrder.purchaseDate >= :purchaseDateFrom" : "1=1", {
          purchaseDateFrom: input.dateFrom
        })
        .andWhere(dateRange.to ? "purchaseOrder.purchaseDate <= :purchaseDateTo" : "1=1", {
          purchaseDateTo: input.dateTo
        })
        .getRawOne<{ quantity: string; amount: string }>(),
      this.invoiceLineRepository
        .createQueryBuilder("line")
        .leftJoin("line.invoice", "invoice")
        .leftJoin(Product, "product", "product.id::text = line.\"referenceId\"::text")
        .select("COALESCE(SUM(line.quantity), 0)", "quantity")
        .addSelect("COALESCE(SUM(line.lineTotal), 0)", "amount")
        .addSelect("COALESCE(SUM(line.quantity * COALESCE(product.purchaseUnitPrice, 0)), 0)", "costAmount")
        .where("line.lineType = :lineType", { lineType: "product" })
        .andWhere("invoice.status = :status", { status: "paid" })
        .andWhere("invoice.orderType = :orderType", { orderType: "snooker" })
        .andWhere("product.targetSection IN (:...sections)", { sections: ["gaming", "both"] })
        .andWhere(dateRange.from ? "invoice.createdAt >= :salesFrom" : "1=1", {
          salesFrom: dateRange.from ?? undefined
        })
        .andWhere(dateRange.to ? "invoice.createdAt <= :salesTo" : "1=1", {
          salesTo: dateRange.to ?? undefined
        })
        .getRawOne<{ quantity: string; amount: string; costAmount: string }>(),
      this.productRepository
        .createQueryBuilder("product")
        .select("COALESCE(SUM(product.currentStock * product.purchaseUnitPrice), 0)", "value")
        .where("product.targetSection IN (:...sections)", { sections: ["gaming", "both"] })
        .getRawOne<{ value: string }>()
    ]);
    const now = new Date();

    const totals = {
      totalBookings: bookings.length,
      ongoing: 0,
      upcoming: 0,
      completed: 0,
      cancelled: 0,
      pendingPayments: 0,
      paidBookings: 0,
      activePlayers: 0,
      endingSoon: 0,
      totalRevenue: 0,
      pendingCollection: 0
    };

    const staffCollectionMap = new Map<string, { staffId: string; staffName: string; collectedAmount: number; bookings: number }>();
    const resourceUsageMap = new Map<string, { resourceCode: string; resourceLabel: string; bookings: number; revenue: number }>();

    bookings.forEach((booking) => {
      const dto = this.toDto(booking);
      const collectibleAmount =
        dto.status === "completed" ? roundCurrency(dto.finalAmount) : roundCurrency(dto.systemCalculatedAmount);
      totals[dto.status] += 1;
      if (dto.status === "ongoing") {
        totals.activePlayers += dto.customerCount;
        const elapsedMinutes = getMinutesBetween(new Date(dto.checkInAt), now);
        const estMinutesLeft = Math.max(60 - elapsedMinutes, 0);
        if (estMinutesLeft <= 15) {
          totals.endingSoon += 1;
        }
      }
      if (dto.paymentStatus === "pending") {
        totals.pendingPayments += 1;
        totals.pendingCollection = roundCurrency(totals.pendingCollection + collectibleAmount);
      }
      if (dto.paymentStatus === "paid") {
        totals.paidBookings += 1;
        totals.totalRevenue = roundCurrency(totals.totalRevenue + collectibleAmount);
      }

      const staffKey = dto.staffId;
      const staffRow = staffCollectionMap.get(staffKey) ?? {
        staffId: dto.staffId,
        staffName: dto.staffName,
        collectedAmount: 0,
        bookings: 0
      };
      if (dto.paymentStatus === "paid") {
        staffRow.collectedAmount = roundCurrency(staffRow.collectedAmount + collectibleAmount);
      }
      staffRow.bookings += 1;
      staffCollectionMap.set(staffKey, staffRow);

      const usageCodes = dto.resourceCodes?.length ? dto.resourceCodes : [dto.resourceCode];
      usageCodes.forEach((resourceCode) => {
        const resourceKey = resourceCode;
        const resourceRow = resourceUsageMap.get(resourceKey) ?? {
          resourceCode,
          resourceLabel: GAMING_RESOURCE_LABELS[resourceCode] ?? resourceCode,
          bookings: 0,
          revenue: 0
        };
        resourceRow.bookings += 1;
        if (dto.paymentStatus === "paid") {
          resourceRow.revenue = roundCurrency(resourceRow.revenue + collectibleAmount);
        }
        resourceUsageMap.set(resourceKey, resourceRow);
      });
    });

    const purchasedQuantity = toNumber(gamingPurchaseSummary?.quantity, 0);
    const purchasedAmount = roundCurrency(toNumber(gamingPurchaseSummary?.amount, 0));
    const soldQuantity = toNumber(gamingSalesSummary?.quantity, 0);
    const soldAmount = roundCurrency(toNumber(gamingSalesSummary?.amount, 0));
    const soldCostAmount = roundCurrency(toNumber(gamingSalesSummary?.costAmount, 0));
    const estimatedProfit = roundCurrency(soldAmount - soldCostAmount);

    return {
      totals,
      gamingProducts: {
        purchasedQuantity: Number(purchasedQuantity.toFixed(3)),
        purchasedAmount,
        soldQuantity: Number(soldQuantity.toFixed(3)),
        soldAmount,
        estimatedProfit,
        stockValuation: roundCurrency(toNumber(gamingStockValuation?.value, 0))
      },
      staffCollection: [...staffCollectionMap.values()].sort((a, b) => b.collectedAmount - a.collectedAmount),
      resourceUsage: [...resourceUsageMap.values()].sort((a, b) => b.bookings - a.bookings)
    };
  }

  async getResources(_context: GamingContext) {
    const resources = ALL_GAMING_RESOURCES.map((resourceCode) => ({
      resourceCode,
      resourceLabel: GAMING_RESOURCE_LABELS[resourceCode] ?? resourceCode,
      bookingType: SNOOKER_RESOURCES.includes(resourceCode as (typeof SNOOKER_RESOURCES)[number]) ? "snooker" : "console"
    }));

    const query = this.bookingRepository
      .createQueryBuilder("booking")
      .leftJoinAndSelect("booking.staff", "staff")
      .where("booking.status IN (:...statuses)", { statuses: ["upcoming", "ongoing"] });

    const activeBookings = await query.getMany();
    const activeMap = new Map<string, ReturnType<GamingService["toDto"]>>();
    activeBookings.forEach((booking) => {
      const bookingDto = this.toDto(booking);
      const bookingCodes = booking.resourceCodes?.length ? booking.resourceCodes : [booking.resourceCode];
      bookingCodes.forEach((code) => {
        if (!activeMap.has(code)) {
          activeMap.set(code, bookingDto);
        }
      });
    });

    return resources.map((resource) => ({
      ...resource,
      isAvailable: !activeMap.has(resource.resourceCode),
      activeBooking: activeMap.get(resource.resourceCode) ?? null
    }));
  }

  async upsertBookingFromSync(input: CreateBookingInput, context: GamingContext) {
    if (!input.bookingNumber?.trim()) {
      throw new AppError(422, "Booking number is required for sync.");
    }

    const existing = await this.bookingRepository.findOne({
      where: { bookingNumber: input.bookingNumber.trim() },
      relations: { staff: true }
    });

    if (!existing) {
      return this.createBooking(input, context);
    }

    const bookingType = input.bookingType;
    const resourceCodes = this.normalizeResourceCodes(bookingType, {
      resourceCode: input.resourceCode,
      resourceCodes: input.resourceCodes
    });
    const resourceCode = resourceCodes[0];
    const customerGroup = this.sanitizeCustomerGroup(input.customers);
    const checkInAt = parseDateOrThrow(input.checkInAt, "Check-in time") ?? existing.checkInAt;
    const checkOutAt = parseDateOrThrow(input.checkOutAt, "Check-out time");
    const status =
      input.status && GAMING_BOOKING_STATUSES.includes(input.status)
        ? input.status
        : existing.status;
    const payment = this.sanitizePayment(
      {
        paymentStatus: input.paymentStatus ?? existing.paymentStatus,
        paymentMode: input.paymentMode ?? existing.paymentMode ?? undefined
      },
      existing.paymentStatus
    );

    if (
      (JSON.stringify(resourceCodes) !==
        JSON.stringify(existing.resourceCodes?.length ? existing.resourceCodes : [existing.resourceCode]) ||
        bookingType !== existing.bookingType) &&
      (status === "upcoming" || status === "ongoing")
    ) {
      await this.assertResourcesAvailable(resourceCodes, existing.id);
    }

    existing.bookingType = bookingType;
    existing.resourceCode = resourceCode;
    existing.resourceCodes = resourceCodes;
    existing.resourceLabel = this.buildResourceLabel(resourceCodes);
    existing.customerGroup = customerGroup;
    existing.primaryCustomerName = this.resolvePrimaryCustomer(customerGroup)?.name ?? null;
    existing.primaryCustomerPhone = this.resolvePrimaryCustomer(customerGroup)?.phone ?? null;
    existing.checkInAt = checkInAt;
    existing.checkOutAt = checkOutAt ?? existing.checkOutAt;
    existing.hourlyRate = roundCurrency(Math.max(0, toNumber(input.hourlyRate, toNumber(existing.hourlyRate))));
    existing.status = status;
    existing.paymentStatus = payment.paymentStatus;
    existing.paymentMode = payment.paymentMode;
    existing.foodOrderReference =
      input.foodOrderReference === undefined ? existing.foodOrderReference : cleanText(input.foodOrderReference);
    existing.foodInvoiceNumber =
      input.foodInvoiceNumber === undefined ? existing.foodInvoiceNumber : cleanText(input.foodInvoiceNumber);
    existing.foodInvoiceStatus = input.foodInvoiceStatus ?? existing.foodInvoiceStatus;
    if (input.foodAndBeverageAmount !== undefined) {
      existing.foodAndBeverageAmount = roundCurrency(Math.max(0, Number(input.foodAndBeverageAmount)));
    }
    existing.bookingChannel = cleanText(input.bookingChannel) ?? existing.bookingChannel;
    existing.sourceDeviceId = cleanText(input.sourceDeviceId) ?? existing.sourceDeviceId;
    existing.note = cleanText(input.note);

    const derivedSystemSnapshot = this.buildSystemCalculatedAmount({
      bookingType: existing.bookingType,
      customerCount: existing.customerGroup?.length ?? 0,
      resourceCount: resourceCodes.length,
      gameAmount: this.calculateAmount({
        checkInAt: existing.checkInAt,
        checkOutAt: existing.checkOutAt,
        hourlyRate: toNumber(existing.hourlyRate),
        status: existing.status
      }).amount,
      foodAndBeverageAmount: toNumber(existing.foodAndBeverageAmount)
    });
    existing.systemCalculatedAmount = roundCurrency(
      Math.max(0, toNumber(input.systemCalculatedAmount, derivedSystemSnapshot.systemCalculatedAmount))
    );
    existing.extraMemberCount = Math.max(0, Math.floor(toNumber(input.extraMemberCount, derivedSystemSnapshot.extraMemberCount)));
    existing.extraMemberCharge = roundCurrency(
      Math.max(0, toNumber(input.extraMemberCharge, derivedSystemSnapshot.extraMemberCharge))
    );

    const overrideReason = cleanText(input.amountOverrideReason);
    if (Number.isFinite(input.finalAmount)) {
      existing.finalAmount = roundCurrency(Math.max(0, Number(input.finalAmount)));
    } else if (status === "completed" && toNumber(existing.finalAmount) <= 0) {
      existing.finalAmount = existing.systemCalculatedAmount;
    }
    if (status === "completed") {
      this.assertAmountOverrideReason(toNumber(existing.finalAmount), existing.systemCalculatedAmount, overrideReason);
      existing.amountOverrideReason =
        hasAmountDiff(toNumber(existing.finalAmount), existing.systemCalculatedAmount) && overrideReason
          ? overrideReason
          : null;
    } else if (input.amountOverrideReason !== undefined) {
      existing.amountOverrideReason = overrideReason;
    }

    if (status === "completed" && !existing.checkOutAt) {
      existing.checkOutAt = new Date();
    }

    const saved = await this.bookingRepository.save(existing);
    return this.toDto(saved);
  }
}
