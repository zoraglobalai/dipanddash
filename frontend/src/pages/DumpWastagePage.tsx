import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

type UnitMeta = {
  group: string;
  factorToBase: number;
};

const UNIT_META: Record<string, UnitMeta> = {
  mcg: { group: "weight", factorToBase: 0.000001 },
  mg: { group: "weight", factorToBase: 0.001 },
  g: { group: "weight", factorToBase: 1 },
  kg: { group: "weight", factorToBase: 1000 },
  quintal: { group: "weight", factorToBase: 100000 },
  ton: { group: "weight", factorToBase: 1000000 },
  ml: { group: "volume", factorToBase: 1 },
  cl: { group: "volume", factorToBase: 10 },
  dl: { group: "volume", factorToBase: 100 },
  l: { group: "volume", factorToBase: 1000 },
  gallon: { group: "volume", factorToBase: 3785.411784 },
  teaspoon: { group: "volume", factorToBase: 5 },
  tablespoon: { group: "volume", factorToBase: 15 },
  cup: { group: "volume", factorToBase: 240 },
  pcs: { group: "count", factorToBase: 1 },
  piece: { group: "count", factorToBase: 1 },
  count: { group: "count", factorToBase: 1 },
  unit: { group: "count", factorToBase: 1 },
  units: { group: "count", factorToBase: 1 },
  pair: { group: "count", factorToBase: 2 },
  dozen: { group: "count", factorToBase: 12 },
  tray: { group: "count", factorToBase: 1 },
  tin: { group: "count", factorToBase: 1 },
  item: { group: "item", factorToBase: 1 }
};

