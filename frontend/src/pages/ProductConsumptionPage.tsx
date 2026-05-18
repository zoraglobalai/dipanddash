import {
  Badge,
  Box,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
  VStack,
  useDisclosure
} from "@chakra-ui/react";
import { Download, History, Plus, RefreshCw, Upload } from "lucide-react";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppSearchableSelect } from "@/components/ui/AppSearchableSelect";
import { DataTable } from "@/components/ui/DataTable";
import { useAppToast } from "@/hooks/useAppToast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { procurementService } from "@/services/procurement.service";
import { productConsumptionService } from "@/services/product-consumption.service";
import type { ProductListItem } from "@/types/procurement";
import type {
  ProductConsumptionImportHistoryItem,
  ProductConsumptionImportResult,
  ProductConsumptionRecord,
  ProductConsumptionRowDetail
} from "@/types/product-consumption";
import { extractErrorMessage } from "@/utils/api-error";

const defaultPagination = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1
};
const TABLE_PAGE_SIZE = 10;

const todayYmd = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value || 0);

const formatDateTime = (value?: string | null) => {
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

const statusColor = (status: string) => {
  if (status === "inserted" || status === "paid") {
    return "green";
  }
  if (status === "skipped_duplicate") {
    return "yellow";
  }
  if (status === "pending") {
    return "orange";
  }
  return "red";
};

const rowStatusRank = (status: ProductConsumptionRowDetail["status"]) => {
  if (status === "inserted") {
    return 0;
  }
  if (status === "skipped_duplicate") {
    return 1;
  }
  return 2;
};

type ConsumptionForm = {
  date: string;
  customerName: string;
  productId: string;
  productName: string;
  rate: string;
  quantity: string;
  totalAmount: string;
  cashAmount: string;
  gpayAmount: string;
  remarks: string;
  finalRemarks: string;
  status: string;
};

const initialForm = (): ConsumptionForm => ({
  date: todayYmd(),
  customerName: "Admin",
  productId: "",
  productName: "",
  rate: "",
  quantity: "1",
  totalAmount: "",
  cashAmount: "",
  gpayAmount: "",
  remarks: "",
  finalRemarks: "",
  status: "paid"
});

type ConsumptionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  products: ProductListItem[];
  loading: boolean;
  onSubmit: (form: ConsumptionForm) => void;
};

