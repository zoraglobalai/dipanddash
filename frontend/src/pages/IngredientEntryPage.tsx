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
import { Edit2, Eye, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { AppCard } from "@/components/ui/AppCard";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { DataTable } from "@/components/ui/DataTable";
import { CategoryFormModal } from "@/features/ingredients/components/CategoryFormModal";
import { IngredientFormModal } from "@/features/ingredients/components/IngredientFormModal";
import { StockDetailsModal } from "@/features/ingredients/components/StockDetailsModal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAppToast } from "@/hooks/useAppToast";
import { ingredientsService } from "@/services/ingredients.service";
import { reportsService } from "@/services/reports.service";
import type {
  IngredientCategory,
  IngredientAllocationStats,
  IngredientListItem,
  IngredientStockDetails,
  IngredientStockLog,
  IngredientUnit,
  PaginationData
} from "@/types/ingredient";
import { extractErrorMessage } from "@/utils/api-error";
import { formatQuantityWithUnit } from "@/utils/quantity";

const defaultPagination: PaginationData = {
  page: 1,
  limit: 5,
  total: 0,
  totalPages: 1
};

type IngredientDayLedgerRow = {
  id: string;
  date: string;
  ingredient: string;
  unit: string;
  openingStock: number;
  purchase: number;
  dump: number;
  consumption: number;
  transferredIn: number;
  transferredOut: number;
  totalStock: number;
  stockHealth: "HEALTHY" | "LOW_STOCK";
};

const toNumberValue = (value: string | number | null | undefined) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toDateInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDefaultLedgerRange = () => {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 6);
  return {
    from: toDateInputValue(fromDate),
    to: toDateInputValue(toDate)
  };
};

const PaginationControls = ({
  page,
  totalPages,
  total,
  showing,
  onPageChange
}: {
  page: number;
  totalPages: number;
  total: number;
  showing: number;
  onPageChange: (page: number) => void;
}) => (
  <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
    <Text color="#705B52" fontSize="sm">
      Showing {showing} of {total} records
    </Text>
    <HStack>
      <AppButton variant="outline" isDisabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </AppButton>
      <Text fontWeight={700}>
        Page {page} of {totalPages}
      </Text>
      <AppButton variant="outline" isDisabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </AppButton>
    </HStack>
  </HStack>
);

const statusBadge = (status: "LOW_STOCK" | "OK") => (
  <Box
    px={3}
    py={1}
    borderRadius="full"
    fontSize="xs"
    fontWeight={700}
    bg={status === "LOW_STOCK" ? "red.100" : "green.100"}
    color={status === "LOW_STOCK" ? "red.700" : "green.700"}
    w="fit-content"
  >
    {status === "LOW_STOCK" ? "Low Stock" : "Healthy"}
  </Box>
);

const stockHealthBadge = (status: "HEALTHY" | "LOW_STOCK") => (
  <Box
    px={3}
    py={1}
    borderRadius="full"
    fontSize="xs"
    fontWeight={700}
    bg={status === "LOW_STOCK" ? "red.100" : "green.100"}
    color={status === "LOW_STOCK" ? "red.700" : "green.700"}
    w="fit-content"
  >
    {status === "LOW_STOCK" ? "Low Stock" : "Healthy"}
  </Box>
);

