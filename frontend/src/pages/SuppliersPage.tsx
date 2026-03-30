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
  Switch,
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
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import { procurementService } from "@/services/procurement.service";
import type { SupplierListItem } from "@/types/procurement";
import { extractErrorMessage } from "@/utils/api-error";

const defaultPagination = {
  page: 1,
  limit: 5,
  total: 0,
  totalPages: 1
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

type SupplierFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialData: SupplierListItem | null;
  loading: boolean;
  onSubmit: (payload: { name: string; storeName?: string; phone: string; address?: string; isActive: boolean }) => Promise<void>;
};

const SupplierFormModal = ({ isOpen, onClose, initialData, loading, onSubmit }: SupplierFormModalProps) => {
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);
  const [name, setName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setName(initialData?.name ?? "");
    setStoreName(initialData?.storeName ?? "");
    setPhone(initialData?.phone ?? "");
    setAddress(initialData?.address ?? "");
    setIsActive(initialData?.isActive ?? true);
  }, [initialData, isOpen]);

  const handleSubmit = async () => {
    await onSubmit({
      name: name.trim(),
      storeName: storeName.trim() || undefined,
      phone: phone.trim(),
      address: address.trim() || undefined,
      isActive
    });
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={requestClose} isCentered size="lg" closeOnOverlayClick={false} closeOnEsc={false}>
        <ModalOverlay />
        <ModalContent borderRadius="18px">
          <ModalHeader>{initialData ? "Edit Supplier" : "Create Supplier"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <AppInput label="Supplier Name" value={name} onChange={(event) => setName((event.target as HTMLInputElement).value)} />
              <AppInput
                label="Supplier Store Name"
                value={storeName}
                onChange={(event) => setStoreName((event.target as HTMLInputElement).value)}
              />
              <AppInput label="Phone Number" value={phone} onChange={(event) => setPhone((event.target as HTMLInputElement).value)} />
              <AppInput label="Address" value={address} onChange={(event) => setAddress((event.target as HTMLInputElement).value)} />
              <FormControl display="flex" alignItems="center" justifyContent="space-between">
                <FormLabel mb={0} fontWeight={600}>
                  Active Supplier
                </FormLabel>
                <Switch isChecked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={3}>
            <AppButton variant="outline" onClick={requestClose}>
              Cancel
            </AppButton>
            <AppButton
              onClick={() => void handleSubmit()}
              isLoading={loading}
              isDisabled={name.trim().length < 2 || phone.trim().length < 7}
            >
              {initialData ? "Save Supplier" : "Create Supplier"}
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <ConfirmDialog
        isOpen={isCloseConfirmOpen}
        title="Close this popup?"
        description="Are you sure you want to close? Unsaved changes will be lost."
        onClose={cancelCloseRequest}
        onConfirm={confirmClose}
      />
    </>
  );
};

