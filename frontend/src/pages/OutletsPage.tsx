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
import { Edit2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { outletService } from "@/services/outlet.service";
import { outletTransferService } from "@/services/outlet-transfer.service";
import type { OutletTransferRecord } from "@/types/outlet-transfer";
import type { OutletListItem } from "@/types/outlet";
import { extractErrorMessage } from "@/utils/api-error";

const defaultPagination = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1
};

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

type OutletFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialData: OutletListItem | null;
  loading: boolean;
  onSubmit: (payload: {
    outletName: string;
    location: string;
    managerName: string;
    managerPhone: string;
    isActive: boolean;
  }) => Promise<void>;
};

const OutletFormModal = ({ isOpen, onClose, initialData, loading, onSubmit }: OutletFormModalProps) => {
  const [outletName, setOutletName] = useState("");
  const [location, setLocation] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setOutletName(initialData?.outletName ?? "");
    setLocation(initialData?.location ?? "");
    setManagerName(initialData?.managerName ?? "");
    setManagerPhone(initialData?.managerPhone ?? "");
    setIsActive(initialData?.isActive ?? true);
  }, [initialData, isOpen]);

  const handleSubmit = async () => {
    await onSubmit({
      outletName: outletName.trim(),
      location: location.trim(),
      managerName: managerName.trim(),
      managerPhone: managerPhone.trim(),
      isActive
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent borderRadius="18px">
        <ModalHeader>{initialData ? "Edit Outlet" : "Create Outlet"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            {initialData ? (
              <AppInput label="Outlet Code" value={initialData.outletCode} isDisabled />
            ) : (
              <AppInput label="Outlet Code" value="Auto-generated (DND001...)" isDisabled />
            )}
            <AppInput
              label="Outlet Name"
              value={outletName}
              onChange={(event) => setOutletName((event.target as HTMLInputElement).value)}
            />
            <AppInput label="Location" value={location} onChange={(event) => setLocation((event.target as HTMLInputElement).value)} />
            <AppInput
              label="Manager Name"
              value={managerName}
              onChange={(event) => setManagerName((event.target as HTMLInputElement).value)}
            />
            <AppInput
              label="Manager Phone"
              value={managerPhone}
              onChange={(event) => setManagerPhone((event.target as HTMLInputElement).value)}
            />
            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <FormLabel mb={0} fontWeight={600}>
                Active Outlet
              </FormLabel>
              <Switch isChecked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <AppButton variant="outline" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            onClick={() => void handleSubmit()}
            isLoading={loading}
            isDisabled={
              outletName.trim().length < 2 ||
              location.trim().length < 2 ||
              managerName.trim().length < 2 ||
              managerPhone.trim().length < 7
            }
          >
            {initialData ? "Save Outlet" : "Create Outlet"}
          </AppButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export const OutletsPage = () => {
  const toast = useAppToast();
  const outletModal = useDisclosure();

  const [rows, setRows] = useState<OutletListItem[]>([]);
  const [stats, setStats] = useState({
    totalOutlets: 0,
    activeOutlets: 0,
    inactiveOutlets: 0,
    locationCount: 0,
    createdLast30Days: 0,
    lastCreatedAt: null as string | null
  });
  const [pagination, setPagination] = useState(defaultPagination);
  const [loading, setLoading] = useState(true);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [transferRows, setTransferRows] = useState<OutletTransferRecord[]>([]);
  const [transferLoading, setTransferLoading] = useState(true);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selectedOutlet, setSelectedOutlet] = useState<OutletListItem | null>(null);

  const loadOutlets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await outletService.getOutlets({
        search: debouncedSearch || undefined,
        includeInactive: true,
        page,
        limit
      });
      setRows(response.data.outlets);
      setPagination(response.data.pagination);
      setStats(response.data.stats);
    } catch (error) {
      toast.error("Unable to fetch outlets", extractErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, limit, page, toast]);

  const loadTransfers = useCallback(async () => {
    setTransferLoading(true);
    try {
      const response = await outletTransferService.getRecords({
        page: 1,
        limit: 10
      });
      setTransferRows(response.data.records);
    } catch (error) {
      toast.error("Unable to fetch outlet transfer records", extractErrorMessage(error));
    } finally {
      setTransferLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadOutlets();
    void loadTransfers();
  }, [loadOutlets, loadTransfers]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, limit]);

  const handleCreateClick = () => {
    setSelectedOutlet(null);
    outletModal.onOpen();
  };

  const handleEditClick = (row: OutletListItem) => {
    setSelectedOutlet(row);
    outletModal.onOpen();
  };

  const handleSubmitOutlet = async (payload: {
    outletName: string;
    location: string;
    managerName: string;
    managerPhone: string;
    isActive: boolean;
  }) => {
    setMutationLoading(true);
    try {
      if (selectedOutlet) {
        await outletService.updateOutlet(selectedOutlet.id, payload);
        toast.success("Outlet updated successfully");
      } else {
        await outletService.createOutlet(payload);
        toast.success("Outlet created successfully");
      }
      outletModal.onClose();
      setSelectedOutlet(null);
      await loadOutlets();
      await loadTransfers();
    } catch (error) {
      toast.error("Unable to save outlet", extractErrorMessage(error));
    } finally {
      setMutationLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "outletCode",
        header: "Outlet",
        render: (row: OutletListItem) => (
          <Box>
            <Text fontWeight={900}>{row.outletCode}</Text>
            <Text color="#7A6359" fontSize="sm">
              {row.outletName}
            </Text>
          </Box>
        )
      },
      {
        key: "location",
        header: "Location",
        render: (row: OutletListItem) => <Text>{row.location}</Text>
      },
      {
        key: "manager",
        header: "Manager",
        render: (row: OutletListItem) => (
          <Box>
            <Text fontWeight={800}>{row.managerName}</Text>
            <Text fontSize="sm" color="#7A6359">
              {row.managerPhone}
            </Text>
          </Box>
        )
      },
      {
        key: "status",
        header: "Status",
        render: (row: OutletListItem) => (
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
        key: "createdAt",
        header: "Created",
        render: (row: OutletListItem) => <Text>{formatDateTime(row.createdAt)}</Text>
      },
      {
        key: "actions",
        header: "Actions",
        render: (row: OutletListItem) => (
          <ActionIconButton
            aria-label="Edit outlet"
            tooltip="Edit outlet"
            icon={<Edit2 size={16} />}
            size="sm"
            variant="outline"
            onClick={() => handleEditClick(row)}
          />
        )
      }
    ],
    []
  );

  const transferColumns = useMemo(
    () => [
      {
        key: "transfer",
        header: "Transfer",
        render: (row: OutletTransferRecord) => (
          <Box>
            <Text fontWeight={900}>{row.transferNumber}</Text>
            <Text fontSize="sm" color="#7A6359">
              {row.transferDate}
            </Text>
          </Box>
        )
      },
      {
        key: "movement",
        header: "Movement",
        render: (row: OutletTransferRecord) => (
          <Box>
            <Text fontWeight={800}>{row.fromOutletName}</Text>
            <Text fontSize="sm" color="#7A6359">
              to {row.toOutletName}
            </Text>
          </Box>
        )
      },
      {
        key: "lines",
        header: "Lines",
        render: (row: OutletTransferRecord) => <Text fontWeight={700}>{row.lineCount}</Text>
      },
      {
        key: "value",
        header: "Total Value",
        render: (row: OutletTransferRecord) => <Text fontWeight={700}>₹{row.totalValue.toFixed(2)}</Text>
      },
      {
        key: "createdBy",
        header: "Created By",
        render: (row: OutletTransferRecord) => <Text>{row.createdByUserName}</Text>
      }
    ],
    []
  );

  return (
    <VStack spacing={5} align="stretch">
      <PageHeader title="Outlets" subtitle="Create and manage branches with manager contact details and live counts." />

      <SimpleGrid columns={{ base: 2, lg: 5 }} spacing={3}>
        <AppCard p={4}>
          <Text color="#7B645B" fontWeight={600} fontSize="sm">
            Total Outlets
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900}>
            {stats.totalOutlets}
          </Text>
        </AppCard>
        <AppCard p={4}>
          <Text color="#7B645B" fontWeight={600} fontSize="sm">
            Active
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900} color="#15803D">
            {stats.activeOutlets}
          </Text>
        </AppCard>
        <AppCard p={4}>
          <Text color="#7B645B" fontWeight={600} fontSize="sm">
            Inactive
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900} color="#B91C1C">
            {stats.inactiveOutlets}
          </Text>
        </AppCard>
        <AppCard p={4}>
          <Text color="#7B645B" fontWeight={600} fontSize="sm">
            Locations Covered
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900}>
            {stats.locationCount}
          </Text>
        </AppCard>
        <AppCard p={4}>
          <Text color="#7B645B" fontWeight={600} fontSize="sm">
            Added (30 days)
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900}>
            {stats.createdLast30Days}
          </Text>
          <Text mt={1} fontSize="xs" color="#7B645B">
            Last: {formatDateTime(stats.lastCreatedAt)}
          </Text>
        </AppCard>
      </SimpleGrid>

      <AppCard>
        <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3}>
          <AppInput
            label="Search"
            placeholder="Search code/name/location/manager"
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
              Add Outlet
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
                  title="No outlets found"
                  description="Create your first branch to start outlet management."
                  action={
                    <AppButton leftIcon={<Plus size={16} />} onClick={handleCreateClick}>
                      Add Outlet
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

      <OutletFormModal
        isOpen={outletModal.isOpen}
        onClose={() => {
          outletModal.onClose();
          setSelectedOutlet(null);
        }}
        initialData={selectedOutlet}
        loading={mutationLoading}
        onSubmit={handleSubmitOutlet}
      />

      <AppCard title="Outlet Transfer Movement">
        {transferLoading ? (
          <SkeletonTable rows={5} />
        ) : (
          <DataTable
            columns={transferColumns}
            rows={transferRows}
            emptyState={<EmptyState title="No transfers yet" description="Outlet transfer records will appear here." />}
          />
        )}
      </AppCard>
    </VStack>
  );
};
