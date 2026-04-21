import {
  Box,
  Checkbox,
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
  VStack,
  useDisclosure
} from "@chakra-ui/react";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { DataTable } from "@/components/ui/DataTable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAppToast } from "@/hooks/useAppToast";
import { assetsService } from "@/services/assets.service";
import type { AssetListItem, AssetListResponse, AssetUnit } from "@/types/assets";
import type { PaginationData } from "@/types/ingredient";
import { extractErrorMessage } from "@/utils/api-error";

const defaultPagination: PaginationData = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1
};

const unitOptions: AssetUnit[] = ["pcs", "unit", "set", "nos", "kg", "g", "l", "ml", "custom"];

const AssetMetric = ({ label, value, helper }: { label: string; value: string; helper?: string }) => (
  <Box
    p={4}
    borderRadius="18px"
    border="1px solid"
    borderColor="rgba(133, 78, 48, 0.24)"
    bg="linear-gradient(180deg, #FFFFFF 0%, #FFF7EA 100%)"
    boxShadow="0 10px 18px rgba(72, 29, 11, 0.08)"
    minH="110px"
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

type AssetFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  initialData: AssetListItem | null;
  onSubmit: (payload: {
    name: string;
    quantity: number;
    unit: AssetUnit;
    isActive: boolean;
  }) => Promise<void>;
};

