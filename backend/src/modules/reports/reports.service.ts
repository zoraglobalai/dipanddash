import { UserRole } from "../../constants/roles";
import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { AttendanceRecord } from "../attendance/attendance.entity";
import { CashAudit } from "../cash-audit/cash-audit.entity";
import { GamingBooking } from "../gaming/gaming-booking.entity";
import { DailyAllocation } from "../ingredients/daily-allocation.entity";
import { Ingredient } from "../ingredients/ingredient.entity";
import { IngredientStock } from "../ingredients/ingredient-stock.entity";
import { InvoiceLine } from "../invoices/invoice-line.entity";
import { InvoiceUsageEvent } from "../invoices/invoice-usage-event.entity";
import { Invoice } from "../invoices/invoice.entity";
import { AddOn } from "../items/add-on.entity";
import { Combo } from "../items/combo.entity";
import { Item } from "../items/item.entity";
import { Outlet } from "../outlets/outlet.entity";
import { Product } from "../procurement/product.entity";
import { PurchaseOrder } from "../procurement/purchase-order.entity";
import { Supplier } from "../procurement/supplier.entity";
import { User } from "../users/user.entity";
import { REPORT_CATALOG, REPORT_KEYS, type ReportKey } from "./reports.constants";
import {
  buildStockConsumptionExcelXml,
  buildStockConsumptionHtmlDocument,
  buildStockConsumptionPdf,
  type StockConsumptionExportPayload
} from "./stock-consumption-export";

type GenerateReportInput = {
  reportKey: ReportKey;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  outletId?: string;
  page: number;
  limit: number;
};

type ExportStockConsumptionInput = {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  outletId?: string;
};

type ReportUserContext = {
  id: string;
  role: UserRole;
};

type ReportStat = {
  label: string;
  value: string | number;
  hint?: string;
};

type ReportColumn = {
  key: string;
  label: string;
};

type ReportRow = Record<string, string | number | null>;

type ReportPayload = {
  stats: ReportStat[];
  columns: ReportColumn[];
  rows: ReportRow[];
};

type StockMovementRow = {
  date: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantity: number;
};

type TransferMovementRow = {
  date: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  transferredIn: number;
  transferredOut: number;
};

type ClosingStockSnapshotRow = {
  date: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  openingStock: number;
  consumption: number;
  remainingStock: number;
};

type OutletContext = {
  id: string;
  outletCode: string;
  outletName: string;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toMoney = (value: unknown) => Number(toNumber(value).toFixed(2));
const toQty = (value: unknown) => Number(toNumber(value).toFixed(3));
const toPercent = (value: unknown) => Number(toNumber(value).toFixed(2));

const pad2 = (value: number) => String(value).padStart(2, "0");

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
};

