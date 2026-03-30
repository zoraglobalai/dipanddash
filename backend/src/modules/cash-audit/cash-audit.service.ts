import { SelectQueryBuilder } from "typeorm";

import { UserRole } from "../../constants/roles";
import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { comparePassword } from "../../utils/password";
import { GamingBooking } from "../gaming/gaming-booking.entity";
import { Invoice } from "../invoices/invoice.entity";
import { InvoicePayment } from "../invoices/invoice-payment.entity";
import { User } from "../users/user.entity";
import { CashAudit } from "./cash-audit.entity";
import { CASH_DENOMINATIONS, type CashDenominationCounts } from "./cash-audit.constants";

type CreateCashAuditEntryInput = {
  auditDate?: string;
  denominationCounts: Record<string, number>;
  staffCashTakenAmount?: number;
  note?: string;
  adminPassword?: string;
};

type CashAuditSection = "dip_and_dash" | "gaming";

type AdminListFilters = {
  dateFrom?: string;
  dateTo?: string;
  section?: CashAuditSection;
  search?: string;
  page: number;
  limit: number;
};

type StatsFilters = {
  dateFrom?: string;
  dateTo?: string;
  section?: CashAuditSection;
};

type ExpectedBreakdownInput = {
  auditDate?: string;
};

type PaymentModeBreakdown = {
  cash: number;
  card: number;
  upi: number;
};

type EnrichedRecordValues = {
  expectedCashAmount: number;
  expectedCardAmount: number;
  expectedUpiAmount: number;
  expectedTotalAmount: number;
  enteredCashAmount: number;
  enteredCardAmount: number;
  enteredUpiAmount: number;
  enteredTotalAmount: number;
  differenceCashAmount: number;
  differenceCardAmount: number;
  differenceUpiAmount: number;
  differenceTotalAmount: number;
  excessAmount: number;
};

type SafeUser = {
  id: string;
  fullName: string;
  username: string;
  role: UserRole;
};

type CashAuditUserContext = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
};

type CashAuditListItem = {
  id: string;
  auditDate: string;
  denominationCounts: CashDenominationCounts;
  countedAmount: number;
  staffCashTakenAmount: number;
  enteredCardAmount: number;
  enteredUpiAmount: number;
  expectedCashAmount: number;
  expectedCardAmount: number;
  expectedUpiAmount: number;
  expectedTotalAmount: number;
  enteredCashAmount: number;
  enteredTotalAmount: number;
  differenceCashAmount: number;
  differenceCardAmount: number;
  differenceUpiAmount: number;
  differenceTotalAmount: number;
  excessAmount: number;
  totalPieces: number;
  differenceFromPrevious: number;
  note: string | null;
  createdByUserId: string;
  createdByUserName: string;
  createdByUsername: string;
  createdByUserRole: UserRole;
  approvedByAdminId: string;
  approvedByAdminName: string;
  approvedByAdminUsername: string;
  createdAt: Date;
  updatedAt: Date;
};

const todayDateString = () => new Date().toISOString().slice(0, 10);
const toFixedAmount = (value: number) => Number(value.toFixed(2));

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toMoney = (value: unknown) => toFixedAmount(toNumber(value));

