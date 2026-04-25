import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Text,
  Textarea,
  VStack
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { DataTable } from "@/components/ui/DataTable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAppToast } from "@/hooks/useAppToast";
import { gamingService } from "@/services/gaming.service";
import { invoicesService } from "@/services/invoices.service";
import { pendingService } from "@/services/pending.service";
import type { GamingBookingRow } from "@/types/gaming";
import type { InvoiceDetail, InvoiceKitchenStatus, InvoiceLineRow, InvoiceOrderType, InvoicePaymentRow } from "@/types/invoice";
import type {
  PendingCustomerDetails,
  PendingCustomerSummary,
  PendingDocument,
  PendingPaymentHistoryEntry,
  PendingScope
} from "@/types/pending";
import { extractErrorMessage } from "@/utils/api-error";
import { createDraftId } from "@/utils/invoice-billing";

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
    return "-";
  }
  return parsed.toLocaleString("en-IN");
};

const emptyDetails: PendingCustomerDetails = {
  summary: {
    customerName: "",
    customerPhone: "",
    totalPendingAmount: 0,
    pendingDocuments: 0
  },
  pendingDocuments: [],
  paymentHistory: []
};

type CollectState = {
  sourceType: PendingDocument["sourceType"];
  sourceId: string;
  sourceNumber: string;
  pendingAmount: number;
};

type DeleteState = {
  sourceType: PendingDocument["sourceType"];
  sourceId: string;
  sourceNumber: string;
};

type EditState = {
  sourceType: PendingDocument["sourceType"];
  sourceId: string;
  sourceNumber: string;
};

type ScopeOption = {
  value: Exclude<PendingScope, "all">;
  label: string;
  subtitle: string;
};

const scopeOptions: ScopeOption[] = [
  {
    value: "dip_and_dash",
    label: "Dip & Dash",
    subtitle: "Food orders pending"
  },
  {
    value: "snooker",
    label: "Snooker",
    subtitle: "Gaming pending"
  }
];

const roundMoney = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

