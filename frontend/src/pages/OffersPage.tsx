import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  Select,
  SimpleGrid,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
  useDisclosure
} from "@chakra-ui/react";
import { Copy, CopyPlus, Edit2, Eye, Plus, Trash2 } from "lucide-react";
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
import { useAuth } from "@/context/AuthContext";
import { CouponFormModal } from "@/features/offers/components/CouponFormModal";
import { CouponUsageModal } from "@/features/offers/components/CouponUsageModal";
import { useAppToast } from "@/hooks/useAppToast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { offersService } from "@/services/offers.service";
import type {
  CouponDetail,
  CouponDerivedStatus,
  CouponDiscountType,
  CouponListItem,
  CouponUsageRow,
  CouponUsageSummary,
  OfferItemCategoryMeta,
  OfferItemMeta,
  OfferPagination,
  OfferStats
} from "@/types/offer";
import { UserRole } from "@/types/role";
import { extractErrorMessage } from "@/utils/api-error";

const defaultPagination: OfferPagination = {
  page: 1,
  limit: 5,
  total: 0,
  totalPages: 1
};

const defaultStats: OfferStats = {
  totalCoupons: 0,
  activeCoupons: 0,
  expiredCoupons: 0,
  scheduledCoupons: 0,
  disabledCoupons: 0,
  totalCouponUsages: 0,
  freeItemCoupons: 0
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const formatDate = (value: string) => new Date(value).toLocaleDateString("en-IN");

const derivedStatusColorMap: Record<CouponDerivedStatus, { bg: string; color: string; label: string }> = {
  active: { bg: "green.100", color: "green.700", label: "Active" },
  disabled: { bg: "gray.100", color: "gray.700", label: "Disabled" },
  scheduled: { bg: "blue.100", color: "blue.700", label: "Scheduled" },
  expired: { bg: "red.100", color: "red.700", label: "Expired" }
};

const discountTypeLabelMap: Record<CouponDiscountType, string> = {
  percentage: "Percentage",
  fixed_amount: "Fixed Amount",
  free_item: "Free Item"
};

const StatusBadge = ({ status }: { status: CouponDerivedStatus }) => (
  <Box
    px={3}
    py={1}
    borderRadius="full"
    fontSize="xs"
    fontWeight={700}
    bg={derivedStatusColorMap[status].bg}
    color={derivedStatusColorMap[status].color}
    w="fit-content"
  >
    {derivedStatusColorMap[status].label}
  </Box>
);

export const OffersPage = () => {
  const { user } = useAuth();
  const toast = useAppToast();

  const [stats, setStats] = useState<OfferStats>(defaultStats);
  const [statsLoading, setStatsLoading] = useState(true);

  const [rows, setRows] = useState<CouponListItem[]>([]);
  const [pagination, setPagination] = useState<OfferPagination>(defaultPagination);
  const [tableLoading, setTableLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [discountTypeFilter, setDiscountTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [firstTimeUserFilter, setFirstTimeUserFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);

  const [itemCategories, setItemCategories] = useState<OfferItemCategoryMeta[]>([]);
  const [itemOptionsCache, setItemOptionsCache] = useState<Record<string, OfferItemMeta[]>>({});

  const [mutationLoading, setMutationLoading] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<CouponDetail | null>(null);
  const [selectedCouponRow, setSelectedCouponRow] = useState<CouponListItem | null>(null);
  const [rowActionLoading, setRowActionLoading] = useState<Record<string, boolean>>({});

  const [usageRows, setUsageRows] = useState<CouponUsageRow[]>([]);
  const [usageSummary, setUsageSummary] = useState<CouponUsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usagePage, setUsagePage] = useState(1);
  const [usagePagination, setUsagePagination] = useState<OfferPagination>(defaultPagination);
  const [usageCoupon, setUsageCoupon] = useState<CouponListItem | null>(null);

  const formModal = useDisclosure();
  const deleteDialog = useDisclosure();
  const usageModal = useDisclosure();

  const runRowAction = useCallback(async (key: string, action: () => Promise<void>) => {
    setRowActionLoading((previous) => ({ ...previous, [key]: true }));
    try {
      await action();
    } finally {
      setRowActionLoading((previous) => ({ ...previous, [key]: false }));
    }
  }, []);

  const loadItemsByCategory = useCallback(
    async (categoryId: string) => {
      if (!categoryId) {
        return [];
      }

      if (itemOptionsCache[categoryId]) {
        return itemOptionsCache[categoryId];
      }

      const response = await offersService.getItemsMeta({ categoryId });
      const items = response.data.items;
      setItemOptionsCache((previous) => ({ ...previous, [categoryId]: items }));
      return items;
    },
    [itemOptionsCache]
  );

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await offersService.getStats();
      setStats(response.data.stats);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch offer stats right now."));
    } finally {
      setStatsLoading(false);
    }
  }, [toast]);

  const fetchCoupons = useCallback(async () => {
    setTableLoading(true);
    try {
      const response = await offersService.getCoupons({
        search: debouncedSearch || undefined,
        discountType: (discountTypeFilter || undefined) as CouponDiscountType | undefined,
        status: (statusFilter || undefined) as CouponDerivedStatus | undefined,
        firstTimeUserOnly:
          firstTimeUserFilter === "all" ? undefined : firstTimeUserFilter === "true",
        page,
        limit
      });
      setRows(response.data.coupons);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch coupons."));
    } finally {
      setTableLoading(false);
    }
  }, [debouncedSearch, discountTypeFilter, firstTimeUserFilter, limit, page, statusFilter, toast]);

  const fetchItemCategories = useCallback(async () => {
    try {
      const response = await offersService.getItemCategoriesMeta();
      setItemCategories(response.data.itemCategories);
    } catch {
      setItemCategories([]);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    void fetchCoupons();
  }, [fetchCoupons]);

  useEffect(() => {
    void fetchItemCategories();
  }, [fetchItemCategories]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, discountTypeFilter, firstTimeUserFilter, limit, statusFilter]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchCoupons()]);
  }, [fetchCoupons, fetchStats]);

  const handleCreate = () => {
    setSelectedCoupon(null);
    formModal.onOpen();
  };

  const handleEdit = useCallback(
    async (row: CouponListItem) => {
      setMutationLoading(true);
      try {
        const response = await offersService.getCoupon(row.id);
        setSelectedCoupon(response.data.coupon);
        formModal.onOpen();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to load coupon details."));
      } finally {
        setMutationLoading(false);
      }
    },
    [formModal, toast]
  );

  const handleSaveCoupon = useCallback(
    async (payload: {
      couponCode: string;
      title?: string;
      description?: string;
      discountType: CouponDiscountType;
      discountValue?: number | null;
      minimumOrderAmount?: number | null;
      maximumDiscountAmount?: number | null;
      maxUses?: number | null;
      usagePerUserLimit?: number | null;
      firstTimeUserOnly?: boolean;
      isActive?: boolean;
      validFrom: string;
      validUntil: string;
      freeItemCategoryId?: string | null;
      freeItemId?: string | null;
      internalNote?: string;
    }) => {
      setMutationLoading(true);
      try {
        if (selectedCoupon) {
          const response = await offersService.updateCoupon(selectedCoupon.id, payload);
          toast.success(response.message);
        } else {
          const response = await offersService.createCoupon(payload);
          toast.success(response.message);
        }
        formModal.onClose();
        setSelectedCoupon(null);
        await refreshAll();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to save coupon."));
      } finally {
        setMutationLoading(false);
      }
    },
    [formModal, refreshAll, selectedCoupon, toast]
  );

  const handleDelete = useCallback(async () => {
    if (!selectedCouponRow) {
      return;
    }

    setMutationLoading(true);
    try {
      const response = await offersService.deleteCoupon(selectedCouponRow.id);
      toast.success(response.message);
      deleteDialog.onClose();
      await refreshAll();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete coupon."));
    } finally {
      setMutationLoading(false);
    }
  }, [deleteDialog, refreshAll, selectedCouponRow, toast]);

  const handleToggleStatus = useCallback(
    async (row: CouponListItem, nextStatus: boolean) => {
      await runRowAction(`status-${row.id}`, async () => {
        try {
          const response = await offersService.updateCouponStatus(row.id, nextStatus);
          toast.success(response.message);
          await refreshAll();
        } catch (error) {
          toast.error(extractErrorMessage(error, "Unable to update coupon status."));
        }
      });
    },
    [refreshAll, runRowAction, toast]
  );

  const handleCopyCode = useCallback(
    async (couponCode: string) => {
      try {
        await navigator.clipboard.writeText(couponCode);
        toast.success("Coupon code copied to clipboard");
      } catch {
        toast.error("Unable to copy coupon code");
      }
    },
    [toast]
  );

  const handleDuplicate = useCallback(
    async (row: CouponListItem) => {
      await runRowAction(`duplicate-${row.id}`, async () => {
        try {
          const duplicateCode = `${row.couponCode}_COPY_${Date.now().toString().slice(-4)}`;
          const response = await offersService.createCoupon({
            couponCode: duplicateCode,
            title: row.title ?? undefined,
            description: row.description ?? undefined,
            discountType: row.discountType,
            discountValue: row.discountType === "free_item" ? null : row.discountValue,
            minimumOrderAmount: row.minimumOrderAmount,
            maximumDiscountAmount:
              row.discountType === "free_item" ? null : row.maximumDiscountAmount,
            maxUses: row.maxUses,
            usagePerUserLimit: row.usagePerUserLimit,
            firstTimeUserOnly: row.firstTimeUserOnly,
            isActive: false,
            validFrom: row.validFrom,
            validUntil: row.validUntil,
            freeItemCategoryId: row.discountType === "free_item" ? row.freeItemCategoryId : null,
            freeItemId: row.discountType === "free_item" ? row.freeItemId : null,
            internalNote: row.internalNote ?? undefined
          });
          toast.success(`${response.message} (${duplicateCode})`);
          await refreshAll();
        } catch (error) {
          toast.error(extractErrorMessage(error, "Unable to duplicate coupon."));
        }
      });
    },
    [refreshAll, runRowAction, toast]
  );

  const fetchCouponUsages = useCallback(
    async (couponId: string, currentPage: number) => {
      setUsageLoading(true);
      try {
        const response = await offersService.getCouponUsages(couponId, { page: currentPage, limit: 5 });
        setUsageRows(response.data.usages);
        setUsageSummary(response.data.summary);
        setUsagePagination(response.data.pagination);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to fetch coupon usages right now."));
      } finally {
        setUsageLoading(false);
      }
    },
    [toast]
  );

  const handleOpenUsages = useCallback(
    (row: CouponListItem) => {
      setUsageCoupon(row);
      setUsagePage(1);
      usageModal.onOpen();
    },
    [usageModal]
  );

  useEffect(() => {
    if (!usageModal.isOpen || !usageCoupon) {
      return;
    }
    void fetchCouponUsages(usageCoupon.id, usagePage);
  }, [fetchCouponUsages, usageCoupon, usageModal.isOpen, usagePage]);

  const columns = useMemo(
    () =>
      [
        {
          key: "couponCode",
          header: "Coupon Code",
          render: (row: CouponListItem) => (
            <HStack spacing={2}>
              <Text fontWeight={700}>{row.couponCode}</Text>
              <ActionIconButton
                aria-label={`Copy ${row.couponCode}`}
                icon={<Copy size={14} />}
                size="xs"
                variant="outline"
                onClick={() => void handleCopyCode(row.couponCode)}
              />
            </HStack>
          )
        },
        {
          key: "title",
          header: "Title",
          render: (row: CouponListItem) => row.title || "-"
        },
        {
          key: "discountType",
          header: "Type",
          render: (row: CouponListItem) => discountTypeLabelMap[row.discountType]
        },
        {
          key: "rewardPreview",
          header: "Discount / Reward"
        },
        {
          key: "minimumOrderAmount",
          header: "Min Order",
          render: (row: CouponListItem) =>
            row.minimumOrderAmount === null ? "-" : formatCurrency(row.minimumOrderAmount)
        },
        {
          key: "maximumDiscountAmount",
          header: "Max Discount",
          render: (row: CouponListItem) =>
            row.maximumDiscountAmount === null ? "-" : formatCurrency(row.maximumDiscountAmount)
        },
        {
          key: "usage",
          header: "Usage",
          render: (row: CouponListItem) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>
                {row.currentUsageCount}
                {row.maxUses ? ` / ${row.maxUses}` : ""}
              </Text>
              <Text fontSize="xs" color="#7D655B">
                {row.usagePercentage === null ? "Unlimited" : `${row.usagePercentage}% used`}
              </Text>
            </VStack>
          )
        },
        {
          key: "firstTimeUserOnly",
          header: "First-Time Only",
          render: (row: CouponListItem) => (row.firstTimeUserOnly ? "Yes" : "No")
        },
        {
          key: "validity",
          header: "Validity",
          render: (row: CouponListItem) => (
            <VStack align="start" spacing={0}>
              <Text fontSize="sm">{formatDate(row.validFrom)}</Text>
              <Text fontSize="xs" color="#7D655B">
                to {formatDate(row.validUntil)}
              </Text>
            </VStack>
          )
        },
        {
          key: "status",
          header: "Status",
          render: (row: CouponListItem) => <StatusBadge status={row.derivedStatus} />
        },
        {
          key: "enable",
          header: "Enable",
          render: (row: CouponListItem) => (
            <Switch
              colorScheme="brand"
              isChecked={row.isActive}
              isDisabled={Boolean(rowActionLoading[`status-${row.id}`])}
              onChange={(event) => void handleToggleStatus(row, event.target.checked)}
            />
          )
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: CouponListItem) => (
            <HStack spacing={2} flexWrap="nowrap">
              <ActionIconButton
                aria-label={`Edit ${row.couponCode}`}
                icon={<Edit2 size={16} />}
                size="sm"
                variant="outline"
                onClick={() => void handleEdit(row)}
              />
              <ActionIconButton
                aria-label={`View usages for ${row.couponCode}`}
                icon={<Eye size={16} />}
                size="sm"
                variant="outline"
                onClick={() => void handleOpenUsages(row)}
              />
              <ActionIconButton
                aria-label={`Duplicate ${row.couponCode}`}
                icon={<CopyPlus size={16} />}
                size="sm"
                variant="outline"
                isDisabled={Boolean(rowActionLoading[`duplicate-${row.id}`])}
                onClick={() => void handleDuplicate(row)}
              />
              <ActionIconButton
                aria-label={`Delete ${row.couponCode}`}
                icon={<Trash2 size={16} />}
                size="sm"
                variant="outline"
                colorScheme="red"
                onClick={() => {
                  setSelectedCouponRow(row);
                  deleteDialog.onOpen();
                }}
              />
            </HStack>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: CouponListItem) => ReactNode }>,
    [
      deleteDialog,
      handleCopyCode,
      handleDuplicate,
      handleEdit,
      handleOpenUsages,
      handleToggleStatus,
      rowActionLoading
    ]
  );

  if (user?.role !== UserRole.ADMIN) {
    return (
      <VStack spacing={6} align="stretch">
        <PageHeader title="Offers" subtitle="This module is restricted to admin users." />
        <AppCard>
          <EmptyState title="Unauthorized" description="Only admin users can access Offers module." />
        </AppCard>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Offers"
        subtitle="Manage coupons, discount campaigns and usage analytics from one place."
      />

      <SimpleGrid columns={{ base: 1, md: 3, xl: 7 }} spacing={4}>
        {[
          { label: "Total Coupons", value: stats.totalCoupons },
          { label: "Active", value: stats.activeCoupons },
          { label: "Scheduled", value: stats.scheduledCoupons },
          { label: "Expired", value: stats.expiredCoupons },
          { label: "Disabled", value: stats.disabledCoupons },
          { label: "Free Item", value: stats.freeItemCoupons },
          { label: "Total Usages", value: stats.totalCouponUsages }
        ].map((card) => (
          <AppCard key={card.label}>
            <Text fontSize="sm" color="#705B52">
              {card.label}
            </Text>
            <Text fontWeight={800} fontSize="2xl">
              {statsLoading ? "..." : card.value}
            </Text>
          </AppCard>
        ))}
      </SimpleGrid>

      <Tabs variant="soft-rounded" colorScheme="brand" isLazy>
        <TabList>
          <Tab>Coupons</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <AppCard>
              <VStack spacing={4} align="stretch">
                <SimpleGrid columns={{ base: 1, md: 6 }} spacing={4}>
                  <AppInput
                    label="Search"
                    placeholder="Code or title"
                    value={search}
                    onChange={(event) => setSearch((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                  />
                  <FormControl>
                    <FormLabel>Type</FormLabel>
                    <Select value={discountTypeFilter} onChange={(event) => setDiscountTypeFilter((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}>
                      <option value="">All</option>
                      <option value="percentage">Percentage</option>
                      <option value="fixed_amount">Fixed Amount</option>
                      <option value="free_item">Free Item</option>
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel>Status</FormLabel>
                    <Select value={statusFilter} onChange={(event) => setStatusFilter((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}>
                      <option value="">All</option>
                      <option value="active">Active</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="expired">Expired</option>
                      <option value="disabled">Disabled</option>
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel>First-time User</FormLabel>
                    <Select value={firstTimeUserFilter} onChange={(event) => setFirstTimeUserFilter((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}>
                      <option value="all">All</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel>Records per page</FormLabel>
                    <Select
                      value={String(limit)}
                      onChange={(event) => {
                        const nextLimit = Number((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value) || 5;
                        setLimit(nextLimit);
                        setPage(1);
                      }}
                    >
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="20">20</option>
                    </Select>
                  </FormControl>
                  <Box alignSelf="end">
                    <AppButton leftIcon={<Plus size={16} />} onClick={handleCreate}>
                      Create Coupon
                    </AppButton>
                  </Box>
                </SimpleGrid>

                {tableLoading ? (
                  <SkeletonTable />
                ) : (
                  <DataTable
                    columns={columns}
                    rows={rows}
                    emptyState={
                      <EmptyState
                        title="No coupons found"
                        description="Create your first coupon to start running offers."
                      />
                    }
                  />
                )}

                <HStack justify="space-between">
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
          </TabPanel>
        </TabPanels>
      </Tabs>

      <CouponFormModal
        isOpen={formModal.isOpen}
        onClose={() => {
          formModal.onClose();
          setSelectedCoupon(null);
        }}
        loading={mutationLoading}
        initialData={selectedCoupon}
        itemCategories={itemCategories}
        getItemsByCategory={loadItemsByCategory}
        onSubmit={handleSaveCoupon}
      />

      <CouponUsageModal
        isOpen={usageModal.isOpen}
        onClose={() => {
          usageModal.onClose();
          setUsageRows([]);
          setUsageSummary(null);
          setUsageCoupon(null);
        }}
        loading={usageLoading}
        summary={usageSummary}
        usages={usageRows}
        page={usagePagination.page}
        totalPages={usagePagination.totalPages}
        total={usagePagination.total}
        onPageChange={setUsagePage}
      />

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.onClose}
        title="Delete Coupon Permanently"
        description={`Are you sure you want to permanently delete ${selectedCouponRow?.couponCode ?? "this coupon"}?`}
        onConfirm={() => void handleDelete()}
        isLoading={mutationLoading}
      />
    </VStack>
  );
};