const AssetFormModal = ({ isOpen, onClose, loading, initialData, onSubmit }: AssetFormModalProps) => {
  const [form, setForm] = useState({
    name: "",
    quantity: "0",
    unit: "pcs" as AssetUnit,
    isActive: true
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setForm({
      name: initialData?.name ?? "",
      quantity: String(initialData?.quantity ?? 0),
      unit: (initialData?.unit as AssetUnit) || "pcs",
      isActive: initialData?.isActive ?? true
    });
  }, [initialData, isOpen]);

  const hasInvalid = !form.name.trim() || Number(form.quantity) < 0 || !Number.isFinite(Number(form.quantity));

  const handleSave = async () => {
    await onSubmit({
      name: form.name.trim(),
      quantity: Number(form.quantity),
      unit: form.unit,
      isActive: form.isActive
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
      <ModalOverlay />
      <ModalContent borderRadius="18px">
        <ModalHeader>{initialData ? "Edit Asset" : "Create Asset"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <AppInput
              label="Asset Name"
              value={form.name}
              onChange={(event) => setForm((previous) => ({ ...previous, name: (event.target as HTMLInputElement).value }))}
            />
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <AppInput
                label="Quantity"
                type="number"
                min={0}
                step="0.001"
                value={form.quantity}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, quantity: (event.target as HTMLInputElement).value }))
                }
              />
              <FormControl>
                <FormLabel>Unit</FormLabel>
                <Select
                  value={form.unit}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, unit: event.target.value as AssetUnit }))
                  }
                >
                  {unitOptions.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit.toUpperCase()}
                    </option>
                  ))}
                </Select>
              </FormControl>
            </SimpleGrid>
            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <FormLabel mb={0}>Active Asset</FormLabel>
              <Checkbox
                isChecked={form.isActive}
                onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))}
              >
                Active
              </Checkbox>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <AppButton variant="outline" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton onClick={() => void handleSave()} isLoading={loading} isDisabled={hasInvalid}>
            {initialData ? "Save Asset" : "Create Asset"}
          </AppButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export const AssetsEntryPage = () => {
  const toast = useAppToast();
  const assetModal = useDisclosure();
  const deleteDialog = useDisclosure();

  const [rows, setRows] = useState<AssetListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationData>(defaultPagination);
  const [stats, setStats] = useState<AssetListResponse["stats"]>({
    totalAssets: 0,
    activeAssets: 0,
    inactiveAssets: 0,
    totalQuantity: 0
  });

  const [loading, setLoading] = useState(true);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selectedAsset, setSelectedAsset] = useState<AssetListItem | null>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await assetsService.getAssets({
        search: debouncedSearch || undefined,
        includeInactive: true,
        page,
        limit
      });
      setRows(response.data.assets);
      setPagination(response.data.pagination);
      setStats(response.data.stats);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch assets."));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, limit, page, toast]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, limit]);

  const lowQuantityRows = useMemo(() => rows.filter((row) => row.isActive && row.quantity <= 0), [rows]);

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Asset",
        render: (row: AssetListItem) => (
          <Box>
            <Text fontWeight={800}>{row.name}</Text>
            <Text fontSize="sm" color="#7A6359">
              ID: {row.id.slice(0, 8)}
            </Text>
          </Box>
        )
      },
      { key: "quantity", header: "Quantity", render: (row: AssetListItem) => row.quantity },
      { key: "unit", header: "Unit", render: (row: AssetListItem) => row.unit.toUpperCase() },
      {
        key: "status",
        header: "Status",
        render: (row: AssetListItem) => (
          <Box
            px={3}
            py={1}
            borderRadius="full"
            bg={row.isActive ? "green.100" : "gray.200"}
            color={row.isActive ? "green.700" : "gray.700"}
            fontSize="xs"
            fontWeight={700}
            w="fit-content"
          >
            {row.isActive ? "Active" : "Inactive"}
          </Box>
        )
      },
      {
        key: "updatedAt",
        header: "Last Updated",
        render: (row: AssetListItem) => new Date(row.updatedAt).toLocaleString("en-IN")
      },
      {
        key: "actions",
        header: "Actions",
        render: (row: AssetListItem) => (
          <HStack spacing={2}>
            <ActionIconButton
              aria-label="Edit asset"
              tooltip="Edit asset"
              icon={<Edit2 size={16} />}
              variant="outline"
              onClick={() => {
                setSelectedAsset(row);
                assetModal.onOpen();
              }}
            />
            <ActionIconButton
              aria-label="Delete asset"
              tooltip="Delete asset"
              icon={<Trash2 size={16} />}
              variant="outline"
              colorScheme="accentRed"
              onClick={() => {
                setSelectedAsset(row);
                deleteDialog.onOpen();
              }}
            />
          </HStack>
        )
      }
    ],
    [assetModal, deleteDialog]
  );

  const handleSaveAsset = useCallback(
    async (payload: {
      name: string;
      quantity: number;
      unit: AssetUnit;
      isActive: boolean;
    }) => {
      setMutationLoading(true);
      try {
        if (selectedAsset) {
          await assetsService.updateAsset(selectedAsset.id, payload);
          toast.success("Asset updated successfully.");
        } else {
          await assetsService.createAsset(payload);
          toast.success("Asset created successfully.");
        }
        assetModal.onClose();
        setSelectedAsset(null);
        await loadAssets();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to save asset."));
      } finally {
        setMutationLoading(false);
      }
    },
    [assetModal, loadAssets, selectedAsset, toast]
  );

  const handleDeleteAsset = useCallback(async () => {
    if (!selectedAsset) {
      return;
    }
    setMutationLoading(true);
    try {
      await assetsService.deleteAsset(selectedAsset.id);
      toast.success("Asset deleted successfully.");
      deleteDialog.onClose();
      setSelectedAsset(null);
      await loadAssets();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete asset."));
    } finally {
      setMutationLoading(false);
    }
  }, [deleteDialog, loadAssets, selectedAsset, toast]);

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Assets Entry"
        subtitle="Manage kitchen assets like vessels, gas cylinders and equipment."
      />

      <AppCard
        title="Assets Control Room"
        subtitle="Add, edit and delete asset records with quantity and unit."
        rightContent={
          <AppButton
            leftIcon={<Plus size={16} />}
            onClick={() => {
              setSelectedAsset(null);
              assetModal.onOpen();
            }}
          >
            Add Asset
          </AppButton>
        }
      >
        <SimpleGrid columns={{ base: 1, md: 3, xl: 5 }} spacing={4}>
          <AppInput
            label="Search"
            placeholder="Search by asset name / unit"
            value={search}
            onChange={(event) => setSearch((event.target as HTMLInputElement).value)}
          />
          <FormControl>
            <FormLabel>Rows per page</FormLabel>
            <Select value={String(limit)} onChange={(event) => setLimit(Number(event.target.value) || 10)}>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </Select>
          </FormControl>
        </SimpleGrid>
      </AppCard>

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4}>
        <AssetMetric label="Total Assets" value={String(stats.totalAssets)} />
        <AssetMetric label="Active Assets" value={String(stats.activeAssets)} />
        <AssetMetric label="Inactive Assets" value={String(stats.inactiveAssets)} />
        <AssetMetric label="Total Quantity" value={String(stats.totalQuantity)} helper="Across filtered inventory" />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4}>
        <Box gridColumn={{ base: "auto", xl: "span 2" }}>
          <AppCard title="Asset Registry" subtitle="Track all assets with quantity and unit">
            {loading ? (
              <SkeletonTable />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={rows.map((row) => ({ ...row, id: row.id }))}
                  emptyState={<EmptyState title="No assets found" description="Add your first kitchen asset to start tracking." />}
                />
                <HStack justify="space-between" mt={4}>
                  <Text color="#705B52" fontSize="sm">
                    Showing {rows.length} of {pagination.total} records
                  </Text>
                  <HStack>
                    <AppButton variant="outline" isDisabled={page <= 1} onClick={() => setPage((previous) => previous - 1)}>
                      Previous
                    </AppButton>
                    <Text fontWeight={700}>
                      Page {pagination.page} of {pagination.totalPages}
                    </Text>
                    <AppButton
                      variant="outline"
                      isDisabled={pagination.page >= pagination.totalPages}
                      onClick={() => setPage((previous) => previous + 1)}
                    >
                      Next
                    </AppButton>
                  </HStack>
                </HStack>
              </>
            )}
          </AppCard>
        </Box>

        <AppCard title="Refill Watch" subtitle="Assets with zero quantity">
          {lowQuantityRows.length ? (
            <VStack align="stretch" spacing={3}>
              {lowQuantityRows.slice(0, 10).map((row) => (
                <Box
                  key={row.id}
                  p={3}
                  borderRadius="12px"
                  border="1px solid"
                  borderColor="rgba(185, 28, 28, 0.28)"
                  bg="rgba(255, 240, 240, 0.6)"
                >
                  <Text fontWeight={800} color="#2A1A14">
                    {row.name}
                  </Text>
                  <Text fontSize="sm" color="#7A6359">
                    Quantity {row.quantity} {row.unit.toUpperCase()}
                  </Text>
                  <Text fontSize="sm" color="#8D1C13" fontWeight={700}>
                    Last update {new Date(row.updatedAt).toLocaleString("en-IN")}
                  </Text>
                </Box>
              ))}
            </VStack>
          ) : (
            <EmptyState title="No refill alerts" description="All active assets currently have quantity above zero." />
          )}
        </AppCard>
      </SimpleGrid>

      <AssetFormModal
        isOpen={assetModal.isOpen}
        onClose={() => {
          setSelectedAsset(null);
          assetModal.onClose();
        }}
        loading={mutationLoading}
        initialData={selectedAsset}
        onSubmit={handleSaveAsset}
      />

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Delete this asset?"
        description={selectedAsset ? `Are you sure you want to delete ${selectedAsset.name}?` : "Are you sure?"}
        onClose={() => {
          deleteDialog.onClose();
          setSelectedAsset(null);
        }}
        onConfirm={() => void handleDeleteAsset()}
        isLoading={mutationLoading}
      />
    </VStack>
  );
};
