import {
  Box,
  Button,
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
  VStack,
  useToast
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";

import { usePosAuth } from "@/app/PosAuthContext";
import { PosDataTable, type PosTableColumn } from "@/components/common/PosDataTable";
import { pendingService } from "@/services/pending.service";
import type {
  PendingCustomerDetails,
  PendingCustomerSummary,
  PendingDocument,
  PendingPaymentHistoryEntry
} from "@/types/pending";
import { formatINR } from "@/utils/currency";

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

export const StaffPendingPage = () => {
  const toast = useToast();
  const { session } = usePosAuth();
  const pendingScope = useMemo<"all" | "dip_and_dash" | "snooker">(() => {
    if (session?.role === "snooker_staff") {
      return "snooker";
    }
    // Staff desktop should stay outlet-scoped by default.
    // Only explicit snooker role sees snooker pending; all other desktop roles use Dip & Dash scope.
    return "dip_and_dash";
  }, [session?.role]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PendingCustomerSummary[]>([]);
  const [totals, setTotals] = useState({
    pendingCustomers: 0,
    pendingDocuments: 0,
    pendingAmount: 0
  });

  const [selectedCustomer, setSelectedCustomer] = useState<PendingCustomerSummary | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<PendingCustomerDetails>(emptyDetails);

  const [collectState, setCollectState] = useState<CollectState | null>(null);
  const [collectMode, setCollectMode] = useState<"cash" | "card" | "upi">("cash");
  const [collectAmount, setCollectAmount] = useState("");
  const [collectReference, setCollectReference] = useState("");
  const [collectNote, setCollectNote] = useState("");
  const [collecting, setCollecting] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await pendingService.listCustomers({
        search: search.trim() || undefined,
        scope: pendingScope,
        page: 1,
        limit: 100
      });
      if (pendingScope === "dip_and_dash") {
        const dipOnlyRows = response.data.customers.filter((row) => row.pendingGamingBookings <= 0);
        setRows(dipOnlyRows);
        setTotals({
          pendingCustomers: dipOnlyRows.length,
          pendingDocuments: dipOnlyRows.reduce((sum, row) => sum + row.pendingDocuments, 0),
          pendingAmount: Number(dipOnlyRows.reduce((sum, row) => sum + row.totalPendingAmount, 0).toFixed(2))
        });
      } else {
        setRows(response.data.customers);
        setTotals(response.data.totals);
      }
    } catch (error) {
      toast({
        status: "error",
        title: "Unable to load pending customers",
        description: error instanceof Error ? error.message : "Please retry."
      });
    } finally {
      setLoading(false);
    }
  }, [pendingScope, search, toast]);

  const fetchCustomerDetails = useCallback(
    async (customer: PendingCustomerSummary) => {
      setDetailsLoading(true);
      try {
        const response = await pendingService.getCustomerDetails({
          phone: customer.customerPhone || undefined,
          name: customer.customerName || undefined,
          scope: pendingScope
        });
        if (pendingScope === "dip_and_dash") {
          const dipOnlyDocuments = response.data.pendingDocuments.filter((row) => row.sourceType === "invoice");
          const allowedKeys = new Set(dipOnlyDocuments.map((row) => `invoice:${row.sourceId}`));
          const dipOnlyHistory = response.data.paymentHistory.filter(
            (entry) => entry.sourceType === "invoice" && allowedKeys.has(`invoice:${entry.sourceId}`)
          );
          setDetails({
            summary: {
              customerName: response.data.summary.customerName,
              customerPhone: response.data.summary.customerPhone,
              totalPendingAmount: Number(
                dipOnlyDocuments.reduce((sum, row) => sum + row.pendingAmount, 0).toFixed(2)
              ),
              pendingDocuments: dipOnlyDocuments.length
            },
            pendingDocuments: dipOnlyDocuments,
            paymentHistory: dipOnlyHistory
          });
        } else {
          setDetails(response.data);
        }
      } catch (error) {
        toast({
          status: "error",
          title: "Unable to load customer details",
          description: error instanceof Error ? error.message : "Please retry."
        });
      } finally {
        setDetailsLoading(false);
      }
    },
    [pendingScope, toast]
  );

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const customerColumns = useMemo<PosTableColumn<PendingCustomerSummary>[]>(
    () => [
      {
        key: "customer",
        header: "Customer",
        alwaysVisible: true,
        render: (row) => (
          <VStack align="start" spacing={0}>
            <Text fontWeight={800}>{row.customerName || "Walk-in"}</Text>
            <Text fontSize="xs" color="#705A50">
              {row.customerPhone || "-"}
            </Text>
          </VStack>
        )
      },
      {
        key: "pending",
        header: "Pending",
        render: (row) => <Text fontWeight={800}>{formatINR(row.totalPendingAmount)}</Text>
      },
      {
        key: "docs",
        header: "Docs",
        render: (row) => `${row.pendingDocuments} (Inv ${row.pendingInvoices} | Game ${row.pendingGamingBookings})`
      },
      {
        key: "updated",
        header: "Last Update",
        render: (row) => formatDateTime(row.lastUpdatedAt)
      },
      {
        key: "action",
        header: "Action",
        alwaysVisible: true,
        render: (row) => (
          <Button
            size="xs"
            onClick={() => {
              setSelectedCustomer(row);
              void fetchCustomerDetails(row);
            }}
          >
            View
          </Button>
        )
      }
    ],
    [fetchCustomerDetails]
  );

  const pendingDocColumns = useMemo<PosTableColumn<PendingDocument>[]>(
    () => [
      {
        key: "doc",
        header: "Document",
        alwaysVisible: true,
        render: (row) => (
          <VStack align="start" spacing={0}>
            <Text fontWeight={800}>{row.sourceNumber}</Text>
            <Text fontSize="xs" color="#705A50">
              {row.sourceType === "invoice" ? "Invoice" : "Gaming Booking"}
            </Text>
          </VStack>
        )
      },
      {
        key: "total",
        header: "Total",
        render: (row) => formatINR(row.totalAmount)
      },
      {
        key: "collected",
        header: "Collected",
        render: (row) => formatINR(row.collectedAmount)
      },
      {
        key: "pending",
        header: "Pending",
        render: (row) => <Text fontWeight={800}>{formatINR(row.pendingAmount)}</Text>
      },
      {
        key: "date",
        header: "Date",
        render: (row) => formatDateTime(row.documentDate)
      },
      {
        key: "collect",
        header: "Collect",
        alwaysVisible: true,
        render: (row) => (
          <Button
            size="xs"
            onClick={() => {
              setCollectState({
                sourceType: row.sourceType,
                sourceId: row.sourceId,
                sourceNumber: row.sourceNumber,
                pendingAmount: row.pendingAmount
              });
              setCollectMode("cash");
              setCollectAmount(String(row.pendingAmount));
              setCollectReference("");
              setCollectNote("");
            }}
          >
            Collect
          </Button>
        )
      }
    ],
    []
  );

  const historyColumns = useMemo<PosTableColumn<PendingPaymentHistoryEntry>[]>(
    () => [
      {
        key: "doc",
        header: "Document",
        alwaysVisible: true,
        render: (row) => (
          <VStack align="start" spacing={0}>
            <Text fontWeight={800}>{row.sourceNumber}</Text>
            <Text fontSize="xs" color="#705A50">
              {row.sourceType === "invoice" ? "Invoice" : "Gaming Booking"}
            </Text>
          </VStack>
        )
      },
      {
        key: "mode",
        header: "Mode",
        render: (row) => row.paymentMode.toUpperCase()
      },
      {
        key: "amount",
        header: "Amount",
        render: (row) => formatINR(row.amount)
      },
      {
        key: "remaining",
        header: "Remaining",
        render: (row) => formatINR(row.remainingAmount)
      },
      {
        key: "reference",
        header: "Reference",
        render: (row) => row.referenceNo || "-"
      },
      {
        key: "time",
        header: "Collected At",
        render: (row) => formatDateTime(row.createdAt)
      }
    ],
    []
  );

  const submitCollect = useCallback(async () => {
    if (!collectState || !selectedCustomer) {
      return;
    }

    const amount = Number(collectAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ status: "warning", title: "Enter a valid amount" });
      return;
    }
    if ((collectMode === "upi" || collectMode === "card") && !collectReference.trim()) {
      toast({ status: "warning", title: "Reference ID is required for UPI/Card payment" });
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
      toast({ status: "success", title: "Pending amount collected" });
      setCollectState(null);
      await Promise.all([fetchCustomers(), fetchCustomerDetails(selectedCustomer)]);
    } catch (error) {
      toast({
        status: "error",
        title: "Collection failed",
        description: error instanceof Error ? error.message : "Please retry."
      });
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
    <VStack align="stretch" spacing={4}>
      <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3}>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
          <Text fontSize="sm">Pending Customers</Text>
          <Text fontSize="2xl" fontWeight={900}>{totals.pendingCustomers}</Text>
        </Box>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
          <Text fontSize="sm">Pending Documents</Text>
          <Text fontSize="2xl" fontWeight={900}>{totals.pendingDocuments}</Text>
        </Box>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
          <Text fontSize="sm">Total Pending</Text>
          <Text fontSize="2xl" fontWeight={900}>{formatINR(totals.pendingAmount)}</Text>
        </Box>
        <Box display="flex" alignItems="end" justifyContent={{ base: "stretch", md: "end" }}>
          <Button leftIcon={<FiRefreshCw size={14} />} variant="outline" onClick={() => void fetchCustomers()}>
            Refresh
          </Button>
        </Box>
      </SimpleGrid>

      <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mb={3}>
          <FormControl>
            <FormLabel>Search Customer</FormLabel>
            <Input
              placeholder="Name or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FormControl>
          <Box display="flex" alignItems="end">
            <Button onClick={() => void fetchCustomers()} w={{ base: "full", md: "auto" }}>
              Search
            </Button>
          </Box>
        </SimpleGrid>

        <PosDataTable
          rows={rows}
          columns={customerColumns}
          getRowId={(row) => row.customerKey}
          emptyMessage="No pending customers."
          loading={loading}
          maxColumns={6}
        />
      </Box>

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
        <ModalContent maxW="1240px" maxH="90vh">
          <ModalHeader>Pending Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody overflowY="auto">
            <VStack align="stretch" spacing={4}>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                <Box p={3} border="1px solid rgba(132,79,52,0.2)" borderRadius="12px" bg="#FFFCF7">
                  <Text fontSize="sm" color="#705A50">Customer</Text>
                  <Text fontWeight={800}>{details.summary.customerName || selectedCustomer?.customerName || "-"}</Text>
                  <Text fontSize="sm" color="#705A50">{details.summary.customerPhone || selectedCustomer?.customerPhone || "-"}</Text>
                </Box>
                <Box p={3} border="1px solid rgba(132,79,52,0.2)" borderRadius="12px" bg="#FFFCF7">
                  <Text fontSize="sm" color="#705A50">Pending Docs</Text>
                  <Text fontWeight={800}>{details.summary.pendingDocuments}</Text>
                </Box>
                <Box p={3} border="1px solid rgba(132,79,52,0.2)" borderRadius="12px" bg="#FFFCF7">
                  <Text fontSize="sm" color="#705A50">Pending Amount</Text>
                  <Text fontWeight={800}>{formatINR(details.summary.totalPendingAmount)}</Text>
                </Box>
              </SimpleGrid>

              <Box border="1px solid rgba(132,79,52,0.2)" borderRadius="12px" p={3}>
                <Text fontWeight={800} mb={3}>Pending Documents</Text>
                <PosDataTable
                  rows={details.pendingDocuments}
                  columns={pendingDocColumns}
                  getRowId={(row) => `${row.sourceType}-${row.sourceId}`}
                  emptyMessage="No pending documents."
                  loading={detailsLoading}
                  maxColumns={6}
                />
              </Box>

              <Box border="1px solid rgba(132,79,52,0.2)" borderRadius="12px" p={3}>
                <Text fontWeight={800} mb={3}>Payment History</Text>
                <PosDataTable
                  rows={details.paymentHistory}
                  columns={historyColumns}
                  getRowId={(row) => row.id}
                  emptyMessage="No collection history."
                  loading={detailsLoading}
                  maxColumns={6}
                />
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedCustomer(null);
                setDetails(emptyDetails);
              }}
            >
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={Boolean(collectState)} onClose={() => setCollectState(null)} isCentered closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Collect Pending Amount</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Text fontSize="sm" color="#705A50">
                Document: <b>{collectState?.sourceNumber}</b>
              </Text>
              <Text fontSize="sm" color="#705A50">
                Pending: <b>{formatINR(collectState?.pendingAmount ?? 0)}</b>
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
                <Input type="number" min={0} value={collectAmount} onChange={(event) => setCollectAmount(event.target.value)} />
              </FormControl>
              {collectMode === "card" || collectMode === "upi" ? (
                <FormControl>
                  <FormLabel>Reference ID</FormLabel>
                  <Input value={collectReference} onChange={(event) => setCollectReference(event.target.value)} />
                </FormControl>
              ) : null}
              <FormControl>
                <FormLabel>Note (Optional)</FormLabel>
                <Textarea value={collectNote} onChange={(event) => setCollectNote(event.target.value)} />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button variant="outline" onClick={() => setCollectState(null)}>Cancel</Button>
              <Button isLoading={collecting} onClick={() => void submitCollect()}>Collect</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
};