const normalizeUnit = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const convertQuantityUnit = (quantity: number, fromUnit: string, toUnit: string) => {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) {
    return null;
  }
  if (from === to) {
    return Number(quantity.toFixed(3));
  }
  const fromMeta = UNIT_META[from];
  const toMeta = UNIT_META[to];
  if (!fromMeta || !toMeta || fromMeta.group !== toMeta.group) {
    return null;
  }
  return Number(((quantity * fromMeta.factorToBase) / toMeta.factorToBase).toFixed(3));
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
  const editModal = useDisclosure();
  const deleteDialog = useDisclosure();
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);

  const [stats, setStats] = useState<DumpStatsResponse | null>(null);
  const [records, setRecords] = useState<DumpRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<DumpRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<DumpRecord | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editNote, setEditNote] = useState("");
  const [deletingRecord, setDeletingRecord] = useState<DumpRecord | null>(null);
  const [entryOptions, setEntryOptions] = useState<{
    ingredients: Array<{ id: string; baseUnit: string; perUnitPrice: number }>;
    items: Array<{ id: string; estimatedIngredientCost: number }>;
    products: Array<{ id: string; baseUnit: string; purchaseUnitPrice: number }>;
  } | null>(null);
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
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const getRecordSourceId = useCallback((record: DumpRecord) => {
    if (record.entryType === "ingredient") {
      return record.ingredientId;
    }
    if (record.entryType === "item") {
      return record.itemId;
    }
    return record.productId;
  }, []);

  const loadEntryOptions = useCallback(async () => {
    if (entryOptions) {
      return entryOptions;
    }
    const response = await dumpService.getEntryOptions();
    const options = response.data;
    setEntryOptions(options);
    return options;
  }, [entryOptions]);

  const openEditModal = useCallback(
    async (record: DumpRecord) => {
      const sourceId = getRecordSourceId(record);
      if (!sourceId) {
        toast.error("This record cannot be edited because source reference is missing.");
        return;
      }

      try {
        await loadEntryOptions();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to load entry options for edit."));
        return;
      }

      setEditingRecord(record);
      setEditDate(record.entryDate);
      setEditQuantity(String(record.quantity));
      setEditNote(record.note ?? "");
      editModal.onOpen();
    },
    [editModal, getRecordSourceId, loadEntryOptions, toast]
  );

  const estimatedLossPreview = useMemo(() => {
    if (!editingRecord || !entryOptions) {
      return null;
    }
    const quantity = Number(editQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }

    if (editingRecord.entryType === "item") {
      const source = entryOptions.items.find((row) => row.id === editingRecord.itemId);
      if (!source) {
        return null;
      }
      return Number((quantity * source.estimatedIngredientCost).toFixed(2));
    }

    if (editingRecord.entryType === "ingredient") {
      const source = entryOptions.ingredients.find((row) => row.id === editingRecord.ingredientId);
      if (!source) {
        return null;
      }
      const converted = convertQuantityUnit(quantity, editingRecord.unit, source.baseUnit);
      if (converted === null) {
        return null;
      }
      return Number((converted * source.perUnitPrice).toFixed(2));
    }

    const source = entryOptions.products.find((row) => row.id === editingRecord.productId);
    if (!source) {
      return null;
    }
    const converted = convertQuantityUnit(quantity, editingRecord.unit, source.baseUnit);
    if (converted === null) {
      return null;
    }
    return Number((converted * source.purchaseUnitPrice).toFixed(2));
  }, [editQuantity, editingRecord, entryOptions]);

  const submitEdit = useCallback(async () => {
    if (!editingRecord) {
      return;
    }

    const sourceId = getRecordSourceId(editingRecord);
    if (!sourceId) {
      toast.error("Unable to update. Source reference is missing.");
      return;
    }

    const quantity = Number(editQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Quantity must be greater than zero.");
      return;
    }

    setSavingEdit(true);
    try {
      const response = await dumpService.updateAdminRecord(editingRecord.id, {
        entryDate: editDate || undefined,
        entryType: editingRecord.entryType,
        sourceId,
        quantity,
        quantityUnit: editingRecord.unit,
        note: editNote.trim() || undefined
      });

      toast.success("Dump entry updated. Stock restocked and recalculated successfully.");
      editModal.onClose();
      setEditingRecord(null);

      if (selectedRecord?.id === editingRecord.id) {
        setSelectedRecord(response.data.entry);
      }

      await fetchData(pagination.page, pagination.limit);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to update dump entry."));
    } finally {
      setSavingEdit(false);
    }
  }, [
    editDate,
    editModal,
    editNote,
    editQuantity,
    editingRecord,
    fetchData,
    getRecordSourceId,
    pagination.limit,
    pagination.page,
    selectedRecord?.id,
    toast
  ]);

  const openDeleteDialog = useCallback((record: DumpRecord) => {
    setDeletingRecord(record);
    deleteDialog.onOpen();
  }, [deleteDialog]);

  const confirmDelete = useCallback(async () => {
    if (!deletingRecord) {
      return;
    }

    setDeleting(true);
    try {
      await dumpService.deleteAdminRecord(deletingRecord.id);
      toast.success("Dump entry deleted and stock restocked successfully.");
      deleteDialog.onClose();

      if (selectedRecord?.id === deletingRecord.id) {
        detailModal.onClose();
        setSelectedRecord(null);
      }

      setDeletingRecord(null);
      await fetchData(1, pagination.limit);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete dump entry."));
    } finally {
      setDeleting(false);
    }
  }, [deleteDialog, deletingRecord, detailModal, fetchData, pagination.limit, selectedRecord?.id, toast]);

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
            <HStack spacing={2}>
              <AppButton
                variant="outline"
                onClick={() => {
                  setSelectedRecord(row);
                  detailModal.onOpen();
                }}
              >
                View
              </AppButton>
              <AppButton variant="outline" onClick={() => void openEditModal(row)}>
                Edit
              </AppButton>
              <AppButton variant="outline" onClick={() => openDeleteDialog(row)}>
                Delete
              </AppButton>
            </HStack>
          )
        }
      ] as Array<{
        key: string;
        header: string;
        render?: (row: DumpRecord) => ReactNode;
      }>,
    [detailModal, openDeleteDialog, openEditModal]
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

      <Modal isOpen={editModal.isOpen} onClose={editModal.onClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Dump Entry</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {editingRecord ? (
              <VStack align="stretch" spacing={3}>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <AppInput
                    label="Entry Date"
                    type="date"
                    value={editDate}
                    onChange={(event) => setEditDate((event.target as HTMLInputElement).value)}
                  />
                  <AppInput
                    label={`Quantity (${editingRecord.unit})`}
                    type="number"
                    min={0}
                    value={editQuantity}
                    onChange={(event) => setEditQuantity((event.target as HTMLInputElement).value)}
                  />
                </SimpleGrid>
                <AppInput
                  label="Note"
                  value={editNote}
                  onChange={(event) => setEditNote((event.target as HTMLInputElement).value)}
                  placeholder="Reason / correction note"
                />
                <Box p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="12px" bg="#FFF9EE">
                  <Text fontSize="sm" color="#705B52">
                    Source: <Text as="span" fontWeight={700}>{editingRecord.sourceName}</Text> (
                    {ENTRY_TYPE_LABEL[editingRecord.entryType]})
                  </Text>
                  <Text fontSize="sm" color="#705B52" mt={1}>
                    Current Saved Loss: <Text as="span" fontWeight={800}>{formatCurrency(editingRecord.lossAmount)}</Text>
                  </Text>
                  <Text fontSize="sm" color="#705B52" mt={1}>
                    Estimated Loss After Update:{" "}
                    <Text as="span" fontWeight={800} color="#A32626">
                      {estimatedLossPreview !== null ? formatCurrency(estimatedLossPreview) : "-"}
                    </Text>
                  </Text>
                  <Text mt={1} fontSize="xs" color="#705B52">
                    Saving will automatically restock old wastage and apply the updated quantity.
                  </Text>
                </Box>
              </VStack>
            ) : (
              <Text color="#705B52">No dump entry selected.</Text>
            )}
          </ModalBody>
          <ModalFooter>
            <HStack>
              <AppButton variant="outline" onClick={editModal.onClose}>
                Cancel
              </AppButton>
              <AppButton onClick={() => void submitEdit()} isLoading={savingEdit}>
                Save Changes
              </AppButton>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <AlertDialog
        isOpen={deleteDialog.isOpen}
        leastDestructiveRef={deleteCancelRef}
        onClose={deleteDialog.onClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight={800}>
              Delete Dump Entry
            </AlertDialogHeader>
            <AlertDialogBody>
              {deletingRecord ? (
                <Text>
                  Delete <Text as="span" fontWeight={800}>{deletingRecord.sourceName}</Text> ({ENTRY_TYPE_LABEL[deletingRecord.entryType]})?
                  Stock will be restocked automatically.
                </Text>
              ) : (
                <Text>Delete selected dump entry?</Text>
              )}
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={deleteCancelRef} onClick={deleteDialog.onClose}>
                Cancel
              </Button>
              <Button ml={3} colorScheme="red" onClick={() => void confirmDelete()} isLoading={deleting}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

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
                    {selectedRecord.lossAmount <= 0 ? (
                      <Text mt={1} fontSize="xs" color="#B91C1C" fontWeight={700}>
                        Loss is zero. Use Edit and save once to recalculate with latest source cost.
                      </Text>
                    ) : null}
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
