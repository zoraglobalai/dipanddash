import {
  Badge,
  Box,
  FormControl,
  FormLabel,
  HStack,
  Select,
  SimpleGrid,
  Text,
  VStack
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { DataTable } from "@/components/ui/DataTable";
import { useAuth } from "@/context/AuthContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAppToast } from "@/hooks/useAppToast";
import { gamingService } from "@/services/gaming.service";
import type {
  GamingBookingRow,
  GamingBookingStatus,
  GamingPaymentStatus,
  GamingResourceAvailability,
  GamingStats
} from "@/types/gaming";
import { UserRole } from "@/types/role";
import { extractErrorMessage } from "@/utils/api-error";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString("en-IN") : "-");

const getToday = () => new Date().toISOString().slice(0, 10);
const getWeekStart = () => {
  const value = new Date();
  value.setDate(value.getDate() - 6);
  return value.toISOString().slice(0, 10);
};

const emptyStats: GamingStats = {
  totals: {
    totalBookings: 0,
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
  },
  staffCollection: [],
  resourceUsage: []
};

const statusColorMap: Record<GamingBookingStatus, string> = {
  upcoming: "blue",
  ongoing: "green",
  completed: "purple",
  cancelled: "gray"
};

const paymentColorMap: Record<GamingPaymentStatus, string> = {
  pending: "orange",
  paid: "green",
  refunded: "purple"
};

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

