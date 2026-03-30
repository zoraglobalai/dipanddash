import {
  Box,
  HStack,
  SimpleGrid,
  Text,
  VStack
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorFallback } from "@/components/feedback/ErrorFallback";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { DataTable } from "@/components/ui/DataTable";
import { attendanceService } from "@/services/attendance.service";
import { cashAuditService } from "@/services/cash-audit.service";
import { dashboardService } from "@/services/dashboard.service";
import { dumpService } from "@/services/dump.service";
import { gamingService } from "@/services/gaming.service";
import { ingredientsService } from "@/services/ingredients.service";
import { useAppToast } from "@/hooks/useAppToast";
import type { AttendanceSummary } from "@/types/attendance";
import type { CashAuditStatsResponse } from "@/types/cash-audit";
import type { DumpStatsResponse } from "@/types/dump";
import type { GamingStats } from "@/types/gaming";
import type { IngredientAllocationStats } from "@/types/ingredient";
import type { SalesStatsResponse } from "@/types/sales-stats";
import { extractErrorMessage } from "@/utils/api-error";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  });
};

const toDateInput = (value: Date) => value.toISOString().slice(0, 10);
const getToday = () => toDateInput(new Date());
const getDateBefore = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateInput(date);
};

const emptyAttendanceSummary: AttendanceSummary = {
  totalRecords: 0,
  presentStaff: 0,
  currentlyPunchedIn: 0,
  activeHours: 0,
  breakHours: 0,
  totalHours: 0
};

const chartColors = ["#B91C1C", "#16A34A", "#D97706", "#7C2D12", "#1D4ED8", "#C2410C"];

const InsightCard = ({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper?: string;
}) => (
  <Box
    p={4}
    borderRadius="18px"
    border="1px solid"
    borderColor="rgba(133, 78, 48, 0.24)"
    bg="linear-gradient(180deg, #FFFFFF 0%, #FFF7EA 100%)"
    boxShadow="0 10px 18px rgba(72, 29, 11, 0.08)"
    minH="118px"
  >
    <Text fontSize="sm" color="#7A6258" fontWeight={600}>
      {label}
    </Text>
    <Text mt={2} fontSize="2xl" fontWeight={900} color="#2A1A14">
      {value}
    </Text>
    {helper ? (
      <Text mt={1} fontSize="xs" color="#8A6F63">
        {helper}
      </Text>
    ) : null}
  </Box>
);

