import {
  Box,
  Button,
  HStack,
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
  VStack,
  useDisclosure
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { DataTable } from "@/components/ui/DataTable";
import { useAppToast } from "@/hooks/useAppToast";
import { cashAuditService } from "@/services/cash-audit.service";
import {
  CASH_AUDIT_DENOMINATIONS,
  type CashAuditRecord,
  type CashAuditRecordsResponse,
  type CashAuditStatsResponse
} from "@/types/cash-audit";
import { extractErrorMessage } from "@/utils/api-error";

type AuditSection = "dip_and_dash" | "gaming";

const SECTION_META: Record<AuditSection, { label: string; description: string }> = {
  dip_and_dash: {
    label: "Dip & Dash Cash Audit",
    description: "Restaurant-side cash audit records"
  },
  gaming: {
    label: "Gaming Cash Audit",
    description: "Snooker/Gaming-side cash audit records"
  }
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);

const formatDateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : "-";

const getTodayDate = () => new Date().toISOString().slice(0, 10);

const getSevenDaysBefore = () => {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return date.toISOString().slice(0, 10);
};

const StatCard = ({ label, value, helper }: { label: string; value: string; helper?: string }) => (
  <AppCard minH="120px">
    <Text color="#7A6258" fontSize="sm" fontWeight={700}>
      {label}
    </Text>
    <Text mt={2} color="#2A1A14" fontSize="2xl" fontWeight={900}>
      {value}
    </Text>
    {helper ? (
      <Text mt={1} color="#8A6F63" fontSize="xs">
        {helper}
      </Text>
    ) : null}
  </AppCard>
);

const buildDenominationText = (counts: CashAuditRecord["denominationCounts"]) => {
  const segments = CASH_AUDIT_DENOMINATIONS.map((denomination) => {
    const key = String(denomination);
    const count = Number(counts[key] ?? 0);
    return count > 0 ? `Rs.${denomination} x ${count}` : null;
  }).filter(Boolean);

  return segments.length ? segments.join(" | ") : "No denominations counted";
};

export const CashAuditPage = () => {
  const toast = useAppToast();
  const detailModal = useDisclosure();

  const [section, setSection] = useState<AuditSection>("dip_and_dash");
  const [stats, setStats] = useState<CashAuditStatsResponse | null>(null);
  const [records, setRecords] = useState<CashAuditRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<CashAuditRecord | null>(null);
  const [pagination, setPagination] = useState<CashAuditRecordsResponse["pagination"]>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  });
  const [dateFrom, setDateFrom] = useState(getSevenDaysBefore());
  const [dateTo, setDateTo] = useState(getTodayDate());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(
    async (nextPage: number, nextLimit: number, nextSection: AuditSection) => {
      setLoading(true);
      try {
        const [statsResponse, recordsResponse] = await Promise.all([
          cashAuditService.getAdminStats({
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            section: nextSection
          }),
          cashAuditService.getAdminRecords({
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            section: nextSection,
            search: search.trim() || undefined,
            page: nextPage,
            limit: nextLimit
          })
        ]);

        setStats(statsResponse.data);
        setRecords(recordsResponse.data.records);
        setPagination(recordsResponse.data.pagination);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to load cash audit records."));
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo, search, toast]
  );

  useEffect(() => {
    void fetchData(pagination.page, pagination.limit, section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(() => {
    void fetchData(1, pagination.limit, section);
  }, [fetchData, pagination.limit, section]);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      void fetchData(nextPage, pagination.limit, section);
    },
    [fetchData, pagination.limit, section]
  );

  const handleLimitChange = useCallback(
    (nextLimit: number) => {
      void fetchData(1, nextLimit, section);
    },
    [fetchData, section]
  );

  const handleSectionChange = useCallback(
    (nextSection: AuditSection) => {
      setSection(nextSection);
      setSelectedRecord(null);
      void fetchData(1, pagination.limit, nextSection);
    },
    [fetchData, pagination.limit]
  );

  const columns = useMemo(
    () =>
      [
        {
          key: "auditDate",
          header: "Audit",
          render: (row: CashAuditRecord) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={800}>{row.auditDate}</Text>
              <Text color="#7B655A" fontSize="xs">
                {formatDateTime(row.createdAt)}
              </Text>
              <Text color="#7B655A" fontSize="xs">
                {row.createdByUserName}
              </Text>
            </VStack>
          )
        },
        {
          key: "expectedTotalAmount",
          header: "Expected",
          render: (row: CashAuditRecord) => (
            <Text fontWeight={800} color="#2A1A14">
              {formatCurrency(row.expectedTotalAmount)}
            </Text>
          )
        },
        {
          key: "enteredTotalAmount",
          header: "Entered",
          render: (row: CashAuditRecord) => (
            <Text fontWeight={800} color="#2A1A14">
              {formatCurrency(row.enteredTotalAmount)}
            </Text>
          )
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: CashAuditRecord) => (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedRecord(row);
                detailModal.onOpen();
              }}
            >
              View
            </Button>
          )
        }
      ] as Array<{
        key: string;
        header: string;
        render?: (row: CashAuditRecord) => ReactNode;
      }>,
    [detailModal]
  );

  return (
    <VStack align="stretch" spacing={6}>
      <PageHeader
        title="Cash Audit"
        subtitle="View audit records section-wise for Dip & Dash and Gaming operations."
      />

      <AppCard>
        <HStack spacing={3} flexWrap="wrap" justify="space-between">
          <VStack align="start" spacing={0}>
            <Text fontWeight={800}>{SECTION_META[section].label}</Text>
            <Text color="#7B655A" fontSize="sm">
              {SECTION_META[section].description}
            </Text>
          </VStack>
          <HStack>
            <AppButton
              variant={section === "dip_and_dash" ? "solid" : "outline"}
              onClick={() => handleSectionChange("dip_and_dash")}
            >
              Dip & Dash Cash Audit
            </AppButton>
            <AppButton
              variant={section === "gaming" ? "solid" : "outline"}
              onClick={() => handleSectionChange("gaming")}
            >
              Gaming Cash Audit
            </AppButton>
          </HStack>
        </HStack>
      </AppCard>

      <AppCard>
        <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={4}>
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
          <AppInput
            label="Search"
            placeholder="Search by entered/approved user"
            value={search}
            onChange={(event) => setSearch((event.target as HTMLInputElement).value)}
          />
          <VStack align="stretch" spacing={1}>
            <Text fontWeight={600}>Rows per page</Text>
            <Select
              value={String(pagination.limit)}
              onChange={(event) => {
                handleLimitChange(Number(event.target.value) || 10);
              }}
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </Select>
          </VStack>
          <VStack align="stretch" justify="end">
            <Text opacity={0}>Refresh</Text>
            <AppButton onClick={handleRefresh} isLoading={loading}>
              Refresh
            </AppButton>
          </VStack>
        </SimpleGrid>
      </AppCard>

      <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={4}>
        <StatCard label="Total Audits" value={String(stats?.totalAudits ?? 0)} />
        <StatCard label="Expected Total" value={formatCurrency(stats?.totalExpectedAmount ?? 0)} />
        <StatCard label="Entered Total" value={formatCurrency(stats?.totalEnteredAmount ?? 0)} />
        <StatCard label="Total Difference" value={formatCurrency(stats?.totalDifferenceAmount ?? 0)} />
        <StatCard label="Excess Amount" value={formatCurrency(stats?.totalExcessAmount ?? 0)} />
      </SimpleGrid>

      <AppCard title="Audit Records">
        {loading ? (
          <SkeletonTable />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={records.map((record) => ({ ...record, id: record.id }))}
              emptyState={
                <EmptyState
                  title="No cash audit records"
                  description="No entries found for the selected section, date range, and filters."
                />
              }
            />
            <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
              <Text color="#705B52" fontSize="sm">
                Showing {records.length} of {pagination.total} records
              </Text>
              <HStack>
                <AppButton
                  variant="outline"
                  isDisabled={pagination.page <= 1}
                  onClick={() => handlePageChange(pagination.page - 1)}
                >
                  Previous
                </AppButton>
                <Text fontWeight={700}>
                  Page {pagination.page} of {pagination.totalPages}
                </Text>
                <AppButton
                  variant="outline"
                  isDisabled={pagination.page >= pagination.totalPages}
                  onClick={() => handlePageChange(pagination.page + 1)}
                >
                  Next
                </AppButton>
              </HStack>
            </HStack>
          </>
        )}
      </AppCard>

      <Modal isOpen={detailModal.isOpen} onClose={detailModal.onClose} size="4xl" isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Audit Detail</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedRecord ? (
              <VStack align="stretch" spacing={4}>
                <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="12px" bg="rgba(255, 249, 238, 0.65)">
                  <Text fontWeight={800} color="#2A1A14">
                    {selectedRecord.auditDate}
                  </Text>
                  <Text color="#705B52" fontSize="sm">
                    {formatDateTime(selectedRecord.createdAt)} | {SECTION_META[section].label}
                  </Text>
                </Box>

                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                  <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="10px" bg="white">
                    <Text color="#705B52" fontSize="sm" fontWeight={700}>
                      Expected
                    </Text>
                    <Text mt={1} fontSize="lg" fontWeight={900} color="#2A1A14">
                      {formatCurrency(selectedRecord.expectedTotalAmount)}
                    </Text>
                    <Text fontSize="xs" color="#7B655A">
                      Cash {formatCurrency(selectedRecord.expectedCashAmount)} | Card {formatCurrency(selectedRecord.expectedCardAmount)} | UPI {formatCurrency(selectedRecord.expectedUpiAmount)}
                    </Text>
                  </Box>

                  <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="10px" bg="white">
                    <Text color="#705B52" fontSize="sm" fontWeight={700}>
                      Entered
                    </Text>
                    <Text mt={1} fontSize="lg" fontWeight={900} color="#2A1A14">
                      {formatCurrency(selectedRecord.enteredTotalAmount)}
                    </Text>
                    <Text fontSize="xs" color="#7B655A">
                      Cash {formatCurrency(selectedRecord.enteredCashAmount)} | Card {formatCurrency(selectedRecord.enteredCardAmount)} | UPI {formatCurrency(selectedRecord.enteredUpiAmount)}
                    </Text>
                  </Box>

                  <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="10px" bg="white">
                    <Text color="#705B52" fontSize="sm" fontWeight={700}>
                      Difference
                    </Text>
                    <Text mt={1} fontSize="lg" fontWeight={900} color="#2A1A14">
                      {formatCurrency(selectedRecord.differenceTotalAmount)}
                    </Text>
                    <Text fontSize="xs" color="#7B655A">
                      Cash {formatCurrency(selectedRecord.differenceCashAmount)} | Card {formatCurrency(selectedRecord.differenceCardAmount)} | UPI {formatCurrency(selectedRecord.differenceUpiAmount)}
                    </Text>
                  </Box>
                </SimpleGrid>

                <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="10px" bg="white">
                  <Text color="#705B52" fontSize="sm" fontWeight={700}>
                    Excess Amount
                  </Text>
                  <Text mt={1} fontSize="lg" fontWeight={900} color="#2A1A14">
                    {formatCurrency(selectedRecord.excessAmount)}
                  </Text>
                </Box>

                <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="10px" bg="white">
                  <Text color="#705B52" fontSize="sm" fontWeight={700}>
                    Denomination Count
                  </Text>
                  <Text mt={1} fontSize="sm" color="#2A1A14">
                    {buildDenominationText(selectedRecord.denominationCounts)}
                  </Text>
                  <Text mt={1} fontSize="xs" color="#7B655A">
                    Pieces: {selectedRecord.totalPieces} | Counted: {formatCurrency(selectedRecord.countedAmount)} | Staff Cash Taken: {formatCurrency(selectedRecord.staffCashTakenAmount)}
                  </Text>
                </Box>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="10px" bg="white">
                    <Text color="#705B52" fontSize="sm" fontWeight={700}>
                      Entered By
                    </Text>
                    <Text mt={1} fontWeight={800} color="#2A1A14">
                      {selectedRecord.createdByUserName} (@{selectedRecord.createdByUsername})
                    </Text>
                  </Box>
                  <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="10px" bg="white">
                    <Text color="#705B52" fontSize="sm" fontWeight={700}>
                      Approved By
                    </Text>
                    <Text mt={1} fontWeight={800} color="#2A1A14">
                      {selectedRecord.approvedByAdminName} (@{selectedRecord.approvedByAdminUsername})
                    </Text>
                  </Box>
                </SimpleGrid>

                <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="10px" bg="white">
                  <Text color="#705B52" fontSize="sm" fontWeight={700}>
                    Note
                  </Text>
                  <Text mt={1} color="#2A1A14">
                    {selectedRecord.note?.trim() ? selectedRecord.note : "-"}
                  </Text>
                </Box>
              </VStack>
            ) : (
              <Text color="#705B52">No audit detail selected.</Text>
            )}
          </ModalBody>
          <ModalFooter>
            <AppButton variant="outline" onClick={detailModal.onClose}>
              Close
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
};