const ConsumptionModal = ({ isOpen, onClose, products, loading, onSubmit }: ConsumptionModalProps) => {
  const [form, setForm] = useState<ConsumptionForm>(initialForm);
  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        label: `${product.name} (${product.currentStock} ${product.unit})`,
        value: product.id
      })),
    [products]
  );

  useEffect(() => {
    if (isOpen) {
      setForm(initialForm());
    }
  }, [isOpen]);

  const selectedProduct = products.find((product) => product.id === form.productId);
  const derivedTotal = Number(form.rate || 0) * Number(form.quantity || 0);

  const setField = (key: keyof ConsumptionForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const handleFieldChange = (key: keyof ConsumptionForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setField(key, event.target.value);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Add Product Consumption</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <AppInput label="Date" type="date" value={form.date} onChange={handleFieldChange("date")} />
              <AppInput
                label="Customer Name"
                value={form.customerName}
                onChange={handleFieldChange("customerName")}
                placeholder="Admin"
              />
              <AppSearchableSelect
                label="Product"
                value={form.productId}
                options={productOptions}
                onValueChange={(value) => {
                  const product = products.find((item) => item.id === value);
                  setForm((current) => ({
                    ...current,
                    productId: value,
                    productName: "",
                    rate: product?.sellingPrice ? String(product.sellingPrice) : current.rate
                  }));
                }}
                placeholder="Select product"
                searchPlaceholder="Search product"
                emptyText="No Snooker products found"
              />
              <AppInput
                label="New Product Name"
                value={form.productName}
                isDisabled={Boolean(form.productId)}
                onChange={handleFieldChange("productName")}
                placeholder={selectedProduct ? "Using selected product" : "Type if product is not in list"}
              />
              <AppInput label="Rate" type="number" value={form.rate} onChange={handleFieldChange("rate")} />
              <AppInput label="Qty" type="number" value={form.quantity} onChange={handleFieldChange("quantity")} />
              <AppInput
                label="Total Amount"
                type="number"
                value={form.totalAmount}
                onChange={handleFieldChange("totalAmount")}
                placeholder={derivedTotal ? String(derivedTotal.toFixed(2)) : "0.00"}
              />
              <AppInput
                label="Cash"
                type="number"
                value={form.cashAmount}
                onChange={handleFieldChange("cashAmount")}
              />
              <AppInput
                label="Gpay"
                type="number"
                value={form.gpayAmount}
                onChange={handleFieldChange("gpayAmount")}
              />
              <FormControl>
                <FormLabel fontWeight={600}>Status</FormLabel>
                <Input
                  as="select"
                  value={form.status}
                  onChange={(event) => setField("status", event.target.value)}
                >
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                </Input>
              </FormControl>
            </SimpleGrid>
            <AppInput
              label="Remarks"
              value={form.remarks}
              onChange={handleFieldChange("remarks")}
              placeholder="Cash, Gpay, pending note"
            />
            <AppInput
              label="Final Remarks"
              value={form.finalRemarks}
              onChange={handleFieldChange("finalRemarks")}
            />
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <AppButton variant="outline" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton isLoading={loading} onClick={() => onSubmit(form)}>
            Save
          </AppButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export const ProductConsumptionPage = () => {
  const toast = useAppToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const historySectionRef = useRef<HTMLDivElement | null>(null);
  const detailSectionRef = useRef<HTMLDivElement | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [records, setRecords] = useState<ProductConsumptionRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(defaultPagination);
  const [historyRows, setHistoryRows] = useState<ProductConsumptionImportHistoryItem[]>([]);
  const [historyPagination, setHistoryPagination] = useState(defaultPagination);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedSummary, setSelectedSummary] = useState<ProductConsumptionImportResult | null>(null);
  const [selectedSummaryPage, setSelectedSummaryPage] = useState(1);
  const [importToDelete, setImportToDelete] = useState<ProductConsumptionImportHistoryItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const firstPage = await procurementService.getProducts({
        targetSection: "gaming",
        includeInactive: true,
        page: 1,
        limit: 200
      });
      const productsById = new Map(firstPage.data.products.map((product) => [product.id, product]));
      const totalPages = firstPage.data.pagination.totalPages;
      for (let nextPage = 2; nextPage <= totalPages; nextPage += 1) {
        const response = await procurementService.getProducts({
          targetSection: "gaming",
          includeInactive: true,
          page: nextPage,
          limit: 200
        });
        response.data.products.forEach((product) => productsById.set(product.id, product));
      }
      setProducts(Array.from(productsById.values()));
    } catch (error) {
      toast.error(extractErrorMessage(error) || "Unable to load Snooker products.");
    } finally {
      setProductsLoading(false);
    }
  }, [toast]);

  const loadRecords = useCallback(
    async (nextPage = 1) => {
      setRecordsLoading(true);
      try {
        const response = await productConsumptionService.getConsumptions({
          search: debouncedSearch || undefined,
          page: nextPage,
          limit: pagination.limit
        });
        setRecords(response.data.consumptions);
        setPagination(response.data.pagination);
      } catch (error) {
        toast.error(extractErrorMessage(error) || "Unable to load product consumption records.");
      } finally {
        setRecordsLoading(false);
      }
    },
    [debouncedSearch, pagination.limit, toast]
  );

  const loadHistory = useCallback(
    async (nextPage = 1) => {
      setHistoryLoading(true);
      try {
        const response = await productConsumptionService.getImportHistory({ page: nextPage, limit: TABLE_PAGE_SIZE });
        setHistoryRows(response.data.imports);
        setHistoryPagination(response.data.pagination);
      } catch (error) {
        toast.error(extractErrorMessage(error) || "Unable to load upload history.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setHistoryPage(1);
    void loadHistory(1);
  }, [loadHistory]);

  useEffect(() => {
    void loadRecords(1);
    setPage(1);
  }, [debouncedSearch, loadRecords]);

  const openHistory = useCallback(() => {
    setHistoryPage(1);
    void loadHistory(1);
    window.setTimeout(() => historySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }, [loadHistory]);

  const handleTemplateDownload = async () => {
    setTemplateLoading(true);
    try {
      const response = await productConsumptionService.downloadTemplate();
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "snooker_product_consumption_template.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(extractErrorMessage(error) || "Unable to download template.");
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setUploadLoading(true);
    try {
      const response = await productConsumptionService.importFile(file);
      const uploadedSummary = response.data;
      setSelectedSummary(uploadedSummary);
      setSelectedSummaryPage(1);
      if (uploadedSummary.id || uploadedSummary.importId) {
        const historyItem = {
          ...uploadedSummary,
          id: uploadedSummary.id ?? uploadedSummary.importId!,
          fileName: uploadedSummary.fileName ?? file.name,
          createdByUserId: null,
          createdAt: uploadedSummary.createdAt ?? uploadedSummary.importedAt ?? new Date().toISOString()
        };
        setHistoryRows((current) => [historyItem, ...current.filter((row) => row.id !== historyItem.id)].slice(0, TABLE_PAGE_SIZE));
        setHistoryPagination((current) => ({
          ...current,
          page: 1,
          total: Math.max(current.total + 1, 1),
          totalPages: Math.max(1, Math.ceil((current.total + 1) / TABLE_PAGE_SIZE))
        }));
      }
      const uploadMessage = `${uploadedSummary.insertedRows} inserted, ${uploadedSummary.failedRows} failed.`;
      if (uploadedSummary.failedRows > 0) {
        toast.warning(uploadMessage);
      } else {
        toast.success(uploadMessage);
      }
      setPage(1);
      setHistoryPage(1);
      await Promise.all([loadRecords(1), loadProducts(), loadHistory(1)]);
      window.setTimeout(() => detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (error) {
      toast.error(extractErrorMessage(error) || "Unable to import consumption file.");
    } finally {
      setUploadLoading(false);
    }
  };

  const handleSubmit = async (form: ConsumptionForm) => {
    const rate = Number(form.rate || 0);
    const quantity = Number(form.quantity || 0);
    const totalAmount = Number(form.totalAmount || 0) || rate * quantity;
    setSubmitLoading(true);
    try {
      await productConsumptionService.createConsumption({
        date: form.date,
        customerName: form.customerName || "Admin",
        productId: form.productId || undefined,
        productName: form.productId ? undefined : form.productName,
        rate,
        quantity,
        totalAmount,
        cashAmount: Number(form.cashAmount || 0),
        gpayAmount: Number(form.gpayAmount || 0),
        remarks: form.remarks,
        finalRemarks: form.finalRemarks,
        status: form.status
      });
      toast.success("Product consumption added.");
      onClose();
      await Promise.all([loadRecords(1), loadProducts()]);
      setPage(1);
    } catch (error) {
      toast.error(extractErrorMessage(error) || "Unable to add consumption record.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteImport = async () => {
    if (!importToDelete) {
      return;
    }
    setDeleteLoading(true);
    try {
      const response = await productConsumptionService.deleteImportHistory(importToDelete.id);
      toast.success(
        `Upload deleted. ${response.data.deletedInvoices} records removed, ${response.data.restoredStockQuantity} stock restored.`
      );
      if (selectedSummary?.id === importToDelete.id || selectedSummary?.importId === importToDelete.id) {
        setSelectedSummary(null);
      }
      setImportToDelete(null);
      await Promise.all([loadHistory(historyPage), loadRecords(page), loadProducts()]);
    } catch (error) {
      toast.error(extractErrorMessage(error) || "Unable to delete this upload.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const selectedRowDetails = useMemo(
    () =>
      (selectedSummary?.rowDetails ?? [])
        .map((row, index) => ({ ...row, id: `${row.rowNumber}-${index}` }))
        .sort((left, right) => rowStatusRank(left.status) - rowStatusRank(right.status) || left.rowNumber - right.rowNumber),
    [selectedSummary]
  );
  const selectedRowTotalPages = Math.max(1, Math.ceil(selectedRowDetails.length / TABLE_PAGE_SIZE));
  const selectedRowPage = Math.min(selectedSummaryPage, selectedRowTotalPages);
  const paginatedSelectedRowDetails = selectedRowDetails.slice(
    (selectedRowPage - 1) * TABLE_PAGE_SIZE,
    selectedRowPage * TABLE_PAGE_SIZE
  );

  return (
    <Box>
      <PageHeader
        title="Snooker Product Consumption"
        subtitle="Add Snooker product usage, payments, pending balances, and stock deductions."
        action={
          <HStack spacing={3} flexWrap="wrap" justify="flex-end">
            <AppButton leftIcon={<Download size={18} />} variant="outline" isLoading={templateLoading} onClick={handleTemplateDownload}>
              Template
            </AppButton>
            <AppButton leftIcon={<History size={18} />} variant="outline" onClick={openHistory}>
              History
            </AppButton>
            <AppButton leftIcon={<Upload size={18} />} variant="outline" isLoading={uploadLoading} onClick={() => fileInputRef.current?.click()}>
              Upload
            </AppButton>
            <AppButton leftIcon={<Plus size={18} />} onClick={onOpen}>
              New Record
            </AppButton>
          </HStack>
        }
      />

      <input ref={fileInputRef} type="file" accept=".csv,.xlsx" hidden onChange={(event) => void handleFileSelect(event)} />

      <AppCard mb={5}>
        <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
          <AppInput
            label="Search"
            value={search}
            onChange={(event) => setSearch((event.target as HTMLInputElement).value)}
            placeholder="Customer, product, invoice"
          />
          <Box>
            <Text color="#725D53" fontSize="sm">
              Total Rows
            </Text>
            <Text fontSize="2xl" fontWeight={800}>
              {pagination.total}
            </Text>
          </Box>
          <Box>
            <Text color="#725D53" fontSize="sm">
              Current Page Amount
            </Text>
            <Text fontSize="2xl" fontWeight={800}>
              {formatCurrency(records.reduce((sum, row) => sum + row.totalAmount, 0))}
            </Text>
          </Box>
          <Box>
            <Text color="#725D53" fontSize="sm">
              Pending On Page
            </Text>
            <Text fontSize="2xl" fontWeight={800}>
              {formatCurrency(records.reduce((sum, row) => sum + row.pendingAmount, 0))}
            </Text>
          </Box>
        </SimpleGrid>
      </AppCard>

      <AppCard title="Consumption Records" rightContent={<AppButton size="sm" variant="outline" leftIcon={<RefreshCw size={16} />} onClick={() => void loadRecords(page)}>Refresh</AppButton>}>
        {recordsLoading ? (
          <SkeletonTable rows={5} />
        ) : (
          <DataTable
            rows={records}
            emptyState={<EmptyState title="No product consumption found" description="Upload a file or add a new record." />}
            columns={[
              { key: "date", header: "Date" },
              { key: "customerName", header: "Customer" },
              { key: "productName", header: "Product" },
              { key: "quantity", header: "Qty" },
              { key: "rate", header: "Rate", render: (row) => formatCurrency(row.rate) },
              { key: "totalAmount", header: "Total", render: (row) => formatCurrency(row.totalAmount) },
              { key: "cashAmount", header: "Cash", render: (row) => formatCurrency(row.cashAmount) },
              { key: "gpayAmount", header: "Gpay", render: (row) => formatCurrency(row.gpayAmount) },
              { key: "pendingAmount", header: "Pending", render: (row) => formatCurrency(row.pendingAmount) },
              {
                key: "status",
                header: "Status",
                render: (row) => <Badge colorScheme={statusColor(row.status)}>{row.status}</Badge>
              },
              { key: "invoiceNumber", header: "Invoice" }
            ]}
          />
        )}
        <HStack justify="flex-end" mt={4}>
          <AppButton
            variant="outline"
            isDisabled={page <= 1}
            onClick={() => {
              const nextPage = page - 1;
              setPage(nextPage);
              void loadRecords(nextPage);
            }}
          >
            Previous
          </AppButton>
          <Text fontWeight={700}>
            Page {pagination.page} of {pagination.totalPages}
          </Text>
          <AppButton
            variant="outline"
            isDisabled={page >= pagination.totalPages}
            onClick={() => {
              const nextPage = page + 1;
              setPage(nextPage);
              void loadRecords(nextPage);
            }}
          >
            Next
          </AppButton>
        </HStack>
      </AppCard>

      <Box ref={historySectionRef} mt={5}>
        <AppCard
          title="Bulk Upload History"
          subtitle="Each upload keeps inserted, duplicate, failed, and row-level reason details."
          rightContent={<AppButton size="sm" variant="outline" onClick={() => void loadHistory(1)}>Refresh</AppButton>}
        >
          {historyLoading ? (
            <SkeletonTable rows={3} />
          ) : (
            <DataTable
              rows={historyRows}
              emptyState={<EmptyState title="No upload history found" description="Bulk uploads will appear here." />}
              columns={[
                { key: "createdAt", header: "Uploaded", render: (row) => formatDateTime(row.createdAt) },
                { key: "fileName", header: "File" },
                { key: "insertedRows", header: "Inserted" },
                { key: "failedRows", header: "Failed" },
                { key: "createdProducts", header: "Products Created" },
                {
                  key: "actions",
                  header: "Rows",
                  render: (row) => (
                    <HStack spacing={2}>
                      <AppButton
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedSummary(row);
                          setSelectedSummaryPage(1);
                          window.setTimeout(() => detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
                        }}
                      >
                        View Rows
                      </AppButton>
                      <AppButton
                        size="sm"
                        variant="outline"
                        colorScheme="accentRed"
                        leftIcon={<Trash2 size={14} />}
                        onClick={() => setImportToDelete(row)}
                      >
                        Delete
                      </AppButton>
                    </HStack>
                  )
                }
              ]}
            />
          )}
          <HStack justify="flex-end" mt={4}>
            <AppButton
              variant="outline"
              isDisabled={historyPage <= 1}
              onClick={() => {
                const nextPage = historyPage - 1;
                setHistoryPage(nextPage);
                void loadHistory(nextPage);
              }}
            >
              Previous
            </AppButton>
            <Text fontWeight={700}>
              Page {historyPagination.page} of {historyPagination.totalPages}
            </Text>
            <AppButton
              variant="outline"
              isDisabled={historyPage >= historyPagination.totalPages}
              onClick={() => {
                const nextPage = historyPage + 1;
                setHistoryPage(nextPage);
                void loadHistory(nextPage);
              }}
            >
              Next
            </AppButton>
          </HStack>
        </AppCard>
      </Box>

      {selectedSummary ? (
        <Box ref={detailSectionRef} mt={5}>
          <AppCard
            title="Selected Upload Row Details"
            subtitle={`${selectedSummary.fileName ?? "Upload"} | ${selectedSummary.insertedRows} inserted, ${selectedSummary.failedRows} failed.`}
            rightContent={
              <AppButton variant="outline" onClick={() => setSelectedSummary(null)}>
                Close Rows
              </AppButton>
            }
          >
            <SimpleGrid columns={{ base: 2, md: 5 }} spacing={4} mb={4}>
              <Box>
                <Text color="#725D53" fontSize="sm">Inserted</Text>
                <Text fontWeight={800}>{selectedSummary.insertedRows}</Text>
              </Box>
              <Box>
                <Text color="#725D53" fontSize="sm">Duplicate</Text>
                <Text fontWeight={800}>{selectedSummary.skippedDuplicateRows}</Text>
              </Box>
              <Box>
                <Text color="#725D53" fontSize="sm">Failed</Text>
                <Text fontWeight={800}>{selectedSummary.failedRows}</Text>
              </Box>
              <Box>
                <Text color="#725D53" fontSize="sm">Products Created</Text>
                <Text fontWeight={800}>{selectedSummary.createdProducts}</Text>
              </Box>
              <Box>
                <Text color="#725D53" fontSize="sm">Customers Created</Text>
                <Text fontWeight={800}>{selectedSummary.createdCustomers}</Text>
              </Box>
            </SimpleGrid>
            <DataTable
              rows={paginatedSelectedRowDetails}
              columns={[
                { key: "rowNumber", header: "Row", render: (row: ProductConsumptionRowDetail) => <Text fontWeight={800}>#{row.rowNumber}</Text> },
                { key: "status", header: "Status", render: (row: ProductConsumptionRowDetail) => <Badge colorScheme={statusColor(row.status)}>{row.status.replace("_", " ")}</Badge> },
                { key: "date", header: "Date" },
                { key: "customerName", header: "Customer" },
                { key: "itemName", header: "Product" },
                { key: "quantity", header: "Qty" },
                { key: "rate", header: "Rate", render: (row: ProductConsumptionRowDetail) => (row.rate ? formatCurrency(row.rate) : "-") },
                { key: "totalAmount", header: "Total", render: (row: ProductConsumptionRowDetail) => (row.totalAmount ? formatCurrency(row.totalAmount) : "-") },
                { key: "cashAmount", header: "Cash", render: (row: ProductConsumptionRowDetail) => (row.cashAmount ? formatCurrency(row.cashAmount) : "-") },
                { key: "gpayAmount", header: "Gpay", render: (row: ProductConsumptionRowDetail) => (row.gpayAmount ? formatCurrency(row.gpayAmount) : "-") },
                { key: "pendingAmount", header: "Pending", render: (row: ProductConsumptionRowDetail) => (row.pendingAmount ? formatCurrency(row.pendingAmount) : "-") },
                { key: "invoiceNumber", header: "Invoice" },
                { key: "reason", header: "Reason" }
              ]}
            />
            <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
              <Text color="#6F594F" fontSize="sm">
                Showing {paginatedSelectedRowDetails.length} of {selectedRowDetails.length} rows
              </Text>
              <HStack>
                <AppButton
                  variant="outline"
                  isDisabled={selectedRowPage <= 1}
                  onClick={() => setSelectedSummaryPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </AppButton>
                <Text fontWeight={700}>
                  Page {selectedRowPage} of {selectedRowTotalPages}
                </Text>
                <AppButton
                  variant="outline"
                  isDisabled={selectedRowPage >= selectedRowTotalPages}
                  onClick={() => setSelectedSummaryPage((current) => Math.min(selectedRowTotalPages, current + 1))}
                >
                  Next
                </AppButton>
              </HStack>
            </HStack>
          </AppCard>
        </Box>
      ) : null}

      <ConsumptionModal
        isOpen={isOpen}
        onClose={onClose}
        products={products}
        loading={submitLoading || productsLoading}
        onSubmit={(form) => void handleSubmit(form)}
      />
      <ConfirmDialog
        isOpen={Boolean(importToDelete)}
        title="Delete Upload?"
        description="This will delete every inserted record from this upload and add the consumed quantities back to Snooker product stock."
        onClose={() => setImportToDelete(null)}
        onConfirm={() => void handleDeleteImport()}
        isLoading={deleteLoading}
      >
        {importToDelete ? (
          <Text fontWeight={700}>
            {importToDelete.fileName} | {importToDelete.insertedRows} inserted rows
          </Text>
        ) : null}
      </ConfirmDialog>
    </Box>
  );
};
