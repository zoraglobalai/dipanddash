import { Box, FormControl, FormLabel, HStack, Select, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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
import { customersService } from "@/services/customers.service";
import type { CustomerListRow, CustomerPagination, CustomerStats } from "@/types/customer";
import { UserRole } from "@/types/role";
import { extractErrorMessage } from "@/utils/api-error";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const defaultPagination: CustomerPagination = {
  page: 1,
  limit: 5,
  total: 0,
  totalPages: 1
};

const emptyStats: CustomerStats = {
  totalCustomers: 0,
  activeCustomers: 0,
  newCustomersThisMonth: 0,
  customersWithOrders: 0,
  repeatCustomers: 0,
  paidInvoices: 0,
  totalRevenue: 0,
  averageOrderValue: 0,
  topCustomers: []
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
    position="relative"
    overflow="hidden"
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

export const CustomerDataPage = () => {
  const { user } = useAuth();
  const toast = useAppToast();
  const [stats, setStats] = useState<CustomerStats>(emptyStats);
  const [statsLoading, setStatsLoading] = useState(true);

  const [rows, setRows] = useState<CustomerListRow[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [pagination, setPagination] = useState<CustomerPagination>(defaultPagination);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await customersService.getStats();
      setStats(response.data);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch customer stats."));
    } finally {
      setStatsLoading(false);
    }
  }, [toast]);

  const fetchCustomers = useCallback(async () => {
    setTableLoading(true);
    try {
      const response = await customersService.getCustomers({
        search: debouncedSearch || undefined,
        page,
        limit
      });
      setRows(response.data.customers);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch customers."));
    } finally {
      setTableLoading(false);
    }
  }, [debouncedSearch, limit, page, toast]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchCustomers()]);
  }, [fetchCustomers, fetchStats]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, limit]);

  const columns = useMemo(
    () =>
      [
        {
          key: "name",
          header: "Customer",
          render: (row: CustomerListRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.name}</Text>
              <Text fontSize="xs" color="#7A6258">
                {row.phone}
              </Text>
            </VStack>
          )
        },
        {
          key: "invoiceCount",
          header: "Orders",
          render: (row: CustomerListRow) => row.invoiceCount
        },
        {
          key: "totalSpent",
          header: "Total Spent",
          render: (row: CustomerListRow) => formatCurrency(row.totalSpent)
        },
        {
          key: "lastInvoiceAt",
          header: "Last Order",
          render: (row: CustomerListRow) =>
            row.lastInvoiceAt ? new Date(row.lastInvoiceAt).toLocaleString("en-IN") : "-"
        },
        {
          key: "status",
          header: "Status",
          render: (row: CustomerListRow) => (
            <Box
              px={3}
              py={1}
              borderRadius="full"
              fontSize="xs"
              fontWeight={700}
              bg={row.isActive ? "green.100" : "gray.200"}
              color={row.isActive ? "green.700" : "gray.700"}
              w="fit-content"
            >
              {row.isActive ? "Active" : "Inactive"}
            </Box>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: CustomerListRow) => ReactNode }>,
    []
  );

  if (user?.role !== UserRole.ADMIN) {
    return (
      <VStack spacing={6} align="stretch">
        <PageHeader title="Customer Data" subtitle="This module is restricted to admin users." />
        <AppCard>
          <EmptyState title="Unauthorized" description="Only admin users can access customer analytics." />
        </AppCard>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Customer Data"
        subtitle="Track customer purchase behavior, repeat ratio, and revenue contribution."
      />

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4}>
        <StatsCard label="Total Customers" value={statsLoading ? "..." : String(stats.totalCustomers)} />
        <StatsCard
          label="Customers With Orders"
          value={statsLoading ? "..." : String(stats.customersWithOrders)}
          helper={`${stats.repeatCustomers} repeat customers`}
        />
        <StatsCard
          label="Revenue"
          value={statsLoading ? "..." : formatCurrency(stats.totalRevenue)}
          helper={`${stats.paidInvoices} paid invoices`}
        />
        <StatsCard
          label="Average Order Value"
          value={statsLoading ? "..." : formatCurrency(stats.averageOrderValue)}
          helper={`${stats.newCustomersThisMonth} new this month`}
        />
      </SimpleGrid>

      <AppCard>
        <VStack spacing={4} align="stretch">
          <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
            <AppInput
              label="Search"
              placeholder="Customer name / phone"
              value={search}
              onChange={(event) =>
                setSearch(
                  (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
                )
              }
            />
            <FormControl>
              <FormLabel>Records per page</FormLabel>
              <Select
                value={String(limit)}
                onChange={(event) => {
                  const nextLimit =
                    Number(
                      (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
                    ) || 5;
                  setLimit(nextLimit);
                  setPage(1);
                }}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </Select>
            </FormControl>
            <Box />
            <Box alignSelf="end">
              <AppButton variant="outline" onClick={() => void refreshAll()}>
                Refresh
              </AppButton>
            </Box>
          </SimpleGrid>

          {tableLoading ? (
            <SkeletonTable />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              emptyState={
                <EmptyState title="No customers found" description="Customers will appear after POS billing sync." />
              }
            />
          )}

          <HStack justify="space-between" flexWrap="wrap" gap={3}>
            <Text color="#705B52" fontSize="sm">
              Showing {rows.length} of {pagination.total} records
            </Text>
            <HStack>
              <AppButton variant="outline" isDisabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </AppButton>
              <Text fontWeight={700}>
                Page {pagination.page} of {pagination.totalPages}
              </Text>
              <AppButton
                variant="outline"
                isDisabled={page >= pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </AppButton>
            </HStack>
          </HStack>
        </VStack>
      </AppCard>

      <AppCard title="Top Customers" subtitle="Highest revenue contribution from paid invoices.">
        {stats.topCustomers.length ? (
          <DataTable
            columns={[
              { key: "name", header: "Name" },
              { key: "phone", header: "Phone" },
              { key: "invoiceCount", header: "Orders" },
              {
                key: "totalSpent",
                header: "Revenue",
                render: (row: CustomerStats["topCustomers"][number]) => formatCurrency(row.totalSpent)
              },
              {
                key: "lastInvoiceAt",
                header: "Last Order",
                render: (row: CustomerStats["topCustomers"][number]) =>
                  row.lastInvoiceAt ? new Date(row.lastInvoiceAt).toLocaleString("en-IN") : "-"
              }
            ]}
            rows={stats.topCustomers}
          />
        ) : (
          <EmptyState
            title="No customer revenue data"
            description="Once paid invoices sync, top customers will be visible here."
          />
        )}
      </AppCard>
    </VStack>
  );
};
