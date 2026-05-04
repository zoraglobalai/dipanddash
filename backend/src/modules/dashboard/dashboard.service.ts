import { AppDataSource } from "../../database/data-source";
import { UserRole } from "../../constants/roles";
import { CashAudit } from "../cash-audit/cash-audit.entity";
import { GamingBooking } from "../gaming/gaming-booking.entity";
import { Invoice } from "../invoices/invoice.entity";
import { InvoiceLine } from "../invoices/invoice-line.entity";
import { InvoicePayment } from "../invoices/invoice-payment.entity";
import { Product } from "../procurement/product.entity";
import { PurchaseOrder } from "../procurement/purchase-order.entity";

type SalesStatsInput = {
  dateFrom?: string;
  dateTo?: string;
};

const toMoney = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number(Number.isFinite(parsed) ? parsed.toFixed(2) : 0);
};

const toDay = (value: Date) => value.toISOString().slice(0, 10);

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

const buildDateSeries = (from: Date, to: Date) => {
  const rows: string[] = [];
  const cursor = startOfDay(from);
  const limit = startOfDay(to);
  while (cursor <= limit) {
    rows.push(toDay(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
};

export class DashboardService {
  private readonly invoiceRepository = AppDataSource.getRepository(Invoice);
  private readonly invoiceLineRepository = AppDataSource.getRepository(InvoiceLine);
  private readonly invoicePaymentRepository = AppDataSource.getRepository(InvoicePayment);
  private readonly cashAuditRepository = AppDataSource.getRepository(CashAudit);
  private readonly purchaseOrderRepository = AppDataSource.getRepository(PurchaseOrder);
  private readonly gamingBookingRepository = AppDataSource.getRepository(GamingBooking);

  private async getDipAndDashExcessAmount(from: Date, to: Date) {
    try {
      const fromDay = toDay(from);
      const toDayValue = toDay(to);
      const rows = await this.cashAuditRepository
        .createQueryBuilder("cashAudit")
        .leftJoin("cashAudit.createdByUser", "createdByUser")
        .where("cashAudit.auditDate >= :fromDay", { fromDay })
        .andWhere("cashAudit.auditDate <= :toDay", { toDay: toDayValue })
        .andWhere("createdByUser.role != :gamingRole", { gamingRole: UserRole.SNOOKER_STAFF })
        .select("cashAudit.countedAmount", "countedAmount")
        .addSelect("cashAudit.staffCashTakenAmount", "staffCashTakenAmount")
        .addSelect("cashAudit.enteredCardAmount", "enteredCardAmount")
        .addSelect("cashAudit.enteredUpiAmount", "enteredUpiAmount")
        .addSelect("cashAudit.expectedCashAmount", "expectedCashAmount")
        .addSelect("cashAudit.expectedCardAmount", "expectedCardAmount")
        .addSelect("cashAudit.expectedUpiAmount", "expectedUpiAmount")
        .getRawMany<{
          countedAmount: string;
          staffCashTakenAmount: string;
          enteredCardAmount: string;
          enteredUpiAmount: string;
          expectedCashAmount: string;
          expectedCardAmount: string;
          expectedUpiAmount: string;
        }>();

      const totalExcessAmount = rows.reduce((sum, row) => {
        const enteredTotal =
          toMoney(row.countedAmount) +
          toMoney(row.staffCashTakenAmount) +
          toMoney(row.enteredCardAmount) +
          toMoney(row.enteredUpiAmount);
        const expectedTotal =
          toMoney(row.expectedCashAmount) + toMoney(row.expectedCardAmount) + toMoney(row.expectedUpiAmount);
        return sum + Math.max(toMoney(enteredTotal - expectedTotal), 0);
      }, 0);

      return toMoney(totalExcessAmount);
    } catch {
      return 0;
    }
  }

  getAdminDashboard() {
    return {
      stats: [
        { label: "Total Revenue", value: "₹18,74,220", change: "+12.4%" },
        { label: "Active Staff", value: 27, change: "+2" },
        { label: "Open Bills", value: 41, change: "-5" },
        { label: "Low Stock Alerts", value: 8, change: "+1" }
      ],
      revenueTrend: [
        { month: "Jan", value: 124000 },
        { month: "Feb", value: 138000 },
        { month: "Mar", value: 151000 },
        { month: "Apr", value: 147000 },
        { month: "May", value: 166000 },
        { month: "Jun", value: 179000 }
      ],
      recentActivity: [
        { id: "1", action: "Staff login", actor: "counter_03", time: "2 mins ago" },
        { id: "2", action: "Offer published", actor: "manager_01", time: "14 mins ago" },
        { id: "3", action: "Stock adjusted", actor: "accounting", time: "36 mins ago" }
      ],
      quickActions: [
        { id: "1", label: "Create Offer" },
        { id: "2", label: "Add Item" },
        { id: "3", label: "Download Report" }
      ]
    };
  }

  getStaffDashboard(fullName: string) {
    return {
      welcomeTitle: `Welcome, ${fullName}`,
      summary: [
        { label: "Today's Bills", value: 24 },
        { label: "Open Tasks", value: 3 },
        { label: "Shift Status", value: "Active" }
      ],
      notes: [
        "Please confirm stock usage before shift close.",
        "New offer pricing is active from today."
      ]
    };
  }

  async getSalesStats(input: SalesStatsInput = {}) {
    const now = new Date();
    const parsedInputFrom = input.dateFrom ? startOfDay(new Date(input.dateFrom)) : null;
    const parsedInputTo = input.dateTo ? endOfDay(new Date(input.dateTo)) : null;
    const hasInputFrom = Boolean(parsedInputFrom && !Number.isNaN(parsedInputFrom.getTime()));
    const hasInputTo = Boolean(parsedInputTo && !Number.isNaN(parsedInputTo.getTime()));

    const [invoiceBounds, purchaseBounds, gamingBounds] = await Promise.all([
      this.invoiceRepository
        .createQueryBuilder("invoice")
        .where("invoice.status = 'paid'")
        .andWhere("invoice.orderType != 'snooker'")
        .select("MIN(invoice.createdAt)", "minDate")
        .addSelect("MAX(invoice.createdAt)", "maxDate")
        .getRawOne<{ minDate: string | null; maxDate: string | null }>(),
      this.purchaseOrderRepository
        .createQueryBuilder("purchaseOrder")
        .select("MIN(purchaseOrder.purchaseDate)", "minDate")
        .addSelect("MAX(purchaseOrder.purchaseDate)", "maxDate")
        .getRawOne<{ minDate: string | null; maxDate: string | null }>(),
      this.gamingBookingRepository
        .createQueryBuilder("booking")
        .where("booking.paymentStatus = 'paid'")
        .select("MIN(booking.checkInAt)", "minDate")
        .addSelect("MAX(booking.checkInAt)", "maxDate")
        .getRawOne<{ minDate: string | null; maxDate: string | null }>()
    ]);

    const toDateBoundary = (
      value: string | Date | null | undefined,
      boundary: "start" | "end"
    ): Date | null => {
      if (!value) {
        return null;
      }
      const parsed = value instanceof Date ? new Date(value) : new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return boundary === "start" ? startOfDay(parsed) : endOfDay(parsed);
    };

    const lowerBounds = [
      toDateBoundary(invoiceBounds?.minDate, "start"),
      toDateBoundary(purchaseBounds?.minDate, "start"),
      toDateBoundary(gamingBounds?.minDate, "start")
    ].filter((value): value is Date => Boolean(value));
    const upperBounds = [
      toDateBoundary(invoiceBounds?.maxDate, "end"),
      toDateBoundary(purchaseBounds?.maxDate, "end"),
      toDateBoundary(gamingBounds?.maxDate, "end")
    ].filter((value): value is Date => Boolean(value));

    let safeFrom = hasInputFrom
      ? (parsedInputFrom as Date)
      : lowerBounds.length
        ? new Date(Math.min(...lowerBounds.map((value) => value.getTime())))
        : startOfDay(now);
    let safeTo = hasInputTo
      ? (parsedInputTo as Date)
      : upperBounds.length
        ? new Date(Math.max(...upperBounds.map((value) => value.getTime())))
        : endOfDay(now);

    safeFrom = startOfDay(safeFrom);
    safeTo = endOfDay(safeTo);

    if (safeFrom > safeTo) {
      safeTo = endOfDay(safeFrom);
    }

    const rangeDays = Math.max(1, Math.ceil((safeTo.getTime() - safeFrom.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    const previousTo = new Date(safeFrom.getTime() - 1);
    const previousFrom = new Date(previousTo);
    previousFrom.setDate(previousFrom.getDate() - (rangeDays - 1));
    const safeFromDay = toDay(safeFrom);
    const safeToDay = toDay(safeTo);
    const previousFromDay = toDay(previousFrom);
    const previousToDay = toDay(previousTo);

    const paidInvoiceBase = this.invoiceRepository
      .createQueryBuilder("invoice")
      .where("invoice.status = 'paid'")
      .andWhere("invoice.orderType != 'snooker'")
      .andWhere("invoice.createdAt >= :fromDate", { fromDate: safeFrom })
      .andWhere("invoice.createdAt <= :toDate", { toDate: safeTo });

    const previousPaidBase = this.invoiceRepository
      .createQueryBuilder("invoice")
      .where("invoice.status = 'paid'")
      .andWhere("invoice.orderType != 'snooker'")
      .andWhere("invoice.createdAt >= :fromDate", { fromDate: previousFrom })
      .andWhere("invoice.createdAt <= :toDate", { toDate: previousTo });

    const [
      summary,
      previousSummary,
      purchaseSummary,
      previousPurchaseSummary,
      productSalesSummary,
      snookerRevenueSummary,
      paymentRows,
      paymentFallbackRows,
      orderTypeRows,
      trendRows,
      topCashierRows,
      topItemRows,
      excessAmount,
      previousExcessAmount
    ] =
      await Promise.all([
        paidInvoiceBase
          .clone()
          .select("COUNT(invoice.id)", "totalOrders")
          .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "totalSales")
          .addSelect("COALESCE(AVG(invoice.totalAmount), 0)", "avgOrderValue")
          .addSelect(
            "COALESCE(SUM(invoice.itemDiscountAmount + invoice.couponDiscountAmount + invoice.manualDiscountAmount), 0)",
            "discountAmount"
          )
          .addSelect("COALESCE(SUM(invoice.taxAmount), 0)", "taxAmount")
          .addSelect("COUNT(DISTINCT invoice.customerId)", "uniqueCustomers")
          .getRawOne<{
            totalOrders: string;
            totalSales: string;
            avgOrderValue: string;
            discountAmount: string;
            taxAmount: string;
            uniqueCustomers: string;
          }>(),
        previousPaidBase
          .clone()
          .select("COALESCE(SUM(invoice.totalAmount), 0)", "totalSales")
          .getRawOne<{ totalSales: string }>(),
        this.purchaseOrderRepository
          .createQueryBuilder("purchaseOrder")
          .select(
            `COALESCE(SUM(CASE WHEN "purchaseOrder"."purchaseSection" = 'dip_and_dash' THEN "purchaseOrder"."totalAmount" ELSE 0 END), 0)`,
            "dipAndDashPurchaseAmount"
          )
          .addSelect(
            `COALESCE(SUM(CASE WHEN "purchaseOrder"."purchaseSection" = 'gaming' THEN "purchaseOrder"."totalAmount" ELSE 0 END), 0)`,
            "snookerPurchaseAmount"
          )
          .addSelect("COALESCE(SUM(purchaseOrder.totalAmount), 0)", "totalPurchaseAmount")
          .where("purchaseOrder.purchaseDate >= :fromDay", { fromDay: safeFromDay })
          .andWhere("purchaseOrder.purchaseDate <= :toDay", { toDay: safeToDay })
          .getRawOne<{
            dipAndDashPurchaseAmount: string;
            snookerPurchaseAmount: string;
            totalPurchaseAmount: string;
          }>(),
        this.purchaseOrderRepository
          .createQueryBuilder("purchaseOrder")
          .select(
            `COALESCE(SUM(CASE WHEN "purchaseOrder"."purchaseSection" = 'dip_and_dash' THEN "purchaseOrder"."totalAmount" ELSE 0 END), 0)`,
            "dipAndDashPurchaseAmount"
          )
          .addSelect(
            `COALESCE(SUM(CASE WHEN "purchaseOrder"."purchaseSection" = 'gaming' THEN "purchaseOrder"."totalAmount" ELSE 0 END), 0)`,
            "snookerPurchaseAmount"
          )
          .addSelect("COALESCE(SUM(purchaseOrder.totalAmount), 0)", "totalPurchaseAmount")
          .where("purchaseOrder.purchaseDate >= :fromDay", { fromDay: previousFromDay })
          .andWhere("purchaseOrder.purchaseDate <= :toDay", { toDay: previousToDay })
          .getRawOne<{
            dipAndDashPurchaseAmount: string;
            snookerPurchaseAmount: string;
            totalPurchaseAmount: string;
          }>(),
        this.invoiceLineRepository
          .createQueryBuilder("line")
          .leftJoin(Invoice, "invoice", "invoice.id = line.invoiceId")
          .leftJoin(Product, "product", `product.id::text = line."referenceId"::text`)
          .where("line.lineType = :lineType", { lineType: "product" })
          .andWhere("invoice.status = 'paid'")
          .andWhere("invoice.orderType != 'snooker'")
          .andWhere("invoice.createdAt >= :fromDate", { fromDate: safeFrom })
          .andWhere("invoice.createdAt <= :toDate", { toDate: safeTo })
          .select("COALESCE(SUM(line.lineTotal), 0)", "soldAmount")
          .addSelect("COALESCE(SUM(line.quantity * COALESCE(product.purchaseUnitPrice, 0)), 0)", "costAmount")
          .getRawOne<{ soldAmount: string; costAmount: string }>(),
        this.gamingBookingRepository
          .createQueryBuilder("booking")
          .where("booking.paymentStatus = :paymentStatus", { paymentStatus: "paid" })
          .andWhere("booking.checkInAt >= :fromDate", { fromDate: safeFrom })
          .andWhere("booking.checkInAt <= :toDate", { toDate: safeTo })
          .select(
            `COALESCE(SUM(CASE WHEN booking.status = 'completed' THEN COALESCE(booking.finalAmount, booking.systemCalculatedAmount, 0) ELSE COALESCE(booking.systemCalculatedAmount, 0) END), 0)`,
            "totalRevenue"
          )
          .getRawOne<{ totalRevenue: string }>(),
        this.invoicePaymentRepository
          .createQueryBuilder("payment")
          .innerJoin(Invoice, "invoice", "invoice.id = payment.invoiceId")
          .where("payment.status = 'success'")
          .andWhere("invoice.status IN (:...revenueStatuses)", { revenueStatuses: ["paid", "pending"] })
          .andWhere("invoice.orderType != 'snooker'")
          .andWhere("invoice.createdAt >= :fromDate", { fromDate: safeFrom })
          .andWhere("invoice.createdAt <= :toDate", { toDate: safeTo })
          .select("payment.mode", "paymentMode")
          .addSelect("COUNT(payment.id)", "count")
          .addSelect("COALESCE(SUM(payment.amount), 0)", "amount")
          .groupBy("payment.mode")
          .orderBy("amount", "DESC")
          .getRawMany<{ paymentMode: string; count: string; amount: string }>(),
        this.invoiceRepository
          .createQueryBuilder("invoice")
          .where("invoice.status = 'paid'")
          .andWhere("invoice.orderType != 'snooker'")
          .andWhere("invoice.createdAt >= :fromDate", { fromDate: safeFrom })
          .andWhere("invoice.createdAt <= :toDate", { toDate: safeTo })
          .andWhere((query) => {
            const subQuery = query
              .subQuery()
              .select("1")
              .from(InvoicePayment, "invoicePayment")
              .where("invoicePayment.invoiceId = invoice.id")
              .getQuery();
            return `NOT EXISTS ${subQuery}`;
          })
          .select("invoice.paymentMode", "paymentMode")
          .addSelect("COUNT(invoice.id)", "count")
          .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "amount")
          .groupBy("invoice.paymentMode")
          .orderBy("amount", "DESC")
          .getRawMany<{ paymentMode: string; count: string; amount: string }>(),
        paidInvoiceBase
          .clone()
          .select("invoice.orderType", "orderType")
          .addSelect("COUNT(invoice.id)", "count")
          .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "amount")
          .groupBy("invoice.orderType")
          .orderBy("amount", "DESC")
          .getRawMany<{ orderType: string; count: string; amount: string }>(),
        paidInvoiceBase
          .clone()
          .select("DATE(invoice.createdAt)", "date")
          .addSelect("COUNT(invoice.id)", "orders")
          .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "sales")
          .groupBy("DATE(invoice.createdAt)")
          .orderBy("DATE(invoice.createdAt)", "ASC")
          .getRawMany<{ date: string; orders: string; sales: string }>(),
        paidInvoiceBase
          .clone()
          .leftJoin("invoice.staff", "staff")
          .select("invoice.staffId", "staffId")
          .addSelect("COALESCE(staff.fullName, 'Unknown')", "staffName")
          .addSelect("COUNT(invoice.id)", "orderCount")
          .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "totalSales")
          .groupBy("invoice.staffId")
          .addGroupBy("staff.fullName")
          .orderBy("COALESCE(SUM(invoice.totalAmount), 0)", "DESC")
          .addOrderBy("COUNT(invoice.id)", "DESC")
          .take(5)
          .getRawMany<{
            staffId: string;
            staffName: string;
            orderCount: string;
            totalSales: string;
          }>(),
        this.invoiceLineRepository
          .createQueryBuilder("line")
          .leftJoin(Invoice, "invoice", "invoice.id = line.invoiceId")
          .where("invoice.status = 'paid'")
          .andWhere("invoice.orderType != 'snooker'")
          .andWhere("invoice.createdAt >= :fromDate", { fromDate: safeFrom })
          .andWhere("invoice.createdAt <= :toDate", { toDate: safeTo })
          .select("line.nameSnapshot", "name")
          .addSelect("line.lineType", "lineType")
          .addSelect("COALESCE(SUM(line.quantity), 0)", "quantity")
          .addSelect("COALESCE(SUM(line.lineTotal), 0)", "total")
          .groupBy("line.nameSnapshot")
          .addGroupBy("line.lineType")
          .orderBy("total", "DESC")
          .take(8)
          .getRawMany<{
            name: string;
            lineType: string;
            quantity: string;
            total: string;
          }>(),
        this.getDipAndDashExcessAmount(safeFrom, safeTo),
        this.getDipAndDashExcessAmount(previousFrom, previousTo)
      ]);

    const billedSales = toMoney(summary?.totalSales ?? 0);
    const totalSales = toMoney(billedSales + excessAmount);
    const previousBilledSales = toMoney(previousSummary?.totalSales ?? 0);
    const previousSales = toMoney(previousBilledSales + previousExcessAmount);
    const dipAndDashPurchaseAmount = toMoney(purchaseSummary?.dipAndDashPurchaseAmount ?? 0);
    const snookerPurchaseAmount = toMoney(purchaseSummary?.snookerPurchaseAmount ?? 0);
    const totalPurchaseAmount = toMoney(purchaseSummary?.totalPurchaseAmount ?? 0);
    const previousDipAndDashPurchaseAmount = toMoney(previousPurchaseSummary?.dipAndDashPurchaseAmount ?? 0);
    const previousPurchaseAmount = toMoney(previousPurchaseSummary?.totalPurchaseAmount ?? 0);
    const netRevenue = toMoney(totalSales - dipAndDashPurchaseAmount);
    const previousNetRevenue = toMoney(previousSales - previousDipAndDashPurchaseAmount);
    const salesGrowthPercentage =
      previousSales > 0 ? Number((((totalSales - previousSales) / previousSales) * 100).toFixed(2)) : null;
    const netRevenueGrowthPercentage =
      previousNetRevenue !== 0
        ? Number((((netRevenue - previousNetRevenue) / Math.abs(previousNetRevenue)) * 100).toFixed(2))
        : null;
    const productSalesAmount = toMoney(productSalesSummary?.soldAmount ?? 0);
    const productSalesCostAmount = toMoney(productSalesSummary?.costAmount ?? 0);
    const productSalesProfit = toMoney(productSalesAmount - productSalesCostAmount);
    const snookerGamingRevenue = toMoney(snookerRevenueSummary?.totalRevenue ?? 0);
    const snookerGamingProfit = toMoney(snookerGamingRevenue - snookerPurchaseAmount);

    const paymentMap = new Map<string, { paymentMode: string; count: number; amount: number }>();
    [...paymentRows, ...paymentFallbackRows].forEach((row) => {
      const key = row.paymentMode ?? "cash";
      const existing = paymentMap.get(key) ?? {
        paymentMode: key,
        count: 0,
        amount: 0
      };
      existing.count += Number(row.count ?? 0);
      existing.amount = toMoney(existing.amount + toMoney(row.amount ?? 0));
      paymentMap.set(key, existing);
    });

    const paymentBreakdown = [...paymentMap.values()].sort((a, b) => b.amount - a.amount);
    const cashSales = paymentBreakdown.find((row) => row.paymentMode === "cash")?.amount ?? 0;
    const cardSales = paymentBreakdown.find((row) => row.paymentMode === "card")?.amount ?? 0;
    const upiSales = paymentBreakdown.find((row) => row.paymentMode === "upi")?.amount ?? 0;
    const mixedSales = paymentBreakdown.find((row) => row.paymentMode === "mixed")?.amount ?? 0;
    const adjustedCashSales = toMoney(cashSales + excessAmount);

    const trendMap = new Map(
      trendRows.map((row) => [
        row.date,
        {
          orders: Number(row.orders ?? 0),
          sales: toMoney(row.sales ?? 0)
        }
      ])
    );
    const trend = buildDateSeries(safeFrom, safeTo).map((date) => ({
      date,
      orders: trendMap.get(date)?.orders ?? 0,
      sales: trendMap.get(date)?.sales ?? 0
    }));

    return {
      range: {
        from: toDay(safeFrom),
        to: toDay(safeTo),
        days: rangeDays
      },
      cards: {
        totalSales,
        dipAndDashSales: totalSales,
        netRevenue,
        billedSales,
        excessAmount,
        totalPurchaseAmount,
        dipAndDashPurchaseAmount,
        snookerPurchaseAmount,
        totalOrders: Number(summary?.totalOrders ?? 0),
        averageOrderValue: toMoney(summary?.avgOrderValue ?? 0),
        totalDiscount: toMoney(summary?.discountAmount ?? 0),
        totalTax: toMoney(summary?.taxAmount ?? 0),
        uniqueCustomers: Number(summary?.uniqueCustomers ?? 0),
        previousPeriodSales: previousSales,
        previousPeriodNetRevenue: previousNetRevenue,
        previousPeriodPurchaseAmount: previousPurchaseAmount,
        salesGrowthPercentage,
        netRevenueGrowthPercentage,
        cashSales: adjustedCashSales,
        cardSales: toMoney(cardSales),
        upiSales: toMoney(upiSales),
        mixedSales: toMoney(mixedSales),
        snookerGamingRevenue,
        snookerGamingProfit,
        productSalesProfit
      },
      paymentModeBreakdown: paymentBreakdown.map((row) => ({
        paymentMode: row.paymentMode,
        count: row.count,
        amount: toMoney(row.amount)
      })),
      orderTypeBreakdown: orderTypeRows.map((row) => ({
        orderType: row.orderType,
        count: Number(row.count ?? 0),
        amount: toMoney(row.amount ?? 0)
      })),
      trend,
      topCashiers: topCashierRows.map((row) => ({
        staffId: row.staffId,
        staffName: row.staffName,
        orderCount: Number(row.orderCount ?? 0),
        totalSales: toMoney(row.totalSales ?? 0)
      })),
      topSellingLines: topItemRows.map((row) => ({
        name: row.name,
        lineType: row.lineType,
        quantity: Number(Number(row.quantity ?? 0).toFixed(2)),
        total: toMoney(row.total ?? 0)
      }))
    };
  }
}
