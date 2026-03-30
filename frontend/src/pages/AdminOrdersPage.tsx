import { Box, FormControl, FormLabel, HStack, Select, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { Eye } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { DataTable } from "@/components/ui/DataTable";
import { useAuth } from "@/context/AuthContext";
import { InvoiceDetailsModal } from "@/features/invoices/components/InvoiceDetailsModal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAppToast } from "@/hooks/useAppToast";
import { invoicesService } from "@/services/invoices.service";
import type {
  InvoiceActivityRow,
  InvoiceDetail,
  InvoiceKitchenStatus,
  InvoiceLineRow,
  InvoiceListRow,
  InvoicePagination,
  InvoicePaymentRow,
  InvoiceUsageEventRow
} from "@/types/invoice";
import { UserRole } from "@/types/role";
import { extractErrorMessage } from "@/utils/api-error";

const defaultPagination: InvoicePagination = {
  page: 1,
  limit: 5,
  total: 0,
  totalPages: 1
};

const kitchenStatusOptions: Array<{ label: string; value: InvoiceKitchenStatus }> = [
  { label: "Queued", value: "queued" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready" },
  { label: "Served", value: "served" }
];

export const AdminOrdersPage = () => {
  const { user } = useAuth();
  const toast = useAppToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [kitchenStatusFilter, setKitchenStatusFilter] = useState<InvoiceKitchenStatus | "">("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [pagination, setPagination] = useState<InvoicePagination>(defaultPagination);
  const [statusDraft, setStatusDraft] = useState<Record<string, InvoiceKitchenStatus>>({});

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [selectedLines, setSelectedLines] = useState<InvoiceLineRow[]>([]);
  const [selectedPayments, setSelectedPayments] = useState<InvoicePaymentRow[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<InvoiceActivityRow[]>([]);
  const [selectedUsageEvents, setSelectedUsageEvents] = useState<InvoiceUsageEventRow[]>([]);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await invoicesService.getInvoices({
        status: "pending",
        kitchenStatus: kitchenStatusFilter || undefined,
        search: debouncedSearch || undefined,
        page,
        limit
      });
      setRows(response.data.invoices);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch orders."));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, kitchenStatusFilter, limit, page, toast]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, kitchenStatusFilter, limit]);

  const openDetails = useCallback(
    async (row: InvoiceListRow) => {
      setDetailsLoading(true);
      setIsDetailsOpen(true);
      try {
        const response = await invoicesService.getInvoice(row.id);
        setSelectedInvoice(response.data.invoice);
        setSelectedLines(response.data.lines);
        setSelectedPayments(response.data.payments);
        setSelectedActivities(response.data.activities);
        setSelectedUsageEvents(response.data.usageEvents);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to fetch order details."));
      } finally {
        setDetailsLoading(false);
      }
    },
    [toast]
  );

  const updateKitchenStatus = useCallback(
    async (row: InvoiceListRow) => {
      const nextStatus = statusDraft[row.id] ?? row.kitchenStatus;
      try {
        const response = await invoicesService.updateKitchenStatus(row.id, nextStatus);
        toast.success(response.message);
        await fetchOrders();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to update kitchen status."));
      }
    },
    [fetchOrders, statusDraft, toast]
  );

  const columns = useMemo(
    () =>
      [
        { key: "invoiceNumber", header: "Invoice" },
        {
          key: "customer",
          header: "Customer",
          render: (row: InvoiceListRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.customerName ?? "Walk-in"}</Text>
              <Text fontSize="xs" color="#7A6258">
                {row.customerPhone ?? "-"}
              </Text>
            </VStack>
          )
        },
        {
          key: "orderType",
          header: "Order Type",
          render: (row: InvoiceListRow) => (
            <Text textTransform="capitalize">{row.orderType.replace("_", " ")}</Text>
          )
        },
        {
          key: "tableLabel",
          header: "Table",
          render: (row: InvoiceListRow) => row.tableLabel ?? "-"
        },
        {
          key: "kitchenStatus",
          header: "Kitchen Status",
          render: (row: InvoiceListRow) => (
            <HStack>
              <Select
                size="sm"
                value={statusDraft[row.id] ?? row.kitchenStatus}
                onChange={(event) =>
                  setStatusDraft((previous) => ({
                    ...previous,
                    [row.id]: event.target.value as InvoiceKitchenStatus
                  }))
                }
              >
                {kitchenStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <AppButton size="sm" variant="outline" onClick={() => void updateKitchenStatus(row)}>
                Save
              </AppButton>
            </HStack>
          )
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: InvoiceListRow) => (
            <ActionIconButton
              aria-label={`View order ${row.invoiceNumber}`}
              icon={<Eye size={16} />}
              size="sm"
              variant="outline"
              onClick={() => void openDetails(row)}
            />
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: InvoiceListRow) => ReactNode }>,
    [openDetails, statusDraft, updateKitchenStatus]
  );

  if (user?.role !== UserRole.ADMIN) {
    return (
      <VStack spacing={6} align="stretch">
        <PageHeader title="Orders" subtitle="This module is restricted to admin users." />
        <AppCard>
          <EmptyState title="Unauthorized" description="Only admin users can access order board." />
        </AppCard>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader title="Orders" subtitle="Track pending kitchen orders and monitor fulfillment status." />

      <AppCard>
        <VStack align="stretch" spacing={4}>
          <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
            <AppInput
              label="Search"
              placeholder="Invoice / customer / phone"
              value={search}
              onChange={(event) =>
                setSearch(
                  (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
                )
              }
            />
            <FormControl>
              <FormLabel>Kitchen Status</FormLabel>
              <Select
                value={kitchenStatusFilter}
                onChange={(event) =>
                  setKitchenStatusFilter(
                    (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
                      .value as InvoiceKitchenStatus | ""
                  )
                }
              >
                <option value="">All</option>
                {kitchenStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormControl>
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
            <Box alignSelf="end">
              <AppButton variant="outline" onClick={() => void fetchOrders()}>
                Refresh
              </AppButton>
            </Box>
          </SimpleGrid>

          {loading ? (
            <SkeletonTable />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              emptyState={<EmptyState title="No pending orders" description="Kitchen queue is clear right now." />}
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

      <InvoiceDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false);
          setSelectedInvoice(null);
          setSelectedLines([]);
          setSelectedPayments([]);
          setSelectedActivities([]);
          setSelectedUsageEvents([]);
        }}
        loading={detailsLoading}
        invoice={selectedInvoice}
        lines={selectedLines}
        payments={selectedPayments}
        activities={selectedActivities}
        usageEvents={selectedUsageEvents}
      />
    </VStack>
  );
};