const formatDate = (value: Date) => `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;

const parseDateInput = (value: string) => {
  const trimmed = value.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const parsed = new Date(year, month - 1, day);
    const isValid =
      parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
    return isValid ? parsed : new Date(Number.NaN);
  }
  return new Date(trimmed);
};

const normalizeMovementDate = (value: unknown) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "";
    }
    return formatDate(value);
  }

  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  const exactDateMatch = /^(\d{4}-\d{2}-\d{2})$/.exec(text);
  if (exactDateMatch) {
    return exactDateMatch[1];
  }

  const leadingDateMatch = /^(\d{4}-\d{2}-\d{2})[T\s].*$/.exec(text);
  if (leadingDateMatch) {
    return leadingDateMatch[1];
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }
  return formatDate(parsed);
};

const getDefaultRange = () => {
  const to = endOfDay(new Date());
  const from = startOfDay(new Date(to));
  from.setDate(from.getDate() - 6);
  return { from, to };
};

const getDateRange = (dateFrom?: string, dateTo?: string) => {
  const defaults = getDefaultRange();
  const from = dateFrom ? startOfDay(parseDateInput(dateFrom)) : defaults.from;
  const to = dateTo ? endOfDay(parseDateInput(dateTo)) : defaults.to;

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new AppError(422, "Date must be in YYYY-MM-DD format.");
  }

  if (from > to) {
    throw new AppError(422, "Date From must be before Date To.");
  }

  return { from, to };
};

const minutesBetween = (start: Date, end: Date) =>
  Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));

const toIso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

export class ReportsService {
  private readonly userRepository = AppDataSource.getRepository(User);
  private readonly invoiceRepository = AppDataSource.getRepository(Invoice);
  private readonly invoiceLineRepository = AppDataSource.getRepository(InvoiceLine);
  private readonly usageRepository = AppDataSource.getRepository(InvoiceUsageEvent);
  private readonly purchaseRepository = AppDataSource.getRepository(PurchaseOrder);
  private readonly ingredientRepository = AppDataSource.getRepository(Ingredient);
  private readonly ingredientStockRepository = AppDataSource.getRepository(IngredientStock);
  private readonly allocationRepository = AppDataSource.getRepository(DailyAllocation);
  private readonly attendanceRepository = AppDataSource.getRepository(AttendanceRecord);
  private readonly itemRepository = AppDataSource.getRepository(Item);
  private readonly addOnRepository = AppDataSource.getRepository(AddOn);
  private readonly comboRepository = AppDataSource.getRepository(Combo);
  private readonly productRepository = AppDataSource.getRepository(Product);
  private readonly outletRepository = AppDataSource.getRepository(Outlet);
  private readonly gamingRepository = AppDataSource.getRepository(GamingBooking);
  private readonly cashAuditRepository = AppDataSource.getRepository(CashAudit);

  private async getUserAssignedReports(userId: string): Promise<ReportKey[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ["id", "assignedReports"]
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    return (user.assignedReports ?? []).filter((key): key is ReportKey =>
      (REPORT_KEYS as readonly string[]).includes(key)
    );
  }

  async getCatalog(user: ReportUserContext) {
    if (user.role === UserRole.ADMIN) {
      return {
        reports: REPORT_CATALOG
      };
    }

    const assigned = await this.getUserAssignedReports(user.id);
    const assignedSet = new Set(assigned);
    return {
      reports: REPORT_CATALOG.filter((report) => assignedSet.has(report.key))
    };
  }

  private async assertAccess(user: ReportUserContext, key: ReportKey) {
    if (user.role === UserRole.ADMIN) {
      return;
    }

    const assigned = await this.getUserAssignedReports(user.id);
    if (!assigned.includes(key)) {
      throw new AppError(403, "This report is not assigned to your account.");
    }
  }

  private applyDateFilter(query: ReturnType<typeof this.invoiceRepository.createQueryBuilder>, from: Date, to: Date) {
    return query.andWhere("invoice.createdAt >= :from AND invoice.createdAt <= :to", { from, to });
  }

  private filterReportRows(rows: ReportRow[], search: string | undefined) {
    const normalizedSearch = search?.trim().toLowerCase();
    if (!normalizedSearch) {
      return rows;
    }

    return rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(normalizedSearch))
    );
  }

  private finalizeReportRows(rows: ReportRow[], search: string | undefined, page: number, limit: number) {
    const filtered = this.filterReportRows(rows, search);

    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.min(500, Math.max(1, limit || 50));
    const offset = (safePage - 1) * safeLimit;
    const pagedRows = filtered.slice(offset, offset + safeLimit);

    return {
      rows: pagedRows,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / safeLimit))
      }
    };
  }

  async generateReport(user: ReportUserContext, input: GenerateReportInput) {
    await this.assertAccess(user, input.reportKey);
    const reportDefinition = REPORT_CATALOG.find((item) => item.key === input.reportKey);
    if (!reportDefinition) {
      throw new AppError(404, "Report definition not found");
    }

    const { from, to } = getDateRange(input.dateFrom, input.dateTo);
    const payload = await this.dispatchGenerateReport(input.reportKey, from, to, {
      outletId: input.outletId
    });
    const finalized = this.finalizeReportRows(payload.rows, input.search, input.page, input.limit);

    return {
      report: reportDefinition,
      range: {
        dateFrom: formatDate(from),
        dateTo: formatDate(to),
        generatedAt: new Date().toISOString()
      },
      stats: payload.stats,
      columns: payload.columns,
      rows: finalized.rows,
      pagination: finalized.pagination
    };
  }

  async exportStockConsumptionReport(
    user: ReportUserContext,
    input: ExportStockConsumptionInput,
    format: "excel" | "pdf"
  ) {
    await this.assertAccess(user, "stock_consumption_report");
    const { from, to } = getDateRange(input.dateFrom, input.dateTo);
    const computed = await this.buildStockConsumptionDataset(from, to, input.outletId);
    const filteredRows = this.filterReportRows(computed.payload.rows, input.search);
    const exportPayload: StockConsumptionExportPayload = {
      title: "Stock Consumption Report",
      outletLabel: computed.outletLabel,
      dateFrom: formatDate(from),
      dateTo: formatDate(to),
      generatedAt: new Date().toISOString(),
      columns: computed.payload.columns,
      rows: filteredRows,
      stats: this.buildStockConsumptionStats(filteredRows)
    };

    const outletToken = computed.outletLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "all_outlets";
    const rangeToken = `${formatDate(from)}_${formatDate(to)}`;

    if (format === "excel") {
      return {
        fileName: `stock_consumption_${outletToken}_${rangeToken}.csv`,
        mimeType: "text/csv; charset=utf-8",
        content: buildStockConsumptionExcelXml(exportPayload)
      };
    }

    return {
      fileName: `stock_consumption_${outletToken}_${rangeToken}.pdf`,
      mimeType: "application/pdf",
      content: buildStockConsumptionPdf(exportPayload)
    };
  }

  async exportStockConsumptionHtml(user: ReportUserContext, input: ExportStockConsumptionInput) {
    await this.assertAccess(user, "stock_consumption_report");
    const { from, to } = getDateRange(input.dateFrom, input.dateTo);
    const computed = await this.buildStockConsumptionDataset(from, to, input.outletId);
    const filteredRows = this.filterReportRows(computed.payload.rows, input.search);
    const html = buildStockConsumptionHtmlDocument({
      title: "Stock Consumption Report",
      outletLabel: computed.outletLabel,
      dateFrom: formatDate(from),
      dateTo: formatDate(to),
      generatedAt: new Date().toISOString(),
      columns: computed.payload.columns,
      rows: filteredRows,
      stats: this.buildStockConsumptionStats(filteredRows)
    });

    return {
      fileName: `stock_consumption_${formatDate(from)}_${formatDate(to)}.html`,
      html
    };
  }

  private async generateDailySalesReport(from: Date, to: Date): Promise<ReportPayload> {
    const rows = await this.applyDateFilter(
      this.invoiceRepository
        .createQueryBuilder("invoice")
        .where("invoice.status = 'paid'")
        .select("DATE(invoice.createdAt)", "date")
        .addSelect("COUNT(invoice.id)", "orders")
        .addSelect("COALESCE(SUM(invoice.totalAmount),0)", "sales")
        .addSelect("COALESCE(SUM(invoice.taxAmount),0)", "tax")
        .addSelect(
          "COALESCE(SUM(invoice.itemDiscountAmount + invoice.couponDiscountAmount + invoice.manualDiscountAmount),0)",
          "discount"
        )
        .groupBy("DATE(invoice.createdAt)")
        .orderBy("DATE(invoice.createdAt)", "ASC"),
      from,
      to
    ).getRawMany<{ date: string; orders: string; sales: string; tax: string; discount: string }>();

    const parsedRows = rows.map((row) => ({
      date: row.date,
      orders: Number(row.orders ?? 0),
      sales: toMoney(row.sales),
      tax: toMoney(row.tax),
      discount: toMoney(row.discount),
      netSales: toMoney(toNumber(row.sales) - toNumber(row.tax))
    }));

    const totalSales = parsedRows.reduce((sum, row) => sum + toNumber(row.sales), 0);
    const totalOrders = parsedRows.reduce((sum, row) => sum + toNumber(row.orders), 0);

    return {
      stats: [
        { label: "Total Sales", value: toMoney(totalSales) },
        { label: "Total Orders", value: totalOrders },
        { label: "Average Order Value", value: totalOrders ? toMoney(totalSales / totalOrders) : 0 }
      ],
      columns: [
        { key: "date", label: "Date" },
        { key: "orders", label: "Orders" },
        { key: "sales", label: "Sales" },
        { key: "tax", label: "Tax" },
        { key: "discount", label: "Discount" },
        { key: "netSales", label: "Net Sales" }
      ],
      rows: parsedRows
    };
  }

  private async generateProductWiseSalesReport(from: Date, to: Date): Promise<ReportPayload> {
    const rows = await this.invoiceLineRepository
      .createQueryBuilder("line")
      .leftJoin(Invoice, "invoice", "invoice.id = line.invoiceId")
      .where("invoice.status = 'paid'")
      .andWhere("invoice.createdAt >= :from AND invoice.createdAt <= :to", { from, to })
      .select("line.nameSnapshot", "name")
      .addSelect("line.lineType", "lineType")
      .addSelect("COALESCE(SUM(line.quantity),0)", "quantity")
      .addSelect("COALESCE(SUM(line.lineTotal),0)", "total")
      .addSelect("COALESCE(AVG(line.unitPrice),0)", "avgPrice")
      .groupBy("line.nameSnapshot")
      .addGroupBy("line.lineType")
      .orderBy("COALESCE(SUM(line.lineTotal),0)", "DESC")
      .getRawMany<{ name: string; lineType: string; quantity: string; total: string; avgPrice: string }>();

    const parsedRows = rows.map((row) => ({
      name: row.name,
      type: row.lineType,
      quantity: toQty(row.quantity),
      totalSales: toMoney(row.total),
      averageUnitPrice: toMoney(row.avgPrice)
    }));

    return {
      stats: [
        { label: "Lines", value: parsedRows.length },
        { label: "Total Product Sales", value: toMoney(parsedRows.reduce((sum, row) => sum + row.totalSales, 0)) },
        {
          label: "Top Seller",
          value: parsedRows[0]?.name ?? "-",
          hint: parsedRows[0] ? `Sales ${parsedRows[0].totalSales}` : undefined
        }
      ],
      columns: [
        { key: "name", label: "Name" },
        { key: "type", label: "Type" },
        { key: "quantity", label: "Quantity" },
        { key: "averageUnitPrice", label: "Avg Price" },
        { key: "totalSales", label: "Total Sales" }
      ],
      rows: parsedRows
    };
  }

  private async generatePaymentMethodReport(from: Date, to: Date): Promise<ReportPayload> {
    const rows = await this.applyDateFilter(
      this.invoiceRepository
        .createQueryBuilder("invoice")
        .where("invoice.status = 'paid'")
        .select("invoice.paymentMode", "paymentMode")
        .addSelect("COUNT(invoice.id)", "count")
        .addSelect("COALESCE(SUM(invoice.totalAmount),0)", "amount")
        .groupBy("invoice.paymentMode")
        .orderBy("COALESCE(SUM(invoice.totalAmount),0)", "DESC"),
      from,
      to
    ).getRawMany<{ paymentMode: string; count: string; amount: string }>();

    const parsedRows = rows.map((row) => ({
      paymentMode: row.paymentMode,
      invoices: Number(row.count ?? 0),
      amount: toMoney(row.amount)
    }));

    return {
      stats: [
        { label: "Payment Modes", value: parsedRows.length },
        { label: "Total Collected", value: toMoney(parsedRows.reduce((sum, row) => sum + row.amount, 0)) },
        { label: "Top Method", value: parsedRows[0]?.paymentMode?.toUpperCase() ?? "-" }
      ],
      columns: [
        { key: "paymentMode", label: "Payment Mode" },
        { key: "invoices", label: "Invoices" },
        { key: "amount", label: "Amount" }
      ],
      rows: parsedRows
    };
  }

  private async generateDiscountReport(from: Date, to: Date): Promise<ReportPayload> {
    const rows = await this.applyDateFilter(
      this.invoiceRepository
        .createQueryBuilder("invoice")
        .where("invoice.status = 'paid'")
        .select("DATE(invoice.createdAt)", "date")
        .addSelect("COALESCE(SUM(invoice.itemDiscountAmount),0)", "itemDiscount")
        .addSelect("COALESCE(SUM(invoice.couponDiscountAmount),0)", "couponDiscount")
        .addSelect("COALESCE(SUM(invoice.manualDiscountAmount),0)", "manualDiscount")
        .addSelect(
          "COALESCE(SUM(invoice.itemDiscountAmount + invoice.couponDiscountAmount + invoice.manualDiscountAmount),0)",
          "totalDiscount"
        )
        .groupBy("DATE(invoice.createdAt)")
        .orderBy("DATE(invoice.createdAt)", "ASC"),
      from,
      to
    ).getRawMany<{
      date: string;
      itemDiscount: string;
      couponDiscount: string;
      manualDiscount: string;
      totalDiscount: string;
    }>();

    const parsedRows = rows.map((row) => ({
      date: row.date,
      itemDiscount: toMoney(row.itemDiscount),
      couponDiscount: toMoney(row.couponDiscount),
      manualDiscount: toMoney(row.manualDiscount),
      totalDiscount: toMoney(row.totalDiscount)
    }));

    return {
      stats: [
        { label: "Total Discount", value: toMoney(parsedRows.reduce((sum, row) => sum + row.totalDiscount, 0)) },
        { label: "Coupon Discount", value: toMoney(parsedRows.reduce((sum, row) => sum + row.couponDiscount, 0)) },
        { label: "Manual Discount", value: toMoney(parsedRows.reduce((sum, row) => sum + row.manualDiscount, 0)) }
      ],
      columns: [
        { key: "date", label: "Date" },
        { key: "itemDiscount", label: "Item Discount" },
        { key: "couponDiscount", label: "Coupon Discount" },
        { key: "manualDiscount", label: "Manual Discount" },
        { key: "totalDiscount", label: "Total Discount" }
      ],
      rows: parsedRows
    };
  }

  private async generateCancelledVoidReport(from: Date, to: Date): Promise<ReportPayload> {
    const rows = await this.invoiceRepository
      .createQueryBuilder("invoice")
      .leftJoinAndSelect("invoice.staff", "staff")
      .where("invoice.status IN ('cancelled', 'refunded')")
      .andWhere("invoice.createdAt >= :from AND invoice.createdAt <= :to", { from, to })
      .orderBy("invoice.createdAt", "DESC")
      .getMany();

    const parsedRows = rows.map((row) => ({
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      orderType: row.orderType,
      amount: toMoney(row.totalAmount),
      reason: row.status === "cancelled" ? row.cancelledReason ?? "-" : row.refundedReason ?? "-",
      staff: row.staff?.fullName ?? "-",
      createdAt: row.createdAt.toISOString()
    }));

    return {
      stats: [
        { label: "Total Records", value: parsedRows.length },
        { label: "Cancelled", value: parsedRows.filter((row) => row.status === "cancelled").length },
        { label: "Refunded", value: parsedRows.filter((row) => row.status === "refunded").length }
      ],
      columns: [
        { key: "invoiceNumber", label: "Invoice" },
        { key: "status", label: "Status" },
        { key: "orderType", label: "Order Type" },
        { key: "amount", label: "Amount" },
        { key: "reason", label: "Reason" },
        { key: "staff", label: "Staff" },
        { key: "createdAt", label: "Created At" }
      ],
      rows: parsedRows
    };
  }

  private async generateKotReport(from: Date, to: Date): Promise<ReportPayload> {
    const [statusRows, recent] = await Promise.all([
      this.invoiceRepository
        .createQueryBuilder("invoice")
        .where("invoice.kitchenStatus != 'not_sent'")
        .andWhere("invoice.createdAt >= :from AND invoice.createdAt <= :to", { from, to })
        .select("invoice.kitchenStatus", "status")
        .addSelect("COUNT(invoice.id)", "count")
        .groupBy("invoice.kitchenStatus")
        .orderBy("COUNT(invoice.id)", "DESC")
        .getRawMany<{ status: string; count: string }>(),
      this.invoiceRepository
        .createQueryBuilder("invoice")
        .leftJoinAndSelect("invoice.staff", "staff")
        .where("invoice.kitchenStatus != 'not_sent'")
        .andWhere("invoice.createdAt >= :from AND invoice.createdAt <= :to", { from, to })
        .orderBy("invoice.createdAt", "DESC")
        .take(200)
        .getMany()
    ]);

    const parsedRows = recent.map((row) => ({
      invoiceNumber: row.invoiceNumber,
      kitchenStatus: row.kitchenStatus,
      orderType: row.orderType,
      amount: toMoney(row.totalAmount),
      staff: row.staff?.fullName ?? "-",
      createdAt: row.createdAt.toISOString()
    }));

    return {
      stats: [
        { label: "KOT Invoices", value: parsedRows.length },
        { label: "Queued", value: Number(statusRows.find((row) => row.status === "queued")?.count ?? 0) },
        {
          label: "Ready/Served",
          value: statusRows
            .filter((row) => ["ready", "served"].includes(row.status))
            .reduce((sum, row) => sum + Number(row.count ?? 0), 0)
        }
      ],
      columns: [
        { key: "invoiceNumber", label: "Invoice" },
        { key: "kitchenStatus", label: "Kitchen Status" },
        { key: "orderType", label: "Order Type" },
        { key: "amount", label: "Amount" },
        { key: "staff", label: "Staff" },
        { key: "createdAt", label: "Created At" }
      ],
      rows: parsedRows
    };
  }

  private async generateCustomerReport(from: Date, to: Date): Promise<ReportPayload> {
    const invoices = await this.invoiceRepository
      .createQueryBuilder("invoice")
      .leftJoinAndSelect("invoice.customer", "customer")
      .where("invoice.status = 'paid'")
      .andWhere("invoice.createdAt >= :from AND invoice.createdAt <= :to", { from, to })
      .select([
        "invoice.id",
        "invoice.totalAmount",
        "invoice.createdAt",
        "invoice.customerSnapshot",
        "customer.id",
        "customer.name",
        "customer.phone"
      ])
      .getMany();

    const map = new Map<
      string,
      { customerName: string; phone: string; orders: number; totalSpend: number; lastOrderAt: string }
    >();

    invoices.forEach((invoice) => {
      const snapshot = (invoice.customerSnapshot ?? {}) as Record<string, unknown>;
      const customerName =
        (typeof snapshot.name === "string" ? snapshot.name : null) ??
        (typeof snapshot.fullName === "string" ? snapshot.fullName : null) ??
        invoice.customer?.name ??
        "Walk-in";
      const phone =
        (typeof snapshot.phone === "string" ? snapshot.phone : null) ?? invoice.customer?.phone ?? "-";
      const key = `${customerName}::${phone}`;
      const existing = map.get(key);
      const currentTime = invoice.createdAt.toISOString();

      if (!existing) {
        map.set(key, {
          customerName,
          phone,
          orders: 1,
          totalSpend: toMoney(invoice.totalAmount),
          lastOrderAt: currentTime
        });
        return;
      }

      existing.orders += 1;
      existing.totalSpend = toMoney(existing.totalSpend + toNumber(invoice.totalAmount));
      if (currentTime > existing.lastOrderAt) {
        existing.lastOrderAt = currentTime;
      }
    });

    const parsedRows = Array.from(map.values()).sort((a, b) => b.totalSpend - a.totalSpend);

    return {
      stats: [
        { label: "Customers", value: parsedRows.length },
        { label: "Total Spend", value: toMoney(parsedRows.reduce((sum, row) => sum + row.totalSpend, 0)) },
        { label: "Walk-in Records", value: parsedRows.filter((row) => row.customerName === "Walk-in").length }
      ],
      columns: [
        { key: "customerName", label: "Customer" },
        { key: "phone", label: "Phone" },
        { key: "orders", label: "Orders" },
        { key: "totalSpend", label: "Total Spend" },
        { key: "lastOrderAt", label: "Last Order At" }
      ],
      rows: parsedRows
    };
  }

  private async generatePurchaseReport(from: Date, to: Date): Promise<ReportPayload> {
    const fromDate = formatDate(from);
    const toDate = formatDate(to);

    const rows = await this.purchaseRepository
      .createQueryBuilder("purchase")
      .leftJoinAndSelect("purchase.supplier", "supplier")
      .leftJoinAndSelect("purchase.createdByUser", "createdByUser")
      .where("purchase.purchaseDate >= :fromDate AND purchase.purchaseDate <= :toDate", { fromDate, toDate })
      .orderBy("purchase.purchaseDate", "DESC")
      .getMany();

    const parsedRows = rows.map((row) => ({
      purchaseNumber: row.purchaseNumber,
      purchaseDate: row.purchaseDate,
      purchaseType: row.purchaseType,
      supplier: row.supplier?.name ?? "-",
      totalAmount: toMoney(row.totalAmount),
      createdBy: row.createdByUser?.fullName ?? "-"
    }));

    return {
      stats: [
        { label: "Purchase Orders", value: parsedRows.length },
        { label: "Total Purchase", value: toMoney(parsedRows.reduce((sum, row) => sum + row.totalAmount, 0)) },
        { label: "Suppliers", value: new Set(parsedRows.map((row) => row.supplier)).size }
      ],
      columns: [
        { key: "purchaseNumber", label: "Purchase No" },
        { key: "purchaseDate", label: "Date" },
        { key: "purchaseType", label: "Type" },
        { key: "supplier", label: "Supplier" },
        { key: "totalAmount", label: "Total Amount" },
        { key: "createdBy", label: "Created By" }
      ],
      rows: parsedRows
    };
  }

  private async generateSupplierWiseReport(from: Date, to: Date): Promise<ReportPayload> {
    const fromDate = formatDate(from);
    const toDate = formatDate(to);

    const rows = await this.purchaseRepository
      .createQueryBuilder("purchase")
      .leftJoin(Supplier, "supplier", "supplier.id = purchase.supplierId")
      .where("purchase.purchaseDate >= :fromDate AND purchase.purchaseDate <= :toDate", { fromDate, toDate })
      .select("supplier.name", "supplier")
      .addSelect("COUNT(purchase.id)", "orders")
      .addSelect("COALESCE(SUM(purchase.totalAmount),0)", "totalAmount")
      .groupBy("supplier.name")
      .orderBy("COALESCE(SUM(purchase.totalAmount),0)", "DESC")
      .getRawMany<{ supplier: string; orders: string; totalAmount: string }>();

    const parsedRows = rows.map((row) => ({
      supplier: row.supplier ?? "-",
      orders: Number(row.orders ?? 0),
      totalAmount: toMoney(row.totalAmount)
    }));

    return {
      stats: [
        { label: "Suppliers", value: parsedRows.length },
        { label: "Total Purchase", value: toMoney(parsedRows.reduce((sum, row) => sum + row.totalAmount, 0)) },
        { label: "Top Supplier", value: parsedRows[0]?.supplier ?? "-" }
      ],
      columns: [
        { key: "supplier", label: "Supplier" },
        { key: "orders", label: "Orders" },
        { key: "totalAmount", label: "Total Amount" }
      ],
      rows: parsedRows
    };
  }

  private async generateStockReport(from: Date, to: Date): Promise<ReportPayload> {
    const fromDate = formatDate(from);
    const toDate = formatDate(to);

    const [ingredients, stocks, allocations] = await Promise.all([
      this.ingredientRepository
        .createQueryBuilder("ingredient")
        .leftJoinAndSelect("ingredient.category", "category")
        .where("ingredient.isActive = true")
        .orderBy("ingredient.name", "ASC")
        .getMany(),
      this.ingredientStockRepository.find(),
      this.allocationRepository
        .createQueryBuilder("allocation")
        .where("allocation.date >= :fromDate AND allocation.date <= :toDate", { fromDate, toDate })
        .getMany()
    ]);

    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, stock]));
    const allocationMap = new Map<
      string,
      { allocatedQuantity: number; usedQuantity: number; remainingQuantity: number }
    >();

    allocations.forEach((allocation) => {
      const entry = allocationMap.get(allocation.ingredientId) ?? {
        allocatedQuantity: 0,
        usedQuantity: 0,
        remainingQuantity: 0
      };
      entry.allocatedQuantity += toNumber(allocation.allocatedQuantity);
      entry.usedQuantity += toNumber(allocation.usedQuantity);
      entry.remainingQuantity += toNumber(allocation.remainingQuantity);
      allocationMap.set(allocation.ingredientId, entry);
    });

    const rows = ingredients.map((ingredient) => {
      const stock = stockMap.get(ingredient.id);
      const allocation = allocationMap.get(ingredient.id);
      const totalStock = toQty(stock?.totalStock ?? 0);
      const allocated = toQty(allocation?.allocatedQuantity ?? 0);
      const used = toQty(allocation?.usedQuantity ?? 0);
      const remaining = toQty(allocation?.remainingQuantity ?? 0);
      const minStock = toQty(ingredient.minStock);

      return {
        ingredient: ingredient.name,
        category: ingredient.category?.name ?? "-",
        unit: ingredient.unit,
        totalStock,
        allocated,
        used,
        remaining,
        minStock,
        valuation: toMoney(totalStock * toNumber(ingredient.perUnitPrice)),
        status: totalStock <= minStock ? "LOW_STOCK" : "HEALTHY"
      };
    });

    return {
      stats: [
        { label: "Ingredients", value: rows.length },
        { label: "Low Stock", value: rows.filter((row) => row.status === "LOW_STOCK").length },
        { label: "Total Valuation", value: toMoney(rows.reduce((sum, row) => sum + row.valuation, 0)) }
      ],
      columns: [
        { key: "ingredient", label: "Ingredient" },
        { key: "category", label: "Category" },
        { key: "unit", label: "Unit" },
        { key: "totalStock", label: "Total Stock" },
        { key: "allocated", label: "Allocated" },
        { key: "used", label: "Used" },
        { key: "remaining", label: "Remaining" },
        { key: "minStock", label: "Min Stock" },
        { key: "valuation", label: "Valuation" },
        { key: "status", label: "Status" }
      ],
      rows
    };
  }

  private async generateLowStockReport(): Promise<ReportPayload> {
    const [ingredients, stocks, products] = await Promise.all([
      this.ingredientRepository
        .createQueryBuilder("ingredient")
        .leftJoinAndSelect("ingredient.category", "category")
        .where("ingredient.isActive = true")
        .orderBy("ingredient.name", "ASC")
        .getMany(),
      this.ingredientStockRepository.find(),
      this.productRepository
        .createQueryBuilder("product")
        .where("product.isActive = true")
        .orderBy("product.name", "ASC")
        .getMany()
    ]);

    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, stock]));

    const ingredientRows = ingredients
      .map((ingredient) => {
        const totalStock = toQty(stockMap.get(ingredient.id)?.totalStock ?? 0);
        const minStock = toQty(ingredient.minStock);
        return {
          type: "ingredient",
          name: ingredient.name,
          category: ingredient.category?.name ?? "-",
          unit: ingredient.unit,
          currentStock: totalStock,
          minStock,
          status: totalStock <= minStock ? "LOW_STOCK" : "HEALTHY"
        };
      })
      .filter((row) => row.status === "LOW_STOCK");

    const productRows = products
      .map((product) => {
        const currentStock = toQty(product.currentStock);
        const minStock = toQty(product.minStock);
        return {
          type: "product",
          name: product.name,
          category: product.category,
          unit: product.unit,
          currentStock,
          minStock,
          status: currentStock <= minStock ? "LOW_STOCK" : "HEALTHY"
        };
      })
      .filter((row) => row.status === "LOW_STOCK");

    const rows = [...ingredientRows, ...productRows].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return {
      stats: [
        { label: "Total Low Stock", value: rows.length },
        { label: "Ingredients", value: ingredientRows.length },
        { label: "Products", value: productRows.length }
      ],
      columns: [
        { key: "type", label: "Type" },
        { key: "name", label: "Name" },
        { key: "category", label: "Category" },
        { key: "unit", label: "Unit" },
        { key: "currentStock", label: "Current Stock" },
        { key: "minStock", label: "Min Stock" },
        { key: "status", label: "Status" }
      ],
      rows
    };
  }

  private async generateIngredientReport(): Promise<ReportPayload> {
    const [ingredients, stocks] = await Promise.all([
      this.ingredientRepository
        .createQueryBuilder("ingredient")
        .leftJoinAndSelect("ingredient.category", "category")
        .where("ingredient.isActive = true")
        .orderBy("ingredient.name", "ASC")
        .getMany(),
      this.ingredientStockRepository.find()
    ]);
    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, stock]));

    const rows = ingredients.map((ingredient) => {
      const totalStock = toQty(stockMap.get(ingredient.id)?.totalStock ?? 0);
      const perUnitPrice = toMoney(ingredient.perUnitPrice);
      const valuation = toMoney(totalStock * perUnitPrice);

      return {
        ingredient: ingredient.name,
        category: ingredient.category?.name ?? "-",
        unit: ingredient.unit,
        perUnitPrice,
        totalStock,
        minStock: toQty(ingredient.minStock),
        valuation,
        availability: ingredient.isActive ? "ACTIVE" : "INACTIVE"
      };
    });

    return {
      stats: [
        { label: "Ingredients", value: rows.length },
        { label: "Valuation", value: toMoney(rows.reduce((sum, row) => sum + row.valuation, 0)) },
        {
          label: "Average Price",
          value: rows.length
            ? toMoney(rows.reduce((sum, row) => sum + row.perUnitPrice, 0) / rows.length)
            : 0
        }
      ],
      columns: [
        { key: "ingredient", label: "Ingredient" },
        { key: "category", label: "Category" },
        { key: "unit", label: "Unit" },
        { key: "perUnitPrice", label: "Per Unit Price" },
        { key: "totalStock", label: "Total Stock" },
        { key: "minStock", label: "Min Stock" },
        { key: "valuation", label: "Valuation" },
        { key: "availability", label: "Availability" }
      ],
      rows
    };
  }

  private async generateMenuReport(): Promise<ReportPayload> {
    const [items, addOns, combos] = await Promise.all([
      this.itemRepository
        .createQueryBuilder("item")
        .leftJoinAndSelect("item.category", "category")
        .orderBy("item.name", "ASC")
        .getMany(),
      this.addOnRepository.createQueryBuilder("addOn").orderBy("addOn.name", "ASC").getMany(),
      this.comboRepository.createQueryBuilder("combo").orderBy("combo.name", "ASC").getMany()
    ]);

    const rows: ReportRow[] = [
      ...items.map((item) => ({
        type: "item",
        name: item.name,
        category: item.category?.name ?? "-",
        sellingPrice: toMoney(item.sellingPrice),
        gstPercentage: toPercent(item.gstPercentage),
        estimatedCost: toMoney(item.estimatedIngredientCost),
        status: item.isActive ? "ACTIVE" : "INACTIVE"
      })),
      ...addOns.map((addOn) => ({
        type: "add_on",
        name: addOn.name,
        category: "Add-on",
        sellingPrice: toMoney(addOn.sellingPrice),
        gstPercentage: toPercent(addOn.gstPercentage),
        estimatedCost: toMoney(addOn.estimatedIngredientCost),
        status: addOn.isActive ? "ACTIVE" : "INACTIVE"
      })),
      ...combos.map((combo) => ({
        type: "combo",
        name: combo.name,
        category: "Combo",
        sellingPrice: toMoney(combo.sellingPrice),
        gstPercentage: toPercent(combo.gstPercentage),
        estimatedCost: null,
        status: combo.isActive ? "ACTIVE" : "INACTIVE"
      }))
    ];

    return {
      stats: [
        { label: "Total Menu Records", value: rows.length },
        { label: "Items", value: items.length },
        { label: "Active Records", value: rows.filter((row) => row.status === "ACTIVE").length }
      ],
      columns: [
        { key: "type", label: "Type" },
        { key: "name", label: "Name" },
        { key: "category", label: "Category" },
        { key: "sellingPrice", label: "Selling Price" },
        { key: "gstPercentage", label: "GST %" },
        { key: "estimatedCost", label: "Estimated Cost" },
        { key: "status", label: "Status" }
      ],
      rows
    };
  }

  private async generateStaffAttendanceReport(from: Date, to: Date): Promise<ReportPayload> {
    const now = new Date();
    const records = await this.attendanceRepository
      .createQueryBuilder("attendance")
      .leftJoinAndSelect("attendance.user", "user")
      .where("attendance.punchInAt >= :from AND attendance.punchInAt <= :to", { from, to })
      .orderBy("attendance.punchInAt", "DESC")
      .getMany();

    const rows = records.map((record) => {
      const end = record.punchOutAt ?? now;
      const activeMinutes = minutesBetween(record.punchInAt, end);
      return {
        staff: record.user?.fullName ?? "-",
        username: record.user?.username ?? "-",
        role: record.user?.role ?? "-",
        punchInAt: record.punchInAt.toISOString(),
        punchOutAt: toIso(record.punchOutAt),
        activeHours: Number((activeMinutes / 60).toFixed(2)),
        status: record.punchOutAt ? "CLOSED" : "ACTIVE"
      };
    });

    const totalHours = rows.reduce((sum, row) => sum + toNumber(row.activeHours), 0);
    const activeShifts = rows.filter((row) => row.status === "ACTIVE").length;

    return {
      stats: [
        { label: "Attendance Records", value: rows.length },
        { label: "Active Shifts", value: activeShifts },
        { label: "Worked Hours", value: Number(totalHours.toFixed(2)) }
      ],
      columns: [
        { key: "staff", label: "Staff" },
        { key: "username", label: "Username" },
        { key: "role", label: "Role" },
        { key: "punchInAt", label: "Punch In" },
        { key: "punchOutAt", label: "Punch Out" },
        { key: "activeHours", label: "Active Hours" },
        { key: "status", label: "Status" }
      ],
      rows
    };
  }

  private async generateStaffLoginReport(from: Date, to: Date): Promise<ReportPayload> {
    const rows = await this.attendanceRepository
      .createQueryBuilder("attendance")
      .leftJoin("attendance.user", "user")
      .where("attendance.punchInAt >= :from AND attendance.punchInAt <= :to", { from, to })
      .select("attendance.userId", "staffId")
      .addSelect("user.fullName", "staffName")
      .addSelect("user.username", "username")
      .addSelect("user.role", "role")
      .addSelect("COUNT(attendance.id)", "loginCount")
      .addSelect("MAX(attendance.punchInAt)", "lastLoginAt")
      .groupBy("attendance.userId")
      .addGroupBy("user.fullName")
      .addGroupBy("user.username")
      .addGroupBy("user.role")
      .orderBy("MAX(attendance.punchInAt)", "DESC")
      .getRawMany<{
        staffId: string;
        staffName: string;
        username: string;
        role: string;
        loginCount: string;
        lastLoginAt: string | null;
      }>();

    const parsedRows = rows.map((row) => ({
      staffName: row.staffName ?? "-",
      username: row.username ?? "-",
      role: row.role ?? "-",
      loginCount: Number(row.loginCount ?? 0),
      lastLoginAt: row.lastLoginAt
    }));

    return {
      stats: [
        { label: "Staff Logged In", value: parsedRows.length },
        { label: "Total Logins", value: parsedRows.reduce((sum, row) => sum + row.loginCount, 0) },
        { label: "Most Active Staff", value: parsedRows[0]?.staffName ?? "-" }
      ],
      columns: [
        { key: "staffName", label: "Staff" },
        { key: "username", label: "Username" },
        { key: "role", label: "Role" },
        { key: "loginCount", label: "Login Count" },
        { key: "lastLoginAt", label: "Last Login" }
      ],
      rows: parsedRows
    };
  }

  private async generateGstReport(from: Date, to: Date): Promise<ReportPayload> {
    const rows = await this.applyDateFilter(
      this.invoiceRepository
        .createQueryBuilder("invoice")
        .where("invoice.status = 'paid'")
        .select(`DATE("invoice"."createdAt")`, "date")
        .addSelect("COUNT(invoice.id)", "invoices")
        .addSelect("COALESCE(SUM(invoice.subtotal),0)", "taxableAmount")
        .addSelect("COALESCE(SUM(invoice.taxAmount),0)", "gstAmount")
        .addSelect("COALESCE(SUM(invoice.totalAmount),0)", "grossAmount")
        .groupBy(`DATE("invoice"."createdAt")`)
        .orderBy(`DATE("invoice"."createdAt")`, "ASC"),
      from,
      to
    ).getRawMany<{
      date: string;
      invoices: string;
      taxableAmount: string;
      gstAmount: string;
      grossAmount: string;
    }>();

    const parsedRows = rows.map((row) => ({
      date: row.date,
      invoices: Number(row.invoices ?? 0),
      taxableAmount: toMoney(row.taxableAmount),
      gstAmount: toMoney(row.gstAmount),
      grossAmount: toMoney(row.grossAmount)
    }));

    return {
      stats: [
        { label: "GST Collected", value: toMoney(parsedRows.reduce((sum, row) => sum + row.gstAmount, 0)) },
        { label: "Taxable Sales", value: toMoney(parsedRows.reduce((sum, row) => sum + row.taxableAmount, 0)) },
        { label: "Paid Invoices", value: parsedRows.reduce((sum, row) => sum + row.invoices, 0) }
      ],
      columns: [
        { key: "date", label: "Date" },
        { key: "invoices", label: "Invoices" },
        { key: "taxableAmount", label: "Taxable Amount" },
        { key: "gstAmount", label: "GST Amount" },
        { key: "grossAmount", label: "Gross Amount" }
      ],
      rows: parsedRows
    };
  }

  private async generateExpenseReport(from: Date, to: Date): Promise<ReportPayload> {
    const fromDate = formatDate(from);
    const toDate = formatDate(to);

    const [purchases, refunds] = await Promise.all([
      this.purchaseRepository
        .createQueryBuilder("purchase")
        .where("purchase.purchaseDate >= :fromDate AND purchase.purchaseDate <= :toDate", { fromDate, toDate })
        .select("purchase.purchaseDate", "date")
        .addSelect("COUNT(purchase.id)", "purchaseCount")
        .addSelect("COALESCE(SUM(purchase.totalAmount),0)", "purchaseAmount")
        .groupBy("purchase.purchaseDate")
        .orderBy("purchase.purchaseDate", "ASC")
        .getRawMany<{ date: string; purchaseCount: string; purchaseAmount: string }>(),
      this.invoiceRepository
        .createQueryBuilder("invoice")
        .where("invoice.status = 'refunded'")
        .andWhere("invoice.refundedAt >= :from AND invoice.refundedAt <= :to", { from, to })
        .select(`DATE("invoice"."refundedAt")`, "date")
        .addSelect("COUNT(invoice.id)", "refundCount")
        .addSelect("COALESCE(SUM(invoice.totalAmount),0)", "refundAmount")
        .groupBy(`DATE("invoice"."refundedAt")`)
        .orderBy(`DATE("invoice"."refundedAt")`, "ASC")
        .getRawMany<{ date: string; refundCount: string; refundAmount: string }>()
    ]);

    const map = new Map<
      string,
      { date: string; purchaseCount: number; purchaseAmount: number; refundCount: number; refundAmount: number }
    >();

    purchases.forEach((row) => {
      map.set(row.date, {
        date: row.date,
        purchaseCount: Number(row.purchaseCount ?? 0),
        purchaseAmount: toMoney(row.purchaseAmount),
        refundCount: 0,
        refundAmount: 0
      });
    });

    refunds.forEach((row) => {
      const existing = map.get(row.date) ?? {
        date: row.date,
        purchaseCount: 0,
        purchaseAmount: 0,
        refundCount: 0,
        refundAmount: 0
      };
      existing.refundCount += Number(row.refundCount ?? 0);
      existing.refundAmount = toMoney(existing.refundAmount + toNumber(row.refundAmount));
      map.set(row.date, existing);
    });

    const rows = Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({
        date: row.date,
        purchaseCount: row.purchaseCount,
        purchaseAmount: toMoney(row.purchaseAmount),
        refundCount: row.refundCount,
        refundAmount: toMoney(row.refundAmount),
        netOutflow: toMoney(row.purchaseAmount + row.refundAmount)
      }));

    return {
      stats: [
        { label: "Purchase Expense", value: toMoney(rows.reduce((sum, row) => sum + row.purchaseAmount, 0)) },
        { label: "Refund Expense", value: toMoney(rows.reduce((sum, row) => sum + row.refundAmount, 0)) },
        { label: "Net Outflow", value: toMoney(rows.reduce((sum, row) => sum + row.netOutflow, 0)) }
      ],
      columns: [
        { key: "date", label: "Date" },
        { key: "purchaseCount", label: "Purchase Count" },
        { key: "purchaseAmount", label: "Purchase Amount" },
        { key: "refundCount", label: "Refund Count" },
        { key: "refundAmount", label: "Refund Amount" },
        { key: "netOutflow", label: "Net Outflow" }
      ],
      rows
    };
  }

  private async generateOrderTypeReport(
    from: Date,
    to: Date,
    orderType: "delivery" | "dine_in",
    title: string
  ): Promise<ReportPayload> {
    const rows = await this.applyDateFilter(
      this.invoiceRepository
        .createQueryBuilder("invoice")
        .where("invoice.status = 'paid'")
        .andWhere("invoice.orderType = :orderType", { orderType })
        .select(`DATE("invoice"."createdAt")`, "date")
        .addSelect("COUNT(invoice.id)", "orders")
        .addSelect("COALESCE(SUM(invoice.totalAmount),0)", "sales")
        .addSelect("COALESCE(SUM(invoice.taxAmount),0)", "tax")
        .groupBy(`DATE("invoice"."createdAt")`)
        .orderBy(`DATE("invoice"."createdAt")`, "ASC"),
      from,
      to
    ).getRawMany<{ date: string; orders: string; sales: string; tax: string }>();

    const parsedRows = rows.map((row) => ({
      date: row.date,
      orders: Number(row.orders ?? 0),
      sales: toMoney(row.sales),
      tax: toMoney(row.tax),
      averageOrderValue: Number(row.orders ?? 0) ? toMoney(toNumber(row.sales) / toNumber(row.orders)) : 0
    }));

    return {
      stats: [
        { label: `${title} Orders`, value: parsedRows.reduce((sum, row) => sum + row.orders, 0) },
        { label: `${title} Sales`, value: toMoney(parsedRows.reduce((sum, row) => sum + row.sales, 0)) },
        {
          label: `${title} AOV`,
          value: (() => {
            const totalOrders = parsedRows.reduce((sum, row) => sum + row.orders, 0);
            const totalSales = parsedRows.reduce((sum, row) => sum + row.sales, 0);
            return totalOrders ? toMoney(totalSales / totalOrders) : 0;
          })()
        }
      ],
      columns: [
        { key: "date", label: "Date" },
        { key: "orders", label: "Orders" },
        { key: "sales", label: "Sales" },
        { key: "tax", label: "Tax" },
        { key: "averageOrderValue", label: "Avg Order Value" }
      ],
      rows: parsedRows
    };
  }

  private async generateOnlineReport(from: Date, to: Date): Promise<ReportPayload> {
    const invoices = await this.invoiceRepository
      .createQueryBuilder("invoice")
      .where("invoice.status = 'paid'")
      .andWhere("invoice.orderType = 'delivery'")
      .andWhere("invoice.createdAt >= :from AND invoice.createdAt <= :to", { from, to })
      .orderBy("invoice.createdAt", "DESC")
      .getMany();

    const resolveChannel = (invoice: Invoice) => {
      const source = `${invoice.notes ?? ""} ${invoice.orderReference ?? ""} ${invoice.couponCode ?? ""}`.toLowerCase();
      if (source.includes("swiggy")) {
        return "swiggy";
      }
      if (source.includes("zomato")) {
        return "zomato";
      }
      return "delivery";
    };

    const rows = invoices.map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      channel: resolveChannel(invoice),
      customer: ((invoice.customerSnapshot ?? {}) as Record<string, unknown>).name as string | undefined ?? "Walk-in",
      amount: toMoney(invoice.totalAmount),
      tax: toMoney(invoice.taxAmount),
      createdAt: invoice.createdAt.toISOString()
    }));

    return {
      stats: [
        { label: "Online Orders", value: rows.length },
        { label: "Online Sales", value: toMoney(rows.reduce((sum, row) => sum + row.amount, 0)) },
        { label: "Channels", value: new Set(rows.map((row) => row.channel)).size }
      ],
      columns: [
        { key: "invoiceNumber", label: "Invoice" },
        { key: "channel", label: "Channel" },
        { key: "customer", label: "Customer" },
        { key: "amount", label: "Amount" },
        { key: "tax", label: "Tax" },
        { key: "createdAt", label: "Created At" }
      ],
      rows
    };
  }

  private async generateComboReport(from: Date, to: Date): Promise<ReportPayload> {
    const rows = await this.invoiceLineRepository
      .createQueryBuilder("line")
      .leftJoin(Invoice, "invoice", "invoice.id = line.invoiceId")
      .where("invoice.status = 'paid'")
      .andWhere("line.lineType = 'combo'")
      .andWhere("invoice.createdAt >= :from AND invoice.createdAt <= :to", { from, to })
      .select("line.nameSnapshot", "comboName")
      .addSelect("COALESCE(SUM(line.quantity),0)", "quantity")
      .addSelect("COALESCE(SUM(line.lineTotal),0)", "totalSales")
      .groupBy("line.nameSnapshot")
      .orderBy("COALESCE(SUM(line.lineTotal),0)", "DESC")
      .getRawMany<{ comboName: string; quantity: string; totalSales: string }>();

    const parsedRows = rows.map((row) => ({
      comboName: row.comboName,
      quantity: toQty(row.quantity),
      totalSales: toMoney(row.totalSales)
    }));

    return {
      stats: [
        { label: "Combos Sold", value: toQty(parsedRows.reduce((sum, row) => sum + row.quantity, 0)) },
        { label: "Combo Revenue", value: toMoney(parsedRows.reduce((sum, row) => sum + row.totalSales, 0)) },
        { label: "Top Combo", value: parsedRows[0]?.comboName ?? "-" }
      ],
      columns: [
        { key: "comboName", label: "Combo" },
        { key: "quantity", label: "Quantity" },
        { key: "totalSales", label: "Sales" }
      ],
      rows: parsedRows
    };
  }

  private async generatePeakSalesTimeReport(from: Date, to: Date): Promise<ReportPayload> {
    const rows = await this.applyDateFilter(
      this.invoiceRepository
        .createQueryBuilder("invoice")
        .where("invoice.status = 'paid'")
        .select(`EXTRACT(HOUR FROM "invoice"."createdAt")`, "hour")
        .addSelect("COUNT(invoice.id)", "orders")
        .addSelect("COALESCE(SUM(invoice.totalAmount),0)", "sales")
        .groupBy(`EXTRACT(HOUR FROM "invoice"."createdAt")`)
        .orderBy(`EXTRACT(HOUR FROM "invoice"."createdAt")`, "ASC"),
      from,
      to
    ).getRawMany<{ hour: string; orders: string; sales: string }>();

    const parsedRows = rows.map((row) => ({
      hour: Number(row.hour ?? 0),
      orders: Number(row.orders ?? 0),
      sales: toMoney(row.sales),
      label: `${String(Number(row.hour ?? 0)).padStart(2, "0")}:00`
    }));

    const top = [...parsedRows].sort((a, b) => b.sales - a.sales)[0];

    return {
      stats: [
        { label: "Busiest Hour", value: top ? `${top.label} (${top.orders} orders)` : "-" },
        { label: "Peak Sales", value: top ? top.sales : 0 },
        { label: "Total Hour Buckets", value: parsedRows.length }
      ],
      columns: [
        { key: "label", label: "Hour" },
        { key: "orders", label: "Orders" },
        { key: "sales", label: "Sales" }
      ],
      rows: parsedRows
    };
  }

  private movementKey(ingredientId: string, date: string) {
    return `${ingredientId}::${date}`;
  }

  private buildDateSeries(fromDate: string, toDate: string) {
    const values: string[] = [];
    const cursor = new Date(`${fromDate}T00:00:00.000Z`);
    const end = new Date(`${toDate}T00:00:00.000Z`);

    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) {
      return values;
    }

    while (cursor <= end) {
      values.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return values;
  }

  private async resolveOutletContext(outletId?: string): Promise<OutletContext | null> {
    if (outletId) {
      const selected = await this.outletRepository.findOne({
        where: { id: outletId, isActive: true }
      });
      if (!selected) {
        throw new AppError(404, "Selected outlet not found.");
      }
      return {
        id: selected.id,
        outletCode: selected.outletCode,
        outletName: selected.outletName
      };
    }

    const primary = await this.outletRepository
      .createQueryBuilder("outlet")
      .where("outlet.isActive = true")
      .orderBy("outlet.outletCode", "ASC")
      .getOne();

    if (!primary) {
      return null;
    }

    return {
      id: primary.id,
      outletCode: primary.outletCode,
      outletName: primary.outletName
    };
  }

  private async getUsageMovements(fromDate: string, toDate: string): Promise<StockMovementRow[]> {
    const rows = await this.usageRepository
      .createQueryBuilder("usage")
      .where("usage.usageDate >= :fromDate AND usage.usageDate <= :toDate", { fromDate, toDate })
      .andWhere("usage.ingredientId IS NOT NULL")
      .select("usage.usageDate", "date")
      .addSelect("usage.ingredientId", "ingredientId")
      .addSelect("MAX(usage.ingredientNameSnapshot)", "ingredientName")
      .addSelect("MAX(usage.baseUnit)", "unit")
      .addSelect("COALESCE(SUM(usage.consumedQuantity),0)", "quantity")
      .groupBy("usage.usageDate")
      .addGroupBy("usage.ingredientId")
      .getRawMany<{
        date: string;
        ingredientId: string;
        ingredientName: string;
        unit: string;
        quantity: string;
      }>();

    return rows.map((row) => ({
      date: normalizeMovementDate(row.date),
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName ?? "-",
      unit: row.unit ?? "",
      quantity: toQty(toNumber(row.quantity))
    }));
  }

  private async getClosingReportSnapshots(fromDate: string, toDate: string): Promise<ClosingStockSnapshotRow[]> {
    if (fromDate > toDate) {
      return [];
    }

    const rows = await AppDataSource.query(
      `
      SELECT
        report."reportDate" AS "date",
        NULLIF(item->>'ingredientId', '') AS "ingredientId",
        COALESCE(NULLIF(item->>'ingredientName', ''), '-') AS "ingredientName",
        LOWER(COALESCE(NULLIF(item->>'unit', ''), 'unit')) AS "unit",
        SUM(COALESCE(NULLIF(item->>'allocatedQuantity', ''), '0')::numeric) AS "openingStock",
        SUM(COALESCE(NULLIF(item->>'usedQuantity', ''), '0')::numeric) AS "consumption",
        SUM(COALESCE(NULLIF(item->>'expectedRemainingQuantity', ''), '0')::numeric) AS "remainingStock"
      FROM "staff_closing_reports" report
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(report."items") = 'array' THEN report."items"
          ELSE '[]'::jsonb
        END
      ) item
      WHERE report."reportDate" >= $1
        AND report."reportDate" <= $2
        AND NULLIF(item->>'ingredientId', '') IS NOT NULL
      GROUP BY
        report."reportDate",
        NULLIF(item->>'ingredientId', ''),
        COALESCE(NULLIF(item->>'ingredientName', ''), '-'),
        LOWER(COALESCE(NULLIF(item->>'unit', ''), 'unit'))
      `,
      [fromDate, toDate]
    );

    return (rows as Array<Record<string, unknown>>)
      .map((row) => ({
        date: normalizeMovementDate(row.date),
        ingredientId: String(row.ingredientId ?? ""),
        ingredientName: String(row.ingredientName ?? "-"),
        unit: String(row.unit ?? ""),
        openingStock: toQty(toNumber(row.openingStock)),
        consumption: toQty(toNumber(row.consumption)),
        remainingStock: toQty(toNumber(row.remainingStock))
      }))
      .filter((row) => row.ingredientId.length > 0);
  }

  private async getPurchaseMovements(fromDate: string, toDate: string): Promise<StockMovementRow[]> {
    if (fromDate > toDate) {
      return [];
    }

    const rows = await AppDataSource.query(
      `
      SELECT
        po."purchaseDate" AS "date",
        line."ingredientId" AS "ingredientId",
        COALESCE(MAX(ingredient."name"), MAX(line."itemNameSnapshot"), '-') AS "ingredientName",
        LOWER(COALESCE(MAX(ingredient."unit"::text), MAX(line."unit"), 'unit')) AS "unit",
        SUM(COALESCE(line."stockAdded", 0)) AS "quantity"
      FROM "purchase_order_lines" line
      INNER JOIN "purchase_orders" po ON po."id" = line."purchaseOrderId"
      LEFT JOIN "ingredients" ingredient ON ingredient."id" = line."ingredientId"
      WHERE line."lineType" = 'ingredient'
        AND line."ingredientId" IS NOT NULL
        AND po."purchaseDate" >= $1
        AND po."purchaseDate" <= $2
      GROUP BY po."purchaseDate", line."ingredientId"
      `,
      [fromDate, toDate]
    );

    return (rows as Array<Record<string, unknown>>)
      .map((row) => ({
        date: normalizeMovementDate(row.date),
        ingredientId: String(row.ingredientId ?? ""),
        ingredientName: String(row.ingredientName ?? "-"),
        unit: String(row.unit ?? ""),
        quantity: toQty(toNumber(row.quantity))
      }))
      .filter((row) => row.ingredientId.length > 0);
  }

  private async getDumpMovements(fromDate: string, toDate: string): Promise<StockMovementRow[]> {
    if (fromDate > toDate) {
      return [];
    }

    const rows = await AppDataSource.query(
      `
      SELECT
        dump."entryDate" AS "date",
        COALESCE(NULLIF((impact->>'ingredientId'), ''), dump."ingredientId"::text) AS "ingredientId",
        COALESCE(NULLIF((impact->>'ingredientName'), ''), dump."sourceName") AS "ingredientName",
        LOWER(COALESCE(NULLIF((impact->>'unit'), ''), dump."baseUnit", dump."unit")) AS "unit",
        SUM(
          COALESCE(
            CASE WHEN impact ? 'quantity' THEN NULLIF(impact->>'quantity', '')::numeric ELSE NULL END,
            dump."baseQuantity"
          )
        ) AS "quantity"
      FROM "dump_entries" dump
      LEFT JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(dump."ingredientImpacts") = 'array' THEN dump."ingredientImpacts"
          ELSE '[]'::jsonb
        END
      ) impact ON TRUE
      WHERE dump."entryDate" >= $1
        AND dump."entryDate" <= $2
        AND (
          dump."entryType" = 'ingredient'
          OR (impact->>'ingredientId') IS NOT NULL
        )
      GROUP BY
        dump."entryDate",
        COALESCE(NULLIF((impact->>'ingredientId'), ''), dump."ingredientId"::text),
        COALESCE(NULLIF((impact->>'ingredientName'), ''), dump."sourceName"),
        LOWER(COALESCE(NULLIF((impact->>'unit'), ''), dump."baseUnit", dump."unit"))
      `,
      [fromDate, toDate]
    );

    return (rows as Array<Record<string, unknown>>)
      .map((row) => ({
        date: normalizeMovementDate(row.date),
        ingredientId: String(row.ingredientId ?? ""),
        ingredientName: String(row.ingredientName ?? "-"),
        unit: String(row.unit ?? ""),
        quantity: toQty(toNumber(row.quantity))
      }))
      .filter((row) => row.ingredientId.length > 0);
  }

  private async getTransferMovements(
    fromDate: string,
    toDate: string,
    outletId: string | null
  ): Promise<TransferMovementRow[]> {
    if (!outletId || fromDate > toDate) {
      return [];
    }

    const rows = await AppDataSource.query(
      `
      SELECT
        transfer."transferDate" AS "date",
        movement."ingredientId" AS "ingredientId",
        movement."ingredientName" AS "ingredientName",
        LOWER(movement."unit") AS "unit",
        SUM(CASE WHEN transfer."toOutletId" = $3 THEN movement."quantity" ELSE 0 END) AS "transferredIn",
        SUM(CASE WHEN transfer."fromOutletId" = $3 THEN movement."quantity" ELSE 0 END) AS "transferredOut"
      FROM "outlet_transfers" transfer
      JOIN LATERAL (
        SELECT
          NULLIF(line->>'sourceId', '') AS "ingredientId",
          COALESCE(NULLIF(line->>'sourceName', ''), '-') AS "ingredientName",
          COALESCE(NULLIF(line->>'unit', ''), 'unit') AS "unit",
          COALESCE(NULLIF(line->>'quantity', ''), '0')::numeric AS "quantity"
        FROM jsonb_array_elements(transfer."lines") line
        WHERE line->>'lineType' = 'ingredient'

        UNION ALL

        SELECT
          NULLIF(impact->>'ingredientId', '') AS "ingredientId",
          COALESCE(NULLIF(impact->>'ingredientName', ''), '-') AS "ingredientName",
          COALESCE(NULLIF(impact->>'unit', ''), 'unit') AS "unit",
          COALESCE(NULLIF(impact->>'quantity', ''), '0')::numeric AS "quantity"
        FROM jsonb_array_elements(transfer."lines") line
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(line->'impacts') = 'array' THEN line->'impacts'
            ELSE '[]'::jsonb
          END
        ) impact
        WHERE line->>'lineType' = 'item'
      ) movement ON TRUE
      WHERE transfer."transferDate" >= $1
        AND transfer."transferDate" <= $2
        AND (transfer."fromOutletId" = $3 OR transfer."toOutletId" = $3)
        AND movement."ingredientId" IS NOT NULL
      GROUP BY
        transfer."transferDate",
        movement."ingredientId",
        movement."ingredientName",
        LOWER(movement."unit")
      `,
      [fromDate, toDate, outletId]
    );

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      date: normalizeMovementDate(row.date),
      ingredientId: String(row.ingredientId ?? ""),
      ingredientName: String(row.ingredientName ?? "-"),
      unit: String(row.unit ?? ""),
      transferredIn: toQty(toNumber(row.transferredIn)),
      transferredOut: toQty(toNumber(row.transferredOut))
    }));
  }

  private buildStockConsumptionStats(rows: ReportRow[]): ReportStat[] {
    const ingredientTotals = new Map<string, { consumption: number; dump: number; unit: string }>();
    const dateTotals = new Map<string, number>();

    rows.forEach((row) => {
      const ingredient = String(row.ingredient ?? "-");
      const unit = String(row.unit ?? "unit");
      const consumption = toQty(toNumber(row.consumption));
      const dump = toQty(toNumber(row.dump));
      const totalStock = toQty(toNumber(row.totalStock));
      const date = String(row.date ?? "");

      const current = ingredientTotals.get(ingredient) ?? { consumption: 0, dump: 0, unit };
      current.consumption = toQty(current.consumption + consumption);
      current.dump = toQty(current.dump + dump);
      current.unit = current.unit || unit;
      ingredientTotals.set(ingredient, current);

      if (date.length) {
        dateTotals.set(date, toQty((dateTotals.get(date) ?? 0) + totalStock));
      }
    });

    const entries = Array.from(ingredientTotals.entries()).map(([ingredient, totals]) => ({
      ingredient,
      ...totals
    }));
    const consumedEntries = entries.filter((entry) => entry.consumption > 0);
    const dumpedEntries = entries.filter((entry) => entry.dump > 0);

    const mostUsed = [...consumedEntries].sort((left, right) => {
      if (right.consumption !== left.consumption) {
        return right.consumption - left.consumption;
      }
      return left.ingredient.localeCompare(right.ingredient);
    })[0];

    const leastUsed = [...consumedEntries].sort((left, right) => {
      if (left.consumption !== right.consumption) {
        return left.consumption - right.consumption;
      }
      return left.ingredient.localeCompare(right.ingredient);
    })[0];

    const mostDumped = [...dumpedEntries].sort((left, right) => {
      if (right.dump !== left.dump) {
        return right.dump - left.dump;
      }
      return left.ingredient.localeCompare(right.ingredient);
    })[0];

    const finalDate = Array.from(dateTotals.keys()).sort()[dateTotals.size - 1] ?? null;
    const closingStock = finalDate ? toQty(dateTotals.get(finalDate) ?? 0) : 0;
    const totalConsumption = toQty(rows.reduce((sum, row) => sum + toNumber(row.consumption), 0));

    return [
      { label: "Total Ingredients", value: ingredientTotals.size },
      {
        label: "Most Used Ingredient",
        value: mostUsed?.ingredient ?? "-",
        hint: mostUsed ? `${toQty(mostUsed.consumption)} ${mostUsed.unit}` : "No usage data"
      },
      {
        label: "Least Used Ingredient",
        value: leastUsed?.ingredient ?? "-",
        hint: leastUsed ? `${toQty(leastUsed.consumption)} ${leastUsed.unit}` : "No usage data"
      },
      {
        label: "Most Dumped Ingredient",
        value: mostDumped?.ingredient ?? "-",
        hint: mostDumped ? `${toQty(mostDumped.dump)} ${mostDumped.unit}` : "No dump data"
      },
      { label: "Total Consumption", value: totalConsumption },
      {
        label: "Closing Stock",
        value: closingStock,
        hint: finalDate ? `As of ${finalDate}` : undefined
      }
    ];
  }

  private async buildStockConsumptionDataset(from: Date, to: Date, outletId?: string) {
    const fromDate = formatDate(from);
    const toDate = formatDate(to);
    const todayDate = formatDate(endOfDay(new Date()));
    const movementEndDate = fromDate > todayDate ? fromDate : todayDate;

    const [outletContext, ingredients, stocks] = await Promise.all([
      this.resolveOutletContext(outletId),
      this.ingredientRepository.find({ order: { name: "ASC" } }),
      this.ingredientStockRepository.find()
    ]);

    const [closingSnapshots, purchaseRows, usageRows, dumpRows, transferRows] = await Promise.all([
      this.getClosingReportSnapshots(fromDate, toDate),
      this.getPurchaseMovements(fromDate, movementEndDate),
      this.getUsageMovements(fromDate, movementEndDate),
      this.getDumpMovements(fromDate, movementEndDate),
      this.getTransferMovements(fromDate, movementEndDate, outletContext?.id ?? null)
    ]);

    const closingUsageRows: StockMovementRow[] = closingSnapshots.map((snapshot) => ({
      date: snapshot.date,
      ingredientId: snapshot.ingredientId,
      ingredientName: snapshot.ingredientName,
      unit: snapshot.unit,
      quantity: snapshot.consumption
    }));

    // Closing report usage is preferred for stock consumption rows; invoice usage fills missing keys.
    const usageKeys = new Set<string>();
    const usageRowsWithFallback: StockMovementRow[] = [];
    usageRows.forEach((row) => {
      usageKeys.add(this.movementKey(row.ingredientId, row.date));
      usageRowsWithFallback.push(row);
    });
    closingUsageRows.forEach((row) => {
      const key = this.movementKey(row.ingredientId, row.date);
      if (!usageKeys.has(key)) {
        usageKeys.add(key);
        usageRowsWithFallback.push(row);
      }
    });

    const ingredientNameMap = new Map<string, string>(ingredients.map((ingredient) => [ingredient.id, ingredient.name]));
    const ingredientUnitMap = new Map<string, string>(ingredients.map((ingredient) => [ingredient.id, ingredient.unit]));
    const ingredientMinStockMap = new Map<string, number>(
      ingredients.map((ingredient) => [ingredient.id, toQty(toNumber(ingredient.minStock))])
    );
    const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, toQty(toNumber(stock.totalStock))]));

    const closingOpeningByKey = new Map<string, number>();
    const closingRemainingByKey = new Map<string, number>();
    const purchaseRangeMap = new Map<string, number>();
    const consumedRangeMap = new Map<string, number>();
    const dumpRangeMap = new Map<string, number>();
    const transferInRangeMap = new Map<string, number>();
    const transferOutRangeMap = new Map<string, number>();

    const purchaseFromStartMap = new Map<string, number>();
    const consumedFromStartMap = new Map<string, number>();
    const dumpFromStartMap = new Map<string, number>();
    const transferInFromStartMap = new Map<string, number>();
    const transferOutFromStartMap = new Map<string, number>();

    const ingredientIdsInRange = new Set<string>();

    const addToMap = (map: Map<string, number>, key: string, value: number) => {
      map.set(key, (map.get(key) ?? 0) + value);
    };

    purchaseRows.forEach((row) => {
      ingredientNameMap.set(row.ingredientId, ingredientNameMap.get(row.ingredientId) ?? row.ingredientName);
      ingredientUnitMap.set(row.ingredientId, ingredientUnitMap.get(row.ingredientId) ?? row.unit);
      addToMap(purchaseFromStartMap, row.ingredientId, row.quantity);
      if (row.date <= toDate) {
        const key = this.movementKey(row.ingredientId, row.date);
        addToMap(purchaseRangeMap, key, row.quantity);
        ingredientIdsInRange.add(row.ingredientId);
      }
    });

    usageRowsWithFallback.forEach((row) => {
      ingredientNameMap.set(row.ingredientId, ingredientNameMap.get(row.ingredientId) ?? row.ingredientName);
      ingredientUnitMap.set(row.ingredientId, ingredientUnitMap.get(row.ingredientId) ?? row.unit);
      addToMap(consumedFromStartMap, row.ingredientId, row.quantity);
      if (row.date <= toDate) {
        const key = this.movementKey(row.ingredientId, row.date);
        addToMap(consumedRangeMap, key, row.quantity);
        ingredientIdsInRange.add(row.ingredientId);
      }
    });

    dumpRows.forEach((row) => {
      ingredientNameMap.set(row.ingredientId, ingredientNameMap.get(row.ingredientId) ?? row.ingredientName);
      ingredientUnitMap.set(row.ingredientId, ingredientUnitMap.get(row.ingredientId) ?? row.unit);
      addToMap(dumpFromStartMap, row.ingredientId, row.quantity);
      if (row.date <= toDate) {
        const key = this.movementKey(row.ingredientId, row.date);
        addToMap(dumpRangeMap, key, row.quantity);
        ingredientIdsInRange.add(row.ingredientId);
      }
    });

    transferRows.forEach((row) => {
      ingredientNameMap.set(row.ingredientId, ingredientNameMap.get(row.ingredientId) ?? row.ingredientName);
      ingredientUnitMap.set(row.ingredientId, ingredientUnitMap.get(row.ingredientId) ?? row.unit);
      addToMap(transferInFromStartMap, row.ingredientId, row.transferredIn);
      addToMap(transferOutFromStartMap, row.ingredientId, row.transferredOut);
      if (row.date <= toDate) {
        const key = this.movementKey(row.ingredientId, row.date);
        addToMap(transferInRangeMap, key, row.transferredIn);
        addToMap(transferOutRangeMap, key, row.transferredOut);
        ingredientIdsInRange.add(row.ingredientId);
      }
    });

    closingSnapshots.forEach((snapshot) => {
      ingredientNameMap.set(snapshot.ingredientId, ingredientNameMap.get(snapshot.ingredientId) ?? snapshot.ingredientName);
      ingredientUnitMap.set(snapshot.ingredientId, ingredientUnitMap.get(snapshot.ingredientId) ?? snapshot.unit);
      const key = this.movementKey(snapshot.ingredientId, snapshot.date);
      closingOpeningByKey.set(key, snapshot.openingStock);
      closingRemainingByKey.set(key, snapshot.remainingStock);
      consumedRangeMap.set(key, snapshot.consumption);
      ingredientIdsInRange.add(snapshot.ingredientId);
    });

    const dateSeries = this.buildDateSeries(fromDate, toDate);
    const ingredientIds = Array.from(ingredientIdsInRange).sort((left, right) => {
      const leftName = ingredientNameMap.get(left) ?? left;
      const rightName = ingredientNameMap.get(right) ?? right;
      return leftName.localeCompare(rightName);
    });

    const rows: ReportRow[] = [];

    if (closingSnapshots.length > 0) {
      closingSnapshots
        .slice()
        .sort((left, right) => {
          const dateCompare = left.date.localeCompare(right.date);
          if (dateCompare !== 0) {
            return dateCompare;
          }
          return left.ingredientName.localeCompare(right.ingredientName);
        })
        .forEach((snapshot) => {
          const key = this.movementKey(snapshot.ingredientId, snapshot.date);
          const consumption = toQty(consumedRangeMap.get(key) ?? snapshot.consumption);
          const dump = toQty(dumpRangeMap.get(key) ?? 0);
          const transferredIn = toQty(transferInRangeMap.get(key) ?? 0);
          const transferredOut = toQty(transferOutRangeMap.get(key) ?? 0);
          const openingStock = toQty(closingOpeningByKey.get(key) ?? snapshot.openingStock);
          const purchaseFromMovements = toQty(purchaseRangeMap.get(key) ?? 0);
          const purchaseFromClosing = toQty(
            snapshot.remainingStock - openingStock - transferredIn + transferredOut + consumption + dump
          );
          const purchase =
            Math.abs(purchaseFromMovements - purchaseFromClosing) > 0.001
              ? toQty(Math.max(0, purchaseFromClosing))
              : purchaseFromMovements;
          const totalStock = toQty(
            closingRemainingByKey.get(key) ?? (openingStock + purchase + transferredIn - transferredOut - consumption - dump)
          );
          const minStock = ingredientMinStockMap.get(snapshot.ingredientId) ?? 0;
          const stockHealth = totalStock <= minStock ? "LOW_STOCK" : "HEALTHY";

          rows.push({
            date: snapshot.date,
            ingredient: ingredientNameMap.get(snapshot.ingredientId) ?? snapshot.ingredientName,
            unit: ingredientUnitMap.get(snapshot.ingredientId) ?? snapshot.unit,
            openingStock,
            purchase,
            dump,
            consumption,
            transferredIn,
            transferredOut,
            totalStock,
            stockHealth
          });
        });
    } else {
      ingredientIds.forEach((ingredientId) => {
        const currentStock = stockMap.get(ingredientId) ?? 0;
        const outgoingSinceStart =
          (consumedFromStartMap.get(ingredientId) ?? 0) +
          (dumpFromStartMap.get(ingredientId) ?? 0) +
          (transferOutFromStartMap.get(ingredientId) ?? 0);
        const incomingSinceStart =
          (transferInFromStartMap.get(ingredientId) ?? 0) + (purchaseFromStartMap.get(ingredientId) ?? 0);
        let openingStock = toQty(currentStock + outgoingSinceStart - incomingSinceStart);
        const ingredientName = ingredientNameMap.get(ingredientId) ?? "-";
        const unit = ingredientUnitMap.get(ingredientId) ?? "-";
        const minStock = ingredientMinStockMap.get(ingredientId) ?? 0;

        dateSeries.forEach((date) => {
          const key = this.movementKey(ingredientId, date);
          const purchase = toQty(purchaseRangeMap.get(key) ?? 0);
          const consumption = toQty(consumedRangeMap.get(key) ?? 0);
          const dump = toQty(dumpRangeMap.get(key) ?? 0);
          const transferredIn = toQty(transferInRangeMap.get(key) ?? 0);
          const transferredOut = toQty(transferOutRangeMap.get(key) ?? 0);
          const totalStock = toQty(openingStock + purchase + transferredIn - transferredOut - consumption - dump);
          const stockHealth = totalStock <= minStock ? "LOW_STOCK" : "HEALTHY";

          rows.push({
            date,
            ingredient: ingredientName,
            unit,
            openingStock: toQty(openingStock),
            purchase,
            dump,
            consumption,
            transferredIn,
            transferredOut,
            totalStock,
            stockHealth
          });

          openingStock = totalStock;
        });
      });
    }

    rows.sort((left, right) => {
      const dateComparison = String(left.date ?? "").localeCompare(String(right.date ?? ""));
      if (dateComparison !== 0) {
        return dateComparison;
      }
      return String(left.ingredient ?? "").localeCompare(String(right.ingredient ?? ""));
    });

    const payload: ReportPayload = {
      stats: this.buildStockConsumptionStats(rows),
      columns: [
        { key: "date", label: "Date" },
        { key: "ingredient", label: "Ingredient" },
        { key: "unit", label: "Unit" },
        { key: "openingStock", label: "Opening Stock" },
        { key: "purchase", label: "Purchase" },
        { key: "dump", label: "Dump" },
        { key: "consumption", label: "Consumption" },
        { key: "transferredIn", label: "Transferred In" },
        { key: "transferredOut", label: "Transferred Out" },
        { key: "totalStock", label: "Remaining Stock" },
        { key: "stockHealth", label: "Stock Health" }
      ],
      rows
    };

    const outletLabel = outletContext
      ? `${outletContext.outletCode} - ${outletContext.outletName}`
      : "No active outlet";

    return { payload, outletLabel };
  }

  private async generateStockConsumptionReport(from: Date, to: Date, outletId?: string): Promise<ReportPayload> {
    const computed = await this.buildStockConsumptionDataset(from, to, outletId);
    return computed.payload;
  }

  private async generateGamingReport(from: Date, to: Date): Promise<ReportPayload> {
    const rows = await this.gamingRepository
      .createQueryBuilder("booking")
      .leftJoinAndSelect("booking.staff", "staff")
      .where("booking.createdAt >= :from AND booking.createdAt <= :to", { from, to })
      .orderBy("booking.createdAt", "DESC")
      .getMany();

    const parsedRows = rows.map((row) => ({
      bookingNumber: row.bookingNumber,
      bookingType: row.bookingType,
      resource: row.resourceCodes?.length ? row.resourceCodes.join(", ") : row.resourceLabel,
      players: row.customerGroup?.length || 0,
      status: row.status,
      paymentStatus: row.paymentStatus,
      paymentMode: row.paymentMode ?? "-",
      hourlyRate: toMoney(row.hourlyRate),
      finalAmount: toMoney(row.finalAmount),
      foodAndBeverageAmount: toMoney(row.foodAndBeverageAmount),
      totalAmount: toMoney(toNumber(row.finalAmount) + toNumber(row.foodAndBeverageAmount)),
      staff: row.staff?.fullName ?? "-",
      checkInAt: row.checkInAt.toISOString(),
      checkOutAt: toIso(row.checkOutAt),
      createdAt: row.createdAt.toISOString()
    }));

    return {
      stats: [
        { label: "Sessions", value: parsedRows.length },
        { label: "Playing Now", value: parsedRows.filter((row) => row.status === "ongoing").length },
        { label: "Gaming Revenue", value: toMoney(parsedRows.reduce((sum, row) => sum + row.totalAmount, 0)) }
      ],
      columns: [
        { key: "bookingNumber", label: "Booking" },
        { key: "bookingType", label: "Type" },
        { key: "resource", label: "Resource" },
        { key: "players", label: "Players" },
        { key: "status", label: "Status" },
        { key: "paymentStatus", label: "Payment Status" },
        { key: "paymentMode", label: "Payment Mode" },
        { key: "hourlyRate", label: "Rate / Hour" },
        { key: "finalAmount", label: "Session Amount" },
        { key: "foodAndBeverageAmount", label: "F&B Amount" },
        { key: "totalAmount", label: "Total" },
        { key: "staff", label: "Staff" },
        { key: "checkInAt", label: "Check In" },
        { key: "checkOutAt", label: "Check Out" },
        { key: "createdAt", label: "Created At" }
      ],
      rows: parsedRows
    };
  }

  private async generateCashAuditReport(from: Date, to: Date): Promise<ReportPayload> {
    const fromDate = formatDate(from);
    const toDate = formatDate(to);

    const rows = await this.cashAuditRepository
      .createQueryBuilder("audit")
      .leftJoinAndSelect("audit.createdByUser", "createdByUser")
      .leftJoinAndSelect("audit.approvedByAdmin", "approvedByAdmin")
      .where("audit.auditDate >= :fromDate AND audit.auditDate <= :toDate", { fromDate, toDate })
      .orderBy("audit.auditDate", "ASC")
      .addOrderBy("audit.createdAt", "ASC")
      .getMany();

    let previousCounted = 0;
    const parsedRows = rows.map((row) => {
      const countedAmount = toMoney(row.countedAmount);
      const varianceFromPrevious = toMoney(countedAmount - previousCounted);
      previousCounted = countedAmount;
      const staffCashTaken = toMoney(row.staffCashTakenAmount);

      return {
        auditDate: row.auditDate,
        countedAmount,
        staffCashTaken,
        closingCashAfterStaff: toMoney(countedAmount - staffCashTaken),
        varianceFromPrevious,
        createdBy: row.createdByUser?.fullName ?? "-",
        approvedBy: row.approvedByAdmin?.fullName ?? "-",
        createdAt: row.createdAt.toISOString()
      };
    });

    return {
      stats: [
        { label: "Audit Entries", value: parsedRows.length },
        { label: "Total Counted", value: toMoney(parsedRows.reduce((sum, row) => sum + row.countedAmount, 0)) },
        {
          label: "Staff Cash Taken",
          value: toMoney(parsedRows.reduce((sum, row) => sum + row.staffCashTaken, 0))
        }
      ],
      columns: [
        { key: "auditDate", label: "Audit Date" },
        { key: "countedAmount", label: "Counted Amount" },
        { key: "staffCashTaken", label: "Staff Cash Taken" },
        { key: "closingCashAfterStaff", label: "Closing Cash" },
        { key: "varianceFromPrevious", label: "Variance vs Previous" },
        { key: "createdBy", label: "Created By" },
        { key: "approvedBy", label: "Approved By" },
        { key: "createdAt", label: "Created At" }
      ],
      rows: parsedRows
    };
  }

  private async dispatchGenerateReport(
    reportKey: ReportKey,
    from: Date,
    to: Date,
    options?: { outletId?: string }
  ): Promise<ReportPayload> {
    switch (reportKey) {
      case "daily_sales_report":
        return this.generateDailySalesReport(from, to);
      case "product_wise_sales_report":
        return this.generateProductWiseSalesReport(from, to);
      case "payment_method_report":
        return this.generatePaymentMethodReport(from, to);
      case "discount_report":
        return this.generateDiscountReport(from, to);
      case "cancelled_void_report":
        return this.generateCancelledVoidReport(from, to);
      case "kot_report":
        return this.generateKotReport(from, to);
      case "customer_report":
        return this.generateCustomerReport(from, to);
      case "purchase_report":
        return this.generatePurchaseReport(from, to);
      case "supplier_wise_report":
        return this.generateSupplierWiseReport(from, to);
      case "stock_report":
        return this.generateStockReport(from, to);
      case "low_stock_report":
        return this.generateLowStockReport();
      case "ingredient_report":
        return this.generateIngredientReport();
      case "menu_report":
        return this.generateMenuReport();
      case "staff_attendance_report":
        return this.generateStaffAttendanceReport(from, to);
      case "staff_login_report":
        return this.generateStaffLoginReport(from, to);
      case "gst_report":
        return this.generateGstReport(from, to);
      case "expense_report":
        return this.generateExpenseReport(from, to);
      case "delivery_report":
        return this.generateOrderTypeReport(from, to, "delivery", "Delivery");
      case "dine_in_report":
        return this.generateOrderTypeReport(from, to, "dine_in", "Dine-in");
      case "online_report":
        return this.generateOnlineReport(from, to);
      case "combo_report":
        return this.generateComboReport(from, to);
      case "peak_sales_time_report":
        return this.generatePeakSalesTimeReport(from, to);
      case "stock_consumption_report":
        return this.generateStockConsumptionReport(from, to, options?.outletId);
      case "gaming_report":
        return this.generateGamingReport(from, to);
      case "cash_audit_report":
        return this.generateCashAuditReport(from, to);
      default:
        return {
          stats: [{ label: "Rows", value: 0 }],
          columns: [{ key: "message", label: "Message" }],
          rows: [{ message: `Report generator not available for ${reportKey}` }]
        };
    }
  }
}