export const AdminDashboardPage = () => {
  const navigate = useNavigate();
  const toast = useAppToast();
  const [dateFrom, setDateFrom] = useState(getDateBefore(6));
  const [dateTo, setDateTo] = useState(getToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const [salesStats, setSalesStats] = useState<SalesStatsResponse | null>(null);
  const [cashAuditStats, setCashAuditStats] = useState<CashAuditStatsResponse | null>(null);
  const [dumpStats, setDumpStats] = useState<DumpStatsResponse | null>(null);
  const [ingredientStats, setIngredientStats] = useState<IngredientAllocationStats | null>(null);
  const [gamingStats, setGamingStats] = useState<GamingStats | null>(null);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary>(emptyAttendanceSummary);

  const applyPresetRange = useCallback((days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (days - 1));
    setDateFrom(toDateInput(from));
    setDateTo(toDateInput(to));
  }, []);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [salesResponse, cashResponse, dumpResponse, ingredientResponse, gamingResponse, attendanceResponse] =
        await Promise.all([
          dashboardService.getSalesStats({ dateFrom, dateTo }),
          cashAuditService.getAdminStats({ dateFrom, dateTo, section: "dip_and_dash" }),
          dumpService.getAdminStats({ dateFrom, dateTo }),
          ingredientsService.getAllocationStats({}),
          gamingService.getStats({ dateFrom, dateTo }),
          attendanceService.getAdminRecords({ date: getToday(), page: 1, limit: 10 })
        ]);

      setSalesStats(salesResponse.data);
      setCashAuditStats(cashResponse.data);
      setDumpStats(dumpResponse.data);
      setIngredientStats(ingredientResponse.data);
      setGamingStats(gamingResponse.data);
      setAttendanceSummary(attendanceResponse.data.summary);
      setLastRefreshedAt(new Date().toISOString());
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to fetch dashboard insights right now."));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const paymentChartData = useMemo(
    () =>
      (salesStats?.paymentModeBreakdown ?? []).map((entry) => ({
        name: entry.paymentMode.toUpperCase(),
        value: entry.amount
      })),
    [salesStats]
  );

  const topCashierColumns = useMemo(
    () =>
      [
        { key: "staffName", header: "Cashier" },
        { key: "orderCount", header: "Orders" },
        {
          key: "totalSales",
          header: "Revenue",
          render: (row: SalesStatsResponse["topCashiers"][number]) => formatCurrency(row.totalSales)
        }
      ] as Array<{
        key: string;
        header: string;
        render?: (row: SalesStatsResponse["topCashiers"][number]) => ReactNode;
      }>,
    []
  );

  const topItemsColumns = useMemo(
    () =>
      [
        { key: "name", header: "Line" },
        { key: "lineType", header: "Type" },
        { key: "quantity", header: "Qty" },
        {
          key: "total",
          header: "Revenue",
          render: (row: SalesStatsResponse["topSellingLines"][number]) => formatCurrency(row.total)
        }
      ] as Array<{
        key: string;
        header: string;
        render?: (row: SalesStatsResponse["topSellingLines"][number]) => ReactNode;
      }>,
    []
  );

  if (error) {
    return <ErrorFallback title="Unable to Load Admin Dashboard" message={error} onRetry={() => void fetchDashboard()} />;
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Admin Dashboard"
        subtitle="Command center for sales, cash control, stock health and loss signals."
      />

      <AppCard
        title="Decision Window"
        subtitle="Use this date range to evaluate performance and operational risk."
        rightContent={
          <HStack spacing={2} flexWrap="wrap" justify="flex-end">
            <AppButton size="sm" variant="outline" onClick={() => applyPresetRange(1)}>
              Today
            </AppButton>
            <AppButton size="sm" variant="outline" onClick={() => applyPresetRange(7)}>
              Last 7 Days
            </AppButton>
            <AppButton size="sm" variant="outline" onClick={() => applyPresetRange(30)}>
              Last 30 Days
            </AppButton>
            <AppButton size="sm" onClick={() => void fetchDashboard()} isLoading={loading}>
              Refresh
            </AppButton>
          </HStack>
        }
      >
        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
          <AppInput
            label="Date From"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom((event.target as HTMLInputElement).value)}
          />
          <AppInput
            label="Date To"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo((event.target as HTMLInputElement).value)}
          />
          <Box
            p={3}
            borderRadius="12px"
            bg="linear-gradient(140deg, rgba(171, 27, 27, 0.08), rgba(227, 181, 80, 0.18))"
            border="1px solid"
            borderColor="rgba(133, 78, 48, 0.2)"
          >
            <Text fontSize="xs" color="#755F57" fontWeight={700}>
              Last Refreshed
            </Text>
            <Text mt={1} fontWeight={800} color="#2A1A14">
              {formatDateTime(lastRefreshedAt)}
            </Text>
          </Box>
          <Box
            p={3}
            borderRadius="12px"
            bg="linear-gradient(140deg, rgba(20, 89, 54, 0.08), rgba(227, 181, 80, 0.18))"
            border="1px solid"
            borderColor="rgba(133, 78, 48, 0.2)"
          >
            <Text fontSize="xs" color="#755F57" fontWeight={700}>
              Selected Range
            </Text>
            <Text mt={1} fontWeight={800} color="#2A1A14">
              {salesStats ? `${salesStats.range.days} days` : "-"}
            </Text>
          </Box>
        </SimpleGrid>
      </AppCard>

      {loading || !salesStats || !cashAuditStats || !dumpStats || !ingredientStats || !gamingStats ? (
        <SkeletonTable />
      ) : (
        <>
          <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4}>
            <InsightCard
              label="Dip & Dash Net Revenue"
              value={formatCurrency(salesStats.cards.netRevenue)}
              helper={
                salesStats.cards.netRevenueGrowthPercentage === null
                  ? `Gross ${formatCurrency(salesStats.cards.totalSales)} - Purchase ${formatCurrency(salesStats.cards.totalPurchaseAmount)}`
                  : `${salesStats.cards.netRevenueGrowthPercentage >= 0 ? "+" : ""}${salesStats.cards.netRevenueGrowthPercentage}% vs previous | Gross ${formatCurrency(salesStats.cards.totalSales)} - Purchase ${formatCurrency(salesStats.cards.totalPurchaseAmount)}`
              }
            />
            <InsightCard
              label="Orders & AOV"
              value={`${salesStats.cards.totalOrders} | ${formatCurrency(salesStats.cards.averageOrderValue)}`}
              helper={`${salesStats.cards.uniqueCustomers} unique customers`}
            />
            <InsightCard
              label="Cash Exposure"
              value={formatCurrency(cashAuditStats.totalDifferenceAmount)}
              helper={`Expected ${formatCurrency(cashAuditStats.totalExpectedAmount)} | Entered ${formatCurrency(cashAuditStats.totalEnteredAmount)}`}
            />
            <InsightCard
              label="Wastage Loss"
              value={formatCurrency(dumpStats.totalLossAmount)}
              helper={`${dumpStats.totalEntries} dump entries`}
            />
            <InsightCard
              label="Payment Mix"
              value={`${formatCurrency(salesStats.cards.cashSales)} / ${formatCurrency(salesStats.cards.cardSales)} / ${formatCurrency(salesStats.cards.upiSales)}`}
              helper="Cash / Card / UPI"
            />
            <InsightCard
              label="Inventory Risk"
              value={String(ingredientStats.totals.lowStockIngredients)}
              helper={`${formatCurrency(ingredientStats.quantities.totalValuation)} stock valuation`}
            />
            <InsightCard
              label="Attendance Pulse"
              value={`${attendanceSummary.presentStaff} present`}
              helper={`${attendanceSummary.currentlyPunchedIn} punched in right now`}
            />
            <InsightCard
              label="Gaming Revenue"
              value={formatCurrency(gamingStats.totals.totalRevenue)}
              helper={`${gamingStats.totals.pendingPayments} pending payments`}
            />
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
            <AppCard title="Sales Trend" subtitle={`From ${salesStats.range.from} to ${salesStats.range.to}`}>
              <Box h="300px">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesStats.trend}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="sales" stroke="#B91C1C" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </AppCard>

            <AppCard title="Payment Split" subtitle="Track mode-wise collections">
              <Box h="300px">
                {paymentChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentChartData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                        {paymentChartData.map((_, index) => (
                          <Cell key={`admin-payment-${index}`} fill={chartColors[index % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="No payment data" description="No paid invoices in selected range." />
                )}
              </Box>
            </AppCard>
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
            <AppCard title="Top Cashiers" subtitle="High-performing counter staff">
              <DataTable
                columns={topCashierColumns}
                rows={salesStats.topCashiers.map((row) => ({ ...row, id: row.staffId }))}
                emptyState={<EmptyState title="No cashier data" description="No paid invoices found in selected range." />}
              />
            </AppCard>
            <AppCard title="Top Selling Lines" subtitle="Revenue-leading lines to protect and promote">
              <DataTable
                columns={topItemsColumns}
                rows={salesStats.topSellingLines.map((row) => ({ ...row, id: row.name }))}
                emptyState={<EmptyState title="No line data" description="No paid invoices found in selected range." />}
              />
            </AppCard>
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4}>
            <AppCard title="Fast Actions" subtitle="Jump directly to modules for quick decisions">
              <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
                <AppButton variant="outline" onClick={() => navigate("/sales-statics")}>
                  Sales Statics
                </AppButton>
                <AppButton variant="outline" onClick={() => navigate("/cash-audit")}>
                  Cash Audit
                </AppButton>
                <AppButton variant="outline" onClick={() => navigate("/dump-wastage")}>
                  Dump Wastage
                </AppButton>
                <AppButton variant="outline" onClick={() => navigate("/ingredient-entry")}>
                  Ingredient Entry
                </AppButton>
                <AppButton variant="outline" onClick={() => navigate("/assets-entry")}>
                  Assets Entry
                </AppButton>
                <AppButton variant="outline" onClick={() => navigate("/reports")}>
                  Reports
                </AppButton>
              </SimpleGrid>
            </AppCard>

            <AppCard title="Cash Audit Signal" subtitle="Recent discrepancy and trend">
              <VStack align="stretch" spacing={2}>
                <Text color="#6F5A50" fontSize="sm">
                  Latest Audit
                </Text>
                <Text fontSize="xl" fontWeight={900} color="#2A1A14">
                  {formatDateTime(cashAuditStats.latestAuditAt)}
                </Text>
                <Text fontWeight={700} color="#7A6359">
                  Latest Difference: {formatCurrency(cashAuditStats.latestDifferenceAmount)}
                </Text>
                <Text fontWeight={700} color="#7A6359">
                  Total Excess: {formatCurrency(cashAuditStats.totalExcessAmount)}
                </Text>
              </VStack>
            </AppCard>

            <AppCard title="Stock Usage Signal" subtitle="Top 5 ingredients by usage for quick replenishment decisions">
              <VStack align="stretch" spacing={3}>
                <Text fontWeight={700} color="#7A6359">
                  Low Stock Alerts: {ingredientStats.totals.lowStockIngredients}
                </Text>
                {ingredientStats.charts.topUsedIngredients.length ? (
                  ingredientStats.charts.topUsedIngredients.slice(0, 5).map((entry, index) => (
                    <Box
                      key={entry.ingredientId}
                      p={3}
                      borderRadius="12px"
                      border="1px solid"
                      borderColor="rgba(133, 78, 48, 0.18)"
                      bg="rgba(255,255,255,0.8)"
                    >
                      <HStack justify="space-between" align="start">
                        <Text fontWeight={700} color="#2A1A14">
                          {index + 1}. {entry.ingredientName}
                        </Text>
                        <Text fontWeight={900} color="#8D1C13">
                          {entry.usedQuantity.toFixed(2)} {entry.unit}
                        </Text>
                      </HStack>
                    </Box>
                  ))
                ) : (
                  <EmptyState title="No usage data" description="Ingredient usage not available yet." />
                )}
              </VStack>
            </AppCard>
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
            <AppCard title="Gaming Resource Revenue" subtitle="Top earning gaming resources">
              <Box h="280px">
                {gamingStats.resourceUsage.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={gamingStats.resourceUsage.slice(0, 8)}>
                      <XAxis dataKey="resourceLabel" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#D97706" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="No gaming data" description="No bookings in selected date range." />
                )}
              </Box>
            </AppCard>
            <AppCard title="Wastage Hotspots" subtitle="Highest-loss dump sources">
              <VStack align="stretch" spacing={3}>
                {dumpStats.topLossSources.length ? (
                  dumpStats.topLossSources.slice(0, 6).map((entry) => (
                    <Box
                      key={entry.sourceName}
                      p={3}
                      borderRadius="12px"
                      border="1px solid"
                      borderColor="rgba(133, 78, 48, 0.18)"
                      bg="rgba(255, 255, 255, 0.8)"
                    >
                      <HStack justify="space-between">
                        <Text fontWeight={700} color="#2A1A14">
                          {entry.sourceName}
                        </Text>
                        <Text fontWeight={900} color="#8D1C13">
                          {formatCurrency(entry.lossAmount)}
                        </Text>
                      </HStack>
                      <Text mt={1} fontSize="xs" color="#7A6359">
                        {entry.entryCount} entries
                      </Text>
                    </Box>
                  ))
                ) : (
                  <EmptyState title="No wastage hotspot" description="No dump entries in selected range." />
                )}
              </VStack>
            </AppCard>
          </SimpleGrid>
        </>
      )}
    </VStack>
  );
};
