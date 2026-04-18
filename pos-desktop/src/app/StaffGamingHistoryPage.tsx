import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Text,
  VStack,
  useToast
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";

import { PosDataTable, type PosTableColumn } from "@/components/common/PosDataTable";
import { gamingBookingsService } from "@/services/gaming-bookings.service";
import type { GamingBooking } from "@/types/pos";
import { formatINR } from "@/utils/currency";

const toLocalDateKey = (isoDate: string) => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleString("en-IN");
};

const getRowTotal = (row: GamingBooking) => (row.status === "completed" ? row.finalAmount : row.systemCalculatedAmount);

export const StaffGamingHistoryPage = () => {
  const toast = useToast();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "paid" | "pending">("all");
  const [rows, setRows] = useState<GamingBooking[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const rowsPerPage = 10;

  const loadRows = useCallback(
    async (forceServerSync = false) => {
      setLoading(true);
      try {
        const result = await gamingBookingsService.listBookings(
          {
            paymentStatus: paymentFilter
          },
          5000,
          { forceServerSync }
        );
        setRows(result);
      } catch (error) {
        toast({
          status: "error",
          title: "Unable to load booking history",
          description: error instanceof Error ? error.message : "Please retry."
        });
      } finally {
        setLoading(false);
      }
    },
    [paymentFilter, toast]
  );

  useEffect(() => {
    void loadRows(false);
  }, [loadRows]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, paymentFilter, search]);

  const filteredRows = useMemo(
    () => {
      const normalizedSearch = search.trim().toLowerCase();
      return rows
        .filter((row) => {
          const dayKey = toLocalDateKey(row.checkInAt);
          if (!dayKey) {
            return false;
          }
          if (dateFrom && dayKey < dateFrom) {
            return false;
          }
          if (dateTo && dayKey > dateTo) {
            return false;
          }
          return true;
        })
        .filter((row) => {
          if (!normalizedSearch) {
            return true;
          }
          return (
            row.bookingNumber.toLowerCase().includes(normalizedSearch) ||
            row.primaryCustomerName.toLowerCase().includes(normalizedSearch) ||
            row.primaryCustomerPhone.toLowerCase().includes(normalizedSearch) ||
            row.resourceLabel.toLowerCase().includes(normalizedSearch)
          );
        })
        .sort((left, right) => right.checkInAt.localeCompare(left.checkInAt));
    },
    [dateFrom, dateTo, rows, search]
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredRows.length / rowsPerPage)), [filteredRows.length]);

  const pagedRows = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, totalPages]);

  const summary = useMemo(() => {
    const paidRows = filteredRows.filter((row) => row.paymentStatus === "paid");
    const pendingRows = filteredRows.filter((row) => row.paymentStatus === "pending");
    const totalAmount = filteredRows.reduce((sum, row) => sum + getRowTotal(row), 0);
    const pendingAmount = pendingRows.reduce((sum, row) => sum + getRowTotal(row), 0);
    return {
      totalRecords: filteredRows.length,
      paidRecords: paidRows.length,
      pendingRecords: pendingRows.length,
      totalAmount,
      pendingAmount
    };
  }, [filteredRows]);

  const columns = useMemo<PosTableColumn<GamingBooking>[]>(
    () => [
      {
        key: "booking",
        header: "Booking",
        alwaysVisible: true,
        render: (row) => (
          <VStack align="start" spacing={0}>
            <Text fontWeight={800}>{row.bookingNumber}</Text>
            <Text fontSize="xs" color="#705A50" textTransform="capitalize">
              {row.bookingType}
            </Text>
          </VStack>
        )
      },
      {
        key: "customer",
        header: "Customer",
        alwaysVisible: true,
        render: (row) => (
          <VStack align="start" spacing={0}>
            <Text fontWeight={700}>{row.primaryCustomerName}</Text>
            <Text fontSize="xs" color="#705A50">
              {row.primaryCustomerPhone}
            </Text>
          </VStack>
        )
      },
      {
        key: "resource",
        header: "Board / Console",
        render: (row) => row.resourceLabel
      },
      {
        key: "timing",
        header: "Check In / Out",
        render: (row) => (
          <VStack align="start" spacing={0}>
            <Text>{formatDateTime(row.checkInAt)}</Text>
            <Text fontSize="xs" color="#705A50">
              Out: {formatDateTime(row.checkOutAt)}
            </Text>
          </VStack>
        )
      },
      {
        key: "players",
        header: "Players",
        render: (row) => row.playerCount
      },
      {
        key: "products",
        header: "Product Sales",
        render: (row) => (
          <VStack align="start" spacing={1}>
            <Text fontWeight={700}>{formatINR(row.foodAndBeverageAmount ?? 0)}</Text>
            <Text fontSize="xs" color="#705A50">
              {row.foodInvoiceNumber ?? row.foodInvoiceStatus}
            </Text>
          </VStack>
        )
      },
      {
        key: "amount",
        header: "Amount",
        render: (row) => <Text fontWeight={800}>{formatINR(getRowTotal(row))}</Text>
      },
      {
        key: "payment",
        header: "Payment",
        alwaysVisible: true,
        render: (row) => (
          <VStack align="start" spacing={1}>
            <Badge colorScheme={row.paymentStatus === "paid" ? "green" : "orange"} textTransform="capitalize">
              {row.paymentStatus}
            </Badge>
            <Text fontSize="xs" color="#705A50" textTransform="uppercase">
              {row.paymentMode ?? "-"}
            </Text>
          </VStack>
        )
      }
    ],
    []
  );

  return (
    <VStack align="stretch" spacing={4}>
      <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
          <FormControl>
            <FormLabel>Date From</FormLabel>
            <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} />
          </FormControl>
          <FormControl>
            <FormLabel>Date To</FormLabel>
            <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} />
          </FormControl>
          <FormControl>
            <FormLabel>Search</FormLabel>
            <Input
              placeholder="Booking / customer / phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Payment</FormLabel>
            <Select
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value as "all" | "paid" | "pending")}
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </Select>
          </FormControl>
          <Box display="flex" alignItems="end">
            <Button
              leftIcon={<FiRefreshCw size={14} />}
              w={{ base: "full", xl: "auto" }}
              onClick={() => void loadRows(true)}
            >
              Refresh
            </Button>
          </Box>
        </SimpleGrid>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={3}>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
          <Text fontSize="sm" color="#705A50">Total Records</Text>
          <Text fontSize="2xl" fontWeight={900}>{summary.totalRecords}</Text>
        </Box>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
          <Text fontSize="sm" color="#705A50">Paid Records</Text>
          <Text fontSize="2xl" fontWeight={900}>{summary.paidRecords}</Text>
        </Box>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
          <Text fontSize="sm" color="#705A50">Pending Records</Text>
          <Text fontSize="2xl" fontWeight={900}>{summary.pendingRecords}</Text>
        </Box>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
          <Text fontSize="sm" color="#705A50">Total Amount</Text>
          <Text fontSize="2xl" fontWeight={900}>{formatINR(summary.totalAmount)}</Text>
        </Box>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
          <Text fontSize="sm" color="#705A50">Pending Amount</Text>
          <Text fontSize="2xl" fontWeight={900}>{formatINR(summary.pendingAmount)}</Text>
        </Box>
      </SimpleGrid>

      <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
        <PosDataTable
          rows={pagedRows}
          columns={columns}
          getRowId={(row) => row.localBookingId}
          emptyMessage="No bookings found for selected date."
          loading={loading}
          maxColumns={8}
        />
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mt={3} alignItems="center">
          <Text color="#705A50" fontSize="sm">
            Showing {(filteredRows.length ? (Math.min(page, totalPages) - 1) * rowsPerPage + 1 : 0)}-
            {Math.min(Math.min(page, totalPages) * rowsPerPage, filteredRows.length)} of {filteredRows.length}
          </Text>
          <HStack justify={{ base: "flex-start", md: "center" }}>
            <Button size="sm" variant="outline" isDisabled={Math.min(page, totalPages) <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
              Previous
            </Button>
            <Text fontWeight={700} fontSize="sm">
              Page {Math.min(page, totalPages)} of {totalPages}
            </Text>
            <Button
              size="sm"
              variant="outline"
              isDisabled={Math.min(page, totalPages) >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </Button>
          </HStack>
          <Box />
        </SimpleGrid>
      </Box>
    </VStack>
  );
};