const StatsCard = ({ label, value, helper }: { label: string; value: string; helper?: string }) => (
  <Box
    p={4}
    borderRadius="18px"
    border="1px solid"
    borderColor="rgba(133, 78, 48, 0.24)"
    bg="linear-gradient(180deg, #FFFFFF 0%, #FFF7EA 100%)"
    boxShadow="0 10px 18px rgba(72, 29, 11, 0.08)"
    minH="114px"
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

export const PendingCollectionsPage = () => {
  const toast = useAppToast();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [scope, setScope] = useState<Exclude<PendingScope, "all">>("dip_and_dash");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendingCustomerSummary[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  });
  const [totals, setTotals] = useState({
    pendingCustomers: 0,
    pendingDocuments: 0,
    pendingAmount: 0
  });

  const [selectedCustomer, setSelectedCustomer] = useState<PendingCustomerSummary | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<PendingCustomerDetails>(emptyDetails);

  const [collectState, setCollectState] = useState<CollectState | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMode, setCollectMode] = useState<"cash" | "card" | "upi" | "mixed">("cash");
  const [collectReference, setCollectReference] = useState("");
  const [collectCardReference, setCollectCardReference] = useState("");
  const [collectUpiReference, setCollectUpiReference] = useState("");
  const [collectCashAmount, setCollectCashAmount] = useState("");
  const [collectCardAmount, setCollectCardAmount] = useState("");
  const [collectUpiAmount, setCollectUpiAmount] = useState("");
  const [collectNote, setCollectNote] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [invoiceEditSource, setInvoiceEditSource] = useState<{
    invoice: InvoiceDetail;
    lines: InvoiceLineRow[];
    payments: InvoicePaymentRow[];
  } | null>(null);
  const [invoiceEditDraft, setInvoiceEditDraft] = useState<{
    orderType: InvoiceOrderType;
    tableLabel: string;
    kitchenStatus: InvoiceKitchenStatus;
    notes: string;
  }>({
    orderType: "takeaway",
    tableLabel: "",
    kitchenStatus: "not_sent",
    notes: ""
  });
  const [gamingEditSource, setGamingEditSource] = useState<GamingBookingRow | null>(null);
  const [gamingEditDraft, setGamingEditDraft] = useState<{
    bookingChannel: string;
    note: string;
  }>({
    bookingChannel: "",
    note: ""
  });

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await pendingService.listCustomers({
        search: debouncedSearch || undefined,
        page,
        limit,
        scope
      });
      setRows(response.data.customers);
      setPagination(response.data.pagination);
      setTotals(response.data.totals);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch pending customers."));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, limit, page, scope, toast]);

  const fetchCustomerDetails = useCallback(
    async (customer: PendingCustomerSummary) => {
      setDetailsLoading(true);
      try {
        const response = await pendingService.getCustomerDetails({
          phone: customer.customerPhone || undefined,
          name: customer.customerName || undefined,
          scope
        });
        setDetails(response.data);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to fetch pending details."));
      } finally {
        setDetailsLoading(false);
      }
    },
    [scope, toast]
  );

  const refreshAll = useCallback(async () => {
    await fetchCustomers();
    if (selectedCustomer) {
      await fetchCustomerDetails(selectedCustomer);
    }
  }, [fetchCustomerDetails, fetchCustomers, selectedCustomer]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    setPage(1);
    setSelectedCustomer(null);
    setDetails(emptyDetails);
  }, [debouncedSearch, limit, scope]);

  const openCollectModal = useCallback((row: PendingDocument) => {
    setCollectState({
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      sourceNumber: row.sourceNumber,
      pendingAmount: row.pendingAmount
    });
    setCollectAmount(String(row.pendingAmount));
    setCollectMode("cash");
    setCollectReference("");
    setCollectCardReference("");
    setCollectUpiReference("");
    setCollectCashAmount("");
    setCollectCardAmount("");
    setCollectUpiAmount("");
    setCollectNote("");
  }, []);

  const openEditModal = useCallback(
    async (row: PendingDocument) => {
      setEditState({
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        sourceNumber: row.sourceNumber
      });
      setEditLoading(true);
      setInvoiceEditSource(null);
      setGamingEditSource(null);
      try {
        if (row.sourceType === "invoice") {
          const response = await invoicesService.getInvoice(row.sourceId);
          const payload = response.data;
          setInvoiceEditSource({
            invoice: payload.invoice,
            lines: payload.lines,
            payments: payload.payments
          });
          setInvoiceEditDraft({
            orderType: payload.invoice.orderType,
            tableLabel: payload.invoice.tableLabel ?? "",
            kitchenStatus: payload.invoice.kitchenStatus,
            notes: payload.invoice.notes ?? ""
          });
          return;
        }

        const response = await gamingService.getBookings({
          search: row.sourceNumber,
          page: 1,
          limit: 20
        });
        const booking =
          response.data.bookings.find((entry) => entry.id === row.sourceId) ??
          response.data.bookings.find((entry) => entry.bookingNumber === row.sourceNumber) ??
          null;
        if (!booking) {
          throw new Error("Unable to find booking details.");
        }
        setGamingEditSource(booking);
        setGamingEditDraft({
          bookingChannel: booking.bookingChannel ?? "",
          note: booking.note ?? ""
        });
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to load document details for edit."));
        setEditState(null);
      } finally {
        setEditLoading(false);
      }
    },
    [toast]
  );

  const closeEditModal = useCallback(() => {
    if (editSaving) {
      return;
    }
    setEditState(null);
    setInvoiceEditSource(null);
    setGamingEditSource(null);
  }, [editSaving]);

  const submitEdit = useCallback(async () => {
    if (!editState) {
      return;
    }
    setEditSaving(true);
    try {
      if (editState.sourceType === "invoice") {
        if (!invoiceEditSource) {
          throw new Error("Invoice details are not loaded.");
        }
        const invoice = invoiceEditSource.invoice;
        const sourceWithSnapshots = invoice as InvoiceDetail & {
          customerSnapshot?: Record<string, unknown> | null;
          totalsSnapshot?: Record<string, unknown> | null;
          linesSnapshot?: Record<string, unknown> | null;
          sourceCreatedAt?: string | null;
        };
        const customerSnapshotFromSource =
          sourceWithSnapshots.customerSnapshot &&
          typeof sourceWithSnapshots.customerSnapshot === "object"
            ? sourceWithSnapshots.customerSnapshot
            : null;
        const customerSnapshot =
          customerSnapshotFromSource ??
          (invoice.customer !== null
            ? {
                name: invoice.customer.name,
                phone: invoice.customer.phone
              }
            : null);
        const customerPhone =
          typeof (customerSnapshot as { phone?: unknown } | null)?.phone === "string"
            ? ((customerSnapshot as { phone?: string }).phone ?? null)
            : invoice.customer?.phone ?? null;
        const customerName =
          typeof (customerSnapshot as { name?: unknown } | null)?.name === "string"
            ? ((customerSnapshot as { name?: string }).name ?? null)
            : invoice.customer?.name ?? null;
        const lineItems = invoiceEditSource.lines.map((line) => ({
          lineType: line.lineType,
          referenceId: line.referenceId,
          nameSnapshot: line.nameSnapshot,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          gstPercentage: line.gstPercentage,
          lineTotal: line.lineTotal,
          meta: line.meta
        }));
        const totalsSnapshotFromSource =
          sourceWithSnapshots.totalsSnapshot &&
          typeof sourceWithSnapshots.totalsSnapshot === "object"
            ? sourceWithSnapshots.totalsSnapshot
            : null;
        const linesSnapshotFromSource =
          sourceWithSnapshots.linesSnapshot &&
          typeof sourceWithSnapshots.linesSnapshot === "object"
            ? sourceWithSnapshots.linesSnapshot
            : null;

        const subtotal = roundMoney(invoice.subtotal);
        const itemDiscountAmount = roundMoney(invoice.itemDiscountAmount);
        const couponDiscountAmount = roundMoney(invoice.couponDiscountAmount);
        const manualDiscountAmount = roundMoney(invoice.manualDiscountAmount);
        const taxAmount = roundMoney(invoice.taxAmount);
        const totalAmount = roundMoney(invoice.totalAmount);

        await invoicesService.syncUpsert({
          idempotencyKey: createDraftId(),
          invoiceNumber: invoice.invoiceNumber,
          orderReference: invoice.orderReference,
          customerId: invoice.customerId,
          customerPhone,
          customerName,
          branchId: invoice.branchId,
          deviceId: "admin-web",
          orderType: invoiceEditDraft.orderType,
          tableLabel: invoiceEditDraft.tableLabel.trim() || null,
          kitchenStatus: invoiceEditDraft.kitchenStatus,
          status: invoice.status,
          paymentMode: invoice.paymentMode,
          subtotal,
          itemDiscountAmount,
          couponDiscountAmount,
          manualDiscountAmount,
          taxAmount,
          totalAmount,
          couponCode: invoice.couponCode,
          notes: invoiceEditDraft.notes.trim() || null,
          customerSnapshot,
          totalsSnapshot:
            totalsSnapshotFromSource ??
            {
              subtotal,
              itemDiscountAmount,
              couponDiscountAmount,
              manualDiscountAmount,
              taxAmount,
              totalAmount
            },
          linesSnapshot:
            linesSnapshotFromSource ??
            {
              count: lineItems.length
            },
          sourceCreatedAt: sourceWithSnapshots.sourceCreatedAt ?? invoice.createdAt,
          lines: lineItems,
          payments: invoiceEditSource.payments.map((payment) => ({
            mode: payment.mode,
            status: payment.status,
            amount: payment.amount,
            receivedAmount: payment.receivedAmount,
            changeAmount: payment.changeAmount,
            referenceNo: payment.referenceNo,
            paidAt: payment.paidAt
          })),
          usageEvents: []
        });
      } else {
        if (!gamingEditSource) {
          throw new Error("Booking details are not loaded.");
        }
        await gamingService.updateBooking(gamingEditSource.id, {
          bookingChannel: gamingEditDraft.bookingChannel.trim() || undefined,
          note: gamingEditDraft.note.trim() || undefined
        });
      }

      toast.success("Pending document updated successfully.");
      setEditState(null);
      setInvoiceEditSource(null);
      setGamingEditSource(null);
      await fetchCustomers();
      if (selectedCustomer) {
        await fetchCustomerDetails(selectedCustomer);
      }
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to update pending document."));
    } finally {
      setEditSaving(false);
    }
  }, [
    editState,
    fetchCustomerDetails,
    fetchCustomers,
    gamingEditDraft.bookingChannel,
    gamingEditDraft.note,
    gamingEditSource,
    invoiceEditDraft.kitchenStatus,
    invoiceEditDraft.notes,
    invoiceEditDraft.orderType,
    invoiceEditDraft.tableLabel,
    invoiceEditSource,
    selectedCustomer,
    toast
  ]);

  const confirmDeleteDocument = useCallback(async () => {
    if (!deleteState) {
      return;
    }
    setDeleting(true);
    try {
      if (deleteState.sourceType === "invoice") {
        await invoicesService.deleteInvoice(deleteState.sourceId);
      } else {
        await gamingService.deleteBooking(deleteState.sourceId);
      }
      toast.success("Pending document deleted successfully.");
      setDeleteState(null);
      await fetchCustomers();
      if (selectedCustomer) {
        await fetchCustomerDetails(selectedCustomer);
      }
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete pending document."));
    } finally {
      setDeleting(false);
    }
  }, [deleteState, fetchCustomerDetails, fetchCustomers, selectedCustomer, toast]);

  const quickEditFromCustomer = useCallback(
    async (customer: PendingCustomerSummary) => {
      try {
        const response = await pendingService.getCustomerDetails({
          phone: customer.customerPhone || undefined,
          name: customer.customerName || undefined,
          scope
        });
        const docs = response.data.pendingDocuments;
        if (!docs.length) {
          toast.warning("No pending documents found for this customer.");
          return;
        }
        if (docs.length > 1) {
          toast.info("Multiple pending documents found. Open customer and choose exact document to edit.");
          return;
        }
        await openEditModal(docs[0]);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to open edit action."));
      }
    },
    [openEditModal, scope, toast]
  );

  const quickDeleteFromCustomer = useCallback(
    async (customer: PendingCustomerSummary) => {
      try {
        const response = await pendingService.getCustomerDetails({
          phone: customer.customerPhone || undefined,
          name: customer.customerName || undefined,
          scope
        });
        const docs = response.data.pendingDocuments;
        if (!docs.length) {
          toast.warning("No pending documents found for this customer.");
          return;
        }
        if (docs.length > 1) {
          toast.info("Multiple pending documents found. Open customer and choose exact document to delete.");
          return;
        }
        const doc = docs[0];
        setDeleteState({
          sourceType: doc.sourceType,
          sourceId: doc.sourceId,
          sourceNumber: doc.sourceNumber
        });
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to open delete action."));
      }
    },
    [scope, toast]
  );

  const customerColumns = useMemo(
    () => [
      {
        key: "customer",
        header: "Customer",
        render: (row: PendingCustomerSummary) => (
          <VStack align="start" spacing={0}>
            <Text fontWeight={700}>{row.customerName || "Walk-in"}</Text>
            <Text fontSize="sm" color="#705B52">
              {row.customerPhone || "-"}
            </Text>
          </VStack>
        )
      },
      {
        key: "pending",
        header: "Total Pending",
        render: (row: PendingCustomerSummary) => <Text fontWeight={800}>{formatCurrency(row.totalPendingAmount)}</Text>
      },
      {
        key: "documents",
        header: "Pending Docs",
        render: (row: PendingCustomerSummary) =>
          `${row.pendingDocuments} (Inv ${row.pendingInvoices} | Game ${row.pendingGamingBookings})`
      },
      {
        key: "lastUpdatedAt",
        header: "Last Update",
        render: (row: PendingCustomerSummary) => formatDateTime(row.lastUpdatedAt)
      },
      {
        key: "actions",
        header: "Actions",
        render: (row: PendingCustomerSummary) => (
          <HStack spacing={2}>
            <AppButton
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedCustomer(row);
                void fetchCustomerDetails(row);
              }}
            >
              View
            </AppButton>
            <AppButton size="sm" variant="outline" onClick={() => void quickEditFromCustomer(row)}>
              Edit
            </AppButton>
            <AppButton size="sm" variant="ghost" onClick={() => void quickDeleteFromCustomer(row)}>
              Delete
            </AppButton>
          </HStack>
        )
      }
    ],
    [fetchCustomerDetails, quickDeleteFromCustomer, quickEditFromCustomer]
  );

  const pendingDocColumns = useMemo(
    () => [
      {
        key: "doc",
        header: "Document",
        render: (row: PendingDocument) => (
          <VStack align="start" spacing={0}>
            <Text fontWeight={700}>{row.sourceNumber}</Text>
            <Text fontSize="xs" color="#705B52">
              {row.sourceType === "invoice" ? "Invoice" : "Gaming Booking"}
            </Text>
          </VStack>
        )
      },
      {
        key: "date",
        header: "Date",
        render: (row: PendingDocument) => formatDateTime(row.documentDate)
      },
      {
        key: "amount",
        header: "Total",
        render: (row: PendingDocument) => formatCurrency(row.totalAmount)
      },
      {
        key: "collected",
        header: "Collected",
        render: (row: PendingDocument) => formatCurrency(row.collectedAmount)
      },
      {
        key: "pending",
        header: "Pending",
        render: (row: PendingDocument) => <Text fontWeight={800}>{formatCurrency(row.pendingAmount)}</Text>
      },
      {
        key: "action",
        header: "Collect",
        render: (row: PendingDocument) => (
          <AppButton size="sm" onClick={() => openCollectModal(row)}>
            Collect
          </AppButton>
        )
      }
    ],
    [openCollectModal]
  );

  const historyColumns = useMemo(
    () => [
      {
        key: "sourceNumber",
        header: "Document",
        render: (row: PendingPaymentHistoryEntry) => (
          <VStack align="start" spacing={0}>
            <Text fontWeight={700}>{row.sourceNumber}</Text>
            <Text fontSize="xs" color="#705B52">
              {row.sourceType === "invoice" ? "Invoice" : "Gaming Booking"}
            </Text>
          </VStack>
        )
      },
      {
        key: "paymentMode",
        header: "Mode",
        render: (row: PendingPaymentHistoryEntry) => row.paymentMode.toUpperCase()
      },
      {
        key: "amount",
        header: "Amount",
        render: (row: PendingPaymentHistoryEntry) => formatCurrency(row.amount)
      },
      {
        key: "remainingAmount",
        header: "Remaining",
        render: (row: PendingPaymentHistoryEntry) => formatCurrency(row.remainingAmount)
      },
      {
        key: "referenceNo",
        header: "Reference",
        render: (row: PendingPaymentHistoryEntry) => row.referenceNo || "-"
      },
      {
        key: "createdAt",
        header: "Collected At",
        render: (row: PendingPaymentHistoryEntry) => formatDateTime(row.createdAt)
      }
    ],
    []
  );

  const mixedSplitValues = useMemo(
    () => ({
      cash: Number(collectCashAmount || 0),
      card: Number(collectCardAmount || 0),
      upi: Number(collectUpiAmount || 0)
    }),
    [collectCardAmount, collectCashAmount, collectUpiAmount]
  );

  const mixedSplitTotal = useMemo(
    () => Number((mixedSplitValues.cash + mixedSplitValues.card + mixedSplitValues.upi).toFixed(2)),
    [mixedSplitValues]
  );

  const submitCollection = useCallback(async () => {
    if (!collectState || !selectedCustomer) {
      return;
    }

    let amount = Number(collectAmount);
    const paymentPayload: {
      sourceType: PendingDocument["sourceType"];
      sourceId: string;
      paymentMode: "cash" | "card" | "upi" | "mixed";
      amount?: number;
      referenceNo?: string;
      cardReferenceNo?: string;
      upiReferenceNo?: string;
      paymentBreakdown?: { cash?: number; card?: number; upi?: number };
      note?: string;
    } = {
      sourceType: collectState.sourceType,
      sourceId: collectState.sourceId,
      paymentMode: collectMode
    };

    if (collectMode === "mixed") {
      const activeSplitModes = [
        mixedSplitValues.cash > 0 ? "cash" : null,
        mixedSplitValues.card > 0 ? "card" : null,
        mixedSplitValues.upi > 0 ? "upi" : null
      ].filter(Boolean);
      if (activeSplitModes.length < 2) {
        toast.error("Mixed payment needs at least two modes.");
        return;
      }
      if (!Number.isFinite(mixedSplitTotal) || mixedSplitTotal <= 0) {
        toast.error("Enter valid split amounts.");
        return;
      }
      if (mixedSplitTotal - collectState.pendingAmount > 0.001) {
        toast.error(`Split amount cannot exceed pending due (${collectState.pendingAmount.toFixed(2)}).`);
        return;
      }
      if (mixedSplitValues.card > 0 && !collectCardReference.trim()) {
        toast.error("Card reference ID is required when card amount is entered.");
        return;
      }
      if (mixedSplitValues.upi > 0 && !collectUpiReference.trim()) {
        toast.error("UPI reference ID is required when UPI amount is entered.");
        return;
      }

      amount = mixedSplitTotal;
      paymentPayload.amount = mixedSplitTotal;
      paymentPayload.paymentBreakdown = {
        cash: mixedSplitValues.cash,
        card: mixedSplitValues.card,
        upi: mixedSplitValues.upi
      };
      paymentPayload.cardReferenceNo = collectCardReference.trim() || undefined;
      paymentPayload.upiReferenceNo = collectUpiReference.trim() || undefined;
    } else {
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Enter a valid collection amount.");
        return;
      }
      if (amount - collectState.pendingAmount > 0.001) {
        toast.error(`Amount cannot exceed pending due (${collectState.pendingAmount.toFixed(2)}).`);
        return;
      }
      if ((collectMode === "upi" || collectMode === "card") && !collectReference.trim()) {
        toast.error("Reference ID is required for UPI/Card payment.");
        return;
      }

      paymentPayload.amount = amount;
      paymentPayload.referenceNo = collectReference.trim() || undefined;
    }

    setCollecting(true);
    try {
      await pendingService.collectAmount({
        ...paymentPayload,
        note: collectNote.trim() || undefined
      });
      toast.success("Pending amount collected successfully.");
      setCollectState(null);
      await Promise.all([fetchCustomers(), fetchCustomerDetails(selectedCustomer)]);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to collect pending amount."));
    } finally {
      setCollecting(false);
    }
  }, [
    collectAmount,
    collectCardAmount,
    collectCardReference,
    collectCashAmount,
    collectMode,
    collectNote,
    collectReference,
    collectState,
    collectUpiAmount,
    collectUpiReference,
    fetchCustomerDetails,
    fetchCustomers,
    mixedSplitTotal,
    mixedSplitValues,
    selectedCustomer,
    toast
  ]);

  const selectedScopeLabel = useMemo(
    () => scopeOptions.find((option) => option.value === scope)?.label ?? "All",
    [scope]
  );

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Pending Collections"
        subtitle={`Track customer-wise pending dues. Currently viewing ${selectedScopeLabel}.`}
        action={
          <AppButton variant="outline" onClick={() => void refreshAll()}>
            Refresh
          </AppButton>
        }
      />

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 3 }} spacing={4}>
        <StatsCard label="Pending Customers" value={String(totals.pendingCustomers)} />
        <StatsCard label="Pending Documents" value={String(totals.pendingDocuments)} />
        <StatsCard label="Pending Amount" value={formatCurrency(totals.pendingAmount)} />
      </SimpleGrid>

      <AppCard>
        <VStack align="stretch" spacing={4}>
          <FormControl>
            <FormLabel>Business Section</FormLabel>
            <HStack spacing={3} flexWrap="wrap">
              {scopeOptions.map((option) => (
                <AppButton
                  key={option.value}
                  size="sm"
                  variant={scope === option.value ? "solid" : "outline"}
                  onClick={() => {
                    setScope(option.value);
                  }}
                >
                  {option.label}
                </AppButton>
              ))}
            </HStack>
            <Text mt={2} fontSize="xs" color="#705B52">
              {scopeOptions.find((option) => option.value === scope)?.subtitle ?? ""}
            </Text>
          </FormControl>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            <FormControl>
              <FormLabel>Search Customer</FormLabel>
              <Input
                placeholder="Name or phone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Records per page</FormLabel>
              <Select
                value={String(limit)}
                onChange={(event) => {
                  const nextLimit = Number(event.target.value) || 10;
                  setLimit(nextLimit);
                  setPage(1);
                }}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </Select>
            </FormControl>
          </SimpleGrid>

          {loading ? (
            <SkeletonTable />
          ) : (
            <DataTable<PendingCustomerSummary>
              columns={customerColumns}
              rows={rows}
              emptyState={<EmptyState title="No pending customers" description="Pending dues are clear right now." />}
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

      <Modal
        isOpen={Boolean(selectedCustomer)}
        onClose={() => {
          setSelectedCustomer(null);
          setDetails(emptyDetails);
        }}
        size="6xl"
        closeOnOverlayClick={false}
      >
        <ModalOverlay />
        <ModalContent borderRadius="16px" maxH="90vh">
          <ModalHeader>Pending Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody overflowY="auto">
            <VStack align="stretch" spacing={4}>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                <Box p={3} borderRadius="12px" border="1px solid rgba(133, 78, 48, 0.2)" bg="#FFFCF5">
                  <Text fontSize="sm" color="#705B52">
                    Customer
                  </Text>
                  <Text fontWeight={800}>{details.summary.customerName || selectedCustomer?.customerName || "-"}</Text>
                  <Text fontSize="sm" color="#705B52">
                    {details.summary.customerPhone || selectedCustomer?.customerPhone || "-"}
                  </Text>
                </Box>
                <Box p={3} borderRadius="12px" border="1px solid rgba(133, 78, 48, 0.2)" bg="#FFFCF5">
                  <Text fontSize="sm" color="#705B52">
                    Pending Documents
                  </Text>
                  <Text fontWeight={800}>{details.summary.pendingDocuments}</Text>
                </Box>
                <Box p={3} borderRadius="12px" border="1px solid rgba(133, 78, 48, 0.2)" bg="#FFFCF5">
                  <Text fontSize="sm" color="#705B52">
                    Total Pending
                  </Text>
                  <Text fontWeight={800}>{formatCurrency(details.summary.totalPendingAmount)}</Text>
                </Box>
              </SimpleGrid>

              <AppCard title="Pending Documents">
                {detailsLoading ? (
                  <SkeletonTable />
                ) : (
                  <DataTable<PendingDocument>
                    columns={pendingDocColumns}
                    rows={details.pendingDocuments}
                    emptyState={<EmptyState title="No pending documents" description="All dues are settled for this customer." />}
                  />
                )}
              </AppCard>

              <AppCard title="Payment History">
                {detailsLoading ? (
                  <SkeletonTable />
                ) : (
                  <DataTable<PendingPaymentHistoryEntry>
                    columns={historyColumns}
                    rows={details.paymentHistory}
                    emptyState={<EmptyState title="No collection history" description="No pending collections recorded yet." />}
                  />
                )}
              </AppCard>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <AppButton
              variant="outline"
              onClick={() => {
                setSelectedCustomer(null);
                setDetails(emptyDetails);
              }}
            >
              Close
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={Boolean(editState)}
        onClose={closeEditModal}
        isCentered
        closeOnOverlayClick={false}
        closeOnEsc={!editSaving}
      >
        <ModalOverlay />
        <ModalContent borderRadius="16px">
          <ModalHeader>Edit Pending Document</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {editLoading ? (
              <Text color="#705B52">Loading document details...</Text>
            ) : editState?.sourceType === "invoice" ? (
              <VStack align="stretch" spacing={3}>
                <Text fontSize="sm" color="#705B52">
                  Document: <b>{editState.sourceNumber}</b>
                </Text>
                <FormControl>
                  <FormLabel>Order Type</FormLabel>
                  <Select
                    value={invoiceEditDraft.orderType}
                    onChange={(event) =>
                      setInvoiceEditDraft((previous) => ({
                        ...previous,
                        orderType: event.target.value as InvoiceOrderType
                      }))
                    }
                  >
                    <option value="takeaway">Takeaway</option>
                    <option value="dine_in">Dine In</option>
                    <option value="delivery">Delivery</option>
                    <option value="snooker">Snooker</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>Kitchen Status</FormLabel>
                  <Select
                    value={invoiceEditDraft.kitchenStatus}
                    onChange={(event) =>
                      setInvoiceEditDraft((previous) => ({
                        ...previous,
                        kitchenStatus: event.target.value as InvoiceKitchenStatus
                      }))
                    }
                  >
                    <option value="not_sent">Not Sent</option>
                    <option value="queued">Queued</option>
                    <option value="preparing">Preparing</option>
                    <option value="ready">Ready</option>
                    <option value="served">Served</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>Table / Label</FormLabel>
                  <Input
                    value={invoiceEditDraft.tableLabel}
                    onChange={(event) =>
                      setInvoiceEditDraft((previous) => ({
                        ...previous,
                        tableLabel: event.target.value
                      }))
                    }
                    placeholder="Optional table/label"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Notes</FormLabel>
                  <Textarea
                    value={invoiceEditDraft.notes}
                    onChange={(event) =>
                      setInvoiceEditDraft((previous) => ({
                        ...previous,
                        notes: event.target.value
                      }))
                    }
                    placeholder="Optional notes"
                  />
                </FormControl>
              </VStack>
            ) : (
              <VStack align="stretch" spacing={3}>
                <Text fontSize="sm" color="#705B52">
                  Document: <b>{editState?.sourceNumber}</b>
                </Text>
                <FormControl>
                  <FormLabel>Booking Channel</FormLabel>
                  <Input
                    value={gamingEditDraft.bookingChannel}
                    onChange={(event) =>
                      setGamingEditDraft((previous) => ({
                        ...previous,
                        bookingChannel: event.target.value
                      }))
                    }
                    placeholder="Optional booking channel"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Note</FormLabel>
                  <Textarea
                    value={gamingEditDraft.note}
                    onChange={(event) =>
                      setGamingEditDraft((previous) => ({
                        ...previous,
                        note: event.target.value
                      }))
                    }
                    placeholder="Optional note"
                  />
                </FormControl>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <HStack>
              <AppButton variant="outline" onClick={closeEditModal} isDisabled={editSaving}>
                Cancel
              </AppButton>
              <AppButton isLoading={editSaving} onClick={() => void submitEdit()} isDisabled={editLoading}>
                Save
              </AppButton>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteState)}
        title="Delete Pending Document"
        description={
          deleteState
            ? `Delete ${deleteState.sourceNumber}? This will remove it from admin and POS after sync.`
            : "Delete this pending document?"
        }
        onClose={() => {
          if (!deleting) {
            setDeleteState(null);
          }
        }}
        onConfirm={() => {
          void confirmDeleteDocument();
        }}
        isLoading={deleting}
      />

      <Modal isOpen={Boolean(collectState)} onClose={() => setCollectState(null)} isCentered closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent borderRadius="16px">
          <ModalHeader>Collect Pending Amount</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Text fontSize="sm" color="#705B52">
                Document: <b>{collectState?.sourceNumber}</b>
              </Text>
              <Text fontSize="sm" color="#705B52">
                Pending: <b>{formatCurrency(collectState?.pendingAmount ?? 0)}</b>
              </Text>
              <FormControl>
                <FormLabel>Payment Mode</FormLabel>
                <Select
                  value={collectMode}
                  onChange={(event) => {
                    setCollectMode(event.target.value as "cash" | "card" | "upi" | "mixed");
                    setCollectReference("");
                    setCollectCardReference("");
                    setCollectUpiReference("");
                    setCollectCashAmount("");
                    setCollectCardAmount("");
                    setCollectUpiAmount("");
                  }}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="mixed">Mixed</option>
                </Select>
              </FormControl>
              {collectMode === "mixed" ? (
                <>
                  <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                    <FormControl>
                      <FormLabel>Cash Amount</FormLabel>
                      <Input
                        type="number"
                        min={0}
                        value={collectCashAmount}
                        onChange={(event) => setCollectCashAmount(event.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Card Amount</FormLabel>
                      <Input
                        type="number"
                        min={0}
                        value={collectCardAmount}
                        onChange={(event) => setCollectCardAmount(event.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>UPI Amount</FormLabel>
                      <Input
                        type="number"
                        min={0}
                        value={collectUpiAmount}
                        onChange={(event) => setCollectUpiAmount(event.target.value)}
                      />
                    </FormControl>
                  </SimpleGrid>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <FormControl>
                      <FormLabel>Card Reference ID</FormLabel>
                      <Input
                        value={collectCardReference}
                        onChange={(event) => setCollectCardReference(event.target.value)}
                        placeholder="Required if card amount entered"
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>UPI Reference ID</FormLabel>
                      <Input
                        value={collectUpiReference}
                        onChange={(event) => setCollectUpiReference(event.target.value)}
                        placeholder="Required if UPI amount entered"
                      />
                    </FormControl>
                  </SimpleGrid>
                  <Text fontSize="sm" color="#705B52">
                    Split Total: <b>{formatCurrency(mixedSplitTotal)}</b>
                  </Text>
                </>
              ) : (
                <>
                  <FormControl>
                    <FormLabel>Amount</FormLabel>
                    <Input
                      type="number"
                      min={0}
                      value={collectAmount}
                      onChange={(event) => setCollectAmount(event.target.value)}
                    />
                  </FormControl>
                  {collectMode === "card" || collectMode === "upi" ? (
                    <FormControl>
                      <FormLabel>Reference ID</FormLabel>
                      <Input
                        value={collectReference}
                        onChange={(event) => setCollectReference(event.target.value)}
                        placeholder="Enter transaction reference"
                      />
                    </FormControl>
                  ) : null}
                </>
              )}
              <FormControl>
                <FormLabel>Note (Optional)</FormLabel>
                <Textarea
                  value={collectNote}
                  onChange={(event) => setCollectNote(event.target.value)}
                  placeholder="Collection note"
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <AppButton variant="outline" onClick={() => setCollectState(null)}>
                Cancel
              </AppButton>
              <AppButton isLoading={collecting} onClick={() => void submitCollection()}>
                Collect
              </AppButton>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
};
