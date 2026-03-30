import {
  Box,
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
import { dumpService } from "@/services/dump.service";
import type { DumpEntryType, DumpRecord, DumpRecordsResponse, DumpStatsResponse } from "@/types/dump";
import { extractErrorMessage } from "@/utils/api-error";

const getTodayDate = () => new Date().toISOString().slice(0, 10);
const getSevenDaysBefore = () => {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return date.toISOString().slice(0, 10);
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

const ENTRY_TYPE_LABEL: Record<DumpEntryType, string> = {
  ingredient: "Ingredient",
  item: "Item",
  product: "Product"
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

export const DumpWastagePage = () => {
  const toast = useAppToast();
  const detailModal = useDisclosure();

  const [stats, setStats] = useState<DumpStatsResponse | null>(null);
  const [records, setRecords] = useState<DumpRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<DumpRecord | null>(null);
  const [pagination, setPagination] = useState<DumpRecordsResponse["pagination"]>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  });
  const [dateFrom, setDateFrom] = useState(getSevenDaysBefore());
  const [dateTo, setDateTo] = useState(getTodayDate());
  const [entryType, setEntryType] = useState<"" | DumpEntryType>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(
    async (nextPage: number, nextLimit: number) => {
      setLoading(true);
      try {
        const [statsResponse, recordsResponse] = await Promise.all([
          dumpService.getAdminStats({
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            entryType: entryType || undefined,
            search: search.trim() || undefined
          }),
          dumpService.getAdminRecords({
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            entryType: entryType || undefined,
            search: search.trim() || undefined,
            page: nextPage,
            limit: nextLimit
          })
        ]);

        setStats(statsResponse.data);
        setRecords(recordsResponse.data.records);
        setPagination(recordsResponse.data.pagination);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to load dump wastage records."));
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo, entryType, search, toast]
  );

  useEffect(() => {
    void fetchData(pagination.page, pagination.limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo(
    () =>
      [
        {
          key: "entryDate",
          header: "Date",
          render: (row: DumpRecord) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={800}>{row.entryDate}</Text>
              <Text color="#7B655A" fontSize="xs">
                {formatDateTime(row.createdAt)}
              </Text>
            </VStack>
          )
        },
        {
          key: "entryType",
          header: "Type / Source",
          render: (row: DumpRecord) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={800}>{ENTRY_TYPE_LABEL[row.entryType]}</Text>
              <Text color="#7B655A" fontSize="xs">
                {row.sourceName}
              </Text>
            </VStack>
          )
        },
        {
          key: "quantity",
          header: "Quantity",
          render: (row: DumpRecord) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={800}>
                {row.quantity} {row.unit}
              </Text>
              <Text fontSize="xs" color="#7B655A">
                Base {row.baseQuantity} {row.baseUnit}
              </Text>
            </VStack>
          )
        },
        {
          key: "lossAmount",
          header: "Loss",
          render: (row: DumpRecord) => (
            <Text fontWeight={900} color="#A32626">
              {formatCurrency(row.lossAmount)}
            </Text>
          )
        },
        {
          key: "createdBy",
          header: "Staff",
          render: (row: DumpRecord) => (
            <Text fontWeight={700}>
              {row.createdByUserName} (@{row.createdByUsername})
            </Text>
          )
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: DumpRecord) => (
            <AppButton
              variant="outline"
              onClick={() => {
                setSelectedRecord(row);
                detailModal.onOpen();
              }}
            >
              View
            </AppButton>
          )
        }
      ] as Array<{
        key: string;
        header: string;
        render?: (row: DumpRecord) => ReactNode;
      }>,
    [detailModal]
  );

  return (
    <VStack align="stretch" spacing={6}>
      <PageHeader
        title="Dump Wastage"
        subtitle="Track ingredient/item/product wastage with staff-wise loss visibility."
      />

      <AppCard>
        <SimpleGrid columns={{ base: 1, md: 2, xl: 6 }} spacing={4}>
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
          <VStack align="stretch" spacing={1}>
            <Text fontWeight={600}>Entry Type</Text>
            <Select value={entryType} onChange={(event) => setEntryType((event.target.value as DumpEntryType) || "")}>
              <option value="">All Types</option>
              <option value="ingredient">Ingredient</option>
              <option value="item">Item</option>
              <option value="product">Product</option>
            </Select>
          </VStack>
          <AppInput
            label="Search"
            placeholder="Search source/staff/note"
            value={search}
            onChange={(event) => setSearch((event.target as HTMLInputElement).value)}
          />
          <VStack align="stretch" spacing={1}>
            <Text fontWeight={600}>Rows per page</Text>
            <Select
              value={String(pagination.limit)}
              onChange={(event) => {
                void fetchData(1, Number(event.target.value) || 10);
              }}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </Select>
          </VStack>
          <VStack align="stretch" justify="end">
            <Text opacity={0}>Refresh</Text>
            <AppButton onClick={() => void fetchData(1, pagination.limit)} isLoading={loading}>
              Refresh
            </AppButton>
          </VStack>
        </SimpleGrid>
      </AppCard>

      <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={4}>
        <StatCard label="Total Loss" value={formatCurrency(stats?.totalLossAmount ?? 0)} />
        <StatCard label="Total Entries" value={String(stats?.totalEntries ?? 0)} />
        <StatCard label="Ingredient Entries" value={String(stats?.ingredientEntryCount ?? 0)} />
        <StatCard label="Item Entries" value={String(stats?.itemEntryCount ?? 0)} />
        <StatCard label="Product Entries" value={String(stats?.productEntryCount ?? 0)} />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <StatCard label="Unique Staff" value={String(stats?.uniqueStaffCount ?? 0)} />
        <StatCard
          label="Latest Entry"
          value={stats?.latestEntryAt ? formatDateTime(stats.latestEntryAt) : "-"}
          helper={`Impact rows ${stats?.totalIngredientImpactRows ?? 0}`}
        />
      </SimpleGrid>

      <AppCard title="Dump Records">
        {loading ? (
          <SkeletonTable />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={records.map((record) => ({ ...record, id: record.id }))}
              emptyState={<EmptyState title="No dump records" description="No records found for selected filters." />}
            />
            <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
              <Text color="#705B52" fontSize="sm">
                Showing {records.length} of {pagination.total} records
              </Text>
              <HStack>
                <AppButton
                  variant="outline"
                  isDisabled={pagination.page <= 1}
                  onClick={() => void fetchData(pagination.page - 1, pagination.limit)}
                >
                  Previous
                </AppButton>
                <Text fontWeight={700}>
                  Page {pagination.page} of {pagination.totalPages}
                </Text>
                <AppButton
                  variant="outline"
                  isDisabled={pagination.page >= pagination.totalPages}
                  onClick={() => void fetchData(pagination.page + 1, pagination.limit)}
                >
                  Next
                </AppButton>
              </HStack>
            </HStack>
          </>
        )}
      </AppCard>

      <Modal isOpen={detailModal.isOpen} onClose={detailModal.onClose} size="3xl" isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Dump Detail</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedRecord ? (
              <VStack align="stretch" spacing={4}>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="12px">
                    <Text fontSize="sm" color="#705B52" fontWeight={700}>
                      Source
                    </Text>
                    <Text mt={1} fontWeight={900}>
                      {ENTRY_TYPE_LABEL[selectedRecord.entryType]} - {selectedRecord.sourceName}
                    </Text>
                    <Text fontSize="sm" color="#705B52">
                      Qty {selectedRecord.quantity} {selectedRecord.unit}
                    </Text>
                  </Box>
                  <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="12px">
                    <Text fontSize="sm" color="#705B52" fontWeight={700}>
                      Loss Amount
                    </Text>
                    <Text mt={1} fontSize="xl" fontWeight={900} color="#A32626">
                      {formatCurrency(selectedRecord.lossAmount)}
                    </Text>
                  </Box>
                </SimpleGrid>

                <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="12px">
                  <Text fontSize="sm" color="#705B52" fontWeight={700}>
                    Ingredient Impacts
                  </Text>
                  {selectedRecord.ingredientImpacts.length ? (
                    <VStack align="stretch" spacing={2} mt={2}>
                      {selectedRecord.ingredientImpacts.map((impact) => (
                        <Box key={`${impact.ingredientId}-${impact.quantity}`} p={2} borderRadius="10px" bg="#FFF9EE">
                          <Text fontWeight={800}>
                            {impact.ingredientName} - {impact.quantity} {impact.unit}
                          </Text>
                          <Text fontSize="sm" color="#705B52">
                            Unit Price {formatCurrency(impact.unitPrice)} | Loss {formatCurrency(impact.lossAmount)}
                          </Text>
                        </Box>
                      ))}
                    </VStack>
                  ) : (
                    <Text mt={1} color="#705B52">
                      No ingredient-level breakdown for this record.
                    </Text>
                  )}
                </Box>

                <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="12px">
                  <Text fontSize="sm" color="#705B52" fontWeight={700}>
                    Staff / Note
                  </Text>
                  <Text mt={1} fontWeight={800}>
                    {selectedRecord.createdByUserName} (@{selectedRecord.createdByUsername})
                  </Text>
                  <Text fontSize="sm" color="#705B52">
                    {formatDateTime(selectedRecord.createdAt)}
                  </Text>
                  <Text mt={2}>{selectedRecord.note?.trim() ? selectedRecord.note : "-"}</Text>
                </Box>
              </VStack>
            ) : (
              <Text color="#705B52">No detail selected.</Text>
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
