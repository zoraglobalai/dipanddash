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

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { DataTable } from "@/components/ui/DataTable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAppToast } from "@/hooks/useAppToast";
import { pendingService } from "@/services/pending.service";
import type {
  PendingCustomerDetails,
  PendingCustomerSummary,
  PendingDocument,
  PendingPaymentHistoryEntry
} from "@/types/pending";
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
  const [collectMode, setCollectMode] = useState<"cash" | "card" | "upi">("cash");
  const [collectReference, setCollectReference] = useState("");
  const [collectNote, setCollectNote] = useState("");
  const [collecting, setCollecting] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await pendingService.listCustomers({
        search: debouncedSearch || undefined,
        page,
        limit
      });
      setRows(response.data.customers);
      setPagination(response.data.pagination);
      setTotals(response.data.totals);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch pending customers."));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, limit, page, toast]);

  const fetchCustomerDetails = useCallback(
    async (customer: PendingCustomerSummary) => {
      setDetailsLoading(true);
      try {
        const response = await pendingService.getCustomerDetails({
          phone: customer.customerPhone || undefined,
          name: customer.customerName || undefined
        });
        setDetails(response.data);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to fetch pending details."));
      } finally {
        setDetailsLoading(false);
      }
    },
    [toast]
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
  }, [debouncedSearch, limit]);

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
        )
      }
    ],
    [fetchCustomerDetails]
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
          <AppButton
            size="sm"
            onClick={() => {
              setCollectState({
                sourceType: row.sourceType,
                sourceId: row.sourceId,
                sourceNumber: row.sourceNumber,
                pendingAmount: row.pendingAmount
              });
              setCollectAmount(String(row.pendingAmount));
              setCollectMode("cash");
              setCollectReference("");
              setCollectNote("");
            }}
          >
            Collect
          </AppButton>
        )
      }
    ],
    []
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

  const submitCollection = useCallback(async () => {
    if (!collectState || !selectedCustomer) {
      return;
    }

    const amount = Number(collectAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid collection amount.");
      return;
    }

    if ((collectMode === "upi" || collectMode === "card") && !collectReference.trim()) {
      toast.error("Reference ID is required for UPI/Card payment.");
      return;
    }

    setCollecting(true);
    try {
      await pendingService.collectAmount({
        sourceType: collectState.sourceType,
        sourceId: collectState.sourceId,
        paymentMode: collectMode,
        amount,
        referenceNo: collectReference.trim() || undefined,
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
    collectMode,
    collectNote,
    collectReference,
    collectState,
    fetchCustomerDetails,
    fetchCustomers,
    selectedCustomer,
    toast
  ]);

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Pending Collections"
        subtitle="Track customer-wise pending dues across Dip & Dash invoices and snooker bookings."
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
                <Select value={collectMode} onChange={(event) => setCollectMode(event.target.value as "cash" | "card" | "upi")}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                </Select>
              </FormControl>
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