export const GamingPage = () => {
  const { user } = useAuth();
  const toast = useAppToast();

  const [stats, setStats] = useState<GamingStats>(emptyStats);
  const [statsLoading, setStatsLoading] = useState(true);
  const [bookings, setBookings] = useState<GamingBookingRow[]>([]);
  const [resources, setResources] = useState<GamingResourceAvailability[]>([]);
  const [tableLoading, setTableLoading] = useState(true);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [bookingType, setBookingType] = useState<"all" | "snooker" | "console">("all");
  const [status, setStatus] = useState<"all" | GamingBookingStatus>("all");
  const [paymentStatus, setPaymentStatus] = useState<"all" | GamingPaymentStatus>("all");
  const [resourceCode, setResourceCode] = useState("");
  const [dateFrom, setDateFrom] = useState(getWeekStart());
  const [dateTo, setDateTo] = useState(getToday());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await gamingService.getStats({ dateFrom, dateTo });
      setStats(response.data);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch gaming analytics."));
    } finally {
      setStatsLoading(false);
    }
  }, [dateFrom, dateTo, toast]);

  const fetchResources = useCallback(async () => {
    try {
      const response = await gamingService.getResources();
      setResources(response.data.resources);
    } catch {
      setResources([]);
    }
  }, []);

  const fetchBookings = useCallback(async () => {
    setTableLoading(true);
    try {
      const response = await gamingService.getBookings({
        search: debouncedSearch || undefined,
        bookingType: bookingType === "all" ? undefined : bookingType,
        status: status === "all" ? undefined : status,
        paymentStatus: paymentStatus === "all" ? undefined : paymentStatus,
        resourceCode: resourceCode || undefined,
        dateFrom,
        dateTo,
        page,
        limit
      });
      setBookings(response.data.bookings);
      setTotal(response.data.pagination.total);
      setTotalPages(response.data.pagination.totalPages);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch bookings."));
    } finally {
      setTableLoading(false);
    }
  }, [debouncedSearch, bookingType, status, paymentStatus, resourceCode, dateFrom, dateTo, page, limit, toast]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchBookings(), fetchResources()]);
  }, [fetchBookings, fetchResources, fetchStats]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    void fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, bookingType, status, paymentStatus, resourceCode, limit]);

  const statusPieData = useMemo(
    () => [
      { name: "Ongoing", value: stats.totals.ongoing, color: "#1E9C58" },
      { name: "Upcoming", value: stats.totals.upcoming, color: "#1D5DB4" },
      { name: "Completed", value: stats.totals.completed, color: "#9747FF" },
      { name: "Cancelled", value: stats.totals.cancelled, color: "#7A6358" }
    ],
    [stats.totals]
  );

  const sessionSplit = useMemo(() => {
    const snookerSessions = stats.resourceUsage
      .filter((resource) => resource.resourceCode.startsWith("board_"))
      .reduce((sum, resource) => sum + resource.bookings, 0);
    const consoleSessions = stats.resourceUsage
      .filter((resource) => !resource.resourceCode.startsWith("board_"))
      .reduce((sum, resource) => sum + resource.bookings, 0);

    const snookerResources = resources.filter((resource) => resource.bookingType === "snooker");
    const consoleResources = resources.filter((resource) => resource.bookingType === "console");

    const snookerOccupied = snookerResources.filter((resource) => !resource.isAvailable).length;
    const consoleOccupied = consoleResources.filter((resource) => !resource.isAvailable).length;

    const snookerPlayers = snookerResources.reduce(
      (sum, resource) => sum + (resource.activeBooking?.customerCount ?? 0),
      0
    );
    const consolePlayers = consoleResources.reduce(
      (sum, resource) => sum + (resource.activeBooking?.customerCount ?? 0),
      0
    );

    return {
      snookerSessions,
      consoleSessions,
      snookerOccupied,
      consoleOccupied,
      snookerTotal: snookerResources.length,
      consoleTotal: consoleResources.length,
      snookerPlayers,
      consolePlayers
    };
  }, [resources, stats.resourceUsage]);

  const columns = useMemo(
    () =>
      [
        {
          key: "booking",
          header: "Booking",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={800}>{row.bookingNumber}</Text>
              <Text fontSize="xs" color="#7A6258">
                {row.bookingChannel ?? "desktop"}
              </Text>
            </VStack>
          )
        },
        {
          key: "customer",
          header: "Customer",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.primaryCustomerName}</Text>
              <Text fontSize="xs" color="#7A6258">
                {row.primaryCustomerPhone} | {row.customerCount} player(s)
              </Text>
            </VStack>
          )
        },
        {
          key: "slot",
          header: "Type / Slot",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Text textTransform="capitalize">{row.bookingType}</Text>
              <Text fontSize="xs" color="#7A6258">
                {row.resourceLabel}
              </Text>
            </VStack>
          )
        },
        {
          key: "timing",
          header: "Check In / Out",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Text>{formatDateTime(row.checkInAt)}</Text>
              <Text fontSize="xs" color="#7A6258">
                Out: {formatDateTime(row.checkOutAt)}
              </Text>
            </VStack>
          )
        },
        {
          key: "amount",
          header: "Amount",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{formatCurrency(row.finalAmount)}</Text>
              <Text fontSize="xs" color="#7A6258">
                Live {formatCurrency(row.calculatedAmount)} | {row.durationMinutes} mins
              </Text>
              <Text fontSize="xs" color="#7A6258">
                F&B {formatCurrency(row.foodAndBeverageAmount)} | {row.foodInvoiceStatus}
              </Text>
            </VStack>
          )
        },
        {
          key: "status",
          header: "Status",
          render: (row: GamingBookingRow) => (
            <Badge colorScheme={statusColorMap[row.status]} textTransform="capitalize">
              {row.status}
            </Badge>
          )
        },
        {
          key: "payment",
          header: "Payment",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Badge colorScheme={paymentColorMap[row.paymentStatus]} textTransform="capitalize">
                {row.paymentStatus}
              </Badge>
              {row.paymentStatus === "paid" && row.paymentMode ? (
                <Text fontSize="xs" color="#7A6258" textTransform="uppercase">
                  {row.paymentMode}
                </Text>
              ) : null}
            </VStack>
          )
        },
        {
          key: "staff",
          header: "Staff",
          render: (row: GamingBookingRow) => row.staffName || row.staffUsername || "-"
        }
      ] as Array<{ key: string; header: string; render?: (row: GamingBookingRow) => ReactNode }>,
    []
  );

  if (user?.role !== UserRole.ADMIN) {
    return (
      <VStack spacing={6} align="stretch">
        <PageHeader title="Gaming" subtitle="This module is restricted to admin users." />
        <AppCard>
          <EmptyState title="Unauthorized" description="Only admin users can access gaming operations." />
        </AppCard>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Gaming Management"
        subtitle="Admin view-only dashboard for snooker and console sessions, collections, and occupancy."
      />

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4}>
        <StatsCard
          label="Current Active Sessions"
          value={statsLoading ? "..." : String(stats.totals.ongoing)}
          helper={`${stats.totals.activePlayers} active players`}
        />
        <StatsCard
          label="Upcoming Bookings"
          value={statsLoading ? "..." : String(stats.totals.upcoming)}
          helper={`${stats.totals.endingSoon} ending soon`}
        />
        <StatsCard
          label="Total Revenue"
          value={statsLoading ? "..." : formatCurrency(stats.totals.totalRevenue)}
          helper={`${stats.totals.paidBookings} paid bookings`}
        />
        <StatsCard
          label="Pending Collection"
          value={statsLoading ? "..." : formatCurrency(stats.totals.pendingCollection)}
          helper={`${stats.totals.pendingPayments} payment pending`}
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4}>
        <StatsCard
          label="Snooker Sessions"
          value={statsLoading ? "..." : String(sessionSplit.snookerSessions)}
          helper={`${sessionSplit.snookerPlayers} active players | ${sessionSplit.snookerOccupied}/${sessionSplit.snookerTotal} tables occupied`}
        />
        <StatsCard
          label="Console Sessions"
          value={statsLoading ? "..." : String(sessionSplit.consoleSessions)}
          helper={`${sessionSplit.consolePlayers} active players | ${sessionSplit.consoleOccupied}/${sessionSplit.consoleTotal} consoles occupied`}
        />
        <StatsCard
          label="Snooker Occupancy"
          value={statsLoading ? "..." : `${sessionSplit.snookerOccupied}/${sessionSplit.snookerTotal}`}
          helper="Current board usage"
        />
        <StatsCard
          label="Console Occupancy"
          value={statsLoading ? "..." : `${sessionSplit.consoleOccupied}/${sessionSplit.consoleTotal}`}
          helper="Current console usage"
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
        <AppCard title="Session Status Mix" subtitle="Distribution of booking lifecycle statuses.">
          <Box h="290px">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPieData} dataKey="value" nameKey="name" innerRadius={68} outerRadius={105}>
                  {statusPieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </AppCard>

        <AppCard title="Top Revenue Slots" subtitle="Highest billed boards / consoles in selected range.">
          <Box h="290px">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.resourceUsage.slice(0, 8)}>
                <XAxis dataKey="resourceLabel" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#D97706" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </AppCard>
      </SimpleGrid>

      <AppCard title="Bookings" subtitle="Search and monitor gaming sessions. Admin actions are disabled (view only).">
        <VStack spacing={4} align="stretch">
          <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
            <AppInput
              label="Search"
              placeholder="Booking / customer / phone / slot"
              value={search}
              onChange={(event) =>
                setSearch((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)
              }
            />
            <FormControl>
              <FormLabel>Booking Type</FormLabel>
              <Select value={bookingType} onChange={(event) => setBookingType(event.target.value as typeof bookingType)}>
                <option value="all">All Types</option>
                <option value="snooker">Snooker</option>
                <option value="console">Console</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Status</FormLabel>
              <Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                <option value="all">All Status</option>
                <option value="ongoing">Ongoing</option>
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Payment</FormLabel>
              <Select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as typeof paymentStatus)}>
                <option value="all">All Payments</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
              </Select>
            </FormControl>
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
            <FormControl>
              <FormLabel>Slot</FormLabel>
              <Select value={resourceCode} onChange={(event) => setResourceCode(event.target.value)}>
                <option value="">All Slots</option>
                {resources.map((resource) => (
                  <option key={resource.resourceCode} value={resource.resourceCode}>
                    {resource.resourceLabel}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Records per page</FormLabel>
              <Select
                value={String(limit)}
                onChange={(event) => {
                  setLimit(Number(event.target.value) || 8);
                  setPage(1);
                }}
              >
                <option value="8">8</option>
                <option value="12">12</option>
                <option value="20">20</option>
              </Select>
            </FormControl>
          </SimpleGrid>

          <HStack justify="space-between" flexWrap="wrap" gap={3}>
            <HStack spacing={2} flexWrap="wrap">
              {resources.map((resource) => (
                <Badge
                  key={`slot-${resource.resourceCode}`}
                  colorScheme={resource.isAvailable ? "green" : "orange"}
                  px={3}
                  py={1}
                  borderRadius="full"
                  textTransform="none"
                >
                  {resource.resourceLabel} | {resource.isAvailable ? "Free" : "Occupied"}
                </Badge>
              ))}
            </HStack>
            <AppButton variant="outline" onClick={() => void refreshAll()}>
              Refresh
            </AppButton>
          </HStack>

          {tableLoading ? (
            <SkeletonTable />
          ) : (
            <DataTable
              columns={columns}
              rows={bookings}
              emptyState={<EmptyState title="No bookings found" description="No gaming sessions for selected filters." />}
            />
          )}

          <HStack justify="space-between" flexWrap="wrap" gap={3}>
            <Text color="#705B52" fontSize="sm">
              Showing {bookings.length} of {total} records
            </Text>
            <HStack>
              <AppButton variant="outline" isDisabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Previous
              </AppButton>
              <Text fontWeight={700}>
                Page {page} of {totalPages}
              </Text>
              <AppButton
                variant="outline"
                isDisabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </AppButton>
            </HStack>
          </HStack>
        </VStack>
      </AppCard>
    </VStack>
  );
};