export const IngredientEntryPage = () => {
  const toast = useAppToast();
  const defaultLedgerRange = useMemo(() => getDefaultLedgerRange(), []);

  const [allCategories, setAllCategories] = useState<IngredientCategory[]>([]);

  const [categoryRows, setCategoryRows] = useState<IngredientCategory[]>([]);
  const [categoryPagination, setCategoryPagination] = useState<PaginationData>(defaultPagination);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categoryMutationLoading, setCategoryMutationLoading] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const debouncedCategorySearch = useDebouncedValue(categorySearch, 400);
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryLimit, setCategoryLimit] = useState(5);
  const [selectedCategory, setSelectedCategory] = useState<IngredientCategory | null>(null);

  const categoryModal = useDisclosure();
  const deleteCategoryDialog = useDisclosure();

  const [ingredientRows, setIngredientRows] = useState<IngredientListItem[]>([]);
  const [ingredientPagination, setIngredientPagination] = useState<PaginationData>(defaultPagination);
  const [ingredientLoading, setIngredientLoading] = useState(true);
  const [ingredientMutationLoading, setIngredientMutationLoading] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const debouncedIngredientSearch = useDebouncedValue(ingredientSearch, 400);
  const [ingredientCategoryFilter, setIngredientCategoryFilter] = useState("");
  const [ingredientPage, setIngredientPage] = useState(1);
  const [ingredientLimit, setIngredientLimit] = useState(5);
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientListItem | null>(null);

  const ingredientModal = useDisclosure();
  const deleteIngredientDialog = useDisclosure();
  const stockDetailsModal = useDisclosure();
  const [stockDetailsLoading, setStockDetailsLoading] = useState(false);
  const [stockDetails, setStockDetails] = useState<IngredientStockDetails | null>(null);
  const [stockLogs, setStockLogs] = useState<IngredientStockLog[]>([]);
  const [rowActionLoading, setRowActionLoading] = useState<Record<string, boolean>>({});
  const [stockInsights, setStockInsights] = useState<IngredientAllocationStats | null>(null);
  const [stockInsightsLoading, setStockInsightsLoading] = useState(true);
  const [ledgerRows, setLedgerRows] = useState<IngredientDayLedgerRow[]>([]);
  const [ledgerPagination, setLedgerPagination] = useState<PaginationData>(defaultPagination);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const debouncedLedgerSearch = useDebouncedValue(ledgerSearch, 400);
  const [ledgerDateFrom, setLedgerDateFrom] = useState(defaultLedgerRange.from);
  const [ledgerDateTo, setLedgerDateTo] = useState(defaultLedgerRange.to);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLimit, setLedgerLimit] = useState(12);

  const fetchCategoryOptions = useCallback(async () => {
    try {
      const limit = 50;
      let page = 1;
      let totalPages = 1;
      const collected: IngredientCategory[] = [];

      while (page <= totalPages) {
        const response = await ingredientsService.getCategories({ page, limit });
        collected.push(...response.data.categories);
        totalPages = response.data.pagination.totalPages;
        page += 1;
      }

      setAllCategories(collected);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch category options."));
    }
  }, [toast]);

  const fetchCategories = useCallback(async () => {
    setCategoryLoading(true);
    try {
      const response = await ingredientsService.getCategories({
        includeInactive: true,
        search: debouncedCategorySearch || undefined,
        page: categoryPage,
        limit: categoryLimit
      });
      setCategoryRows(response.data.categories);
      setCategoryPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch categories."));
    } finally {
      setCategoryLoading(false);
    }
  }, [categoryLimit, categoryPage, debouncedCategorySearch, toast]);

  const fetchIngredients = useCallback(async () => {
    setIngredientLoading(true);
    try {
      const response = await ingredientsService.getIngredients({
        search: debouncedIngredientSearch || undefined,
        categoryId: ingredientCategoryFilter || undefined,
        includeInactive: true,
        page: ingredientPage,
        limit: ingredientLimit
      });
      setIngredientRows(response.data.ingredients);
      setIngredientPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch ingredients."));
    } finally {
      setIngredientLoading(false);
    }
  }, [debouncedIngredientSearch, ingredientCategoryFilter, ingredientLimit, ingredientPage, toast]);

  const fetchStockInsights = useCallback(async () => {
    setStockInsightsLoading(true);
    try {
      const response = await ingredientsService.getAllocationStats({});
      setStockInsights(response.data);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch stock insights."));
    } finally {
      setStockInsightsLoading(false);
    }
  }, [toast]);

  const fetchIngredientDayLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const response = await reportsService.generate({
        reportKey: "stock_consumption_report",
        dateFrom: ledgerDateFrom,
        dateTo: ledgerDateTo,
        search: debouncedLedgerSearch || undefined,
        page: ledgerPage,
        limit: ledgerLimit
      });

      const parsedRows = response.data.rows.map((row, index) => {
        const date = String(row.date ?? "");
        const ingredient = String(row.ingredient ?? "-");
        const unit = String(row.unit ?? "unit").toLowerCase();
        const stockHealth: IngredientDayLedgerRow["stockHealth"] =
          row.stockHealth === "LOW_STOCK" ? "LOW_STOCK" : "HEALTHY";
        return {
          id: `${date}-${ingredient}-${index}`,
          date,
          ingredient,
          unit,
          openingStock: toNumberValue(row.openingStock),
          purchase: toNumberValue(row.purchase),
          dump: toNumberValue(row.dump),
          consumption: toNumberValue(row.consumption),
          transferredIn: toNumberValue(row.transferredIn),
          transferredOut: toNumberValue(row.transferredOut),
          totalStock: toNumberValue(row.totalStock),
          stockHealth
        };
      });

      setLedgerRows(parsedRows);
      setLedgerPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch day-wise ingredient stock ledger."));
    } finally {
      setLedgerLoading(false);
    }
  }, [debouncedLedgerSearch, ledgerDateFrom, ledgerDateTo, ledgerLimit, ledgerPage, toast]);

  useEffect(() => {
    void fetchCategoryOptions();
  }, [fetchCategoryOptions]);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    void fetchIngredients();
  }, [fetchIngredients]);

  useEffect(() => {
    void fetchStockInsights();
  }, [fetchStockInsights]);

  useEffect(() => {
    void fetchIngredientDayLedger();
  }, [fetchIngredientDayLedger]);

  useEffect(() => {
    setCategoryPage(1);
  }, [debouncedCategorySearch]);

  useEffect(() => {
    setIngredientPage(1);
  }, [debouncedIngredientSearch, ingredientCategoryFilter]);

  useEffect(() => {
    setLedgerPage(1);
  }, [debouncedLedgerSearch, ledgerDateFrom, ledgerDateTo]);

  const categoryOptions = useMemo(
    () => allCategories.map((category) => ({ label: category.name, value: category.id })),
    [allCategories]
  );

  const handleCategorySubmit = useCallback(
    async (values: { name: string; description?: string }) => {
      setCategoryMutationLoading(true);
      try {
        if (selectedCategory) {
          const response = await ingredientsService.updateCategory(selectedCategory.id, values);
          toast.success(response.message);
        } else {
          const response = await ingredientsService.createCategory(values);
          toast.success(response.message);
        }

        categoryModal.onClose();
        await Promise.all([fetchCategories(), fetchCategoryOptions(), fetchIngredients()]);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to save category."));
      } finally {
        setCategoryMutationLoading(false);
      }
    },
    [categoryModal, fetchCategories, fetchCategoryOptions, fetchIngredients, selectedCategory, toast]
  );

  const handleDeleteCategory = useCallback(async () => {
    if (!selectedCategory) {
      return;
    }
    if ((selectedCategory.ingredientCount ?? 0) > 0) {
      toast.warning("This category has ingredients. Move or delete ingredients first.");
      deleteCategoryDialog.onClose();
      return;
    }

    setCategoryMutationLoading(true);
    try {
      const response = await ingredientsService.deleteCategory(selectedCategory.id);
      toast.success(response.message);
      deleteCategoryDialog.onClose();
      await Promise.all([fetchCategories(), fetchCategoryOptions(), fetchIngredients()]);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete category."));
    } finally {
      setCategoryMutationLoading(false);
    }
  }, [deleteCategoryDialog, fetchCategories, fetchCategoryOptions, fetchIngredients, selectedCategory, toast]);

  const handleIngredientSubmit = useCallback(
    async (values: {
      name: string;
      categoryId: string;
      unit: IngredientUnit;
      minStock: number;
    }) => {
      setIngredientMutationLoading(true);
      try {
        if (selectedIngredient) {
          const response = await ingredientsService.updateIngredient(selectedIngredient.id, values);
          toast.success(response.message);
        } else {
          const response = await ingredientsService.createIngredient(values);
          toast.success(response.message);
        }

        ingredientModal.onClose();
        await Promise.all([fetchIngredients(), fetchCategories()]);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to save ingredient."));
      } finally {
        setIngredientMutationLoading(false);
      }
    },
    [fetchCategories, fetchIngredients, ingredientModal, selectedIngredient, toast]
  );

  const handleDeleteIngredient = useCallback(async () => {
    if (!selectedIngredient) {
      return;
    }

    setIngredientMutationLoading(true);
    try {
      const response = await ingredientsService.deleteIngredient(selectedIngredient.id);
      toast.success(response.message);
      deleteIngredientDialog.onClose();
      await Promise.all([fetchIngredients(), fetchCategories()]);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete ingredient."));
    } finally {
      setIngredientMutationLoading(false);
    }
  }, [deleteIngredientDialog, fetchCategories, fetchIngredients, selectedIngredient, toast]);

  const openStockDetails = useCallback(
    async (ingredient: IngredientListItem) => {
      setStockDetails(null);
      setStockLogs([]);
      setStockDetailsLoading(true);
      stockDetailsModal.onOpen();

      try {
        const response = await ingredientsService.getIngredientStock(ingredient.id, { page: 1, limit: 20 });
        setStockDetails(response.data.stock);
        setStockLogs(response.data.logs);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to fetch stock details."));
      } finally {
        setStockDetailsLoading(false);
      }
    },
    [stockDetailsModal, toast]
  );

  const runRowAction = useCallback(async (key: string, action: () => Promise<void>) => {
    setRowActionLoading((previous) => ({ ...previous, [key]: true }));
    try {
      await action();
    } finally {
      setRowActionLoading((previous) => ({ ...previous, [key]: false }));
    }
  }, []);

  const handleToggleIngredientStatus = useCallback(
    async (ingredient: IngredientListItem, nextIsActive: boolean) => {
      await runRowAction(`active-${ingredient.id}`, async () => {
        try {
          const response = await ingredientsService.updateIngredient(ingredient.id, { isActive: nextIsActive });
          toast.success(response.message);
          await fetchIngredients();
        } catch (error) {
          toast.error(
            extractErrorMessage(error, nextIsActive ? "Unable to enable ingredient." : "Unable to disable ingredient.")
          );
        }
      });
    },
    [fetchIngredients, runRowAction, toast]
  );

  const categoryColumns = useMemo(
    () =>
      [
        { key: "name", header: "Category Name" },
        {
          key: "description",
          header: "Description",
          render: (row: IngredientCategory) => row.description || "-"
        },
        {
          key: "ingredientCount",
          header: "Ingredients",
          render: (row: IngredientCategory) => (
            <Text fontWeight={700} color={(row.ingredientCount ?? 0) > 0 ? "#5B3A2A" : "#7D655B"}>
              {row.ingredientCount ?? 0}
            </Text>
          )
        },
        {
          key: "status",
          header: "Status",
          render: (row: IngredientCategory) => (
            <Box
              px={3}
              py={1}
              borderRadius="full"
              fontSize="xs"
              fontWeight={700}
              bg={row.isActive ? "green.100" : "gray.100"}
              color={row.isActive ? "green.700" : "gray.600"}
              w="fit-content"
            >
              {row.isActive ? "Active" : "Inactive"}
            </Box>
          )
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: IngredientCategory) => (
            <HStack>
              <ActionIconButton
                aria-label={`Edit ${row.name}`}
                icon={<Edit2 size={16} />}
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedCategory(row);
                  categoryModal.onOpen();
                }}
              />
              <ActionIconButton
                aria-label={`Delete ${row.name}`}
                tooltip={
                  (row.ingredientCount ?? 0) > 0
                    ? "Cannot delete category with ingredients"
                    : `Delete ${row.name}`
                }
                icon={<Trash2 size={16} />}
                size="sm"
                variant="outline"
                colorScheme="red"
                isDisabled={Boolean((row.ingredientCount ?? 0) > 0)}
                onClick={() => {
                  setSelectedCategory(row);
                  deleteCategoryDialog.onOpen();
                }}
              />
            </HStack>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: IngredientCategory) => ReactNode }>,
    [categoryModal, deleteCategoryDialog]
  );

  const ingredientColumns = useMemo(
    () =>
      [
        { key: "name", header: "Name" },
        { key: "categoryName", header: "Category" },
        {
          key: "totalStock",
          header: "Total Stock",
          render: (row: IngredientListItem) => formatQuantityWithUnit(row.totalStock, row.unit)
        },
        {
          key: "minStock",
          header: "Min Stock",
          render: (row: IngredientListItem) => formatQuantityWithUnit(row.minStock, row.unit)
        },
        {
          key: "status",
          header: "Stock Status",
          render: (row: IngredientListItem) =>
            row.isActive ? (
              statusBadge(row.status)
            ) : (
              <Box
                px={3}
                py={1}
                borderRadius="full"
                fontSize="xs"
                fontWeight={700}
                bg="gray.100"
                color="gray.700"
                w="fit-content"
              >
                Inactive
              </Box>
            )
        },
        {
          key: "availability",
          header: "Availability",
          render: (row: IngredientListItem) => (
            <HStack spacing={3}>
              <Switch
                colorScheme="brand"
                isChecked={row.isActive}
                isDisabled={Boolean(rowActionLoading[`active-${row.id}`])}
                onChange={(event) => void handleToggleIngredientStatus(row, event.target.checked)}
              />
              <Text fontSize="sm" fontWeight={600} color={row.isActive ? "green.700" : "gray.600"}>
                {row.isActive ? "Enabled" : "Disabled"}
              </Text>
            </HStack>
          )
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: IngredientListItem) => (
            <HStack spacing={2} flexWrap="nowrap" whiteSpace="nowrap" minW="max-content">
              <ActionIconButton
                aria-label={`Edit ${row.name}`}
                icon={<Edit2 size={16} />}
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedIngredient(row);
                  ingredientModal.onOpen();
                }}
              />
              <ActionIconButton
                aria-label={`View stock ${row.name}`}
                icon={<Eye size={16} />}
                size="sm"
                variant="outline"
                onClick={() => void openStockDetails(row)}
              />
              <ActionIconButton
                aria-label={`Delete ${row.name}`}
                icon={<Trash2 size={16} />}
                size="sm"
                variant="outline"
                colorScheme="red"
                onClick={() => {
                  setSelectedIngredient(row);
                  deleteIngredientDialog.onOpen();
                }}
              />
            </HStack>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: IngredientListItem) => ReactNode }>,
    [deleteIngredientDialog, handleToggleIngredientStatus, ingredientModal, openStockDetails, rowActionLoading]
  );

  const dayLedgerColumns = useMemo(
    () =>
      [
        {
          key: "date",
          header: "Date",
          render: (row: IngredientDayLedgerRow) => <Text fontWeight={700}>{row.date}</Text>
        },
        {
          key: "ingredient",
          header: "Ingredient",
          render: (row: IngredientDayLedgerRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.ingredient}</Text>
              <Text fontSize="sm" color="#6F5A50">
                {row.unit.toUpperCase()}
              </Text>
            </VStack>
          )
        },
        {
          key: "openingStock",
          header: "Opening Stock",
          render: (row: IngredientDayLedgerRow) => formatQuantityWithUnit(row.openingStock, row.unit)
        },
        {
          key: "purchase",
          header: "Purchase",
          render: (row: IngredientDayLedgerRow) => (
            <Text fontWeight={700} color={row.purchase > 0 ? "green.700" : "#2D1D17"}>
              {formatQuantityWithUnit(row.purchase, row.unit)}
            </Text>
          )
        },
        {
          key: "dump",
          header: "Dump",
          render: (row: IngredientDayLedgerRow) => (
            <Text fontWeight={700} color={row.dump > 0 ? "red.700" : "#2D1D17"}>
              {formatQuantityWithUnit(row.dump, row.unit)}
            </Text>
          )
        },
        {
          key: "consumption",
          header: "Consumption",
          render: (row: IngredientDayLedgerRow) => formatQuantityWithUnit(row.consumption, row.unit)
        },
        {
          key: "transferredIn",
          header: "Transfer In",
          render: (row: IngredientDayLedgerRow) => formatQuantityWithUnit(row.transferredIn, row.unit)
        },
        {
          key: "transferredOut",
          header: "Transfer Out",
          render: (row: IngredientDayLedgerRow) => formatQuantityWithUnit(row.transferredOut, row.unit)
        },
        {
          key: "totalStock",
          header: "Remaining Stock",
          render: (row: IngredientDayLedgerRow) => (
            <Text fontWeight={800}>{formatQuantityWithUnit(row.totalStock, row.unit)}</Text>
          )
        },
        {
          key: "stockHealth",
          header: "Stock Health",
          render: (row: IngredientDayLedgerRow) => stockHealthBadge(row.stockHealth)
        }
      ] as Array<{ key: string; header: string; render?: (row: IngredientDayLedgerRow) => ReactNode }>,
    []
  );

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Ingredient & Stock Management"
        subtitle="Manage categories, ingredients, and stock operations with clear visibility."
      />

      <Tabs variant="soft-rounded" colorScheme="brand" isLazy>
        <TabList>
          <Tab>Stats</Tab>
          <Tab>Categories</Tab>
          <Tab>Ingredients</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <AppCard
              title="Day-wise Ingredient Ledger"
              subtitle="Track opening stock, purchase, dump, consumption, transfers, and remaining stock for each day."
            >
              <VStack spacing={4} align="stretch">
                <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={4}>
                  <AppInput
                    label="Search Ingredient"
                    placeholder="Filter ledger rows"
                    value={ledgerSearch}
                    onChange={(event) => setLedgerSearch((event.target as HTMLInputElement).value)}
                  />
                  <AppInput
                    label="Date From"
                    type="date"
                    value={ledgerDateFrom}
                    onChange={(event) => setLedgerDateFrom((event.target as HTMLInputElement).value)}
                  />
                  <AppInput
                    label="Date To"
                    type="date"
                    value={ledgerDateTo}
                    onChange={(event) => setLedgerDateTo((event.target as HTMLInputElement).value)}
                  />
                  <FormControl>
                    <FormLabel>Rows per page</FormLabel>
                    <Select
                      value={String(ledgerLimit)}
                      onChange={(event) => {
                        const nextLimit = Number(event.target.value) || 12;
                        setLedgerLimit(nextLimit);
                        setLedgerPage(1);
                      }}
                    >
                      <option value="12">12</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </Select>
                  </FormControl>
                  <Box alignSelf={{ base: "stretch", xl: "end" }}>
                    <AppButton
                      w={{ base: "full", xl: "auto" }}
                      onClick={() => void fetchIngredientDayLedger()}
                    >
                      Refresh Ledger
                    </AppButton>
                  </Box>
                </SimpleGrid>

                {stockInsightsLoading || !stockInsights ? (
                  <SkeletonTable />
                ) : (
                  <SimpleGrid columns={{ base: 1, sm: 2, md: 3, xl: 5 }} spacing={3}>
                    <AppCard title="Total Ingredients">
                      <Text fontSize="3xl" fontWeight={900}>
                        {stockInsights.totals.totalIngredients}
                      </Text>
                    </AppCard>
                    <AppCard title="Healthy Stock">
                      <Text fontSize="3xl" fontWeight={900} color="green.700">
                        {stockInsights.totals.healthyStockIngredients}
                      </Text>
                    </AppCard>
                    <AppCard title="Low Stock Alerts">
                      <Text fontSize="3xl" fontWeight={900} color="red.700">
                        {stockInsights.totals.lowStockIngredients}
                      </Text>
                    </AppCard>
                    <AppCard title="Staff Usage">
                      <Text fontSize="3xl" fontWeight={900}>
                        {stockInsights.insights.staffUsageSummary.length}
                      </Text>
                      <Text fontSize="sm" color="#705B52">
                        active contributors
                      </Text>
                    </AppCard>
                    <AppCard title="Most Used Ingredient">
                      <Text fontSize="lg" fontWeight={900}>
                        {stockInsights.insights.mostUsedIngredient?.ingredientName ?? "-"}
                      </Text>
                      <Text fontSize="sm" color="#705B52">
                        {stockInsights.insights.mostUsedIngredient
                          ? formatQuantityWithUnit(
                              stockInsights.insights.mostUsedIngredient.usedQuantity,
                              stockInsights.insights.mostUsedIngredient.unit
                            )
                          : "No usage"}
                      </Text>
                    </AppCard>
                  </SimpleGrid>
                )}

                {ledgerLoading ? (
                  <SkeletonTable />
                ) : (
                  <DataTable
                    columns={dayLedgerColumns}
                    rows={ledgerRows}
                    emptyState={
                      <EmptyState
                        title="No ledger rows found"
                        description="Try a different date range or ingredient search."
                      />
                    }
                  />
                )}

                <PaginationControls
                  page={ledgerPagination.page}
                  totalPages={ledgerPagination.totalPages}
                  total={ledgerPagination.total}
                  showing={ledgerRows.length}
                  onPageChange={setLedgerPage}
                />
              </VStack>
            </AppCard>
          </TabPanel>

          <TabPanel px={0}>
            <AppCard>
              <VStack spacing={4} align="stretch">
                <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
                  <AppInput
                    label="Search"
                    placeholder="Search categories"
                    value={categorySearch}
                    onChange={(event) => setCategorySearch((event.target as HTMLInputElement).value)}
                  />
                  <FormControl>
                    <FormLabel>Records per page</FormLabel>
                    <Select
                      value={String(categoryLimit)}
                      onChange={(event) => {
                        const nextLimit = Number(event.target.value) || 5;
                        setCategoryLimit(nextLimit);
                        setCategoryPage(1);
                      }}
                    >
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="20">20</option>
                    </Select>
                  </FormControl>
                  <Box />
                  <Box alignSelf="end">
                    <AppButton
                      leftIcon={<Plus size={16} />}
                      onClick={() => {
                        setSelectedCategory(null);
                        categoryModal.onOpen();
                      }}
                    >
                      Add Category
                    </AppButton>
                  </Box>
                </SimpleGrid>

                {categoryLoading ? (
                  <SkeletonTable />
                ) : (
                  <DataTable
                    columns={categoryColumns}
                    rows={categoryRows}
                    emptyState={
                      <EmptyState
                        title="No categories found"
                        description="Create your first ingredient category to organize inventory."
                      />
                    }
                  />
                )}

                <PaginationControls
                  page={categoryPagination.page}
                  totalPages={categoryPagination.totalPages}
                  total={categoryPagination.total}
                  showing={categoryRows.length}
                  onPageChange={setCategoryPage}
                />
              </VStack>
            </AppCard>
          </TabPanel>

          <TabPanel px={0}>
            <AppCard>
              <VStack spacing={4} align="stretch">
                <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
                  <AppInput
                    label="Search Ingredient"
                    placeholder="Search by ingredient name"
                    value={ingredientSearch}
                    onChange={(event) => setIngredientSearch((event.target as HTMLInputElement).value)}
                  />
                  <FormControl>
                    <FormLabel>Category</FormLabel>
                    <Select
                      value={ingredientCategoryFilter}
                      onChange={(event) => setIngredientCategoryFilter(event.target.value)}
                    >
                      <option value="">All Categories</option>
                      {categoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel>Records per page</FormLabel>
                    <Select
                      value={String(ingredientLimit)}
                      onChange={(event) => {
                        const nextLimit = Number(event.target.value) || 5;
                        setIngredientLimit(nextLimit);
                        setIngredientPage(1);
                      }}
                    >
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="20">20</option>
                    </Select>
                  </FormControl>
                  <Box alignSelf="end">
                    <AppButton
                      leftIcon={<Plus size={16} />}
                      isDisabled={!allCategories.length}
                      onClick={() => {
                        setSelectedIngredient(null);
                        ingredientModal.onOpen();
                      }}
                    >
                      Add Ingredient
                    </AppButton>
                  </Box>
                </SimpleGrid>

                {ingredientLoading ? (
                  <SkeletonTable />
                ) : (
                  <DataTable
                    columns={ingredientColumns}
                    rows={ingredientRows}
                    emptyState={
                      <EmptyState
                        title="No ingredients found"
                        description="Create ingredients and manage stock to start tracking inventory."
                      />
                    }
                  />
                )}

                <PaginationControls
                  page={ingredientPagination.page}
                  totalPages={ingredientPagination.totalPages}
                  total={ingredientPagination.total}
                  showing={ingredientRows.length}
                  onPageChange={setIngredientPage}
                />
              </VStack>
            </AppCard>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <CategoryFormModal
        isOpen={categoryModal.isOpen}
        onClose={() => {
          categoryModal.onClose();
          setSelectedCategory(null);
        }}
        onSubmit={handleCategorySubmit}
        loading={categoryMutationLoading}
        initialData={selectedCategory}
      />

      <IngredientFormModal
        isOpen={ingredientModal.isOpen}
        onClose={() => {
          ingredientModal.onClose();
          setSelectedIngredient(null);
        }}
        onSubmit={handleIngredientSubmit}
        loading={ingredientMutationLoading}
        categories={allCategories}
        initialData={selectedIngredient}
      />

      <StockDetailsModal
        isOpen={stockDetailsModal.isOpen}
        onClose={stockDetailsModal.onClose}
        loading={stockDetailsLoading}
        stock={stockDetails}
        logs={stockLogs}
      />

      <ConfirmDialog
        isOpen={deleteCategoryDialog.isOpen}
        onClose={deleteCategoryDialog.onClose}
        title="Delete Category Permanently"
        description={
          (selectedCategory?.ingredientCount ?? 0) > 0
            ? `${selectedCategory?.name ?? "This category"} has ${selectedCategory?.ingredientCount ?? 0} ingredient(s). Move or delete ingredients first.`
            : `Are you sure you want to permanently delete ${selectedCategory?.name ?? "this category"}?`
        }
        onConfirm={() => void handleDeleteCategory()}
        isLoading={categoryMutationLoading}
      />

      <ConfirmDialog
        isOpen={deleteIngredientDialog.isOpen}
        onClose={deleteIngredientDialog.onClose}
        title="Delete Ingredient Permanently"
        description={`Are you sure you want to permanently delete ${selectedIngredient?.name ?? "this ingredient"}?`}
        onConfirm={() => void handleDeleteIngredient()}
        isLoading={ingredientMutationLoading}
      />
    </VStack>
  );
};