const normalizeText = (value: string | undefined | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const parseAuditDateOrThrow = (value: string | undefined) => {
  const resolved = value ?? todayDateString();
  const parsed = new Date(`${resolved}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(422, "Audit date must be in YYYY-MM-DD format.");
  }
  return resolved;
};

const buildAuditDateRange = (auditDate: string) => {
  const from = new Date(`${auditDate}T00:00:00.000Z`);
  const to = new Date(`${auditDate}T23:59:59.999Z`);
  return { from, to };
};

const computeTotalPieces = (counts: CashDenominationCounts) =>
  CASH_DENOMINATIONS.reduce((sum, denomination) => sum + toNumber(counts[String(denomination)]), 0);

const resolveActorSection = (role: UserRole): CashAuditSection =>
  role === UserRole.SNOOKER_STAFF ? "gaming" : "dip_and_dash";

export class CashAuditService {
  private readonly cashAuditRepository = AppDataSource.getRepository(CashAudit);
  private readonly userRepository = AppDataSource.getRepository(User);
  private readonly invoiceRepository = AppDataSource.getRepository(Invoice);
  private readonly invoicePaymentRepository = AppDataSource.getRepository(InvoicePayment);
  private readonly gamingBookingRepository = AppDataSource.getRepository(GamingBooking);

  private async isCashAuditStorageReady() {
    if (!AppDataSource.isInitialized || !AppDataSource.hasMetadata(CashAudit)) {
      return false;
    }

    const queryRunner = AppDataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      return queryRunner.hasTable("cash_audits");
    } catch {
      return false;
    } finally {
      await queryRunner.release();
    }
  }

  private applyDateFilters(query: SelectQueryBuilder<CashAudit>, filters: StatsFilters) {
    if (filters.dateFrom) {
      query.andWhere("cashAudit.auditDate >= :dateFrom", { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      query.andWhere("cashAudit.auditDate <= :dateTo", { dateTo: filters.dateTo });
    }
  }

  private applySectionFilter(query: SelectQueryBuilder<CashAudit>, section?: CashAuditSection) {
    if (!section) {
      return;
    }

    if (section === "gaming") {
      query.andWhere("createdByUser.role = :gamingRole", { gamingRole: UserRole.SNOOKER_STAFF });
      return;
    }

    query.andWhere("createdByUser.role != :gamingRole", { gamingRole: UserRole.SNOOKER_STAFF });
  }

  private normalizeDenominationCounts(input: Record<string, number>): CashDenominationCounts {
    const normalized: CashDenominationCounts = {};
    for (const denomination of CASH_DENOMINATIONS) {
      const key = String(denomination);
      const count = Math.max(0, Math.floor(toNumber(input[key])));
      normalized[key] = count;
    }
    return normalized;
  }

  private calculateCountedAmount(counts: CashDenominationCounts) {
    const total = CASH_DENOMINATIONS.reduce((sum, denomination) => {
      const key = String(denomination);
      return sum + denomination * toNumber(counts[key]);
    }, 0);
    return toFixedAmount(total);
  }

  private mergePaymentRows(rows: Array<{ mode: string | null; amount: string | number }>) {
    const accumulator: PaymentModeBreakdown = {
      cash: 0,
      card: 0,
      upi: 0
    };

    rows.forEach((row) => {
      const rawMode = row.mode?.toLowerCase().trim();
      const mode =
        rawMode === "cash" || !rawMode
          ? "cash"
          : rawMode === "card" || rawMode.includes("card")
            ? "card"
            : rawMode === "upi" || rawMode.includes("upi")
              ? "upi"
              : "cash";
      const amount = toMoney(row.amount);
      if (amount <= 0) {
        return;
      }
      accumulator[mode] = toFixedAmount(accumulator[mode] + amount);
    });

    return accumulator;
  }

  private async getInvoicePaymentBreakdownForAuditDate(auditDate: string) {
    const { from, to } = buildAuditDateRange(auditDate);

    const paymentRows = await this.invoicePaymentRepository
      .createQueryBuilder("payment")
      .innerJoin(Invoice, "invoice", "invoice.id = payment.invoiceId")
      .select("payment.mode", "mode")
      .addSelect("COALESCE(SUM(payment.amount), 0)", "amount")
      .where("payment.status = 'success'")
      .andWhere("invoice.status = 'paid'")
      .andWhere("invoice.orderType != 'snooker'")
      .andWhere("invoice.createdAt >= :fromDate", { fromDate: from })
      .andWhere("invoice.createdAt <= :toDate", { toDate: to })
      .groupBy("payment.mode")
      .getRawMany<{ mode: string; amount: string }>();

    const missingPaymentRows = await this.invoiceRepository
      .createQueryBuilder("invoice")
      .select("invoice.paymentMode", "mode")
      .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "amount")
      .where("invoice.status = 'paid'")
      .andWhere("invoice.orderType != 'snooker'")
      .andWhere("invoice.createdAt >= :fromDate", { fromDate: from })
      .andWhere("invoice.createdAt <= :toDate", { toDate: to })
      .andWhere((query) => {
        const subQuery = query
          .subQuery()
          .select("1")
          .from(InvoicePayment, "invoicePayment")
          .where("invoicePayment.invoiceId = invoice.id")
          .getQuery();
        return `NOT EXISTS ${subQuery}`;
      })
      .groupBy("invoice.paymentMode")
      .getRawMany<{ mode: string; amount: string }>();

    return this.mergePaymentRows([...paymentRows, ...missingPaymentRows]);
  }

  private async getGamingPaymentBreakdownForAuditDate(auditDate: string) {
    const { from, to } = buildAuditDateRange(auditDate);
    const bookingEffectiveTimeExpression = `
      (
        CASE
          WHEN "booking"."status" = 'completed' AND "booking"."checkOutAt" IS NOT NULL THEN "booking"."checkOutAt"
          ELSE "booking"."createdAt"
        END
      )
    `;

    const rows = await this.gamingBookingRepository
      .createQueryBuilder("booking")
      .select("booking.paymentMode", "mode")
      .addSelect("COALESCE(SUM(booking.finalAmount + booking.foodAndBeverageAmount), 0)", "amount")
      .where("booking.paymentStatus = 'paid'")
      .andWhere("booking.paymentMode IS NOT NULL")
      .andWhere(`${bookingEffectiveTimeExpression} >= :fromDate`, { fromDate: from })
      .andWhere(`${bookingEffectiveTimeExpression} <= :toDate`, { toDate: to })
      .groupBy("booking.paymentMode")
      .getRawMany<{ mode: string; amount: string }>();

    return this.mergePaymentRows(rows);
  }

  private async getExpectedBreakdownForSectionDate(section: CashAuditSection, auditDate: string) {
    const breakdown =
      section === "gaming"
        ? await this.getGamingPaymentBreakdownForAuditDate(auditDate)
        : await this.getInvoicePaymentBreakdownForAuditDate(auditDate);
    const cash = toFixedAmount(breakdown.cash);
    const card = toFixedAmount(breakdown.card);
    const upi = toFixedAmount(breakdown.upi);

    return {
      cash,
      card,
      upi,
      total: toFixedAmount(cash + card + upi)
    };
  }

  private buildEnrichedRecordValues(record: Pick<
    CashAudit,
    | "countedAmount"
    | "staffCashTakenAmount"
    | "enteredCardAmount"
    | "enteredUpiAmount"
    | "expectedCashAmount"
    | "expectedCardAmount"
    | "expectedUpiAmount"
  >): EnrichedRecordValues {
    const countedAmount = toFixedAmount(toNumber(record.countedAmount));
    const staffCashTakenAmount = toFixedAmount(toNumber(record.staffCashTakenAmount));
    const expectedCashAmount = toFixedAmount(toNumber(record.expectedCashAmount));
    const expectedCardAmount = toFixedAmount(toNumber(record.expectedCardAmount));
    const expectedUpiAmount = toFixedAmount(toNumber(record.expectedUpiAmount));
    const enteredCardAmount = toFixedAmount(toNumber(record.enteredCardAmount));
    const enteredUpiAmount = toFixedAmount(toNumber(record.enteredUpiAmount));
    const enteredCashAmount = toFixedAmount(countedAmount + staffCashTakenAmount);

    const expectedTotalAmount = toFixedAmount(expectedCashAmount + expectedCardAmount + expectedUpiAmount);
    const enteredTotalAmount = toFixedAmount(enteredCashAmount + enteredCardAmount + enteredUpiAmount);

    return {
      expectedCashAmount,
      expectedCardAmount,
      expectedUpiAmount,
      expectedTotalAmount,
      enteredCashAmount,
      enteredCardAmount,
      enteredUpiAmount,
      enteredTotalAmount,
      differenceCashAmount: toFixedAmount(enteredCashAmount - expectedCashAmount),
      differenceCardAmount: toFixedAmount(enteredCardAmount - expectedCardAmount),
      differenceUpiAmount: toFixedAmount(enteredUpiAmount - expectedUpiAmount),
      differenceTotalAmount: toFixedAmount(enteredTotalAmount - expectedTotalAmount),
      excessAmount: toFixedAmount(Math.max(enteredTotalAmount - expectedTotalAmount, 0))
    };
  }

  private async verifyAdminPassword(password: string): Promise<SafeUser> {
    const admins = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.role = :role", { role: UserRole.ADMIN })
      .andWhere("user.isActive = true")
      .getMany();

    for (const admin of admins) {
      if (!admin.passwordHash) {
        continue;
      }
      const valid = await comparePassword(password, admin.passwordHash);
      if (valid) {
        return {
          id: admin.id,
          fullName: admin.fullName,
          username: admin.username,
          role: admin.role
        };
      }
    }

    throw new AppError(422, "Admin password verification failed. Please enter a valid admin password.");
  }

  private async resolveApprover(
    actor: CashAuditUserContext,
    adminPassword: string | undefined
  ): Promise<SafeUser> {
    if (actor.role === UserRole.ADMIN) {
      return {
        id: actor.id,
        fullName: actor.fullName,
        username: actor.username,
        role: actor.role
      };
    }

    if (!adminPassword) {
      throw new AppError(422, "Admin password is required to submit cash audit from staff side.");
    }

    return this.verifyAdminPassword(adminPassword);
  }

  private async buildDifferenceMap(filters: StatsFilters): Promise<Map<string, number>> {
    const query = this.cashAuditRepository
      .createQueryBuilder("cashAudit")
      .leftJoin("cashAudit.createdByUser", "createdByUser")
      .select(["cashAudit.id AS id", "cashAudit.countedAmount AS countedAmount"])
      .orderBy("cashAudit.createdAt", "ASC");

    this.applyDateFilters(query, filters);
    this.applySectionFilter(query, filters.section);

    const rows = await query.getRawMany<{ id: string; countedAmount: string }>();
    const differences = new Map<string, number>();
    let previous = 0;

    rows.forEach((row, index) => {
      const current = toNumber(row.countedAmount);
      differences.set(row.id, toFixedAmount(index === 0 ? current : current - previous));
      previous = current;
    });

    return differences;
  }

  private mapRecord(record: CashAudit, differenceFromPrevious: number): CashAuditListItem {
    const denominationCounts = this.normalizeDenominationCounts(record.denominationCounts ?? {});
    const enriched = this.buildEnrichedRecordValues(record);
    return {
      id: record.id,
      auditDate: record.auditDate,
      denominationCounts,
      countedAmount: toFixedAmount(toNumber(record.countedAmount)),
      staffCashTakenAmount: toFixedAmount(toNumber(record.staffCashTakenAmount)),
      enteredCardAmount: enriched.enteredCardAmount,
      enteredUpiAmount: enriched.enteredUpiAmount,
      expectedCashAmount: enriched.expectedCashAmount,
      expectedCardAmount: enriched.expectedCardAmount,
      expectedUpiAmount: enriched.expectedUpiAmount,
      expectedTotalAmount: enriched.expectedTotalAmount,
      enteredCashAmount: enriched.enteredCashAmount,
      enteredTotalAmount: enriched.enteredTotalAmount,
      differenceCashAmount: enriched.differenceCashAmount,
      differenceCardAmount: enriched.differenceCardAmount,
      differenceUpiAmount: enriched.differenceUpiAmount,
      differenceTotalAmount: enriched.differenceTotalAmount,
      excessAmount: enriched.excessAmount,
      totalPieces: computeTotalPieces(denominationCounts),
      differenceFromPrevious: toFixedAmount(differenceFromPrevious),
      note: record.note,
      createdByUserId: record.createdByUserId,
      createdByUserName: record.createdByUser?.fullName ?? "-",
      createdByUsername: record.createdByUser?.username ?? "-",
      createdByUserRole: record.createdByUser?.role ?? UserRole.STAFF,
      approvedByAdminId: record.approvedByAdminId,
      approvedByAdminName: record.approvedByAdmin?.fullName ?? "-",
      approvedByAdminUsername: record.approvedByAdmin?.username ?? "-",
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }

  async createEntry(actor: CashAuditUserContext, payload: CreateCashAuditEntryInput) {
    const storageReady = await this.isCashAuditStorageReady();
    if (!storageReady) {
      throw new AppError(
        503,
        "Cash audit storage is not initialized yet. Please restart backend and run database sync/migration."
      );
    }

    const approver = await this.resolveApprover(actor, payload.adminPassword);
    const auditDate = parseAuditDateOrThrow(payload.auditDate);
    const denominationCounts = this.normalizeDenominationCounts(payload.denominationCounts);
    const countedAmount = this.calculateCountedAmount(denominationCounts);
    const staffCashTakenAmount = toFixedAmount(toNumber(payload.staffCashTakenAmount));
    const section = resolveActorSection(actor.role);
    const expected = await this.getExpectedBreakdownForSectionDate(section, auditDate);
    const enteredCardAmount = toFixedAmount(expected.card);
    const enteredUpiAmount = toFixedAmount(expected.upi);
    const enriched = this.buildEnrichedRecordValues({
      countedAmount,
      staffCashTakenAmount,
      enteredCardAmount,
      enteredUpiAmount,
      expectedCashAmount: expected.cash,
      expectedCardAmount: expected.card,
      expectedUpiAmount: expected.upi
    });

    const normalizedNote = normalizeText(payload.note);
    if (enriched.differenceTotalAmount !== 0 && !normalizedNote) {
      throw new AppError(422, "Reason note is required when there is a difference in cash audit.");
    }

    let finalNote = normalizedNote;
    if (enriched.excessAmount > 0) {
      const excessPrefix = `Excess Amount: ${enriched.excessAmount.toFixed(2)}`;
      const hasPrefix = normalizedNote ? normalizedNote.toLowerCase().includes("excess amount") : false;
      finalNote = hasPrefix ? normalizedNote : [excessPrefix, normalizedNote].filter(Boolean).join(" | ");
    }

    if (finalNote && finalNote.length > 500) {
      throw new AppError(422, "Difference note is too long.");
    }

    const entry = this.cashAuditRepository.create({
      auditDate,
      denominationCounts,
      countedAmount,
      staffCashTakenAmount,
      enteredCardAmount,
      enteredUpiAmount,
      expectedCashAmount: expected.cash,
      expectedCardAmount: expected.card,
      expectedUpiAmount: expected.upi,
      note: finalNote,
      createdByUserId: actor.id,
      approvedByAdminId: approver.id
    });

    const saved = await this.cashAuditRepository.save(entry);
    const hydrated = await this.cashAuditRepository.findOne({
      where: { id: saved.id },
      relations: {
        createdByUser: true,
        approvedByAdmin: true
      }
    });

    if (!hydrated) {
      throw new AppError(500, "Cash audit entry was saved but could not be loaded.");
    }

    const previousRecord = await this.cashAuditRepository
      .createQueryBuilder("cashAudit")
      .where("cashAudit.createdAt < :createdAt", { createdAt: hydrated.createdAt })
      .orderBy("cashAudit.createdAt", "DESC")
      .getOne();

    const previousAmount = previousRecord ? toNumber(previousRecord.countedAmount) : 0;
    const differenceFromPrevious = previousRecord
      ? toFixedAmount(toNumber(hydrated.countedAmount) - previousAmount)
      : toFixedAmount(toNumber(hydrated.countedAmount));

    return this.mapRecord(hydrated, differenceFromPrevious);
  }

  async listAdminRecords(filters: AdminListFilters) {
    const storageReady = await this.isCashAuditStorageReady();
    if (!storageReady) {
      return {
        records: [],
        pagination: {
          page: Math.max(1, filters.page || 1),
          limit: Math.min(100, Math.max(1, filters.limit || 10)),
          total: 0,
          totalPages: 1
        }
      };
    }

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.cashAuditRepository
      .createQueryBuilder("cashAudit")
      .leftJoinAndSelect("cashAudit.createdByUser", "createdByUser")
      .leftJoinAndSelect("cashAudit.approvedByAdmin", "approvedByAdmin")
      .orderBy("cashAudit.createdAt", "DESC");

    this.applyDateFilters(query, filters);
    this.applySectionFilter(query, filters.section);

    if (filters.search) {
      query.andWhere(
        `(
          LOWER(createdByUser.fullName) LIKE LOWER(:search)
          OR LOWER(createdByUser.username) LIKE LOWER(:search)
          OR LOWER(approvedByAdmin.fullName) LIKE LOWER(:search)
          OR LOWER(approvedByAdmin.username) LIKE LOWER(:search)
        )`,
        { search: `%${filters.search}%` }
      );
    }

    const [rows, total, differenceMap] = await Promise.all([
      query.clone().offset(offset).limit(limit).getMany(),
      query.getCount(),
      this.buildDifferenceMap(filters)
    ]);

    return {
      records: rows.map((row) => this.mapRecord(row, differenceMap.get(row.id) ?? 0)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async getAdminStats(filters: StatsFilters) {
    const storageReady = await this.isCashAuditStorageReady();
    if (!storageReady) {
      return {
        totalAudits: 0,
        totalCountedAmount: 0,
        totalStaffCashTaken: 0,
        totalExpectedCashAmount: 0,
        totalExpectedCardAmount: 0,
        totalExpectedUpiAmount: 0,
        totalExpectedAmount: 0,
        totalEnteredCashAmount: 0,
        totalEnteredCardAmount: 0,
        totalEnteredUpiAmount: 0,
        totalEnteredAmount: 0,
        totalDifferenceAmount: 0,
        totalExcessAmount: 0,
        latestAuditAt: null,
        latestAuditDate: null,
        latestCountedAmount: 0,
        previousCountedAmount: 0,
        differenceFromLastAudit: 0,
        latestDifferenceAmount: 0,
        latestExcessAmount: 0,
        latestTotalPieces: 0,
        averageCountedAmount: 0
      };
    }

    const query = this.cashAuditRepository
      .createQueryBuilder("cashAudit")
      .leftJoin("cashAudit.createdByUser", "createdByUser");
    this.applyDateFilters(query, filters);
    this.applySectionFilter(query, filters.section);

    const rows = await query.orderBy("cashAudit.createdAt", "ASC").getMany();

    const totalAudits = rows.length;
    const totalCountedAmount = toFixedAmount(rows.reduce((sum, row) => sum + toNumber(row.countedAmount), 0));
    const totalStaffCashTaken = toFixedAmount(
      rows.reduce((sum, row) => sum + toNumber(row.staffCashTakenAmount), 0)
    );

    const enrichedRows = rows.map((row) => this.buildEnrichedRecordValues(row));
    const totalExpectedCashAmount = toFixedAmount(
      enrichedRows.reduce((sum, row) => sum + row.expectedCashAmount, 0)
    );
    const totalExpectedCardAmount = toFixedAmount(
      enrichedRows.reduce((sum, row) => sum + row.expectedCardAmount, 0)
    );
    const totalExpectedUpiAmount = toFixedAmount(
      enrichedRows.reduce((sum, row) => sum + row.expectedUpiAmount, 0)
    );
    const totalExpectedAmount = toFixedAmount(
      enrichedRows.reduce((sum, row) => sum + row.expectedTotalAmount, 0)
    );
    const totalEnteredCashAmount = toFixedAmount(
      enrichedRows.reduce((sum, row) => sum + row.enteredCashAmount, 0)
    );
    const totalEnteredCardAmount = toFixedAmount(
      enrichedRows.reduce((sum, row) => sum + row.enteredCardAmount, 0)
    );
    const totalEnteredUpiAmount = toFixedAmount(
      enrichedRows.reduce((sum, row) => sum + row.enteredUpiAmount, 0)
    );
    const totalEnteredAmount = toFixedAmount(
      enrichedRows.reduce((sum, row) => sum + row.enteredTotalAmount, 0)
    );
    const totalDifferenceAmount = toFixedAmount(
      enrichedRows.reduce((sum, row) => sum + row.differenceTotalAmount, 0)
    );
    const totalExcessAmount = toFixedAmount(enrichedRows.reduce((sum, row) => sum + row.excessAmount, 0));

    const latest = rows.length ? rows[rows.length - 1] : null;
    const previous = rows.length > 1 ? rows[rows.length - 2] : null;
    const latestCountedAmount = toFixedAmount(toNumber(latest?.countedAmount));
    const previousCountedAmount = toFixedAmount(toNumber(previous?.countedAmount));
    const differenceFromLastAudit = latest
      ? toFixedAmount(latestCountedAmount - previousCountedAmount)
      : 0;
    const latestDifferenceAmount = latest ? this.buildEnrichedRecordValues(latest).differenceTotalAmount : 0;
    const latestExcessAmount = latest ? this.buildEnrichedRecordValues(latest).excessAmount : 0;

    const latestCounts = latest
      ? this.normalizeDenominationCounts((latest.denominationCounts ?? {}) as Record<string, number>)
      : this.normalizeDenominationCounts({});

    return {
      totalAudits,
      totalCountedAmount,
      totalStaffCashTaken,
      totalExpectedCashAmount,
      totalExpectedCardAmount,
      totalExpectedUpiAmount,
      totalExpectedAmount,
      totalEnteredCashAmount,
      totalEnteredCardAmount,
      totalEnteredUpiAmount,
      totalEnteredAmount,
      totalDifferenceAmount,
      totalExcessAmount,
      latestAuditAt: latest?.createdAt ?? null,
      latestAuditDate: latest?.auditDate ?? null,
      latestCountedAmount,
      previousCountedAmount,
      differenceFromLastAudit,
      latestDifferenceAmount,
      latestExcessAmount,
      latestTotalPieces: computeTotalPieces(latestCounts),
      averageCountedAmount: totalAudits ? toFixedAmount(totalCountedAmount / totalAudits) : 0
    };
  }

  async getStaffLastAuditInfo() {
    const storageReady = await this.isCashAuditStorageReady();
    if (!storageReady) {
      return {
        hasAudit: false,
        lastAuditAt: null,
        lastAuditDate: null,
        lastAuditedBy: null
      };
    }

    const latest = await this.cashAuditRepository
      .createQueryBuilder("cashAudit")
      .leftJoinAndSelect("cashAudit.createdByUser", "createdByUser")
      .orderBy("cashAudit.createdAt", "DESC")
      .limit(1)
      .getOne();

    if (!latest) {
      return {
        hasAudit: false,
        lastAuditAt: null,
        lastAuditDate: null,
        lastAuditedBy: null
      };
    }

    return {
      hasAudit: true,
      lastAuditAt: latest.createdAt,
      lastAuditDate: latest.auditDate,
      lastAuditedBy: latest.createdByUser?.fullName ?? latest.createdByUser?.username ?? "-"
    };
  }

  async getStaffExpectedBreakdown(actor: CashAuditUserContext, input: ExpectedBreakdownInput) {
    const auditDate = parseAuditDateOrThrow(input.auditDate);
    const section = resolveActorSection(actor.role);
    const expected = await this.getExpectedBreakdownForSectionDate(section, auditDate);

    return {
      auditDate,
      section,
      expectedCashAmount: expected.cash,
      expectedCardAmount: expected.card,
      expectedUpiAmount: expected.upi,
      expectedTotalAmount: expected.total
    };
  }
}
