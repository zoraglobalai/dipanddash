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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppSearchableSelect, type AppSearchableSelectOption } from "@/components/ui/AppSearchableSelect";
import { DataTable } from "@/components/ui/DataTable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAppToast } from "@/hooks/useAppToast";
import { procurementService } from "@/services/procurement.service";
import type {
  ProductListItem,
  ProductListResponse,
  ProductUnit,
  ProcurementStatsResponse,
  SupplierListItem
} from "@/types/procurement";
import { extractErrorMessage } from "@/utils/api-error";

const defaultPagination = {
  page: 1,
  limit: 10,
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

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  });
};

const getToday = () => new Date().toISOString().slice(0, 10);
const getDateBefore = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

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

type ProductFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  initialData: ProductListItem | null;
  suppliers: SupplierListItem[];
  units: string[];
  onSubmit: (payload: {
    name: string;
    category: string;
    sku?: string;
    packSize?: string;
    unit: ProductUnit;
    currentStock: number;
    minStock: number;
    purchaseUnitPrice: number;
    defaultSupplierId?: string | null;
    isActive: boolean;
  }) => Promise<void>;
};

const ProductFormModal = ({ isOpen, onClose, loading, initialData, suppliers, units, onSubmit }: ProductFormModalProps) => {
  const [form, setForm] = useState({
    name: "",
    category: "",
    sku: "",
    packSize: "",
    unit: (units[0] ?? "pcs") as ProductUnit,
    currentStock: "0",
    minStock: "0",
    purchaseUnitPrice: "0",
    defaultSupplierId: "",
    isActive: true
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setForm({
      name: initialData?.name ?? "",
      category: initialData?.category ?? "",
      sku: initialData?.sku ?? "",
      packSize: initialData?.packSize ?? "",
      unit: (initialData?.unit ?? units[0] ?? "pcs") as ProductUnit,
      currentStock: String(initialData?.currentStock ?? 0),
      minStock: String(initialData?.minStock ?? 0),
      purchaseUnitPrice: String(initialData?.purchaseUnitPrice ?? 0),
      defaultSupplierId: initialData?.defaultSupplierId ?? "",
      isActive: initialData?.isActive ?? true
    });
  }, [initialData, isOpen, units]);

  const supplierOptions: AppSearchableSelectOption[] = useMemo(
    () =>
      suppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
        description: supplier.phone,
        searchText: `${supplier.name} ${supplier.phone}`
      })),
    [suppliers]
  );

  const unitOptions: AppSearchableSelectOption[] = useMemo(
    () =>
      units.map((unit) => ({
        value: unit,
        label: unit.toUpperCase()
      })),
    [units]
  );

  const handleSave = async () => {
    await onSubmit({
      name: form.name.trim(),
      category: form.category.trim(),
      sku: form.sku.trim() || undefined,
      packSize: form.packSize.trim() || undefined,
      unit: form.unit,
      currentStock: Number(form.currentStock),
      minStock: Number(form.minStock),
      purchaseUnitPrice: Number(form.purchaseUnitPrice),
      defaultSupplierId: form.defaultSupplierId || null,
      isActive: form.isActive
    });
  };

  const hasInvalidNumber =
    Number(form.currentStock) < 0 || Number(form.minStock) < 0 || Number(form.purchaseUnitPrice) < 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
      <ModalOverlay />
      <ModalContent borderRadius="18px">
        <ModalHeader>{initialData ? "Edit Asset" : "Create Asset"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <AppInput
                label="Asset Name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: (event.target as HTMLInputElement).value }))}
              />
              <AppInput
                label="Category"
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, category: (event.target as HTMLInputElement).value }))
                }
              />
              <AppInput
                label="SKU (optional)"
                value={form.sku}
                onChange={(event) => setForm((prev) => ({ ...prev, sku: (event.target as HTMLInputElement).value }))}
              />
              <AppInput
                label="Pack Size (optional)"
                value={form.packSize}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, packSize: (event.target as HTMLInputElement).value }))
                }
              />
              <AppSearchableSelect
                label="Unit"
                value={form.unit}
                options={unitOptions}
                onValueChange={(value) => setForm((prev) => ({ ...prev, unit: value as ProductUnit }))}
                isClearable={false}
              />
              <AppSearchableSelect
                label="Default Supplier"
                value={form.defaultSupplierId}
                options={supplierOptions}
                onValueChange={(value) => setForm((prev) => ({ ...prev, defaultSupplierId: value }))}
                placeholder="Select supplier"
                searchPlaceholder="Search supplier"
              />
              <AppInput
                label="Current Stock"
                type="number"
                min={0}
                step="0.001"
                value={form.currentStock}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, currentStock: (event.target as HTMLInputElement).value }))
                }
              />
              <AppInput
                label="Minimum Stock"
                type="number"
                min={0}
                step="0.001"
                value={form.minStock}
                onChange={(event) => setForm((prev) => ({ ...prev, minStock: (event.target as HTMLInputElement).value }))}
              />
            </SimpleGrid>
            <AppInput
              label="Purchase Unit Price"
              type="number"
              min={0}
              step="0.01"
              value={form.purchaseUnitPrice}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, purchaseUnitPrice: (event.target as HTMLInputElement).value }))
              }
            />
            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <FormLabel mb={0}>Active Asset</FormLabel>
              <Checkbox
                isChecked={form.isActive}
                onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
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
          <AppButton
            onClick={() => void handleSave()}
            isLoading={loading}
            isDisabled={!form.name.trim() || !form.category.trim() || hasInvalidNumber}
          >
            {initialData ? "Save Asset" : "Create Asset"}
          </AppButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export const AssetsEntryPage = () => {
  const toast = useAppToast();
  const productModal = useDisclosure();
  const deleteDialog = useDisclosure();

  const [rows, setRows] = useState<ProductListItem[]>([]);
  const [pagination, setPagination] = useState(defaultPagination);
  const [stats, setStats] = useState<ProductListResponse["stats"]>({
    totalProducts: 0,
    activeProducts: 0,
    inactiveProducts: 0,
    lowStockProducts: 0,
    stockValuation: 0,
    totalPurchasedQuantity: 0,
    totalPurchasedAmount: 0,
    topPurchasedProducts: []
  });
  const [procurementSummary, setProcurementSummary] = useState<ProcurementStatsResponse["summary"]>({
    totalSuppliers: 0,
    totalProducts: 0,
    totalPurchaseOrders: 0,
    totalPurchaseAmount: 0,
    totalProductPurchasedQuantity: 0,
    totalProductPurchasedAmount: 0
  });

  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutationLoading, setMutationLoading] = useState(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [selectedProduct, setSelectedProduct] = useState<ProductListItem | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const [suppliersResponse, unitsResponse] = await Promise.all([
        procurementService.getSuppliers({ includeInactive: true, page: 1, limit: 200 }),
        procurementService.getUnits()
      ]);
      setSuppliers(suppliersResponse.data.suppliers);
      setUnits([...unitsResponse.data.productUnits]);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch asset master data."));
    }
  }, [toast]);

  const loadProcurementSummary = useCallback(async () => {
    try {
      const response = await procurementService.getStats({
        dateFrom: getDateBefore(29),
        dateTo: getToday()
      });
      setProcurementSummary(response.data.summary);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch asset spend summary."));
    }
  }, [toast]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await procurementService.getProducts({
        search: debouncedSearch || undefined,
        category: categoryFilter || undefined,
        supplierId: supplierFilter || undefined,
        includeInactive,
        page,
        limit
      });
      setRows(response.data.products);
      setPagination(response.data.pagination);
      setStats(response.data.stats);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch assets."));
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, debouncedSearch, includeInactive, limit, page, supplierFilter, toast]);

  useEffect(() => {
    void loadMeta();
    void loadProcurementSummary();
  }, [loadMeta, loadProcurementSummary]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryFilter, supplierFilter, includeInactive, limit]);

  const supplierOptions = useMemo(
    () => suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
    [suppliers]
  );

  const categoryOptions = useMemo(() => {
    const uniqueCategories = [...new Set(rows.map((row) => row.category).filter(Boolean))];
    return uniqueCategories.map((category) => ({ value: category, label: category }));
  }, [rows]);

  const lowStockRows = useMemo(() => rows.filter((row) => row.stockStatus === "LOW_STOCK"), [rows]);

  const columns = useMemo(
    () =>
      [
        {
          key: "name",
          header: "Asset",
          render: (row: ProductListItem) => (
            <Box>
              <Text fontWeight={800}>{row.name}</Text>
              <Text fontSize="sm" color="#7A6359">
                {row.sku || "-"}
                {row.packSize ? ` | ${row.packSize}` : ""}
              </Text>
            </Box>
          )
        },
        { key: "category", header: "Category", render: (row: ProductListItem) => row.category },
        { key: "stock", header: "Stock", render: (row: ProductListItem) => `${row.currentStock} ${row.unit}` },
        { key: "minStock", header: "Min Stock", render: (row: ProductListItem) => `${row.minStock} ${row.unit}` },
        {
          key: "purchaseUnitPrice",
          header: "Unit Price",
          render: (row: ProductListItem) => formatCurrency(row.purchaseUnitPrice)
        },
        { key: "valuation", header: "Valuation", render: (row: ProductListItem) => formatCurrency(row.valuation) },
        {
          key: "defaultSupplierName",
          header: "Supplier",
          render: (row: ProductListItem) => row.defaultSupplierName || "-"
        },
        {
          key: "status",
          header: "Status",
          render: (row: ProductListItem) => (
            <Box
              px={3}
              py={1}
              borderRadius="full"
              bg={row.stockStatus === "LOW_STOCK" ? "red.100" : "green.100"}
              color={row.stockStatus === "LOW_STOCK" ? "red.700" : "green.700"}
              fontSize="xs"
              fontWeight={700}
              w="fit-content"
            >
              {row.stockStatus === "LOW_STOCK" ? "Low Stock" : "Healthy"}
            </Box>
          )
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: ProductListItem) => (
            <HStack spacing={2}>
              <ActionIconButton
                aria-label="Edit asset"
                tooltip="Edit asset"
                icon={<Edit2 size={16} />}
                variant="outline"
                onClick={() => {
                  setSelectedProduct(row);
                  productModal.onOpen();
                }}
              />
              <ActionIconButton
                aria-label="Delete asset"
                tooltip="Delete asset"
                icon={<Trash2 size={16} />}
                variant="outline"
                colorScheme="accentRed"
                onClick={() => {
                  setSelectedProduct(row);
                  deleteDialog.onOpen();
                }}
              />
            </HStack>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: ProductListItem) => ReactNode }>,
    [deleteDialog, productModal]
  );

  const handleSaveProduct = useCallback(
    async (payload: {
      name: string;
      category: string;
      sku?: string;
      packSize?: string;
      unit: ProductUnit;
      currentStock: number;
      minStock: number;
      purchaseUnitPrice: number;
      defaultSupplierId?: string | null;
      isActive: boolean;
    }) => {
      setMutationLoading(true);
      try {
        if (selectedProduct) {
          await procurementService.updateProduct(selectedProduct.id, payload);
          toast.success("Asset updated successfully.");
        } else {
          await procurementService.createProduct(payload);
          toast.success("Asset created successfully.");
        }
        productModal.onClose();
        setSelectedProduct(null);
        await Promise.all([loadProducts(), loadProcurementSummary()]);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to save asset."));
      } finally {
        setMutationLoading(false);
      }
    },
    [loadProducts, loadProcurementSummary, productModal, selectedProduct, toast]
  );

  const handleDeleteProduct = useCallback(async () => {
    if (!selectedProduct) {
      return;
    }

    setMutationLoading(true);
    try {
      await procurementService.deleteProduct(selectedProduct.id);
      toast.success("Asset deleted successfully.");
      deleteDialog.onClose();
      setSelectedProduct(null);
      await Promise.all([loadProducts(), loadProcurementSummary()]);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete asset."));
    } finally {
      setMutationLoading(false);
    }
  }, [deleteDialog, loadProducts, loadProcurementSummary, selectedProduct, toast]);

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Assets Entry"
        subtitle="Manage product assets, stock health, valuation and procurement movement."
      />

      <AppCard
        title="Assets Control Room"
        subtitle="Filter assets, monitor risk and maintain clean stock data."
        rightContent={
          <AppButton
            leftIcon={<Plus size={16} />}
            onClick={() => {
              setSelectedProduct(null);
              productModal.onOpen();
            }}
          >
            Add Asset
          </AppButton>
        }
      >
        <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={4}>
          <AppInput
            label="Search"
            placeholder="Search by asset name / SKU / pack"
            value={search}
            onChange={(event) => setSearch((event.target as HTMLInputElement).value)}
          />
          <FormControl>
            <FormLabel>Category</FormLabel>
            <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">All Categories</option>
              {categoryOptions.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>Supplier</FormLabel>
            <Select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
              <option value="">All Suppliers</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.value} value={supplier.value}>
                  {supplier.label}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>Rows per page</FormLabel>
            <Select value={String(limit)} onChange={(event) => setLimit(Number(event.target.value) || 10)}>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </Select>
          </FormControl>
          <FormControl display="flex" alignItems="center" justifyContent="space-between">
            <FormLabel mb={0}>Include Inactive</FormLabel>
            <Checkbox isChecked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)}>
              Show
            </Checkbox>
          </FormControl>
        </SimpleGrid>
      </AppCard>

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4}>
        <AssetMetric label="Total Assets" value={String(stats.totalProducts)} helper={`${stats.activeProducts} active`} />
        <AssetMetric
          label="Low Stock Alerts"
          value={String(stats.lowStockProducts)}
          helper={`${stats.inactiveProducts} inactive`}
        />
        <AssetMetric label="Stock Valuation" value={formatCurrency(stats.stockValuation)} />
        <AssetMetric
          label="Purchase Value (30d)"
          value={formatCurrency(procurementSummary.totalProductPurchasedAmount)}
          helper={`${procurementSummary.totalPurchaseOrders} purchase orders`}
        />
        <AssetMetric
          label="Purchased Qty (30d)"
          value={String(procurementSummary.totalProductPurchasedQuantity)}
          helper="Products added through purchase"
        />
        <AssetMetric label="Suppliers" value={String(procurementSummary.totalSuppliers)} />
        <AssetMetric label="Recent Spend" value={formatCurrency(procurementSummary.totalPurchaseAmount)} />
        <AssetMetric
          label="Top Product Count"
          value={String(stats.topPurchasedProducts.length)}
          helper="Top purchased list"
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4}>
        <Box gridColumn={{ base: "auto", xl: "span 2" }}>
          <AppCard title="Asset Registry" subtitle="Maintain clean stock, valuation and supplier mapping">
            {loading ? (
              <SkeletonTable />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={rows.map((row) => ({ ...row, id: row.id }))}
                  emptyState={
                    <EmptyState
                      title="No assets found"
                      description="Try adjusting search or filter and add new assets when required."
                    />
                  }
                />
                <HStack justify="space-between" mt={4}>
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
              </>
            )}
          </AppCard>
        </Box>

        <VStack spacing={4} align="stretch">
          <AppCard title="Top Purchased Assets" subtitle="High movement products by quantity">
            {stats.topPurchasedProducts.length ? (
              <VStack align="stretch" spacing={3}>
                {stats.topPurchasedProducts.slice(0, 8).map((entry) => (
                  <Box
                    key={entry.productId}
                    p={3}
                    borderRadius="12px"
                    border="1px solid"
                    borderColor="rgba(133, 78, 48, 0.18)"
                    bg="rgba(255,255,255,0.8)"
                  >
                    <HStack justify="space-between">
                      <Text fontWeight={700} color="#2A1A14">
                        {entry.name}
                      </Text>
                      <Text fontWeight={900} color="#7A3E16">
                        {entry.quantity} {entry.unit}
                      </Text>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            ) : (
              <EmptyState title="No purchase movement" description="No purchased quantity recorded for products yet." />
            )}
          </AppCard>

          <AppCard title="Low Stock Priority" subtitle="Immediate refill candidates">
            {lowStockRows.length ? (
              <VStack align="stretch" spacing={3}>
                {lowStockRows.slice(0, 8).map((row) => (
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
                      Stock {row.currentStock} {row.unit} | Min {row.minStock} {row.unit}
                    </Text>
                    <Text fontSize="sm" color="#8D1C13" fontWeight={700}>
                      Last update {formatDateTime(row.updatedAt)}
                    </Text>
                  </Box>
                ))}
              </VStack>
            ) : (
              <EmptyState title="No low stock assets" description="Current list has healthy stock levels." />
            )}
          </AppCard>
        </VStack>
      </SimpleGrid>

      <ProductFormModal
        isOpen={productModal.isOpen}
        onClose={() => {
          setSelectedProduct(null);
          productModal.onClose();
        }}
        loading={mutationLoading}
        initialData={selectedProduct}
        suppliers={suppliers}
        units={units}
        onSubmit={handleSaveProduct}
      />

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Delete this asset?"
        description={selectedProduct ? `Are you sure you want to delete ${selectedProduct.name}?` : "Are you sure?"}
        onClose={() => {
          deleteDialog.onClose();
          setSelectedProduct(null);
        }}
        onConfirm={() => void handleDeleteProduct()}
        isLoading={mutationLoading}
      />
    </VStack>
  );
};
