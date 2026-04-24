import {
  Box,
  FormControl,
  FormLabel,
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
  Textarea,
  VStack,
  useDisclosure
} from "@chakra-ui/react";
import { Edit2, Eye, Trash2 } from "lucide-react";
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

const buildDenominationFormFromRecord = (record: CashAuditRecord) =>
  CASH_AUDIT_DENOMINATIONS.reduce<Record<string, string>>((accumulator, denomination) => {
    const key = String(denomination);
    accumulator[key] = String(Math.max(0, Number(record.denominationCounts[key] ?? 0)));
    return accumulator;
  }, {});

const toDenominationPayload = (value: Record<string, string>) =>
  CASH_AUDIT_DENOMINATIONS.reduce<Record<string, number>>((accumulator, denomination) => {
    const key = String(denomination);
    const parsed = Number(value[key] ?? 0);
    accumulator[key] = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
    return accumulator;
  }, {});

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
  const editModal = useDisclosure();
  const deleteDialog = useDisclosure();

  const [section, setSection] = useState<AuditSection>("dip_and_dash");
  const [stats, setStats] = useState<CashAuditStatsResponse | null>(null);
  const [records, setRecords] = useState<CashAuditRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<CashAuditRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<CashAuditRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<CashAuditRecord | null>(null);
  const [editForm, setEditForm] = useState({
    auditDate: "",
    staffCashTakenAmount: "0",
    note: "",
    denominationCounts: {} as Record<string, string>
  });
  const [pagination, setPagination] = useState<CashAuditRecordsResponse["pagination"]>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  });
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [mutationLoading, setMutationLoading] = useState(false);

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

  const openEditRecord = useCallback(
    (record: CashAuditRecord) => {
      setEditingRecord(record);
      setEditForm({
        auditDate: record.auditDate,
        staffCashTakenAmount: String(record.staffCashTakenAmount),
        note: record.note ?? "",
        denominationCounts: buildDenominationFormFromRecord(record)
      });
      editModal.onOpen();
    },
    [editModal]
  );

  const openDeleteRecord = useCallback(
    (record: CashAuditRecord) => {
      setDeletingRecord(record);
      deleteDialog.onOpen();
    },
    [deleteDialog]
  );

  const handleEditSave = useCallback(async () => {
    if (!editingRecord) {
      return;
    }

    setMutationLoading(true);
    try {
      const response = await cashAuditService.updateAdminRecord(editingRecord.id, {
        auditDate: editForm.auditDate,
        staffCashTakenAmount: Number(editForm.staffCashTakenAmount) || 0,
        denominationCounts: toDenominationPayload(editForm.denominationCounts),
        note: editForm.note.trim() ? editForm.note.trim() : null
      });

      const updatedRecord = response.data.record;
      setSelectedRecord((previous) => (previous?.id === updatedRecord.id ? updatedRecord : previous));
      toast.success("Cash audit record updated successfully.");
      editModal.onClose();
      setEditingRecord(null);
      void fetchData(pagination.page, pagination.limit, section);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to update cash audit record."));
    } finally {
      setMutationLoading(false);
    }
  }, [editForm, editModal, editingRecord, fetchData, pagination.limit, pagination.page, section, toast]);

  const handleDeleteRecord = useCallback(async () => {
    if (!deletingRecord) {
      return;
    }

    setMutationLoading(true);
    try {
      await cashAuditService.deleteAdminRecord(deletingRecord.id);
      setSelectedRecord((previous) => (previous?.id === deletingRecord.id ? null : previous));
      toast.success("Cash audit record deleted successfully.");
      deleteDialog.onClose();
      setDeletingRecord(null);

      const nextPage = records.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      void fetchData(nextPage, pagination.limit, section);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete cash audit record."));
    } finally {
      setMutationLoading(false);
    }
  }, [deleteDialog, deletingRecord, fetchData, pagination.limit, pagination.page, records.length, section, toast]);

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
            <HStack spacing={2}>
              <ActionIconButton
                aria-label="View audit"
                tooltip="View"
                icon={<Eye size={16} />}
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedRecord(row);
                  detailModal.onOpen();
                }}
              />
              <ActionIconButton
                aria-label="Edit audit"
                tooltip="Edit"
                icon={<Edit2 size={16} />}
                size="sm"
                variant="outline"
                onClick={() => openEditRecord(row)}
              />
              <ActionIconButton
                aria-label="Delete audit"
                tooltip="Delete"
                icon={<Trash2 size={16} />}
                size="sm"
                variant="outline"
                colorScheme="accentRed"
                onClick={() => openDeleteRecord(row)}
              />
            </HStack>
          )
        }
      ] as Array<{
        key: string;
        header: string;
        render?: (row: CashAuditRecord) => ReactNode;
      }>,
    [detailModal, openDeleteRecord, openEditRecord]
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
            {selectedRecord ? (
              <HStack mr="auto" spacing={2}>
                <AppButton
                  variant="outline"
                  onClick={() => {
                    detailModal.onClose();
                    openEditRecord(selectedRecord);
                  }}
                >
                  Edit
                </AppButton>
                <AppButton
                  variant="outline"
                  colorScheme="accentRed"
                  onClick={() => {
                    detailModal.onClose();
                    openDeleteRecord(selectedRecord);
                  }}
                >
                  Delete
                </AppButton>
              </HStack>
            ) : null}
            <AppButton variant="outline" onClick={detailModal.onClose}>
              Close
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={editModal.isOpen}
        onClose={() => {
          setEditingRecord(null);
          editModal.onClose();
        }}
        size="4xl"
        isCentered
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Cash Audit Record</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={4}>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <AppInput
                  label="Audit Date"
                  type="date"
                  value={editForm.auditDate}
                  onChange={(event) =>
                    setEditForm((previous) => ({
                      ...previous,
                      auditDate: (event.target as HTMLInputElement).value
                    }))
                  }
                />
                <AppInput
                  label="Staff Cash Taken"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.staffCashTakenAmount}
                  onChange={(event) =>
                    setEditForm((previous) => ({
                      ...previous,
                      staffCashTakenAmount: (event.target as HTMLInputElement).value
                    }))
                  }
                />
              </SimpleGrid>

              <FormControl>
                <FormLabel>Denomination Counts</FormLabel>
                <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3}>
                  {CASH_AUDIT_DENOMINATIONS.map((denomination) => {
                    const key = String(denomination);
                    return (
                      <AppInput
                        key={key}
                        label={`Rs.${denomination}`}
                        type="number"
                        min={0}
                        step="1"
                        value={editForm.denominationCounts[key] ?? "0"}
                        onChange={(event) =>
                          setEditForm((previous) => ({
                            ...previous,
                            denominationCounts: {
                              ...previous.denominationCounts,
                              [key]: (event.target as HTMLInputElement).value
                            }
                          }))
                        }
                      />
                    );
                  })}
                </SimpleGrid>
              </FormControl>

              <FormControl>
                <FormLabel>Note</FormLabel>
                <Textarea
                  value={editForm.note}
                  onChange={(event) =>
                    setEditForm((previous) => ({
                      ...previous,
                      note: event.target.value
                    }))
                  }
                  placeholder="Add note (optional)"
                  maxLength={500}
                  bg="white"
                  borderColor="rgba(193, 14, 14, 0.18)"
                  focusBorderColor="brand.400"
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={3}>
            <AppButton
              variant="outline"
              onClick={() => {
                setEditingRecord(null);
                editModal.onClose();
              }}
            >
              Cancel
            </AppButton>
            <AppButton onClick={() => void handleEditSave()} isLoading={mutationLoading} isDisabled={!editForm.auditDate}>
              Save Changes
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Delete cash audit record?"
        description={
          deletingRecord
            ? `Delete audit record ${deletingRecord.auditDate} created by ${deletingRecord.createdByUserName}? This will permanently remove it.`
            : "Delete this record permanently?"
        }
        onClose={() => {
          deleteDialog.onClose();
          setDeletingRecord(null);
        }}
        onConfirm={() => void handleDeleteRecord()}
        isLoading={mutationLoading}
      />
    </VStack>
  );
};