export const SuppliersPage = () => {
  const toast = useAppToast();

  const [rows, setRows] = useState<SupplierListItem[]>([]);
  const [stats, setStats] = useState({
    totalSuppliers: 0,
    activeSuppliers: 0,
    inactiveSuppliers: 0,
    totalPurchaseOrders: 0,
    totalPurchasedAmount: 0
  });
  const [pagination, setPagination] = useState(defaultPagination);
  const [loading, setLoading] = useState(true);
  const [mutationLoading, setMutationLoading] = useState(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);

  const [selectedSupplier, setSelectedSupplier] = useState<SupplierListItem | null>(null);

  const supplierModal = useDisclosure();
  const deleteDialog = useDisclosure();

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await procurementService.getSuppliers({
        search: debouncedSearch || undefined,
        includeInactive: true,
        page,
        limit
      });
      setRows(response.data.suppliers);
      setPagination(response.data.pagination);
      setStats(response.data.stats);
    } catch (error) {
      toast.error("Unable to fetch suppliers", extractErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, limit, page, toast]);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, limit]);

  const handleCreateClick = () => {
    setSelectedSupplier(null);
    supplierModal.onOpen();
  };

  const handleEditClick = (row: SupplierListItem) => {
    setSelectedSupplier(row);
    supplierModal.onOpen();
  };

  const handleDeleteClick = (row: SupplierListItem) => {
    setSelectedSupplier(row);
    deleteDialog.onOpen();
  };

  const handleSubmitSupplier = async (payload: {
    name: string;
    storeName?: string;
    phone: string;
    address?: string;
    isActive: boolean;
  }) => {
    setMutationLoading(true);
    try {
      if (selectedSupplier) {
        await procurementService.updateSupplier(selectedSupplier.id, payload);
        toast.success("Supplier updated successfully");
      } else {
        await procurementService.createSupplier(payload);
        toast.success("Supplier created successfully");
      }
      supplierModal.onClose();
      setSelectedSupplier(null);
      await loadSuppliers();
    } catch (error) {
      toast.error("Unable to save supplier", extractErrorMessage(error));
    } finally {
      setMutationLoading(false);
    }
  };

  const handleDeleteSupplier = async () => {
    if (!selectedSupplier) {
      return;
    }
    setMutationLoading(true);
    try {
      await procurementService.deleteSupplier(selectedSupplier.id);
      toast.success("Supplier deleted successfully");
      deleteDialog.onClose();
      setSelectedSupplier(null);
      await loadSuppliers();
    } catch (error) {
      toast.error("Unable to delete supplier", extractErrorMessage(error));
    } finally {
      setMutationLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Supplier",
        render: (row: SupplierListItem) => (
          <Box>
            <Text fontWeight={800}>{row.name}</Text>
            <Text fontSize="sm" color="#7A6359">
              {row.storeName ? `${row.storeName} | ${row.phone}` : row.phone}
            </Text>
          </Box>
        )
      },
      {
        key: "address",
        header: "Address",
        render: (row: SupplierListItem) => <Text>{row.address || "-"}</Text>
      },
      {
        key: "orders",
        header: "Purchase Orders",
        render: (row: SupplierListItem) => <Text fontWeight={700}>{row.purchaseOrdersCount}</Text>
      },
      {
        key: "amount",
        header: "Purchased Amount",
        render: (row: SupplierListItem) => <Text fontWeight={700}>{formatCurrency(row.totalPurchasedAmount)}</Text>
      },
      {
        key: "lastPurchase",
        header: "Last Purchase",
        render: (row: SupplierListItem) => <Text>{formatDateTime(row.lastPurchaseDate)}</Text>
      },
      {
        key: "status",
        header: "Status",
        render: (row: SupplierListItem) => (
          <Box
            px={3}
            py={1}
            borderRadius="full"
            w="fit-content"
            fontSize="xs"
            fontWeight={700}
            bg={row.isActive ? "green.100" : "gray.200"}
            color={row.isActive ? "green.700" : "gray.700"}
          >
            {row.isActive ? "Active" : "Inactive"}
          </Box>
        )
      },
      {
        key: "actions",
        header: "Actions",
        render: (row: SupplierListItem) => (
          <HStack spacing={2}>
            <ActionIconButton
              aria-label="Edit supplier"
              tooltip="Edit supplier"
              icon={<Edit2 size={16} />}
              size="sm"
              variant="outline"
              onClick={() => handleEditClick(row)}
            />
            <ActionIconButton
              aria-label="Delete supplier"
              tooltip="Delete supplier"
              icon={<Trash2 size={16} />}
              size="sm"
              variant="outline"
              colorScheme="accentRed"
              onClick={() => handleDeleteClick(row)}
            />
          </HStack>
        )
      }
    ],
    []
  );

  return (
    <VStack spacing={5} align="stretch">
      <PageHeader
        title="Suppliers"
        subtitle="Manage ingredient and product suppliers with purchase visibility."
      />

      <SimpleGrid columns={{ base: 2, lg: 5 }} spacing={3}>
        <AppCard p={4}>
          <Text color="#7B645B" fontWeight={600} fontSize="sm">
            Total Suppliers
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900}>
            {stats.totalSuppliers}
          </Text>
        </AppCard>
        <AppCard p={4}>
          <Text color="#7B645B" fontWeight={600} fontSize="sm">
            Active
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900} color="#15803D">
            {stats.activeSuppliers}
          </Text>
        </AppCard>
        <AppCard p={4}>
          <Text color="#7B645B" fontWeight={600} fontSize="sm">
            Inactive
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900} color="#B91C1C">
            {stats.inactiveSuppliers}
          </Text>
        </AppCard>
        <AppCard p={4}>
          <Text color="#7B645B" fontWeight={600} fontSize="sm">
            Purchase Orders
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900}>
            {stats.totalPurchaseOrders}
          </Text>
        </AppCard>
        <AppCard p={4}>
          <Text color="#7B645B" fontWeight={600} fontSize="sm">
            Total Purchased
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900}>
            {formatCurrency(stats.totalPurchasedAmount)}
          </Text>
        </AppCard>
      </SimpleGrid>

      <AppCard>
        <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3}>
          <AppInput
            label="Search"
            placeholder="Search supplier"
            value={search}
            onChange={(event) => setSearch((event.target as HTMLInputElement).value)}
          />
          <FormControl>
            <FormLabel>Rows per page</FormLabel>
            <Select
              value={limit}
              onChange={(event) => setLimit(Number((event.target as HTMLSelectElement).value))}
              bg="white"
              borderColor="rgba(193, 14, 14, 0.18)"
              focusBorderColor="brand.400"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </Select>
          </FormControl>
          <Box />
          <HStack justify={{ base: "stretch", md: "flex-end" }} align="end">
            <AppButton leftIcon={<Plus size={16} />} onClick={handleCreateClick} w={{ base: "full", md: "auto" }}>
              Add Supplier
            </AppButton>
          </HStack>
        </SimpleGrid>

        <Box mt={4}>
          {loading ? (
            <SkeletonTable rows={5} />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              emptyState={
                <EmptyState
                  title="No suppliers found"
                  description="Create a supplier to start purchase ordering."
                  action={
                    <AppButton leftIcon={<Plus size={16} />} onClick={handleCreateClick}>
                      Add Supplier
                    </AppButton>
                  }
                />
              }
            />
          )}
        </Box>

        <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
          <Text color="#705B52" fontSize="sm">
            Showing {rows.length} of {pagination.total} records
          </Text>
          <HStack>
            <AppButton variant="outline" isDisabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
              Previous
            </AppButton>
            <Text fontWeight={700}>
              Page {pagination.page} of {pagination.totalPages}
            </Text>
            <AppButton
              variant="outline"
              isDisabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Next
            </AppButton>
          </HStack>
        </HStack>
      </AppCard>

      <SupplierFormModal
        isOpen={supplierModal.isOpen}
        onClose={() => {
          supplierModal.onClose();
          setSelectedSupplier(null);
        }}
        initialData={selectedSupplier}
        loading={mutationLoading}
        onSubmit={handleSubmitSupplier}
      />

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Delete supplier?"
        description={
          selectedSupplier
            ? `Are you sure you want to delete ${selectedSupplier.name}? This action cannot be undone.`
            : "Are you sure you want to delete this supplier?"
        }
        onClose={() => {
          deleteDialog.onClose();
          setSelectedSupplier(null);
        }}
        onConfirm={() => void handleDeleteSupplier()}
        isLoading={mutationLoading}
      />
    </VStack>
  );
};



