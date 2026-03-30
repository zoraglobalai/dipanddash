import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  Select,
  SimpleGrid,
  Text,
  Textarea,
  VStack,
  useDisclosure
} from "@chakra-ui/react";
import { Ban, Eye, Printer, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
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
import { InvoiceBillPreviewModal } from "@/features/invoices/components/InvoiceBillPreviewModal";
import { useAppToast } from "@/hooks/useAppToast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { invoicesService } from "@/services/invoices.service";
import type {
  InvoiceActivityRow,
  InvoiceDetail,
  InvoiceLineRow,
  InvoiceListRow,
  InvoicePagination,
  InvoicePaymentMode,
  InvoicePaymentRow,
  InvoiceStats,
  InvoiceStatus,
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

const defaultStats: InvoiceStats = {
  totalInvoices: 0,
  statusBreakdown: {
    paid: 0,
    pending: 0,
    cancelled: 0,
    refunded: 0
  },
  paymentModeBreakdown: {
    cash: 0,
    card: 0,
    upi: 0,
    mixed: 0
  },
  totals: {
    grossAmount: 0,
    discountAmount: 0,
    taxAmount: 0
  }
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const formatDateTime = (value: string) => new Date(value).toLocaleString("en-IN");

const statusStyleMap: Record<InvoiceStatus, { bg: string; color: string; label: string }> = {
  paid: { bg: "green.100", color: "green.700", label: "Paid" },
  pending: { bg: "orange.100", color: "orange.700", label: "Pending" },
  cancelled: { bg: "red.100", color: "red.700", label: "Cancelled" },
  refunded: { bg: "purple.100", color: "purple.700", label: "Refunded" }
};

export const InvoicesPage = () => {
  const { user } = useAuth();
  const toast = useAppToast();

  const [stats, setStats] = useState<InvoiceStats>(defaultStats);
  const [statsLoading, setStatsLoading] = useState(true);

  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [pagination, setPagination] = useState<InvoicePagination>(defaultPagination);
  const [tableLoading, setTableLoading] = useState(true);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [paymentModeFilter, setPaymentModeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<InvoiceListRow | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [selectedLines, setSelectedLines] = useState<InvoiceLineRow[]>([]);
  const [selectedPayments, setSelectedPayments] = useState<InvoicePaymentRow[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<InvoiceActivityRow[]>([]);
  const [selectedUsageEvents, setSelectedUsageEvents] = useState<InvoiceUsageEventRow[]>([]);
  const [billPreviewInvoice, setBillPreviewInvoice] = useState<InvoiceDetail | null>(null);
  const [billPreviewLines, setBillPreviewLines] = useState<InvoiceLineRow[]>([]);
  const [billPreviewLoading, setBillPreviewLoading] = useState(false);
  const [rowActionLoading, setRowActionLoading] = useState<Record<string, boolean>>({});

  const [dialogReason, setDialogReason] = useState("");
  const [mutationLoading, setMutationLoading] = useState(false);

  const detailsModal = useDisclosure();
  const billModal = useDisclosure();
  const cancelDialog = useDisclosure();
  const refundDialog = useDisclosure();

  const runRowAction = useCallback(async (key: string, action: () => Promise<void>) => {
    setRowActionLoading((previous) => ({ ...previous, [key]: true }));
    try {
      await action();
    } finally {
      setRowActionLoading((previous) => ({ ...previous, [key]: false }));
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await invoicesService.getStats();
      setStats(response.data);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch invoice stats."));
    } finally {
      setStatsLoading(false);
    }
  }, [toast]);

  const fetchInvoices = useCallback(async () => {
    setTableLoading(true);
    try {
      const response = await invoicesService.getInvoices({
        search: debouncedSearch || undefined,
        status: "paid",
        paymentMode: (paymentModeFilter || undefined) as InvoicePaymentMode | undefined,
        page,
        limit
      });
      setRows(response.data.invoices);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch invoices."));
    } finally {
      setTableLoading(false);
    }
  }, [debouncedSearch, limit, page, paymentModeFilter, toast]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, paymentModeFilter, limit]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchInvoices()]);
  }, [fetchInvoices, fetchStats]);

  const openDetails = useCallback(
    async (row: InvoiceListRow) => {
      setSelectedRow(row);
      setDetailsLoading(true);
      detailsModal.onOpen();
      try {
        const response = await invoicesService.getInvoice(row.id);
        setSelectedInvoice(response.data.invoice);
        setSelectedLines(response.data.lines);
        setSelectedPayments(response.data.payments);
        setSelectedActivities(response.data.activities);
        setSelectedUsageEvents(response.data.usageEvents);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to fetch invoice details."));
      } finally {
        setDetailsLoading(false);
      }
    },
    [detailsModal, toast]
  );

  const onCloseDetails = useCallback(() => {
    detailsModal.onClose();
    setSelectedRow(null);
    setSelectedInvoice(null);
    setSelectedLines([]);
    setSelectedPayments([]);
    setSelectedActivities([]);
    setSelectedUsageEvents([]);
  }, [detailsModal]);

  const openBillPreview = useCallback(
    async (row: InvoiceListRow) => {
      setBillPreviewLoading(true);
      billModal.onOpen();
      try {
        const response = await invoicesService.getInvoice(row.id);
        setBillPreviewInvoice(response.data.invoice);
        setBillPreviewLines(response.data.lines);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to load bill preview."));
        billModal.onClose();
      } finally {
        setBillPreviewLoading(false);
      }
    },
    [billModal, toast]
  );

  const closeBillPreview = useCallback(() => {
    billModal.onClose();
    setBillPreviewInvoice(null);
    setBillPreviewLines([]);
  }, [billModal]);

  const performCancel = useCallback(async () => {
    if (!selectedRow) {
      return;
    }

    setMutationLoading(true);
    try {
      const response = await invoicesService.cancelInvoice(selectedRow.id, dialogReason || undefined);
      toast.success(response.message);
      cancelDialog.onClose();
      setDialogReason("");
      await refreshAll();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to cancel invoice."));
    } finally {
      setMutationLoading(false);
    }
  }, [cancelDialog, dialogReason, refreshAll, selectedRow, toast]);

  const performRefund = useCallback(async () => {
    if (!selectedRow) {
      return;
    }

    setMutationLoading(true);
    try {
      const response = await invoicesService.refundInvoice(selectedRow.id, dialogReason || undefined);
      toast.success(response.message);
      refundDialog.onClose();
      setDialogReason("");
      await refreshAll();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to refund invoice."));
    } finally {
      setMutationLoading(false);
    }
  }, [dialogReason, refreshAll, refundDialog, selectedRow, toast]);

  const columns = useMemo(
    () =>
      [
        { key: "invoiceNumber", header: "Invoice #" },
        {
          key: "customerName",
          header: "Customer",
          render: (row: InvoiceListRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.customerName ?? "Walk-in Customer"}</Text>
              <Text fontSize="xs" color="#7D655B">
                {row.customerPhone ?? "-"}
              </Text>
            </VStack>
          )
        },
        {
          key: "staffName",
          header: "Cashier",
          render: (row: InvoiceListRow) => row.staffName
        },
        {
          key: "paymentMode",
          header: "Payment",
          render: (row: InvoiceListRow) => row.paymentMode.toUpperCase()
        },
        {
          key: "status",
          header: "Status",
          render: (row: InvoiceListRow) => (
            <Box
              px={3}
              py={1}
              borderRadius="full"
              fontSize="xs"
              fontWeight={700}
              bg={statusStyleMap[row.status].bg}
              color={statusStyleMap[row.status].color}
              w="fit-content"
            >
              {statusStyleMap[row.status].label}
            </Box>
          )
        },
        {
          key: "totalAmount",
          header: "Total",
          render: (row: InvoiceListRow) => formatCurrency(row.totalAmount)
        },
        {
          key: "createdAt",
          header: "Created At",
          render: (row: InvoiceListRow) => formatDateTime(row.createdAt)
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: InvoiceListRow) => (
            <HStack spacing={2}>
              <ActionIconButton
                aria-label={`View invoice ${row.invoiceNumber}`}
                icon={<Eye size={16} />}
                size="sm"
                variant="outline"
                onClick={() => void openDetails(row)}
              />
              <ActionIconButton
                aria-label={`Print invoice ${row.invoiceNumber}`}
                icon={<Printer size={16} />}
                size="sm"
                variant="outline"
                onClick={() => void openBillPreview(row)}
              />
              <ActionIconButton
                aria-label={`Cancel invoice ${row.invoiceNumber}`}
                icon={<Ban size={16} />}
                size="sm"
                variant="outline"
                isDisabled={row.status === "cancelled" || row.status === "refunded"}
                isLoading={Boolean(rowActionLoading[`cancel-${row.id}`])}
                onClick={() => {
                  setSelectedRow(row);
                  setDialogReason("");
                  cancelDialog.onOpen();
                }}
              />
              <ActionIconButton
                aria-label={`Refund invoice ${row.invoiceNumber}`}
                icon={<RotateCcw size={16} />}
                size="sm"
                variant="outline"
                isDisabled={row.status === "refunded"}
                isLoading={Boolean(rowActionLoading[`refund-${row.id}`])}
                onClick={() => {
                  setSelectedRow(row);
                  setDialogReason("");
                  refundDialog.onOpen();
                }}
              />
            </HStack>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: InvoiceListRow) => ReactNode }>,
    [cancelDialog, openBillPreview, openDetails, refundDialog, rowActionLoading]
  );

  if (user?.role !== UserRole.ADMIN) {
    return (
      <VStack spacing={6} align="stretch">
        <PageHeader title="Invoices" subtitle="This module is restricted to admin users." />
        <AppCard>
          <EmptyState title="Unauthorized" description="Only admin users can access invoices." />
        </AppCard>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Invoices"
        subtitle="Monitor paid invoices only. Pending kitchen orders are available in the Orders module."
      />

      <SimpleGrid columns={{ base: 1, md: 3, xl: 6 }} spacing={4}>
        {[
          { label: "Total Invoices", value: stats.totalInvoices },
          { label: "Paid", value: stats.statusBreakdown.paid },
          { label: "Pending", value: stats.statusBreakdown.pending },
          { label: "Cancelled", value: stats.statusBreakdown.cancelled },
          { label: "Refunded", value: stats.statusBreakdown.refunded },
          { label: "Gross Amount", value: formatCurrency(stats.totals.grossAmount) }
        ].map((card) => (
          <AppCard key={card.label}>
            <Text fontSize="sm" color="#705B52">
              {card.label}
            </Text>
            <Text fontWeight={800} fontSize="2xl">
              {statsLoading ? "..." : card.value}
            </Text>
          </AppCard>
        ))}
      </SimpleGrid>

      <AppCard>
        <VStack spacing={4} align="stretch">
          <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
            <AppInput
              label="Search"
              placeholder="Invoice no, customer, staff"
              value={search}
              onChange={(event) =>
                setSearch(
                  (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
                )
              }
            />
            <FormControl>
              <FormLabel>Payment Mode</FormLabel>
              <Select
                value={paymentModeFilter}
                onChange={(event) =>
                  setPaymentModeFilter(
                    (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
                  )
                }
              >
                <option value="">All Modes</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="mixed">Mixed</option>
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
                <EmptyState title="No invoices found" description="POS invoices will appear here after sync." />
              }
            />
          )}

          <HStack justify="space-between">
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
        isOpen={detailsModal.isOpen}
        onClose={onCloseDetails}
        loading={detailsLoading}
        invoice={selectedInvoice}
        lines={selectedLines}
        payments={selectedPayments}
        activities={selectedActivities}
        usageEvents={selectedUsageEvents}
      />

      <InvoiceBillPreviewModal
        isOpen={billModal.isOpen}
        onClose={closeBillPreview}
        invoice={billPreviewInvoice}
        lines={billPreviewLines}
        loading={billPreviewLoading}
      />

      <ConfirmDialog
        isOpen={cancelDialog.isOpen}
        onClose={cancelDialog.onClose}
        title={`Cancel ${selectedRow?.invoiceNumber ?? "invoice"}?`}
        description="This action will mark the invoice as cancelled. Please confirm."
        isLoading={mutationLoading}
        onConfirm={() =>
          void runRowAction(`cancel-${selectedRow?.id ?? "unknown"}`, async () => {
            await performCancel();
          })
        }
      >
        <Textarea
          value={dialogReason}
          onChange={(event) => setDialogReason(event.target.value)}
          placeholder="Add an optional reason for audit trail"
        />
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={refundDialog.isOpen}
        onClose={refundDialog.onClose}
        title={`Refund ${selectedRow?.invoiceNumber ?? "invoice"}?`}
        description="This action will mark the invoice as refunded. Please confirm."
        isLoading={mutationLoading}
        onConfirm={() =>
          void runRowAction(`refund-${selectedRow?.id ?? "unknown"}`, async () => {
            await performRefund();
          })
        }
      >
        <Textarea
          value={dialogReason}
          onChange={(event) => setDialogReason(event.target.value)}
          placeholder="Add an optional reason for audit trail"
        />
      </ConfirmDialog>
    </VStack>
  );
};
