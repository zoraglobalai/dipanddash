import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  Image,
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
import { Edit2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import logo from "@/assets/logo.png";
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
import { AddOnFormModal } from "@/features/items/components/AddOnFormModal";
import { ComboFormModal } from "@/features/items/components/ComboFormModal";
import { ItemCategoryFormModal } from "@/features/items/components/ItemCategoryFormModal";
import { ItemFormModal } from "@/features/items/components/ItemFormModal";
import { formatCurrency } from "@/features/items/units";
import { useAppToast } from "@/hooks/useAppToast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { itemsService } from "@/services/items.service";
import type {
  AddOnDetail,
  AddOnListItem,
  ComboDetail,
  ComboListItem,
  ItemCategory,
  ItemDetail,
  ItemListItem,
  ItemMetaIngredient,
  ItemPagination,
  ItemUnitMeta
} from "@/types/item";
import { UserRole } from "@/types/role";
import { extractErrorMessage } from "@/utils/api-error";

const defaultPagination: ItemPagination = {
  page: 1,
  limit: 5,
  total: 0,
  totalPages: 1
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

const ActiveBadge = ({ isActive }: { isActive: boolean }) => (
  <Box
    px={3}
    py={1}
    borderRadius="full"
    fontSize="xs"
    fontWeight={700}
    bg={isActive ? "green.100" : "gray.100"}
    color={isActive ? "green.700" : "gray.700"}
    w="fit-content"
  >
    {isActive ? "Active" : "Inactive"}
  </Box>
);

export const ItemEntryPage = () => {
  const { user } = useAuth();
  const toast = useAppToast();

  const [metaCategories, setMetaCategories] = useState<ItemCategory[]>([]);
  const [metaIngredients, setMetaIngredients] = useState<ItemMetaIngredient[]>([]);
  const [metaUnits, setMetaUnits] = useState<ItemUnitMeta[]>([]);
  const [comboItemOptions, setComboItemOptions] = useState<ItemListItem[]>([]);

  const [categoryRows, setCategoryRows] = useState<ItemCategory[]>([]);
  const [categoryPagination, setCategoryPagination] = useState<ItemPagination>(defaultPagination);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categorySearch, setCategorySearch] = useState("");
  const debouncedCategorySearch = useDebouncedValue(categorySearch, 400);
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryLimit, setCategoryLimit] = useState(5);
  const [categoryMutationLoading, setCategoryMutationLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | null>(null);
  const categoryModal = useDisclosure();
  const deleteCategoryDialog = useDisclosure();

  const [itemRows, setItemRows] = useState<ItemListItem[]>([]);
  const [itemPagination, setItemPagination] = useState<ItemPagination>(defaultPagination);
  const [itemLoading, setItemLoading] = useState(true);
  const [itemSearch, setItemSearch] = useState("");
  const debouncedItemSearch = useDebouncedValue(itemSearch, 400);
  const [itemCategoryFilter, setItemCategoryFilter] = useState("");
  const [itemPage, setItemPage] = useState(1);
  const [itemLimit, setItemLimit] = useState(5);
  const [itemMutationLoading, setItemMutationLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemDetail | null>(null);
  const [selectedItemRow, setSelectedItemRow] = useState<ItemListItem | null>(null);
  const itemModal = useDisclosure();
  const deleteItemDialog = useDisclosure();

  const [addOnRows, setAddOnRows] = useState<AddOnListItem[]>([]);
  const [addOnPagination, setAddOnPagination] = useState<ItemPagination>(defaultPagination);
  const [addOnLoading, setAddOnLoading] = useState(true);
  const [addOnSearch, setAddOnSearch] = useState("");
  const debouncedAddOnSearch = useDebouncedValue(addOnSearch, 400);
  const [addOnPage, setAddOnPage] = useState(1);
  const [addOnLimit, setAddOnLimit] = useState(5);
  const [addOnMutationLoading, setAddOnMutationLoading] = useState(false);
  const [selectedAddOn, setSelectedAddOn] = useState<AddOnDetail | null>(null);
  const [selectedAddOnRow, setSelectedAddOnRow] = useState<AddOnListItem | null>(null);
  const addOnModal = useDisclosure();
  const deleteAddOnDialog = useDisclosure();

  const [comboRows, setComboRows] = useState<ComboListItem[]>([]);
  const [comboPagination, setComboPagination] = useState<ItemPagination>(defaultPagination);
  const [comboLoading, setComboLoading] = useState(true);
  const [comboSearch, setComboSearch] = useState("");
  const debouncedComboSearch = useDebouncedValue(comboSearch, 400);
  const [comboPage, setComboPage] = useState(1);
  const [comboLimit, setComboLimit] = useState(5);
  const [comboMutationLoading, setComboMutationLoading] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState<ComboDetail | null>(null);
  const [selectedComboRow, setSelectedComboRow] = useState<ComboListItem | null>(null);
  const comboModal = useDisclosure();
  const deleteComboDialog = useDisclosure();

  const [rowActionLoading, setRowActionLoading] = useState<Record<string, boolean>>({});

  const runRowAction = useCallback(async (key: string, action: () => Promise<void>) => {
    setRowActionLoading((previous) => ({ ...previous, [key]: true }));
    try {
      await action();
    } finally {
      setRowActionLoading((previous) => ({ ...previous, [key]: false }));
    }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const [ingredientsResponse, categoriesResponse, unitsResponse] = await Promise.all([
        itemsService.getMetaIngredients(),
        itemsService.getMetaCategories(),
        itemsService.getMetaUnits()
      ]);
      setMetaIngredients(ingredientsResponse.data.ingredients);
      setMetaCategories(categoriesResponse.data.categories);
      setMetaUnits(unitsResponse.data.units);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch metadata for Item Entry."));
    }
  }, [toast]);

  const fetchComboItemOptions = useCallback(async () => {
    try {
      const response = await itemsService.getMetaItems();
      setComboItemOptions(response.data.items);
    } catch {
      setComboItemOptions([]);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    setCategoryLoading(true);
    try {
      const response = await itemsService.getCategories({
        includeInactive: true,
        search: debouncedCategorySearch || undefined,
        page: categoryPage,
        limit: categoryLimit
      });
      setCategoryRows(response.data.categories);
      setCategoryPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch item categories."));
    } finally {
      setCategoryLoading(false);
    }
  }, [categoryLimit, categoryPage, debouncedCategorySearch, toast]);

  const fetchItems = useCallback(async () => {
    setItemLoading(true);
    try {
      const response = await itemsService.getItems({
        includeInactive: true,
        search: debouncedItemSearch || undefined,
        categoryId: itemCategoryFilter || undefined,
        page: itemPage,
        limit: itemLimit
      });
      setItemRows(response.data.items);
      setItemPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch items."));
    } finally {
      setItemLoading(false);
    }
  }, [debouncedItemSearch, itemCategoryFilter, itemLimit, itemPage, toast]);

  const fetchAddOns = useCallback(async () => {
    setAddOnLoading(true);
    try {
      const response = await itemsService.getAddOns({
        includeInactive: true,
        search: debouncedAddOnSearch || undefined,
        page: addOnPage,
        limit: addOnLimit
      });
      setAddOnRows(response.data.addOns);
      setAddOnPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch add-ons."));
    } finally {
      setAddOnLoading(false);
    }
  }, [addOnLimit, addOnPage, debouncedAddOnSearch, toast]);

  const fetchCombos = useCallback(async () => {
    setComboLoading(true);
    try {
      const response = await itemsService.getCombos({
        includeInactive: true,
        search: debouncedComboSearch || undefined,
        page: comboPage,
        limit: comboLimit
      });
      setComboRows(response.data.combos);
      setComboPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch combos."));
    } finally {
      setComboLoading(false);
    }
  }, [comboLimit, comboPage, debouncedComboSearch, toast]);

  useEffect(() => {
    void fetchMeta();
    void fetchComboItemOptions();
  }, [fetchComboItemOptions, fetchMeta]);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    void fetchAddOns();
  }, [fetchAddOns]);

  useEffect(() => {
    void fetchCombos();
  }, [fetchCombos]);

  useEffect(() => {
    setCategoryPage(1);
  }, [debouncedCategorySearch]);

  useEffect(() => {
    setItemPage(1);
  }, [debouncedItemSearch, itemCategoryFilter]);

  useEffect(() => {
    setAddOnPage(1);
  }, [debouncedAddOnSearch]);

  useEffect(() => {
    setComboPage(1);
  }, [debouncedComboSearch]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchMeta(), fetchCategories(), fetchItems(), fetchAddOns(), fetchCombos(), fetchComboItemOptions()]);
  }, [fetchAddOns, fetchCategories, fetchComboItemOptions, fetchCombos, fetchItems, fetchMeta]);

  const handleCategorySubmit = useCallback(
    async (values: { name: string; description?: string }) => {
      setCategoryMutationLoading(true);
      try {
        if (selectedCategory) {
          const response = await itemsService.updateCategory(selectedCategory.id, values);
          toast.success(response.message);
        } else {
          const response = await itemsService.createCategory(values);
          toast.success(response.message);
        }

        categoryModal.onClose();
        await refreshAll();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to save item category."));
      } finally {
        setCategoryMutationLoading(false);
      }
    },
    [categoryModal, refreshAll, selectedCategory, toast]
  );

  const handleDeleteCategory = useCallback(async () => {
    if (!selectedCategory) {
      return;
    }
    if ((selectedCategory.itemCount ?? 0) > 0) {
      toast.warning("This category has items. Move or delete items first.");
      deleteCategoryDialog.onClose();
      return;
    }

    setCategoryMutationLoading(true);
    try {
      const response = await itemsService.deleteCategory(selectedCategory.id);
      toast.success(response.message);
      deleteCategoryDialog.onClose();
      await refreshAll();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete item category."));
    } finally {
      setCategoryMutationLoading(false);
    }
  }, [deleteCategoryDialog, refreshAll, selectedCategory, toast]);

  const openEditItem = useCallback(
    async (row: ItemListItem) => {
      setItemMutationLoading(true);
      try {
        const response = await itemsService.getItem(row.id);
        setSelectedItem(response.data.item);
        itemModal.onOpen();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to load item details."));
      } finally {
        setItemMutationLoading(false);
      }
    },
    [itemModal, toast]
  );

  const handleItemSubmit = useCallback(
    async (values: {
      name: string;
      categoryId: string;
      sellingPrice: number;
      gstPercentage: number;
      imageUrl?: string;
      note?: string;
      isActive?: boolean;
      ingredients: { ingredientId: string; quantity: number; unit: ItemMetaIngredient["unit"] }[];
    }) => {
      setItemMutationLoading(true);
      try {
        if (selectedItem) {
          const response = await itemsService.updateItem(selectedItem.id, values);
          toast.success(response.message);
        } else {
          const response = await itemsService.createItem(values);
          toast.success(response.message);
        }

        itemModal.onClose();
        setSelectedItem(null);
        await Promise.all([fetchItems(), fetchCombos(), fetchComboItemOptions()]);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to save item."));
      } finally {
        setItemMutationLoading(false);
      }
    },
    [fetchComboItemOptions, fetchCombos, fetchItems, itemModal, selectedItem, toast]
  );

  const handleDeleteItem = useCallback(async () => {
    if (!selectedItemRow) {
      return;
    }

    setItemMutationLoading(true);
    try {
      const response = await itemsService.deleteItem(selectedItemRow.id);
      toast.success(response.message);
      deleteItemDialog.onClose();
      await Promise.all([fetchItems(), fetchComboItemOptions(), fetchCombos()]);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete item."));
    } finally {
      setItemMutationLoading(false);
    }
  }, [deleteItemDialog, fetchComboItemOptions, fetchCombos, fetchItems, selectedItemRow, toast]);

  const handleToggleItemStatus = useCallback(
    async (row: ItemListItem, nextStatus: boolean) => {
      await runRowAction(`item-status-${row.id}`, async () => {
        try {
          const response = await itemsService.updateItem(row.id, { isActive: nextStatus });
          toast.success(response.message);
          await Promise.all([fetchItems(), fetchComboItemOptions(), fetchCombos()]);
        } catch (error) {
          toast.error(extractErrorMessage(error, "Unable to update item status."));
        }
      });
    },
    [fetchComboItemOptions, fetchCombos, fetchItems, runRowAction, toast]
  );

  const openEditAddOn = useCallback(
    async (row: AddOnListItem) => {
      setAddOnMutationLoading(true);
      try {
        const response = await itemsService.getAddOn(row.id);
        setSelectedAddOn(response.data.addOn);
        addOnModal.onOpen();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to load add-on details."));
      } finally {
        setAddOnMutationLoading(false);
      }
    },
    [addOnModal, toast]
  );

  const handleAddOnSubmit = useCallback(
    async (values: {
      name: string;
      sellingPrice: number;
      gstPercentage: number;
      imageUrl?: string;
      note?: string;
      isActive?: boolean;
      ingredients: { ingredientId: string; quantity: number; unit: ItemMetaIngredient["unit"] }[];
    }) => {
      setAddOnMutationLoading(true);
      try {
        if (selectedAddOn) {
          const response = await itemsService.updateAddOn(selectedAddOn.id, values);
          toast.success(response.message);
        } else {
          const response = await itemsService.createAddOn(values);
          toast.success(response.message);
        }

        addOnModal.onClose();
        setSelectedAddOn(null);
        await fetchAddOns();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to save add-on."));
      } finally {
        setAddOnMutationLoading(false);
      }
    },
    [addOnModal, fetchAddOns, selectedAddOn, toast]
  );

  const handleDeleteAddOn = useCallback(async () => {
    if (!selectedAddOnRow) {
      return;
    }

    setAddOnMutationLoading(true);
    try {
      const response = await itemsService.deleteAddOn(selectedAddOnRow.id);
      toast.success(response.message);
      deleteAddOnDialog.onClose();
      await fetchAddOns();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete add-on."));
    } finally {
      setAddOnMutationLoading(false);
    }
  }, [deleteAddOnDialog, fetchAddOns, selectedAddOnRow, toast]);

  const handleToggleAddOnStatus = useCallback(
    async (row: AddOnListItem, nextStatus: boolean) => {
      await runRowAction(`addon-status-${row.id}`, async () => {
        try {
          const response = await itemsService.updateAddOn(row.id, { isActive: nextStatus });
          toast.success(response.message);
          await fetchAddOns();
        } catch (error) {
          toast.error(extractErrorMessage(error, "Unable to update add-on status."));
        }
      });
    },
    [fetchAddOns, runRowAction, toast]
  );

  const openEditCombo = useCallback(
    async (row: ComboListItem) => {
      setComboMutationLoading(true);
      try {
        const response = await itemsService.getCombo(row.id);
        setSelectedCombo(response.data.combo);
        comboModal.onOpen();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to load combo details."));
      } finally {
        setComboMutationLoading(false);
      }
    },
    [comboModal, toast]
  );

  const handleComboSubmit = useCallback(
    async (values: {
      name: string;
      sellingPrice: number;
      gstPercentage: number;
      imageUrl?: string;
      note?: string;
      isActive?: boolean;
      items: { itemId: string; quantity: number }[];
    }) => {
      setComboMutationLoading(true);
      try {
        if (selectedCombo) {
          const response = await itemsService.updateCombo(selectedCombo.id, values);
          toast.success(response.message);
        } else {
          const response = await itemsService.createCombo(values);
          toast.success(response.message);
        }

        comboModal.onClose();
        setSelectedCombo(null);
        await fetchCombos();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to save combo."));
      } finally {
        setComboMutationLoading(false);
      }
    },
    [comboModal, fetchCombos, selectedCombo, toast]
  );

  const handleDeleteCombo = useCallback(async () => {
    if (!selectedComboRow) {
      return;
    }

    setComboMutationLoading(true);
    try {
      const response = await itemsService.deleteCombo(selectedComboRow.id);
      toast.success(response.message);
      deleteComboDialog.onClose();
      await fetchCombos();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete combo."));
    } finally {
      setComboMutationLoading(false);
    }
  }, [deleteComboDialog, fetchCombos, selectedComboRow, toast]);

  const handleToggleComboStatus = useCallback(
    async (row: ComboListItem, nextStatus: boolean) => {
      await runRowAction(`combo-status-${row.id}`, async () => {
        try {
          const response = await itemsService.updateCombo(row.id, { isActive: nextStatus });
          toast.success(response.message);
          await fetchCombos();
        } catch (error) {
          toast.error(extractErrorMessage(error, "Unable to update combo status."));
        }
      });
    },
    [fetchCombos, runRowAction, toast]
  );

  const categoryColumns = useMemo(
    () =>
      [
        { key: "name", header: "Name" },
        {
          key: "description",
          header: "Description",
          render: (row: ItemCategory) => row.description || "-"
        },
        {
          key: "itemCount",
          header: "Items",
          render: (row: ItemCategory) => (
            <Text fontWeight={700} color={(row.itemCount ?? 0) > 0 ? "#5B3A2A" : "#7D655B"}>
              {row.itemCount ?? 0}
            </Text>
          )
        },
        {
          key: "status",
          header: "Status",
          render: (row: ItemCategory) => <ActiveBadge isActive={row.isActive} />
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: ItemCategory) => (
            <HStack spacing={2} flexWrap="nowrap">
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
                  (row.itemCount ?? 0) > 0
                    ? "Cannot delete category with items"
                    : `Delete ${row.name}`
                }
                icon={<Trash2 size={16} />}
                size="sm"
                variant="outline"
                colorScheme="red"
                isDisabled={Boolean((row.itemCount ?? 0) > 0)}
                onClick={() => {
                  setSelectedCategory(row);
                  deleteCategoryDialog.onOpen();
                }}
              />
            </HStack>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: ItemCategory) => ReactNode }>,
    [categoryModal, deleteCategoryDialog]
  );

  const itemColumns = useMemo(
    () =>
      [
        {
          key: "image",
          header: "Image",
          render: (row: ItemListItem) => (
            <Image
              src={row.imageUrl || logo}
              fallbackSrc={logo}
              w="42px"
              h="42px"
              borderRadius="10px"
              objectFit="cover"
            />
          )
        },
        {
          key: "name",
          header: "Item",
          render: (row: ItemListItem) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.name}</Text>
              <Text fontSize="sm" color="#725D53">
                {row.ingredientCount} ingredients
              </Text>
            </VStack>
          )
        },
        { key: "categoryName", header: "Category" },
        {
          key: "estimatedIngredientCost",
          header: "Est. Cost",
          render: (row: ItemListItem) => formatCurrency(row.estimatedIngredientCost)
        },
        {
          key: "sellingPrice",
          header: "Selling",
          render: (row: ItemListItem) => formatCurrency(row.sellingPrice)
        },
        {
          key: "gstPercentage",
          header: "GST %",
          render: (row: ItemListItem) => `${row.gstPercentage}%`
        },
        {
          key: "status",
          header: "Status",
          render: (row: ItemListItem) => <ActiveBadge isActive={row.isActive} />
        },
        {
          key: "availability",
          header: "Enable",
          render: (row: ItemListItem) => (
            <Switch
              colorScheme="brand"
              isChecked={row.isActive}
              isDisabled={Boolean(rowActionLoading[`item-status-${row.id}`])}
              onChange={(event) => void handleToggleItemStatus(row, event.target.checked)}
            />
          )
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: ItemListItem) => (
            <HStack spacing={2} flexWrap="nowrap">
              <ActionIconButton
                aria-label={`Edit ${row.name}`}
                icon={<Edit2 size={16} />}
                size="sm"
                variant="outline"
                onClick={() => void openEditItem(row)}
              />
              <ActionIconButton
                aria-label={`Delete ${row.name}`}
                icon={<Trash2 size={16} />}
                size="sm"
                variant="outline"
                colorScheme="red"
                onClick={() => {
                  setSelectedItemRow(row);
                  deleteItemDialog.onOpen();
                }}
              />
            </HStack>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: ItemListItem) => ReactNode }>,
    [deleteItemDialog, handleToggleItemStatus, openEditItem, rowActionLoading]
  );

  const addOnColumns = useMemo(
    () =>
      [
        {
          key: "image",
          header: "Image",
          render: (row: AddOnListItem) => (
            <Image
              src={row.imageUrl || logo}
              fallbackSrc={logo}
              w="42px"
              h="42px"
              borderRadius="10px"
              objectFit="cover"
            />
          )
        },
        {
          key: "name",
          header: "Add-on",
          render: (row: AddOnListItem) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.name}</Text>
              <Text fontSize="sm" color="#725D53">
                {row.ingredientCount} ingredients
              </Text>
            </VStack>
          )
        },
        {
          key: "estimatedIngredientCost",
          header: "Est. Cost",
          render: (row: AddOnListItem) => formatCurrency(row.estimatedIngredientCost)
        },
        {
          key: "sellingPrice",
          header: "Selling",
          render: (row: AddOnListItem) => formatCurrency(row.sellingPrice)
        },
        {
          key: "gstPercentage",
          header: "GST %",
          render: (row: AddOnListItem) => `${row.gstPercentage}%`
        },
        {
          key: "status",
          header: "Status",
          render: (row: AddOnListItem) => <ActiveBadge isActive={row.isActive} />
        },
        {
          key: "availability",
          header: "Enable",
          render: (row: AddOnListItem) => (
            <Switch
              colorScheme="brand"
              isChecked={row.isActive}
              isDisabled={Boolean(rowActionLoading[`addon-status-${row.id}`])}
              onChange={(event) => void handleToggleAddOnStatus(row, event.target.checked)}
            />
          )
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: AddOnListItem) => (
            <HStack spacing={2} flexWrap="nowrap">
              <ActionIconButton
                aria-label={`Edit ${row.name}`}
                icon={<Edit2 size={16} />}
                size="sm"
                variant="outline"
                onClick={() => void openEditAddOn(row)}
              />
              <ActionIconButton
                aria-label={`Delete ${row.name}`}
                icon={<Trash2 size={16} />}
                size="sm"
                variant="outline"
                colorScheme="red"
                onClick={() => {
                  setSelectedAddOnRow(row);
                  deleteAddOnDialog.onOpen();
                }}
              />
            </HStack>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: AddOnListItem) => ReactNode }>,
    [deleteAddOnDialog, handleToggleAddOnStatus, openEditAddOn, rowActionLoading]
  );

  const comboColumns = useMemo(
    () =>
      [
        {
          key: "image",
          header: "Image",
          render: (row: ComboListItem) => (
            <Image
              src={row.imageUrl || logo}
              fallbackSrc={logo}
              w="42px"
              h="42px"
              borderRadius="10px"
              objectFit="cover"
            />
          )
        },
        { key: "name", header: "Combo" },
        {
          key: "includedItemsCount",
          header: "Included",
          render: (row: ComboListItem) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.includedItemsCount} items</Text>
              <Text fontSize="sm" color="#725D53">
                {formatCurrency(row.includedItemsValue)}
              </Text>
            </VStack>
          )
        },
        {
          key: "sellingPrice",
          header: "Selling",
          render: (row: ComboListItem) => formatCurrency(row.sellingPrice)
        },
        {
          key: "gstPercentage",
          header: "GST %",
          render: (row: ComboListItem) => `${row.gstPercentage}%`
        },
        {
          key: "status",
          header: "Status",
          render: (row: ComboListItem) => <ActiveBadge isActive={row.isActive} />
        },
        {
          key: "availability",
          header: "Enable",
          render: (row: ComboListItem) => (
            <Switch
              colorScheme="brand"
              isChecked={row.isActive}
              isDisabled={Boolean(rowActionLoading[`combo-status-${row.id}`])}
              onChange={(event) => void handleToggleComboStatus(row, event.target.checked)}
            />
          )
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: ComboListItem) => (
            <HStack spacing={2} flexWrap="nowrap">
              <ActionIconButton
                aria-label={`Edit ${row.name}`}
                icon={<Edit2 size={16} />}
                size="sm"
                variant="outline"
                onClick={() => void openEditCombo(row)}
              />
              <ActionIconButton
                aria-label={`Delete ${row.name}`}
                icon={<Trash2 size={16} />}
                size="sm"
                variant="outline"
                colorScheme="red"
                onClick={() => {
                  setSelectedComboRow(row);
                  deleteComboDialog.onOpen();
                }}
              />
            </HStack>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: ComboListItem) => ReactNode }>,
    [deleteComboDialog, handleToggleComboStatus, openEditCombo, rowActionLoading]
  );

  if (user?.role !== UserRole.ADMIN) {
    return (
      <VStack spacing={6} align="stretch">
        <PageHeader title="Item Entry" subtitle="This module is restricted to admin users." />
        <AppCard>
          <EmptyState
            title="Unauthorized"
            description="Only admin users can access Item Entry module."
          />
        </AppCard>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Item Entry"
        subtitle="Manage item categories, items, add-ons and combos with recipe mapping and estimated cost insights."
      />

      <Tabs variant="soft-rounded" colorScheme="brand" isLazy>
        <TabList>
          <Tab>Categories</Tab>
          <Tab>Items</Tab>
          <Tab>Add-ons</Tab>
          <Tab>Combos</Tab>
        </TabList>

        <TabPanels>
          <TabPanel px={0}>
            <AppCard>
              <VStack spacing={4} align="stretch">
                <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
                  <AppInput
                    label="Search"
                    placeholder="Search category"
                    value={categorySearch}
                    onChange={(event) => setCategorySearch((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                  />
                  <FormControl>
                    <FormLabel>Records per page</FormLabel>
                    <Select
                      value={String(categoryLimit)}
                      onChange={(event) => {
                        const nextLimit = Number((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value) || 5;
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
                    emptyState={<EmptyState title="No categories found" description="Create item categories to organize your menu." />}
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
                    label="Search Item"
                    placeholder="Search by item name"
                    value={itemSearch}
                    onChange={(event) => setItemSearch((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                  />
                  <FormControl>
                    <FormLabel>Category</FormLabel>
                    <Select value={itemCategoryFilter} onChange={(event) => setItemCategoryFilter((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}>
                      <option value="">All Categories</option>
                      {metaCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel>Records per page</FormLabel>
                    <Select
                      value={String(itemLimit)}
                      onChange={(event) => {
                        const nextLimit = Number((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value) || 5;
                        setItemLimit(nextLimit);
                        setItemPage(1);
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
                      isDisabled={!metaCategories.length || !metaIngredients.length}
                      onClick={() => {
                        setSelectedItem(null);
                        itemModal.onOpen();
                      }}
                    >
                      Add Item
                    </AppButton>
                  </Box>
                </SimpleGrid>

                {itemLoading ? (
                  <SkeletonTable />
                ) : (
                  <DataTable
                    columns={itemColumns}
                    rows={itemRows}
                    emptyState={<EmptyState title="No items found" description="Create your first item with ingredient mapping." />}
                  />
                )}

                <PaginationControls
                  page={itemPagination.page}
                  totalPages={itemPagination.totalPages}
                  total={itemPagination.total}
                  showing={itemRows.length}
                  onPageChange={setItemPage}
                />
              </VStack>
            </AppCard>
          </TabPanel>

          <TabPanel px={0}>
            <AppCard>
              <VStack spacing={4} align="stretch">
                <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
                  <AppInput
                    label="Search Add-on"
                    placeholder="Search by add-on name"
                    value={addOnSearch}
                    onChange={(event) => setAddOnSearch((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                  />
                  <FormControl>
                    <FormLabel>Records per page</FormLabel>
                    <Select
                      value={String(addOnLimit)}
                      onChange={(event) => {
                        const nextLimit = Number((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value) || 5;
                        setAddOnLimit(nextLimit);
                        setAddOnPage(1);
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
                      isDisabled={!metaIngredients.length}
                      onClick={() => {
                        setSelectedAddOn(null);
                        addOnModal.onOpen();
                      }}
                    >
                      Add Add-on
                    </AppButton>
                  </Box>
                </SimpleGrid>

                {addOnLoading ? (
                  <SkeletonTable />
                ) : (
                  <DataTable
                    columns={addOnColumns}
                    rows={addOnRows}
                    emptyState={<EmptyState title="No add-ons found" description="Create add-ons with ingredient mapping and pricing." />}
                  />
                )}

                <PaginationControls
                  page={addOnPagination.page}
                  totalPages={addOnPagination.totalPages}
                  total={addOnPagination.total}
                  showing={addOnRows.length}
                  onPageChange={setAddOnPage}
                />
              </VStack>
            </AppCard>
          </TabPanel>

          <TabPanel px={0}>
            <AppCard>
              <VStack spacing={4} align="stretch">
                <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
                  <AppInput
                    label="Search Combo"
                    placeholder="Search by combo name"
                    value={comboSearch}
                    onChange={(event) => setComboSearch((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                  />
                  <FormControl>
                    <FormLabel>Records per page</FormLabel>
                    <Select
                      value={String(comboLimit)}
                      onChange={(event) => {
                        const nextLimit = Number((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value) || 5;
                        setComboLimit(nextLimit);
                        setComboPage(1);
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
                      isDisabled={!comboItemOptions.length}
                      onClick={() => {
                        setSelectedCombo(null);
                        comboModal.onOpen();
                      }}
                    >
                      Add Combo
                    </AppButton>
                  </Box>
                </SimpleGrid>

                {comboLoading ? (
                  <SkeletonTable />
                ) : (
                  <DataTable
                    columns={comboColumns}
                    rows={comboRows}
                    emptyState={<EmptyState title="No combos found" description="Create combos by combining your existing items." />}
                  />
                )}

                <PaginationControls
                  page={comboPagination.page}
                  totalPages={comboPagination.totalPages}
                  total={comboPagination.total}
                  showing={comboRows.length}
                  onPageChange={setComboPage}
                />
              </VStack>
            </AppCard>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <ItemCategoryFormModal
        isOpen={categoryModal.isOpen}
        onClose={() => {
          categoryModal.onClose();
          setSelectedCategory(null);
        }}
        onSubmit={handleCategorySubmit}
        loading={categoryMutationLoading}
        initialData={selectedCategory}
      />

      <ItemFormModal
        isOpen={itemModal.isOpen}
        onClose={() => {
          itemModal.onClose();
          setSelectedItem(null);
        }}
        loading={itemMutationLoading}
        categories={metaCategories}
        ingredients={metaIngredients}
        unitMeta={metaUnits}
        initialData={selectedItem}
        onSubmit={handleItemSubmit}
      />

      <AddOnFormModal
        isOpen={addOnModal.isOpen}
        onClose={() => {
          addOnModal.onClose();
          setSelectedAddOn(null);
        }}
        loading={addOnMutationLoading}
        ingredients={metaIngredients}
        unitMeta={metaUnits}
        initialData={selectedAddOn}
        onSubmit={handleAddOnSubmit}
      />

      <ComboFormModal
        isOpen={comboModal.isOpen}
        onClose={() => {
          comboModal.onClose();
          setSelectedCombo(null);
        }}
        loading={comboMutationLoading}
        items={comboItemOptions}
        initialData={selectedCombo}
        onSubmit={handleComboSubmit}
      />

      <ConfirmDialog
        isOpen={deleteCategoryDialog.isOpen}
        onClose={deleteCategoryDialog.onClose}
        title="Delete Category Permanently"
        description={
          (selectedCategory?.itemCount ?? 0) > 0
            ? `${selectedCategory?.name ?? "This category"} has ${selectedCategory?.itemCount ?? 0} item(s). Move or delete items first.`
            : `Are you sure you want to permanently delete ${selectedCategory?.name ?? "this category"}?`
        }
        onConfirm={() => void handleDeleteCategory()}
        isLoading={categoryMutationLoading}
      />

      <ConfirmDialog
        isOpen={deleteItemDialog.isOpen}
        onClose={deleteItemDialog.onClose}
        title="Delete Item Permanently"
        description={`Are you sure you want to permanently delete ${selectedItemRow?.name ?? "this item"}?`}
        onConfirm={() => void handleDeleteItem()}
        isLoading={itemMutationLoading}
      />

      <ConfirmDialog
        isOpen={deleteAddOnDialog.isOpen}
        onClose={deleteAddOnDialog.onClose}
        title="Delete Add-on Permanently"
        description={`Are you sure you want to permanently delete ${selectedAddOnRow?.name ?? "this add-on"}?`}
        onConfirm={() => void handleDeleteAddOn()}
        isLoading={addOnMutationLoading}
      />

      <ConfirmDialog
        isOpen={deleteComboDialog.isOpen}
        onClose={deleteComboDialog.onClose}
        title="Delete Combo Permanently"
        description={`Are you sure you want to permanently delete ${selectedComboRow?.name ?? "this combo"}?`}
        onConfirm={() => void handleDeleteCombo()}
        isLoading={comboMutationLoading}
      />
    </VStack>
  );
};
