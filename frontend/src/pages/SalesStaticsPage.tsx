import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  SimpleGrid,
  Text,
  VStack
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { DataTable } from "@/components/ui/DataTable";
import { useAuth } from "@/context/AuthContext";
import { useAppToast } from "@/hooks/useAppToast";
import { dashboardService } from "@/services/dashboard.service";
import type { SalesStatsResponse } from "@/types/sales-stats";
import { UserRole } from "@/types/role";
import { extractErrorMessage } from "@/utils/api-error";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const getToday = () => new Date().toISOString().slice(0, 10);
const getSevenDaysBefore = () => {
  const value = new Date();
  value.setDate(value.getDate() - 6);
  return value.toISOString().slice(0, 10);
};

const chartColors = ["#B91C1C", "#16A34A", "#D97706", "#7C2D12", "#C2410C", "#15803D"];

const StatsCard = ({ label, value, helper }: { label: string; value: string; helper?: string }) => (
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

export const SalesStaticsPage = () => {
  const { user } = useAuth();
  const toast = useAppToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SalesStatsResponse | null>(null);
  const [dateFrom, setDateFrom] = useState(getSevenDaysBefore());
  const [dateTo, setDateTo] = useState(getToday());

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const response = await dashboardService.getSalesStats({ dateFrom, dateTo });
      setData(response.data);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch sales analytics."));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, toast]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const paymentChartData = useMemo(
    () =>
      (data?.paymentModeBreakdown ?? []).map((row) => ({
        name: row.paymentMode.toUpperCase(),
        value: row.amount
      })),
    [data]
  );

  if (user?.role !== UserRole.ADMIN) {
    return (
      <VStack spacing={6} align="stretch">
        <PageHeader title="Sales Statics" subtitle="This module is restricted to admin users." />
        <AppCard>
          <EmptyState title="Unauthorized" description="Only admin users can access sales analytics." />
        </AppCard>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Sales Statics"
        subtitle="Advanced sales analytics for revenue, cashier performance, and product movement."
      />

      <AppCard>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <AppInput
            label="Date From"
            type="date"
            value={dateFrom}
            onChange={(event) =>
              setDateFrom((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)
            }
          />
          <AppInput
            label="Date To"
            type="date"
            value={dateTo}
            onChange={(event) =>
              setDateTo((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)
            }
          />
          <FormControl alignSelf="end">
            <FormLabel opacity={0}>Refresh</FormLabel>
            <AppButton onClick={() => void fetchStats()} isLoading={loading}>
              Refresh Stats
            </AppButton>
          </FormControl>
        </SimpleGrid>
      </AppCard>

      {loading || !data ? (
        <SkeletonTable />
      ) : (
        <>
          <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4}>
            <StatsCard
              label="Total Sales"
              value={formatCurrency(data.cards.totalSales)}
              helper={
                data.cards.salesGrowthPercentage === null
                  ? "No previous period data"
                  : `${data.cards.salesGrowthPercentage >= 0 ? "+" : ""}${data.cards.salesGrowthPercentage}% vs previous`
              }
            />
            <StatsCard
              label="Excess Amount"
              value={formatCurrency(data.cards.excessAmount)}
              helper={`Billed ${formatCurrency(data.cards.billedSales)}`}
            />
            <StatsCard
              label="Total Orders"
              value={String(data.cards.totalOrders)}
              helper={`${data.cards.uniqueCustomers} unique customers`}
            />
            <StatsCard label="Average Order Value" value={formatCurrency(data.cards.averageOrderValue)} />
            <StatsCard
              label="Discount + Tax"
              value={formatCurrency(data.cards.totalDiscount + data.cards.totalTax)}
              helper={`Discount ${formatCurrency(data.cards.totalDiscount)} | Tax ${formatCurrency(data.cards.totalTax)}`}
            />
            <StatsCard label="Cash Revenue" value={formatCurrency(data.cards.cashSales)} />
            <StatsCard label="Card Revenue" value={formatCurrency(data.cards.cardSales)} />
            <StatsCard
              label="UPI Revenue"
              value={formatCurrency(data.cards.upiSales)}
              helper={`Mixed ${formatCurrency(data.cards.mixedSales)}`}
            />
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
            <AppCard title="Sales Trend" subtitle={`From ${data.range.from} to ${data.range.to}`}>
              <Box h="300px">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="sales" stroke="#B91C1C" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </AppCard>

            <AppCard title="Payment Mode Split" subtitle="Amount distribution by payment mode">
              <Box h="300px">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={65}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {paymentChartData.map((_, index) => (
                        <Cell key={`payment-${index}`} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </AppCard>
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
            <AppCard title="Top Selling Lines" subtitle="Items/combos/add-ons by billed value">
              <Box h="300px">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topSellingLines}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#D97706" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </AppCard>

            <AppCard title="Top Cashiers" subtitle="Revenue contribution by staff">
              <DataTable
                columns={
                  [
                    { key: "staffName", header: "Cashier" },
                    { key: "orderCount", header: "Orders" },
                    {
                      key: "totalSales",
                      header: "Sales",
                      render: (row: SalesStatsResponse["topCashiers"][number]) => formatCurrency(row.totalSales)
                    }
                  ] as Array<{
                    key: string;
                    header: string;
                    render?: (row: SalesStatsResponse["topCashiers"][number]) => ReactNode;
                  }>
                }
                rows={data.topCashiers.map((row) => ({ ...row, id: row.staffId }))}
                emptyState={<EmptyState title="No cashier data" description="No paid invoices in selected range." />}
              />
            </AppCard>
          </SimpleGrid>
        </>
      )}
    </VStack>
  );
};
