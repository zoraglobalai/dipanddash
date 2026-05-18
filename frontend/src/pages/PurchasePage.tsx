import {
  Box,
  Center,
  Checkbox,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  VStack,
  useDisclosure
} from "@chakra-ui/react";
import { Download, Edit2, Eye, History, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLocation } from "react-router-dom";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import {
  AppSearchableSelect,
  type AppSearchableSelectOption
} from "@/components/ui/AppSearchableSelect";
import { DataTable } from "@/components/ui/DataTable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAppToast } from "@/hooks/useAppToast";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import { procurementService } from "@/services/procurement.service";
import type {
  CreatePurchaseOrderInput,
  CreatePurchaseLineInput,
  ProductDayLedgerResponse,
  ProductListItem,
  ProductListResponse,
  ProductStockHistoryResponse,
  ProductExpiryStatus,
  ProcurementMetaResponse,
  ProcurementStatsResponse,
  ProductTargetSection,
  ProductUnit,
  StockHealth,
  PurchaseSection,
  PurchaseLineType,
  PurchaseBulkImportHistoryItem,
  PurchaseBulkImportResult,
  PurchaseOrderDetail,
  PurchaseOrderSummary,
  SupplierListItem
} from "@/types/procurement";
import { extractErrorMessage } from "@/utils/api-error";
import { businessScopeToPurchaseSection, getBusinessScopeFromSearch, getBusinessTitle } from "@/utils/business-scope";

const defaultPagination = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1
};
const TABLE_PAGE_SIZE = 10;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
};

const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isExpiredDate = (value?: string | null) => Boolean(value && value < getTodayDate());

const getExpiryBadge = (row: ProductListItem): { label: string; tone: "red" | "orange" | "green" | "neutral" } => {
  const status = row.expiryStatus as ProductExpiryStatus;
  if (status === "EXPIRED") {
    const days = row.ageingDays ?? 0;
    return { label: `Expired ${days}d ago`, tone: "red" };
  }
  if (status === "EXPIRING_SOON") {
    const days = row.ageingDays ?? 0;
    return { label: `Expiring in ${days}d`, tone: "orange" };
  }
  if (status === "FRESH") {
    const days = row.ageingDays ?? 0;
    return { label: `Expiring in ${days}d`, tone: "green" };
  }
  return { label: "No expiry", tone: "neutral" };
};

const getStockOverviewCalculatedCurrentStock = (row: ProductListItem) =>
  Math.max(0, Number((row.purchasedQuantity - row.soldQuantity).toFixed(3)));

const extractFileNameFromDisposition = (contentDisposition?: string | null) => {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }

  return null;
};

const createDraftLineId = () => Math.random().toString(36).slice(2, 10);
const PRODUCT_TARGET_SECTION_OPTIONS: AppSearchableSelectOption[] = [
  { value: "dip_and_dash", label: "Dip & Dash" },
  { value: "gaming", label: "Snooker / Gaming" },
  { value: "both", label: "Both Sections" }
];
const PURCHASE_SECTION_OPTIONS: AppSearchableSelectOption[] = [
  { value: "dip_and_dash", label: "Dip & Dash" },
  { value: "gaming", label: "Snooker / Gaming" }
];

const formatTargetSectionLabel = (value: ProductTargetSection) => {
  if (value === "dip_and_dash") {
    return "Dip & Dash";
  }
  if (value === "gaming") {
    return "Snooker / Gaming";
  }
  return "Both";
};

const formatPurchaseSectionLabel = (value: PurchaseSection) =>
  value === "gaming" ? "Snooker / Gaming" : "Dip & Dash";

const formatOrderTypeLabel = (value: string) => {
  if (value === "snooker") {
    return "Snooker / Gaming";
  }
  return value
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

type DraftPurchaseLine = {
  id: string;
  lineType: PurchaseLineType;
  ingredientKind: "core" | "additional";
  ingredientCategoryId: string;
  ingredientId: string;
  productId: string;
  productName: string;
  productPackSize: string;
  quantity: string;
  quantityUnit: string;
  unitPrice: string;
  gstPercentage: string;
  gstValue: string;
  expiryDate: string;
  note: string;
};

const createEmptyLine = (): DraftPurchaseLine => ({
  id: createDraftLineId(),
  lineType: "ingredient",
  ingredientKind: "core",
  ingredientCategoryId: "",
  ingredientId: "",
  productId: "",
  productName: "",
  productPackSize: "",
  quantity: "1",
  quantityUnit: "",
  unitPrice: "0",
  gstPercentage: "0",
  gstValue: "0",
  expiryDate: "",
  note: ""
});

type PurchaseOrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  mode: "create" | "edit";
  initialPurchaseSection: PurchaseSection;
  isBootstrapping: boolean;
  meta: ProcurementMetaResponse | null;
  initialData: PurchaseOrderDetail | null;
  onLoadMetaForDate: (date: string) => Promise<void>;
  onSubmit: (
    payload: CreatePurchaseOrderInput & {
      invoiceImageFile?: File | null;
    }
  ) => Promise<void>;
};

const PurchaseOrderModal = memo(({
  isOpen,
  onClose,
  loading,
  mode,
  initialPurchaseSection,
  isBootstrapping,
  meta,
  initialData,
  onLoadMetaForDate,
  onSubmit
}: PurchaseOrderModalProps) => {
  const isEditMode = mode === "edit";
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(getTodayDate());
  const [purchaseSection, setPurchaseSection] = useState<PurchaseSection>("dip_and_dash");
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState("");
  const [projectName, setProjectName] = useState("");
  const [purchaseMonth, setPurchaseMonth] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftPurchaseLine[]>([createEmptyLine()]);
  const [invoiceImageFile, setInvoiceImageFile] = useState<File | null>(null);
  const [invoiceImageUrl, setInvoiceImageUrl] = useState<string | undefined>(undefined);
  const [invoicePreviewUrl, setInvoicePreviewUrl] = useState("");
  const isSnookerPurchase = purchaseSection === "gaming";

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (isEditMode) {
      if (!initialData) {
        return;
      }
      const nextDate = initialData.purchaseDate || getTodayDate();
      setSupplierId(initialData.supplierId);
      setSupplierName(initialData.supplierName);
      setSupplierPhone(initialData.supplierPhone);
      setPurchaseDate(nextDate);
      setPurchaseSection(initialData.purchaseSection ?? "dip_and_dash");
      setVendorInvoiceNumber(initialData.vendorInvoiceNumber ?? "");
      setProjectName(initialData.projectName ?? "");
      setPurchaseMonth(initialData.purchaseMonth ?? "");
      setReceivedDate(initialData.receivedDate ?? "");
      setNote(initialData.note ?? "");
      setInvoiceImageFile(null);
      setInvoiceImageUrl(initialData.invoiceImageUrl ?? undefined);
      setInvoicePreviewUrl(initialData.invoiceImageUrl ?? "");
      setLines(
        initialData.lines.map((line) => {
          const matchedIngredient = line.ingredientId
            ? (meta?.ingredients ?? []).find((ingredient) => ingredient.id === line.ingredientId)
            : undefined;

          return {
            id: createDraftLineId(),
            lineType: line.lineType,
            ingredientKind: matchedIngredient?.categoryKind ?? "core",
            ingredientCategoryId: matchedIngredient?.categoryId ?? "",
            ingredientId: line.ingredientId ?? "",
            productId: line.productId ?? "",
            productName: line.productId ? "" : line.itemNameSnapshot,
            productPackSize: line.packSizeSnapshot ?? "",
            quantity: String(line.enteredQuantity ?? line.stockAdded),
            quantityUnit: line.enteredUnit ?? line.unit,
            unitPrice: String(line.unitPrice),
            gstPercentage: String(line.gstPercentage ?? 0),
            gstValue: String(line.gstValue ?? 0),
            expiryDate: line.expiryDate ?? "",
            note: ""
          };
        })
      );
      if (meta?.date !== nextDate) {
        void onLoadMetaForDate(nextDate);
      }
      return;
    }

    const nextDate = meta?.date ?? getTodayDate();
    setSupplierId(meta?.suppliers[0]?.id ?? "");
    setSupplierName("");
    setSupplierPhone("");
    setPurchaseDate(nextDate);
    setPurchaseSection(initialPurchaseSection);
    setVendorInvoiceNumber("");
    setProjectName(initialPurchaseSection === "gaming" ? "147-Snooker's" : "");
    setPurchaseMonth("");
    setReceivedDate("");
    setNote("");
    setLines([
      initialPurchaseSection === "gaming"
        ? { ...createEmptyLine(), lineType: "product", quantityUnit: "pcs" }
        : createEmptyLine()
    ]);
    setInvoiceImageFile(null);
    setInvoiceImageUrl(undefined);
    setInvoicePreviewUrl("");
    if (meta?.date !== nextDate) {
      void onLoadMetaForDate(nextDate);
    }
  }, [initialData, initialPurchaseSection, isEditMode, isOpen, meta?.date, onLoadMetaForDate]);

  useEffect(() => {
    return () => {
      if (invoicePreviewUrl) {
        URL.revokeObjectURL(invoicePreviewUrl);
      }
    };
  }, [invoicePreviewUrl]);

  const supplierOptions: AppSearchableSelectOption[] = useMemo(
    () =>
      (meta?.suppliers ?? []).map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
        description: `${supplier.phone}${supplier.address ? ` | ${supplier.address}` : ""}`,
        searchText: `${supplier.name} ${supplier.phone} ${supplier.address ?? ""}`
      })),
    [meta?.suppliers]
  );

  const ingredientById = useMemo(
    () => new Map((meta?.ingredients ?? []).map((ingredient) => [ingredient.id, ingredient])),
    [meta?.ingredients]
  );
  const productById = useMemo(
    () => new Map((meta?.products ?? []).map((product) => [product.id, product])),
    [meta?.products]
  );

  const categoryOptionsByKind = useMemo(() => {
    const base = {
      core: [] as AppSearchableSelectOption[],
      additional: [] as AppSearchableSelectOption[]
    };

    (meta?.ingredientCategories ?? []).forEach((category) => {
      const bucket = category.kind === "additional" ? base.additional : base.core;
      bucket.push({
        value: category.id,
        label: category.name,
        description: category.description ?? undefined
      });
    });

    return base;
  }, [meta?.ingredientCategories]);

  const ingredientOptionsByKindAndCategory = useMemo(() => {
    const createBucket = () => ({
      all: [] as AppSearchableSelectOption[],
      byCategory: new Map<string, AppSearchableSelectOption[]>()
    });
    const buckets = {
      core: createBucket(),
      additional: createBucket()
    };

    (meta?.ingredients ?? []).forEach((ingredient) => {
      const bucket = ingredient.categoryKind === "additional" ? buckets.additional : buckets.core;
      const option = {
        value: ingredient.id,
        label: ingredient.name,
        description: `${ingredient.categoryName} | Stock ${ingredient.currentStock} ${ingredient.unit}`,
        searchText: `${ingredient.name} ${ingredient.categoryName} ${ingredient.unit}`
      } satisfies AppSearchableSelectOption;

      bucket.all.push(option);
      const categoryOptions = bucket.byCategory.get(ingredient.categoryId);
      if (categoryOptions) {
        categoryOptions.push(option);
      } else {
        bucket.byCategory.set(ingredient.categoryId, [option]);
      }
    });

    return buckets;
  }, [meta?.ingredients]);

  const getCategoryOptions = useCallback(
    (ingredientKind: "core" | "additional"): AppSearchableSelectOption[] =>
      ingredientKind === "additional" ? categoryOptionsByKind.additional : categoryOptionsByKind.core,
    [categoryOptionsByKind]
  );

  const productOptions: AppSearchableSelectOption[] = useMemo(
    () =>
      (meta?.products ?? []).map((product) => ({
        value: product.id,
        label: product.name,
        description: `${product.category} | Stock ${product.currentStock} ${product.unit}`,
        searchText: `${product.name} ${product.category} ${product.sku ?? ""} ${product.packSize ?? ""}`
      })),
    [meta?.products]
  );

  const getIngredientOptions = useCallback(
    (categoryId: string, ingredientKind: "core" | "additional"): AppSearchableSelectOption[] => {
      const bucket = ingredientKind === "additional" ? ingredientOptionsByKindAndCategory.additional : ingredientOptionsByKindAndCategory.core;
      if (!categoryId) {
        return bucket.all;
      }
      return bucket.byCategory.get(categoryId) ?? [];
    },
    [ingredientOptionsByKindAndCategory]
  );

  const totalAmount = useMemo(
    () =>
      lines.reduce((acc, line) => {
        const qty = Number(line.quantity);
        const price = Number(line.unitPrice);
        const gstValue = Number(line.gstValue);
        if (!Number.isFinite(qty) || !Number.isFinite(price) || !Number.isFinite(gstValue)) {
          return acc;
        }
        return acc + qty * price + Math.max(0, gstValue);
      }, 0),
    [lines]
  );

  const updateLine = (id: string, next: Partial<DraftPurchaseLine>) => {
    setLines((previous) => previous.map((line) => (line.id === id ? { ...line, ...next } : line)));
  };

  const handleDateChange = async (nextDate: string) => {
    setPurchaseDate(nextDate);
    await onLoadMetaForDate(nextDate);
  };

  const addLine = () => {
    setLines((previous) => [
      ...previous,
      isSnookerPurchase ? { ...createEmptyLine(), lineType: "product", quantityUnit: "pcs" } : createEmptyLine()
    ]);
  };

  const removeLine = (id: string) => {
    setLines((previous) => (previous.length <= 1 ? previous : previous.filter((line) => line.id !== id)));
  };

  const handleIngredientPick = (line: DraftPurchaseLine, ingredientId: string) => {
    const ingredient = ingredientById.get(ingredientId);
    updateLine(line.id, {
      ingredientCategoryId: ingredient?.categoryId ?? line.ingredientCategoryId,
      ingredientKind: ingredient?.categoryKind ?? line.ingredientKind,
      ingredientId,
      quantityUnit: ingredient?.unit ?? line.quantityUnit,
      unitPrice: ingredient ? String(ingredient.perUnitPrice) : line.unitPrice
    });
  };

  const handleProductPick = (line: DraftPurchaseLine, productId: string) => {
    const product = productById.get(productId);
    updateLine(line.id, {
      productId,
      productName: "",
      productPackSize: product?.packSize ?? line.productPackSize,
      quantityUnit: product?.unit ?? line.quantityUnit,
      unitPrice: product ? String(product.purchaseUnitPrice) : line.unitPrice
    });
  };

  const handleInvoiceFileChange = (nextFile: File | null) => {
    if (invoicePreviewUrl) {
      URL.revokeObjectURL(invoicePreviewUrl);
    }

    if (!nextFile) {
      setInvoiceImageFile(null);
      setInvoiceImageUrl("");
      setInvoicePreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(nextFile);
    setInvoiceImageFile(nextFile);
    setInvoiceImageUrl(undefined);
    setInvoicePreviewUrl(previewUrl);
  };

  const handleSave = async () => {
    const payloadLines = lines
      .map((line) => {
        const quantity = Number(line.quantity);
        const unitPrice = Number(line.unitPrice);
        const gstPercentage = Number(line.gstPercentage);
        const gstValue = Number(line.gstValue);
        const sourceAmount = Number((quantity * unitPrice).toFixed(2));
        const sourceGrandTotal = Number((sourceAmount + Math.max(0, gstValue)).toFixed(2));
        if (
          !Number.isFinite(quantity) ||
          !Number.isFinite(unitPrice) ||
          !Number.isFinite(gstPercentage) ||
          !Number.isFinite(gstValue) ||
          quantity <= 0 ||
          unitPrice < 0 ||
          gstPercentage < 0 ||
          gstValue < 0
        ) {
          return null;
        }
        if (line.lineType === "ingredient" && !line.ingredientId) {
          return null;
        }
        if (line.lineType === "product" && !line.productId && !line.productName.trim()) {
          return null;
        }
        return {
          lineType: line.lineType,
          ingredientId: line.lineType === "ingredient" ? line.ingredientId || undefined : undefined,
          productId: line.lineType === "product" ? line.productId || undefined : undefined,
          productName: line.lineType === "product" && !line.productId ? line.productName.trim() : undefined,
          productPackSize:
            line.lineType === "product" && !line.productId ? line.productPackSize.trim() || undefined : undefined,
          productCategory:
            line.lineType === "product" && !line.productId
              ? purchaseSection === "gaming"
                ? "Snooker Beverages"
                : "General"
              : undefined,
          productUnit: line.lineType === "product" && !line.productId ? "pcs" : undefined,
          quantity,
          quantityUnit: line.quantityUnit || (line.lineType === "product" && !line.productId ? "pcs" : undefined),
          unitPrice,
          gstPercentage,
          gstValue,
          sourceAmount,
          sourceGrandTotal,
          expiryDate: line.lineType === "product" ? line.expiryDate || undefined : undefined,
          note: purchaseSection === "gaming" ? undefined : line.note.trim() || undefined
        } as CreatePurchaseLineInput;
      })
      .filter((line): line is CreatePurchaseLineInput => Boolean(line));

    if (
      payloadLines.length !== lines.length ||
      (purchaseSection === "gaming" ? !supplierName.trim() : !supplierId)
    ) {
      return;
    }

    await onSubmit({
      supplierId: purchaseSection === "gaming" ? (isEditMode ? supplierId : undefined) : supplierId,
      supplierName: purchaseSection === "gaming" ? supplierName.trim() : undefined,
      supplierPhone: purchaseSection === "gaming" ? supplierPhone.trim() || undefined : undefined,
      purchaseDate,
      purchaseSection,
      note: purchaseSection === "gaming" ? undefined : note.trim() || undefined,
      vendorInvoiceNumber: purchaseSection === "gaming" ? vendorInvoiceNumber.trim() || undefined : undefined,
      projectName: purchaseSection === "gaming" ? projectName.trim() || undefined : undefined,
      purchaseMonth: purchaseSection === "gaming" ? purchaseMonth.trim() || undefined : undefined,
      receivedDate: purchaseSection === "gaming" ? receivedDate || undefined : undefined,
      invoiceImageUrl: purchaseSection === "gaming" ? undefined : invoiceImageUrl,
      lines: payloadLines,
      invoiceImageFile: purchaseSection === "gaming" ? null : invoiceImageFile
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        size={{ base: "full", lg: "6xl" }}
        isCentered
        scrollBehavior="inside"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <ModalOverlay />
        <ModalContent
          borderRadius="20px"
          maxH={{ base: "calc(100vh - 0.75rem)", md: "calc(100vh - 2rem)" }}
          my={{ base: 1, md: 4 }}
          display="flex"
          flexDirection="column"
          overflow="hidden"
        >
          <ModalHeader>{isEditMode ? "Edit Purchase Order" : "Create Purchase Order"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pr={{ base: 1, md: 2 }} pb={6}>
            {isBootstrapping ? (
              <Center py={16} flexDirection="column" gap={3}>
                <Spinner size="lg" color="brand.500" />
                <Text color="#6F594F" fontWeight={600}>
                  Loading purchase details...
                </Text>
              </Center>
            ) : (
              <VStack spacing={4} align="stretch">
              {isSnookerPurchase ? (
                <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                  <AppInput
                    label="Vendor Name"
                    value={supplierName}
                    onChange={(event) => setSupplierName((event.target as HTMLInputElement).value)}
                  />
                  <AppInput
                    label="Phone Number"
                    value={supplierPhone}
                    onChange={(event) => setSupplierPhone((event.target as HTMLInputElement).value)}
                  />
                  <AppInput
                    label="Vendor Invoice No#"
                    value={vendorInvoiceNumber}
                    onChange={(event) => setVendorInvoiceNumber((event.target as HTMLInputElement).value)}
                  />
                  <AppInput
                    label="Purchase Date"
                    type="date"
                    value={purchaseDate}
                    onChange={(event) => void handleDateChange((event.target as HTMLInputElement).value)}
                  />
                  <AppInput
                    label="Project Name"
                    value={projectName}
                    onChange={(event) => setProjectName((event.target as HTMLInputElement).value)}
                  />
                  <AppInput
                    label="Month"
                    value={purchaseMonth}
                    onChange={(event) => setPurchaseMonth((event.target as HTMLInputElement).value)}
                  />
                  <AppInput
                    label="Received Date"
                    type="date"
                    value={receivedDate}
                    onChange={(event) => setReceivedDate((event.target as HTMLInputElement).value)}
                  />
                  <Box border="1px solid" borderColor="rgba(133, 78, 48, 0.2)" borderRadius="12px" px={4} py={3} bg="white">
                    <Text color="#6F594F" fontWeight={600} fontSize="sm">
                      Grand Total
                    </Text>
                    <Text fontSize="2xl" fontWeight={900}>
                      {formatCurrency(totalAmount)}
                    </Text>
                  </Box>
                </SimpleGrid>
              ) : (
                <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                  <AppSearchableSelect
                    label="Supplier"
                    value={supplierId}
                    options={supplierOptions}
                    onValueChange={setSupplierId}
                    placeholder="Select supplier"
                    searchPlaceholder="Search supplier"
                  />
                  <AppInput
                    label="Purchase Date"
                    type="date"
                    value={purchaseDate}
                    onChange={(event) => void handleDateChange((event.target as HTMLInputElement).value)}
                  />
                  <Box border="1px solid" borderColor="rgba(133, 78, 48, 0.2)" borderRadius="12px" px={4} py={3} bg="white">
                    <Text color="#6F594F" fontWeight={600} fontSize="sm">
                      Draft Total
                    </Text>
                    <Text fontSize="2xl" fontWeight={900}>
                      {formatCurrency(totalAmount)}
                    </Text>
                  </Box>
                </SimpleGrid>
              )}

              {lines.map((line, index) => {
                const selectedIngredient = ingredientById.get(line.ingredientId);
                const selectedProduct = productById.get(line.productId);
                const lineUnitOptions =
                  line.lineType === "ingredient"
                    ? selectedIngredient?.unitOptions ?? []
                    : selectedProduct?.unitOptions ?? ["pcs"];
                const quantityNumber = Number(line.quantity);
                const unitPriceNumber = Number(line.unitPrice);
                const gstValueNumber = Number(line.gstValue);
                const lineTotal =
                  Number.isFinite(quantityNumber) &&
                  Number.isFinite(unitPriceNumber) &&
                  Number.isFinite(gstValueNumber) &&
                  quantityNumber > 0 &&
                  unitPriceNumber >= 0 &&
                  gstValueNumber >= 0
                    ? quantityNumber * unitPriceNumber + gstValueNumber
                    : 0;
                const lineAmount =
                  Number.isFinite(quantityNumber) && Number.isFinite(unitPriceNumber) && quantityNumber > 0 && unitPriceNumber >= 0
                    ? quantityNumber * unitPriceNumber
                    : 0;

                if (isSnookerPurchase) {
                  return (
                    <AppCard
                      key={line.id}
                      p={{ base: 3, md: 4 }}
                      border="1px solid"
                      borderColor="rgba(133, 78, 48, 0.2)"
                      bg="linear-gradient(160deg, #FFFFFF 0%, #FFF8EF 100%)"
                    >
                      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                        <AppInput
                          label="Description"
                          value={line.productName}
                          onChange={(event) =>
                            updateLine(line.id, {
                              lineType: "product",
                              productName: (event.target as HTMLInputElement).value,
                              productId: ""
                            })
                          }
                        />
                        <AppInput
                          label="Alt Type"
                          value={line.productPackSize}
                          onChange={(event) =>
                            updateLine(line.id, { productPackSize: (event.target as HTMLInputElement).value })
                          }
                        />
                        <AppInput
                          label="Purchase Qty"
                          type="number"
                          min={0}
                          step="0.001"
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(line.id, { quantity: (event.target as HTMLInputElement).value })
                          }
                        />
                        <AppInput
                          label="Unit price"
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(event) =>
                            updateLine(line.id, { unitPrice: (event.target as HTMLInputElement).value })
                          }
                        />
                        <AppInput label="Amount" value={lineAmount.toFixed(2)} isDisabled />
                        <AppInput
                          label="GST%"
                          type="number"
                          min={0}
                          step="0.0001"
                          value={line.gstPercentage}
                          onChange={(event) =>
                            updateLine(line.id, { gstPercentage: (event.target as HTMLInputElement).value })
                          }
                        />
                        <AppInput
                          label="Gst Amount"
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.gstValue}
                          onChange={(event) =>
                            updateLine(line.id, { gstValue: (event.target as HTMLInputElement).value })
                          }
                        />
                        <Box
                          border="1px solid"
                          borderColor="rgba(133, 78, 48, 0.2)"
                          borderRadius="12px"
                          p={3}
                          bg="white"
                        >
                          <Text fontSize="sm" color="#6F594F" fontWeight={600}>
                            Grand Total
                          </Text>
                          <Text mt={1} fontSize="xl" fontWeight={900} color="#2A1A14">
                            {formatCurrency(lineTotal)}
                          </Text>
                        </Box>
                        <FormControl>
                          <FormLabel>Actions</FormLabel>
                          <ActionIconButton
                            aria-label="Remove line"
                            tooltip="Remove line"
                            icon={<Trash2 size={16} />}
                            variant="outline"
                            colorScheme="accentRed"
                            onClick={() => removeLine(line.id)}
                            isDisabled={lines.length <= 1}
                          />
                        </FormControl>
                      </SimpleGrid>
                    </AppCard>
                  );
                }

                return (
                  <AppCard
                    key={line.id}
                    p={{ base: 3, md: 4 }}
                    border="1px solid"
                    borderColor="rgba(133, 78, 48, 0.2)"
                    bg="linear-gradient(160deg, #FFFFFF 0%, #FFF8EF 100%)"
                  >
                    <VStack spacing={3} align="stretch">
                      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                      <AppSearchableSelect
                        label={`Line ${index + 1} Type`}
                        value={line.lineType}
                        options={[{ value: "ingredient", label: "Ingredient / Additional" }, { value: "product", label: "Product" }]}
                        onValueChange={(value) =>
                          updateLine(line.id, {
                            lineType: value as PurchaseLineType,
                            ingredientKind: "core",
                            ingredientCategoryId: "",
                            ingredientId: "",
                            productId: "",
                            productName: "",
                            productPackSize: "",
                            quantityUnit: "",
                            unitPrice: "0",
                            gstValue: "0",
                            expiryDate: ""
                          })
                        }
                        isClearable={false}
                      />
                      {line.lineType === "ingredient" ? (
                        <>
                          <AppSearchableSelect
                            label="Ingredient Type"
                            value={line.ingredientKind}
                            options={[
                              { value: "core", label: "Ingredient" },
                              { value: "additional", label: "Additional Item" }
                            ]}
                            onValueChange={(value) =>
                              updateLine(line.id, {
                                ingredientKind: value as "core" | "additional",
                                ingredientCategoryId: "",
                                ingredientId: ""
                              })
                            }
                            isClearable={false}
                          />
                          <AppSearchableSelect
                            label="Ingredient Category"
                            value={line.ingredientCategoryId}
                            options={getCategoryOptions(line.ingredientKind)}
                            onValueChange={(value) => updateLine(line.id, { ingredientCategoryId: value, ingredientId: "" })}
                            placeholder="Select category"
                            searchPlaceholder="Search category"
                          />
                          <AppSearchableSelect
                            label="Ingredient"
                            value={line.ingredientId}
                            options={getIngredientOptions(line.ingredientCategoryId, line.ingredientKind)}
                            onValueChange={(value) => handleIngredientPick(line, value)}
                            placeholder="Select ingredient"
                            searchPlaceholder="Search ingredient"
                          />
                        </>
                      ) : (
                        <>
                          <AppSearchableSelect
                            label="Product"
                            value={line.productId}
                            options={productOptions}
                            onValueChange={(value) => handleProductPick(line, value)}
                            placeholder="Select product"
                            searchPlaceholder="Search product"
                            emptyText="No product found. Type a new product below."
                          />
                          <AppInput
                            label="New Product"
                            value={line.productName}
                            onChange={(event) =>
                              updateLine(line.id, {
                                productName: (event.target as HTMLInputElement).value,
                                productId: ""
                              })
                            }
                            placeholder="Type only if not in list"
                          />
                          <AppInput
                            label="Pack / Alt Type"
                            value={line.productPackSize}
                            onChange={(event) =>
                              updateLine(line.id, { productPackSize: (event.target as HTMLInputElement).value })
                            }
                            placeholder="TIN-300 ml"
                          />
                          <Box
                            border="1px solid"
                            borderColor="rgba(133, 78, 48, 0.2)"
                            borderRadius="12px"
                            p={3}
                            bg="white"
                          >
                            <Text fontSize="sm" color="#6F594F" fontWeight={600}>
                              Purchase Hint
                            </Text>
                            <Text mt={1} fontSize="xs" color="#7A6359">
                              Product price can vary per order. This line price applies only to this stock entry.
                            </Text>
                          </Box>
                        </>
                      )}
                      <AppInput
                        label="Quantity"
                        type="number"
                        min={0}
                        step="0.001"
                          value={line.quantity}
                          onChange={(event) => updateLine(line.id, { quantity: (event.target as HTMLInputElement).value })}
                      />
                    </SimpleGrid>

                      <SimpleGrid columns={{ base: 1, md: 2, xl: 6 }} spacing={3}>
                        <FormControl>
                          <FormLabel>Unit</FormLabel>
                          <Select
                            value={line.quantityUnit}
                            onChange={(event) =>
                              updateLine(line.id, { quantityUnit: (event.target as HTMLSelectElement).value })
                            }
                            bg="white"
                            borderColor="rgba(193, 14, 14, 0.18)"
                            focusBorderColor="brand.400"
                          >
                            <option value="">Select unit</option>
                            {lineUnitOptions.map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </Select>
                        </FormControl>
                        <AppInput
                          label="Unit Price"
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(event) => updateLine(line.id, { unitPrice: (event.target as HTMLInputElement).value })}
                        />
                        <AppInput
                          label="GST Value"
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.gstValue}
                          onChange={(event) => updateLine(line.id, { gstValue: (event.target as HTMLInputElement).value })}
                        />
                        <AppInput
                          label="Expiry Date (product only)"
                          type="date"
                          value={line.expiryDate}
                          onChange={(event) => updateLine(line.id, { expiryDate: (event.target as HTMLInputElement).value })}
                          isDisabled={line.lineType !== "product"}
                        />
                        <Box
                          border="1px solid"
                          borderColor="rgba(133, 78, 48, 0.2)"
                          borderRadius="12px"
                          p={3}
                          bg="white"
                        >
                          <Text fontSize="sm" color="#6F594F" fontWeight={600}>
                            Line Total
                          </Text>
                          <Text mt={1} fontSize="xl" fontWeight={900} color="#2A1A14">
                            {formatCurrency(lineTotal)}
                          </Text>
                        </Box>
                        <FormControl>
                          <FormLabel>Actions</FormLabel>
                          <ActionIconButton
                            aria-label="Remove line"
                            tooltip="Remove line"
                            icon={<Trash2 size={16} />}
                            variant="outline"
                            colorScheme="accentRed"
                            onClick={() => removeLine(line.id)}
                            isDisabled={lines.length <= 1}
                          />
                        </FormControl>
                      </SimpleGrid>
                    <Box
                      mt={1}
                      p={3}
                      borderRadius="12px"
                      bg="rgba(255, 255, 255, 0.7)"
                      border="1px dashed"
                      borderColor="rgba(133, 78, 48, 0.2)"
                    >
                      {line.lineType === "ingredient" && selectedIngredient ? (
                        <Text fontSize="sm" color="#725A50">
                          Stock: {selectedIngredient.currentStock} {selectedIngredient.unit} | Allocated:{" "}
                          {selectedIngredient.allocatedToday} | Used: {selectedIngredient.usedToday} | Pending:{" "}
                          {selectedIngredient.pendingToday} | Last Purchase Price:{" "}
                          {formatCurrency(selectedIngredient.perUnitPrice)} / {selectedIngredient.unit.toUpperCase()}
                        </Text>
                      ) : null}
                      {line.lineType === "product" && selectedProduct ? (
                        <Text fontSize="sm" color="#725A50">
                          Stock: {selectedProduct.currentStock} {selectedProduct.unit} | Min: {selectedProduct.minStock}{" "}
                          {selectedProduct.unit} | Base Unit: {selectedProduct.unit}
                          {line.expiryDate ? ` | Expiry: ${formatDate(line.expiryDate)}` : ""}
                        </Text>
                      ) : null}
                    </Box>
                    </VStack>
                  </AppCard>
                );
              })}

              <HStack justify="space-between">
                <AppButton leftIcon={<Plus size={16} />} variant="outline" onClick={addLine}>
                  Add Line
                </AppButton>
                <Text fontWeight={800} color="#36251E">
                  Total: {formatCurrency(totalAmount)}
                </Text>
              </HStack>

              {!isSnookerPurchase ? (
                <>
                  <FormControl>
                    <FormLabel>Invoice Image (optional)</FormLabel>
                    <AppInput
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      p={1}
                      onChange={(event) => {
                        const target = event.target as HTMLInputElement;
                        handleInvoiceFileChange(target.files?.[0] ?? null);
                      }}
                    />
                    <Text mt={2} fontSize="xs" color="#7A6359">
                      Upload supplier invoice image for future reference. Max size: 5 MB.
                    </Text>
                    {invoiceImageFile ? (
                      <HStack
                        mt={3}
                        align="center"
                        justify="space-between"
                        p={3}
                        border="1px solid"
                        borderColor="rgba(133, 78, 48, 0.22)"
                        borderRadius="12px"
                        bg="white"
                      >
                        <HStack align="center" spacing={3}>
                          {invoicePreviewUrl ? (
                            <Box
                              as="img"
                              src={invoicePreviewUrl}
                              alt="Invoice preview"
                              w="56px"
                              h="56px"
                              borderRadius="10px"
                              objectFit="cover"
                              border="1px solid"
                              borderColor="rgba(133, 78, 48, 0.2)"
                            />
                          ) : null}
                          <Box>
                            <Text fontWeight={700} color="#3C2A23">
                              {invoiceImageFile.name}
                            </Text>
                            <Text fontSize="xs" color="#7A6359">
                              {(invoiceImageFile.size / 1024 / 1024).toFixed(2)} MB
                            </Text>
                          </Box>
                        </HStack>
                        <AppButton variant="outline" size="sm" onClick={() => handleInvoiceFileChange(null)}>
                          Remove
                        </AppButton>
                      </HStack>
                    ) : null}
                  </FormControl>

                  <FormControl>
                    <FormLabel>Note (optional)</FormLabel>
                    <Textarea
                      value={note}
                      onChange={(event) => setNote((event.target as HTMLTextAreaElement).value)}
                      placeholder="Add purchase note"
                      borderColor="rgba(193, 14, 14, 0.18)"
                      focusBorderColor="brand.400"
                      bg="white"
                    />
                  </FormControl>
                </>
              ) : null}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter
            gap={3}
            borderTop="1px solid"
            borderColor="rgba(133, 78, 48, 0.18)"
            bg="#fffaf2"
            pt={4}
            pb={4}
            px={{ base: 4, md: 6 }}
            flexWrap="wrap"
            justifyContent="flex-end"
          >
            <AppButton variant="outline" onClick={requestClose}>
              Cancel
            </AppButton>
            <AppButton
              onClick={() => void handleSave()}
              isLoading={loading}
              isDisabled={
                isBootstrapping ||
                (isSnookerPurchase ? !supplierName.trim() : !supplierId) ||
                !purchaseDate ||
                lines.some(
                  (line) =>
                    (isSnookerPurchase && !line.productName.trim()) ||
                    !line.quantity ||
                    (!isSnookerPurchase && !line.quantityUnit) ||
                    !line.unitPrice ||
                    !line.gstValue ||
                    !line.gstPercentage ||
                    (!isSnookerPurchase && line.lineType === "ingredient" && !line.ingredientId) ||
                    (!isSnookerPurchase && line.lineType === "product" && !line.productId && !line.productName.trim())
                )
              }
            >
              {isEditMode ? "Save Purchase Order" : "Create Purchase Order"}
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <ConfirmDialog
        isOpen={isCloseConfirmOpen}
        title="Close this popup?"
        description="Are you sure you want to close? Unsaved purchase lines will be removed."
        onClose={cancelCloseRequest}
        onConfirm={confirmClose}
      />
    </>
  );
});
PurchaseOrderModal.displayName = "PurchaseOrderModal";

type ProductFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  initialData: ProductListItem | null;
  suppliers: SupplierListItem[];
  units: string[];
  forcedTargetSection?: ProductTargetSection;
  onSubmit: (payload: {
    name: string;
    category: string;
    sku?: string;
    packSize?: string;
    unit: ProductUnit;
    minStock: number;
    sellingPrice: number;
    targetSection: ProductTargetSection;
    dipAndDashAssignedStock?: number;
    gamingAssignedStock?: number;
    defaultSupplierId?: string | null;
    isActive: boolean;
  }) => Promise<void>;
};

const ProductFormModal = memo(({
  isOpen,
  onClose,
  loading,
  initialData,
  suppliers,
  units,
  forcedTargetSection,
  onSubmit
}: ProductFormModalProps) => {
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);
  const [form, setForm] = useState({
    name: "",
    category: "",
    sku: "",
    packSize: "",
    unit: (units[0] ?? "pcs") as ProductUnit,
    minStock: "0",
    sellingPrice: "0",
    targetSection: "dip_and_dash" as ProductTargetSection,
    dipAndDashAssignedStock: "0",
    gamingAssignedStock: "0",
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
      minStock: String(initialData?.minStock ?? 0),
      sellingPrice: String(initialData?.sellingPrice ?? 0),
      targetSection: forcedTargetSection ?? initialData?.targetSection ?? "dip_and_dash",
      dipAndDashAssignedStock: String(initialData?.dipAndDashAssignedStock ?? 0),
      gamingAssignedStock: String(initialData?.gamingAssignedStock ?? 0),
      defaultSupplierId: initialData?.defaultSupplierId ?? "",
      isActive: initialData?.isActive ?? true
    });
  }, [forcedTargetSection, initialData, isOpen, units]);

  const splitCurrentStock = Number(initialData?.currentStock ?? 0);
  const dipAndDashAssignedStock = Math.max(0, Number(form.dipAndDashAssignedStock || 0));
  const gamingAssignedStock = Math.max(0, Number(form.gamingAssignedStock || 0));
  const splitTotal = Number((dipAndDashAssignedStock + gamingAssignedStock).toFixed(3));
  const splitMismatch =
    form.targetSection === "both" &&
    ((splitCurrentStock > 0 && Math.abs(splitTotal - splitCurrentStock) > 0.001) ||
      (splitCurrentStock <= 0 && splitTotal > 0.001));

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
      minStock: Number(form.minStock),
      sellingPrice: Number(form.sellingPrice),
      targetSection: forcedTargetSection ?? form.targetSection,
      dipAndDashAssignedStock: !forcedTargetSection && form.targetSection === "both" ? dipAndDashAssignedStock : undefined,
      gamingAssignedStock: !forcedTargetSection && form.targetSection === "both" ? gamingAssignedStock : undefined,
      defaultSupplierId: form.defaultSupplierId || null,
      isActive: form.isActive
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        isCentered
        size="xl"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <ModalOverlay />
        <ModalContent borderRadius="18px">
          <ModalHeader>{initialData ? "Edit Product" : "Create Product"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <AppInput
                  label="Product Name"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: (event.target as HTMLInputElement).value }))}
                />
                <AppInput
                  label="Category"
                  value={form.category}
                  onChange={(event) => setForm((prev) => ({ ...prev, category: (event.target as HTMLInputElement).value }))}
                />
                <AppInput
                  label="SKU (optional)"
                  value={form.sku}
                  onChange={(event) => setForm((prev) => ({ ...prev, sku: (event.target as HTMLInputElement).value }))}
                />
                <AppInput
                  label="Pack Size (optional)"
                  value={form.packSize}
                  onChange={(event) => setForm((prev) => ({ ...prev, packSize: (event.target as HTMLInputElement).value }))}
                />
                <AppSearchableSelect
                  label="Unit"
                  value={form.unit}
                  options={unitOptions}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, unit: value as ProductUnit }))}
                  isClearable={false}
                />
                {initialData ? (
                  <AppSearchableSelect
                    label="Default Supplier"
                    value={form.defaultSupplierId}
                    options={supplierOptions}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, defaultSupplierId: value }))}
                    placeholder="Select supplier"
                    searchPlaceholder="Search supplier"
                  />
                ) : null}
                <AppInput
                  label="Minimum Stock"
                  type="number"
                  min={0}
                  step="0.001"
                  value={form.minStock}
                  onChange={(event) => setForm((prev) => ({ ...prev, minStock: (event.target as HTMLInputElement).value }))}
                />
                <AppInput
                  label="Selling Price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.sellingPrice}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, sellingPrice: (event.target as HTMLInputElement).value }))
                  }
                />
                {forcedTargetSection ? (
                  <AppCard p={3} bg="rgba(255, 250, 242, 0.95)" borderColor="rgba(133, 78, 48, 0.22)">
                    <Text fontSize="xs" color="#7B645B">Assigned To</Text>
                    <Text fontWeight={900}>{formatTargetSectionLabel(forcedTargetSection)}</Text>
                  </AppCard>
                ) : (
                  <AppSearchableSelect
                    label="Assign To"
                    value={form.targetSection}
                    options={PRODUCT_TARGET_SECTION_OPTIONS}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, targetSection: value as ProductTargetSection }))
                    }
                    isClearable={false}
                  />
                )}
              </SimpleGrid>
              {form.targetSection === "both" ? (
                <AppCard p={3} bg="rgba(255, 250, 242, 0.95)" borderColor="rgba(133, 78, 48, 0.22)">
                  <VStack spacing={3} align="stretch">
                    <Text fontWeight={700} color="#2D1D17">
                      Section Stock Split
                    </Text>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                      <AppInput
                        label="Dip & Dash Assigned Stock"
                        type="number"
                        min={0}
                        step="0.001"
                        value={form.dipAndDashAssignedStock}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            dipAndDashAssignedStock: (event.target as HTMLInputElement).value
                          }))
                        }
                      />
                      <AppInput
                        label="Snooker Assigned Stock"
                        type="number"
                        min={0}
                        step="0.001"
                        value={form.gamingAssignedStock}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            gamingAssignedStock: (event.target as HTMLInputElement).value
                          }))
                        }
                      />
                    </SimpleGrid>
                    <Text fontSize="sm" color={splitMismatch ? "red.700" : "#6F594F"}>
                      Split Total: {splitTotal} | Current Stock: {splitCurrentStock}
                      {splitMismatch ? " (Split total must match current stock)" : ""}
                    </Text>
                  </VStack>
                </AppCard>
              ) : null}
              <FormControl display="flex" alignItems="center" justifyContent="space-between">
                <FormLabel mb={0}>Active Product</FormLabel>
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
            <AppButton variant="outline" onClick={requestClose}>
              Cancel
            </AppButton>
            <AppButton
              onClick={() => void handleSave()}
              isLoading={loading}
              isDisabled={
                !form.name.trim() ||
                !form.category.trim() ||
                Number(form.minStock) < 0 ||
                Number(form.sellingPrice) < 0 ||
                splitMismatch
              }
            >
              {initialData ? "Save Product" : "Create Product"}
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
});
ProductFormModal.displayName = "ProductFormModal";

type ProductLedgerRow = ProductDayLedgerResponse["rows"][number];
type PurchaseBulkRowDetail = PurchaseBulkImportResult["rowDetails"][number] & { id: string };
type ProductStockHistoryPurchaseRow = ProductStockHistoryResponse["purchases"]["rows"][number];
type ProductStockHistoryConsumptionRow = ProductStockHistoryResponse["consumptions"]["rows"][number];

type ProductLedgerEditModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  row: ProductLedgerRow | null;
  productOptions: Array<{
    id: string;
    name: string;
    category: string;
    unit: ProductUnit;
    targetSection: ProductTargetSection;
    minStock: number;
  }>;
  onSubmit: (payload: {
    productId: string;
    date: string;
    targetSection: ProductTargetSection;
    stockHealth: StockHealth;
    openingStock: number;
    purchased: number;
    consumption: number;
    dipAndDashConsumption: number;
    snookerConsumption: number;
    note?: string;
  }) => Promise<void>;
};

const ProductLedgerEditModal = memo(
  ({ isOpen, onClose, loading, row, productOptions, onSubmit }: ProductLedgerEditModalProps) => {
  const [openingStock, setOpeningStock] = useState("0");
  const [purchased, setPurchased] = useState("0");
  const [consumption, setConsumption] = useState("0");
  const [dipAndDashConsumption, setDipAndDashConsumption] = useState("0");
  const [snookerConsumption, setSnookerConsumption] = useState("0");
  const [productId, setProductId] = useState("");
  const [date, setDate] = useState("");
  const [targetSection, setTargetSection] = useState<ProductTargetSection>("dip_and_dash");
  const [stockHealth, setStockHealth] = useState<StockHealth>("HEALTHY");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!isOpen || !row) {
      return;
    }
    setProductId(row.productId);
    setDate(row.date);
    setTargetSection(row.targetSection);
    setStockHealth(row.stockHealth);
    setOpeningStock(String(row.openingStock ?? 0));
    setPurchased(String(row.purchased ?? 0));
    setConsumption(String(row.consumption ?? 0));
    setDipAndDashConsumption(String(row.dipAndDashConsumption ?? 0));
    setSnookerConsumption(String(row.snookerConsumption ?? 0));
    setNote(row.adjustmentNote ?? "");
  }, [isOpen, row]);

  const selectedProduct = useMemo(
    () => productOptions.find((option) => option.id === productId) ?? null,
    [productId, productOptions]
  );
  const displayUnit = selectedProduct?.unit ?? row?.unit ?? "";

  const purchasedNumber = Number(purchased || 0);
  const consumptionNumber = Number(consumption || 0);
  const dipNumber = Number(dipAndDashConsumption || 0);
  const snookerNumber = Number(snookerConsumption || 0);
  const isConsumptionSplitValid = Math.abs(consumptionNumber - (dipNumber + snookerNumber)) <= 0.001;
  const closingStock = Number((Number(openingStock || 0) + purchasedNumber - consumptionNumber).toFixed(3));

  const handleSave = async () => {
    await onSubmit({
      productId,
      date,
      targetSection,
      stockHealth,
      openingStock: Number(openingStock || 0),
      purchased: purchasedNumber,
      consumption: consumptionNumber,
      dipAndDashConsumption: dipNumber,
      snookerConsumption: snookerNumber,
      note: note.trim() || undefined
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent borderRadius="16px">
        <ModalHeader>Edit Ledger Record</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl>
                <FormLabel>Date</FormLabel>
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </FormControl>
              <FormControl>
                <FormLabel>Product</FormLabel>
                <Select
                  value={productId}
                  onChange={(event) => {
                    const nextProductId = event.target.value;
                    const nextProduct = productOptions.find((option) => option.id === nextProductId) ?? null;
                    setProductId(nextProductId);
                    if (nextProduct) {
                      setTargetSection(nextProduct.targetSection);
                    }
                  }}
                >
                  <option value="">Select product</option>
                  {productOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.category} | {option.unit.toUpperCase()})
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Section</FormLabel>
                <Select
                  value={targetSection}
                  onChange={(event) => setTargetSection(event.target.value as ProductTargetSection)}
                >
                  {PRODUCT_TARGET_SECTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Stock Health</FormLabel>
                <Select value={stockHealth} onChange={(event) => setStockHealth(event.target.value as StockHealth)}>
                  <option value="HEALTHY">Healthy</option>
                  <option value="LOW_STOCK">Low Stock</option>
                </Select>
              </FormControl>
              <AppInput
                label={`Opening (${displayUnit})`}
                type="number"
                step="0.001"
                value={openingStock}
                onChange={(event) => setOpeningStock((event.target as HTMLInputElement).value)}
              />
              <AppInput
                label={`Purchase (${displayUnit})`}
                type="number"
                min={0}
                step="0.001"
                value={purchased}
                onChange={(event) => setPurchased((event.target as HTMLInputElement).value)}
              />
              <AppInput
                label={`Consumption (${displayUnit})`}
                type="number"
                min={0}
                step="0.001"
                value={consumption}
                onChange={(event) => setConsumption((event.target as HTMLInputElement).value)}
              />
              <AppInput
                label={`Dip Used (${displayUnit})`}
                type="number"
                min={0}
                step="0.001"
                value={dipAndDashConsumption}
                onChange={(event) => setDipAndDashConsumption((event.target as HTMLInputElement).value)}
              />
              <AppInput
                label={`Snooker Used (${displayUnit})`}
                type="number"
                min={0}
                step="0.001"
                value={snookerConsumption}
                onChange={(event) => setSnookerConsumption((event.target as HTMLInputElement).value)}
              />
              <AppInput
                label={`Closing (${displayUnit})`}
                value={String(closingStock)}
                isDisabled
              />
            </SimpleGrid>
            <FormControl>
              <FormLabel>Adjustment Note (optional)</FormLabel>
              <Textarea
                value={note}
                onChange={(event) => setNote((event.target as HTMLTextAreaElement).value)}
                placeholder="Reason for manual correction"
              />
            </FormControl>
            {!isConsumptionSplitValid ? (
              <Text fontSize="sm" color="red.600">
                Consumption must equal Dip Used + Snooker Used.
              </Text>
            ) : null}
            <Text fontSize="xs" color="#7A6359">
              Date/Product can be edited. Save will move this manual adjustment to the selected row key without creating duplicate adjustment rows.
            </Text>
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <AppButton variant="outline" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            onClick={() => void handleSave()}
            isLoading={loading}
            isDisabled={
              !row ||
              !productId ||
              !date ||
              !isConsumptionSplitValid ||
              Number.isNaN(Number(openingStock)) ||
              Number.isNaN(purchasedNumber) ||
              Number.isNaN(consumptionNumber) ||
              Number.isNaN(dipNumber) ||
              Number.isNaN(snookerNumber) ||
              purchasedNumber < 0 ||
              consumptionNumber < 0 ||
              dipNumber < 0 ||
              snookerNumber < 0
            }
          >
            Save Record
          </AppButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
  }
);
ProductLedgerEditModal.displayName = "ProductLedgerEditModal";

type PurchasePageSection = "orders" | "products";

type PurchasePageProps = {
  initialSection?: PurchasePageSection;
  standalone?: boolean;
};

export const PurchasePage = ({ initialSection = "orders", standalone = false }: PurchasePageProps) => {
  const location = useLocation();
  const toast = useAppToast();
  const businessScope = getBusinessScopeFromSearch(location.search);
  const businessTitle = getBusinessTitle(businessScope);
  const scopedPurchaseSection = businessScopeToPurchaseSection(businessScope);
  const scopedTargetSection = scopedPurchaseSection as ProductTargetSection;
  const initialTabIndex = initialSection === "products" ? 1 : 0;
  const [activeTabIndex, setActiveTabIndex] = useState(initialTabIndex);

  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [meta, setMeta] = useState<ProcurementMetaResponse | null>(null);
  const [units, setUnits] = useState<string[]>([]);
  const [stats, setStats] = useState<ProcurementStatsResponse["summary"]>({
    totalSuppliers: 0,
    totalProducts: 0,
    totalPurchaseOrders: 0,
    totalPurchaseAmount: 0,
    totalProductPurchasedQuantity: 0,
    totalProductPurchasedAmount: 0
  });
  const [recentPurchases, setRecentPurchases] = useState<ProcurementStatsResponse["recentPurchases"]>([]);

  const [orderRows, setOrderRows] = useState<PurchaseOrderSummary[]>([]);
  const [orderPagination, setOrderPagination] = useState(defaultPagination);
  const [orderStats, setOrderStats] = useState({ totalOrders: 0, totalAmount: 0 });
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orderSearch, setOrderSearch] = useState("");
  const debouncedOrderSearch = useDebouncedValue(orderSearch, 350);
  const [orderSupplierFilter, setOrderSupplierFilter] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const [orderLimit, setOrderLimit] = useState(TABLE_PAGE_SIZE);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [productRows, setProductRows] = useState<ProductListItem[]>([]);
  const [productPagination, setProductPagination] = useState(defaultPagination);
  const [productStats, setProductStats] = useState<ProductListResponse["stats"]>({
    totalProducts: 0,
    activeProducts: 0,
    inactiveProducts: 0,
    lowStockProducts: 0,
    stockValuation: 0,
    totalPurchasedQuantity: 0,
    totalPurchasedAmount: 0,
    totalSoldQuantity: 0,
    totalSoldAmount: 0,
    totalEstimatedProfit: 0,
    topPurchasedProducts: [],
    topSoldProducts: []
  });
  const [productsLoading, setProductsLoading] = useState(true);
  const [stockOverviewRows, setStockOverviewRows] = useState<ProductListItem[]>([]);
  const [stockOverviewPagination, setStockOverviewPagination] = useState(defaultPagination);
  const [stockOverviewLoading, setStockOverviewLoading] = useState(true);
  const [stockOverviewSearch, setStockOverviewSearch] = useState("");
  const debouncedStockOverviewSearch = useDebouncedValue(stockOverviewSearch, 350);
  const [stockOverviewPage, setStockOverviewPage] = useState(1);
  const stockOverviewLimit = 10;
  const [stockHistoryProduct, setStockHistoryProduct] = useState<ProductListItem | null>(null);
  const [stockHistoryData, setStockHistoryData] = useState<ProductStockHistoryResponse | null>(null);
  const [stockHistoryLoading, setStockHistoryLoading] = useState(false);
  const [stockHistoryPurchasePage, setStockHistoryPurchasePage] = useState(1);
  const [stockHistoryConsumptionPage, setStockHistoryConsumptionPage] = useState(1);
  const stockHistoryPurchaseLimit = 10;
  const stockHistoryConsumptionLimit = 10;
  const [productSearch, setProductSearch] = useState("");
  const debouncedProductSearch = useDebouncedValue(productSearch, 350);
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [productSupplierFilter, setProductSupplierFilter] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [productLimit, setProductLimit] = useState(TABLE_PAGE_SIZE);
  const [productLedgerRows, setProductLedgerRows] = useState<ProductDayLedgerResponse["rows"]>([]);
  const [productLedgerPagination, setProductLedgerPagination] = useState(defaultPagination);
  const [productLedgerStats, setProductLedgerStats] = useState<ProductDayLedgerResponse["stats"]>({
    totalProducts: 0,
    totalOpeningStock: 0,
    totalPurchased: 0,
    totalConsumption: 0,
    totalClosingStock: 0,
    dipAndDashConsumption: 0,
    snookerConsumption: 0
  });
  const [productLedgerLoading, setProductLedgerLoading] = useState(true);
  const [productLedgerDateFrom, setProductLedgerDateFrom] = useState("");
  const [productLedgerDateTo, setProductLedgerDateTo] = useState("");
  const [productLedgerProductId, setProductLedgerProductId] = useState("");
  const [productLedgerSearch, setProductLedgerSearch] = useState("");
  const debouncedProductLedgerSearch = useDebouncedValue(productLedgerSearch, 350);
  const [productLedgerTargetSection, setProductLedgerTargetSection] = useState<ProductTargetSection>(scopedTargetSection);
  const [productLedgerPage, setProductLedgerPage] = useState(1);
  const [productLedgerLimit, setProductLedgerLimit] = useState(TABLE_PAGE_SIZE);

  const [mutationLoading, setMutationLoading] = useState(false);
  const [purchaseBulkTemplateLoading, setPurchaseBulkTemplateLoading] = useState(false);
  const [purchaseBulkUploadLoading, setPurchaseBulkUploadLoading] = useState(false);
  const [purchaseBulkHistoryLoading, setPurchaseBulkHistoryLoading] = useState(false);
  const [purchaseBulkHistoryRows, setPurchaseBulkHistoryRows] = useState<PurchaseBulkImportHistoryItem[]>([]);
  const [purchaseBulkHistoryPagination, setPurchaseBulkHistoryPagination] = useState(defaultPagination);
  const [purchaseBulkHistoryPage, setPurchaseBulkHistoryPage] = useState(1);
  const [productBulkTemplateLoading, setProductBulkTemplateLoading] = useState(false);
  const [productBulkUploadLoading, setProductBulkUploadLoading] = useState(false);
  const [orderFormMode, setOrderFormMode] = useState<"create" | "edit">("create");
  const [newPurchaseSection, setNewPurchaseSection] = useState<PurchaseSection>(scopedPurchaseSection);
  const [orderFormBootstrapping, setOrderFormBootstrapping] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderDetail | null>(null);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrderDetail | null>(null);
  const [selectedOrderToDelete, setSelectedOrderToDelete] = useState<PurchaseOrderSummary | null>(null);
  const [purchaseBulkImportToDelete, setPurchaseBulkImportToDelete] = useState<PurchaseBulkImportHistoryItem | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductListItem | null>(null);
  const [selectedProductToDelete, setSelectedProductToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingLedgerRow, setEditingLedgerRow] = useState<ProductLedgerRow | null>(null);
  const [ledgerRowToReset, setLedgerRowToReset] = useState<ProductLedgerRow | null>(null);
  const [ledgerRowToDelete, setLedgerRowToDelete] = useState<ProductLedgerRow | null>(null);
  const [purchaseBulkSummary, setPurchaseBulkSummary] = useState<PurchaseBulkImportResult | null>(null);
  const [purchaseBulkDetailsPage, setPurchaseBulkDetailsPage] = useState(1);
  const purchaseBulkInputRef = useRef<HTMLInputElement | null>(null);
  const purchaseBulkHistorySectionRef = useRef<HTMLDivElement | null>(null);
  const purchaseBulkDetailsSectionRef = useRef<HTMLDivElement | null>(null);
  const productBulkInputRef = useRef<HTMLInputElement | null>(null);
  const orderDetailCacheRef = useRef<Map<string, PurchaseOrderDetail>>(new Map());

  const orderModal = useDisclosure();
  const orderDetailModal = useDisclosure();
  const productModal = useDisclosure();
  const deleteOrderDialog = useDisclosure();
  const deletePurchaseBulkDialog = useDisclosure();
  const deleteProductDialog = useDisclosure();
  const ledgerEditModal = useDisclosure();
  const resetLedgerDialog = useDisclosure();
  const deleteLedgerDialog = useDisclosure();
  const stockHistoryModal = useDisclosure();

  const loadMeta = useCallback(
    async (date?: string) => {
      try {
        const response = await procurementService.getMeta({ date, purchaseSection: scopedPurchaseSection });
        setMeta(response.data);
      } catch (error) {
        toast.error("Unable to fetch procurement meta", extractErrorMessage(error));
      }
    },
    [scopedPurchaseSection, toast]
  );

  const loadSuppliers = useCallback(async () => {
    try {
      const response = await procurementService.getSuppliers({
        includeInactive: true,
        section: scopedPurchaseSection,
        page: 1,
        limit: 100
      });
      setSuppliers(response.data.suppliers);
    } catch (error) {
      toast.error("Unable to fetch suppliers", extractErrorMessage(error));
    }
  }, [scopedPurchaseSection, toast]);

  const loadUnits = useCallback(async () => {
    try {
      const response = await procurementService.getUnits();
      setUnits([...response.data.productUnits]);
    } catch (error) {
      toast.error("Unable to fetch units", extractErrorMessage(error));
    }
  }, [toast]);

  const loadStats = useCallback(async () => {
    try {
      const response = await procurementService.getStats({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        purchaseSection: scopedPurchaseSection
      });
      setStats(response.data.summary);
      setRecentPurchases(response.data.recentPurchases);
    } catch (error) {
      toast.error("Unable to fetch purchase stats", extractErrorMessage(error));
    }
  }, [dateFrom, dateTo, scopedPurchaseSection, toast]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const response = await procurementService.getPurchaseOrders({
        search: debouncedOrderSearch || undefined,
        supplierId: orderSupplierFilter || undefined,
        purchaseSection: scopedPurchaseSection,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page: orderPage,
        limit: orderLimit
      });
      setOrderRows(response.data.orders);
      setOrderPagination(response.data.pagination);
      setOrderStats(response.data.stats);
    } catch (error) {
      toast.error("Unable to fetch purchase orders", extractErrorMessage(error));
    } finally {
      setOrdersLoading(false);
    }
  }, [dateFrom, dateTo, debouncedOrderSearch, orderLimit, orderPage, orderSupplierFilter, scopedPurchaseSection, toast]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const response = await procurementService.getProducts({
        search: debouncedProductSearch || undefined,
        category: productCategoryFilter || undefined,
        supplierId: productSupplierFilter || undefined,
        targetSection: scopedTargetSection,
        includeInactive: true,
        page: productPage,
        limit: productLimit
      });
      setProductRows(response.data.products);
      setProductPagination(response.data.pagination);
      setProductStats(response.data.stats);
    } catch (error) {
      toast.error("Unable to fetch products", extractErrorMessage(error));
    } finally {
      setProductsLoading(false);
    }
  }, [debouncedProductSearch, productCategoryFilter, productLimit, productPage, productSupplierFilter, scopedTargetSection, toast]);

  const loadStockOverview = useCallback(async () => {
    setStockOverviewLoading(true);
    try {
      const response = await procurementService.getProducts({
        search: debouncedStockOverviewSearch || undefined,
        targetSection: scopedTargetSection,
        includeInactive: true,
        page: stockOverviewPage,
        limit: stockOverviewLimit
      });
      setStockOverviewRows(response.data.products);
      setStockOverviewPagination(response.data.pagination);
    } catch (error) {
      toast.error("Unable to fetch stock overview", extractErrorMessage(error));
    } finally {
      setStockOverviewLoading(false);
    }
  }, [debouncedStockOverviewSearch, scopedTargetSection, stockOverviewPage, toast]);

  const loadProductStockHistory = useCallback(async () => {
    if (!stockHistoryProduct) {
      return;
    }
    setStockHistoryLoading(true);
    try {
      const response = await procurementService.getProductStockHistory(stockHistoryProduct.id, {
        purchasePage: stockHistoryPurchasePage,
        purchaseLimit: stockHistoryPurchaseLimit,
        consumptionPage: stockHistoryConsumptionPage,
        consumptionLimit: stockHistoryConsumptionLimit
      });
      setStockHistoryData(response.data);
    } catch (error) {
      toast.error("Unable to fetch product stock history", extractErrorMessage(error));
    } finally {
      setStockHistoryLoading(false);
    }
  }, [
    stockHistoryConsumptionLimit,
    stockHistoryConsumptionPage,
    stockHistoryProduct,
    stockHistoryPurchaseLimit,
    stockHistoryPurchasePage,
    toast
  ]);

  const loadProductLedger = useCallback(async () => {
    setProductLedgerLoading(true);
    try {
      const response = await procurementService.getProductLedger({
        dateFrom: productLedgerDateFrom || undefined,
        dateTo: productLedgerDateTo || undefined,
        productId: productLedgerProductId || undefined,
        search: debouncedProductLedgerSearch || undefined,
        targetSection: productLedgerTargetSection,
        page: productLedgerPage,
        limit: productLedgerLimit
      });
      setProductLedgerRows(response.data.rows);
      setProductLedgerPagination(response.data.pagination);
      setProductLedgerStats(response.data.stats);
    } catch (error) {
      toast.error("Unable to fetch product ledger", extractErrorMessage(error));
    } finally {
      setProductLedgerLoading(false);
    }
  }, [
    debouncedProductLedgerSearch,
    productLedgerDateFrom,
    productLedgerDateTo,
    productLedgerProductId,
    productLedgerLimit,
    productLedgerPage,
    productLedgerTargetSection,
    toast
  ]);

  useEffect(() => {
    void Promise.all([loadSuppliers(), loadUnits(), loadMeta(getTodayDate())]);
  }, [loadSuppliers, loadUnits, loadMeta]);

  useEffect(() => {
    setNewPurchaseSection(scopedPurchaseSection);
    setProductLedgerTargetSection(scopedTargetSection);
    setOrderPage(1);
    setProductPage(1);
    setStockOverviewPage(1);
    setProductLedgerPage(1);
  }, [scopedPurchaseSection, scopedTargetSection]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setOrderPage(1);
  }, [debouncedOrderSearch, orderSupplierFilter, orderLimit, dateFrom, dateTo, scopedPurchaseSection]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void loadStockOverview();
  }, [loadStockOverview]);

  useEffect(() => {
    if (!stockHistoryModal.isOpen || !stockHistoryProduct) {
      return;
    }
    void loadProductStockHistory();
  }, [loadProductStockHistory, stockHistoryModal.isOpen, stockHistoryProduct]);

  useEffect(() => {
    setProductPage(1);
  }, [debouncedProductSearch, productCategoryFilter, productSupplierFilter, productLimit, scopedTargetSection]);

  useEffect(() => {
    setStockOverviewPage(1);
  }, [debouncedStockOverviewSearch, scopedTargetSection]);

  useEffect(() => {
    void loadProductLedger();
  }, [loadProductLedger]);

  useEffect(() => {
    setProductLedgerPage(1);
  }, [
    debouncedProductLedgerSearch,
    productLedgerDateFrom,
    productLedgerDateTo,
    productLedgerProductId,
    productLedgerLimit,
    productLedgerTargetSection
  ]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const supplierOptions: AppSearchableSelectOption[] = useMemo(
    () => [
      { value: "", label: "All Suppliers" },
      ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, description: supplier.phone }))
    ],
    [suppliers]
  );

  const categoryFilterOptions: AppSearchableSelectOption[] = useMemo(() => {
    const unique = new Set(productRows.map((row) => row.category));
    return [{ value: "", label: "All Categories" }, ...Array.from(unique).map((category) => ({ value: category, label: category }))];
  }, [productRows]);

  const ledgerTargetSectionOptions: AppSearchableSelectOption[] = useMemo(
    () => [{ value: scopedTargetSection, label: formatTargetSectionLabel(scopedTargetSection) }],
    [scopedTargetSection]
  );
  const ledgerProductOptions: AppSearchableSelectOption[] = useMemo(() => {
    const productMap = new Map<string, AppSearchableSelectOption>();
    (meta?.products ?? []).forEach((product) => {
      productMap.set(product.id, {
        value: product.id,
        label: product.name,
        description: `${product.category} | ${product.unit.toUpperCase()}`,
        searchText: `${product.name} ${product.category} ${product.sku ?? ""}`
      });
    });
    productRows.forEach((product) => {
      if (productMap.has(product.id)) {
        return;
      }
      productMap.set(product.id, {
        value: product.id,
        label: product.name,
        description: `${product.category} | ${product.unit.toUpperCase()}`,
        searchText: `${product.name} ${product.category} ${product.sku ?? ""}`
      });
    });
    return [{ value: "", label: "All Products" }, ...Array.from(productMap.values()).sort((a, b) => a.label.localeCompare(b.label))];
  }, [meta?.products, productRows]);
  const productLedgerEditOptions = useMemo(
    () =>
      Array.from(
        [...(meta?.products ?? []), ...productRows].reduce(
          (acc, product) => {
            if (!acc.has(product.id)) {
              acc.set(product.id, {
                id: product.id,
                name: product.name,
                category: product.category,
                unit: product.unit,
                targetSection: product.targetSection,
                minStock: product.minStock ?? 0
              });
            }
            return acc;
          },
          new Map<
            string,
            {
              id: string;
              name: string;
              category: string;
              unit: ProductUnit;
              targetSection: ProductTargetSection;
              minStock: number;
            }
          >()
        ).values()
      ).sort((left, right) => left.name.localeCompare(right.name)),
    [meta?.products, productRows]
  );

  const openCreateProduct = () => {
    setSelectedProduct(null);
    productModal.onOpen();
  };

  const openCreateOrderForSection = (section: PurchaseSection) => {
    setNewPurchaseSection(section);
    setOrderFormMode("create");
    setOrderFormBootstrapping(false);
    setEditingOrder(null);
    orderModal.onOpen();
  };

  const openCreateOrder = () => {
    openCreateOrderForSection(scopedPurchaseSection);
  };

  const openEditProduct = (row: ProductListItem) => {
    setSelectedProduct(row);
    productModal.onOpen();
  };

  const openEditProductFromLedger = useCallback(
    (row: ProductLedgerRow) => {
      setEditingLedgerRow(row);
      ledgerEditModal.onOpen();
    },
    [ledgerEditModal]
  );

  const openDeleteProduct = (row: { id: string; name: string }) => {
    setSelectedProductToDelete({ id: row.id, name: row.name });
    deleteProductDialog.onOpen();
  };

  const openResetLedgerRecord = useCallback(
    (row: ProductLedgerRow) => {
      if (!row.isAdjusted) {
        toast.info(
          "No manual adjustment found",
          "This row comes from purchase/sales history. Only manual edits can be reset."
        );
        return;
      }
      setLedgerRowToReset(row);
      resetLedgerDialog.onOpen();
    },
    [resetLedgerDialog, toast]
  );

  const openDeleteLedgerRow = useCallback(
    (row: ProductLedgerRow) => {
      setLedgerRowToDelete(row);
      deleteLedgerDialog.onOpen();
    },
    [deleteLedgerDialog]
  );

  const openProductStockHistory = useCallback(
    (row: ProductListItem) => {
      setStockHistoryProduct(row);
      setStockHistoryData(null);
      setStockHistoryPurchasePage(1);
      setStockHistoryConsumptionPage(1);
      stockHistoryModal.onOpen();
    },
    [stockHistoryModal]
  );

  const openViewOrder = useCallback(
    async (orderId: string) => {
      const cached = orderDetailCacheRef.current.get(orderId);
      if (cached) {
        setSelectedOrder(cached);
        orderDetailModal.onOpen();
        return;
      }

      try {
        const response = await procurementService.getPurchaseOrderById(orderId);
        const detail = response.data.purchaseOrder;
        orderDetailCacheRef.current.set(orderId, detail);
        setSelectedOrder(detail);
        orderDetailModal.onOpen();
      } catch (error) {
        toast.error("Unable to load purchase detail", extractErrorMessage(error));
      }
    },
    [orderDetailModal, toast]
  );

  const openEditOrder = useCallback(
    async (row: PurchaseOrderSummary) => {
      setOrderFormMode("edit");
      setNewPurchaseSection(row.purchaseSection);
      setOrderFormBootstrapping(true);
      const cached = orderDetailCacheRef.current.get(row.id);
      if (cached) {
        setEditingOrder(cached);
        setOrderFormBootstrapping(false);
        orderModal.onOpen();
        return;
      }

      setEditingOrder(null);
      orderModal.onOpen();
      try {
        const response = await procurementService.getPurchaseOrderById(row.id);
        const detail = response.data.purchaseOrder;
        orderDetailCacheRef.current.set(row.id, detail);
        setEditingOrder(detail);
      } catch (error) {
        orderModal.onClose();
        toast.error("Unable to load purchase for editing", extractErrorMessage(error));
      } finally {
        setOrderFormBootstrapping(false);
      }
    },
    [orderModal, toast]
  );

  const openDeleteOrder = useCallback(
    (row: PurchaseOrderSummary) => {
      setSelectedOrderToDelete(row);
      deleteOrderDialog.onOpen();
    },
    [deleteOrderDialog]
  );

  const openDeletePurchaseBulkImport = useCallback(
    (row: PurchaseBulkImportHistoryItem) => {
      setPurchaseBulkImportToDelete(row);
      deletePurchaseBulkDialog.onOpen();
    },
    [deletePurchaseBulkDialog]
  );

  const openPurchaseBulkPicker = useCallback(() => {
    purchaseBulkInputRef.current?.click();
  }, []);

  const openProductBulkPicker = useCallback(() => {
    productBulkInputRef.current?.click();
  }, []);

  const loadPurchaseBulkHistory = useCallback(
    async (page = purchaseBulkHistoryPage) => {
      setPurchaseBulkHistoryLoading(true);
      try {
        const response = await procurementService.getPurchaseBulkImportHistory({
          purchaseSection: scopedPurchaseSection,
          page,
          limit: 10
        });
        setPurchaseBulkHistoryRows(response.data.imports);
        setPurchaseBulkHistoryPagination(response.data.pagination);
      } catch (error) {
        toast.error("Unable to fetch upload history", extractErrorMessage(error));
      } finally {
        setPurchaseBulkHistoryLoading(false);
      }
    },
    [purchaseBulkHistoryPage, scopedPurchaseSection, toast]
  );

  const openPurchaseBulkHistory = useCallback(() => {
    void loadPurchaseBulkHistory(1);
    setPurchaseBulkHistoryPage(1);
    window.setTimeout(() => {
      purchaseBulkHistorySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [loadPurchaseBulkHistory]);

  useEffect(() => {
    if (activeTabIndex === 0) {
      void loadPurchaseBulkHistory(purchaseBulkHistoryPage);
    }
  }, [activeTabIndex, loadPurchaseBulkHistory, purchaseBulkHistoryPage]);

  const handleDownloadPurchaseTemplate = useCallback(async () => {
    setPurchaseBulkTemplateLoading(true);
    try {
      const response = await procurementService.downloadPurchaseBulkTemplate();
      const fileName =
        extractFileNameFromDisposition(response.headers["content-disposition"]) ?? "purchase_bulk_template.csv";
      const blob = new Blob([response.data], { type: response.headers["content-type"] ?? "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Purchase bulk template downloaded.");
    } catch (error) {
      toast.error("Unable to download purchase template", extractErrorMessage(error));
    } finally {
      setPurchaseBulkTemplateLoading(false);
    }
  }, [toast]);

  const handlePurchaseBulkFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const inputElement = event.target;
      const selectedFile = inputElement.files?.[0];
      inputElement.value = "";

      if (!selectedFile) {
        return;
      }
      const lowerFileName = selectedFile.name.toLowerCase();
      if (!lowerFileName.endsWith(".csv") && !lowerFileName.endsWith(".xlsx")) {
        toast.warning("Please upload a CSV or XLSX file.");
        return;
      }

      setPurchaseBulkUploadLoading(true);
      try {
        const response = await procurementService.importPurchaseBulkCsv(selectedFile);
        const summary = response.data;
        setPurchaseBulkSummary(summary);
        setPurchaseBulkDetailsPage(1);
        toast.success(
          `Purchase import done. Inserted ${summary.insertedRows}, skipped duplicates ${summary.skippedDuplicateRows}, failed ${summary.failedRows}, products created ${summary.createdProducts}.`
        );
        await Promise.all([
          loadOrders(),
          loadProducts(),
          loadStockOverview(),
          loadProductLedger(),
          loadStats(),
          loadMeta(summary.createdOrders[0]?.purchaseDate ?? getTodayDate()),
          loadSuppliers(),
          loadPurchaseBulkHistory(1)
        ]);
      } catch (error) {
        toast.error("Unable to import purchase file", extractErrorMessage(error));
      } finally {
        setPurchaseBulkUploadLoading(false);
      }
    },
    [
      loadMeta,
      loadOrders,
      loadProductLedger,
      loadProducts,
      loadStats,
      loadStockOverview,
      loadSuppliers,
      loadPurchaseBulkHistory,
      toast
    ]
  );

  const handleDownloadProductTemplate = useCallback(async () => {
    setProductBulkTemplateLoading(true);
    try {
      const response = await procurementService.downloadProductBulkTemplate();
      const fileName =
        extractFileNameFromDisposition(response.headers["content-disposition"]) ?? "product_bulk_template.csv";
      const blob = new Blob([response.data], { type: response.headers["content-type"] ?? "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Product bulk template downloaded.");
    } catch (error) {
      toast.error("Unable to download product template", extractErrorMessage(error));
    } finally {
      setProductBulkTemplateLoading(false);
    }
  }, [toast]);

  const handleProductBulkFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const inputElement = event.target;
      const selectedFile = inputElement.files?.[0];
      inputElement.value = "";

      if (!selectedFile) {
        return;
      }
      if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
        toast.warning("Please upload a CSV file.");
        return;
      }

      setProductBulkUploadLoading(true);
      try {
        const response = await procurementService.importProductBulkCsv(selectedFile);
        const summary = response.data;
        toast.success(
          `Product bulk import completed. Added ${summary.insertedProducts}, skipped existing ${summary.skippedExistingProducts}, duplicate rows ${summary.skippedDuplicateRows}, invalid rows ${summary.invalidRows}.`
        );
        await Promise.all([loadProducts(), loadStockOverview(), loadProductLedger(), loadStats(), loadMeta(meta?.date)]);
      } catch (error) {
        toast.error("Unable to import product CSV", extractErrorMessage(error));
      } finally {
        setProductBulkUploadLoading(false);
      }
    },
    [loadMeta, loadProductLedger, loadProducts, loadStats, loadStockOverview, meta?.date, toast]
  );

  const handleSaveOrder = async (
    payload: CreatePurchaseOrderInput & {
      invoiceImageFile?: File | null;
    }
  ) => {
    setMutationLoading(true);
    try {
      const { invoiceImageFile, ...createPayload } = payload;
      let invoiceImageUrl = createPayload.invoiceImageUrl;

      if (invoiceImageFile) {
        const uploadResponse = await procurementService.uploadPurchaseInvoiceImage(invoiceImageFile);
        invoiceImageUrl = uploadResponse.data.imageUrl;
      }

      if (editingOrder) {
        const response = await procurementService.updatePurchaseOrder(editingOrder.id, {
          ...createPayload,
          invoiceImageUrl
        });
        orderDetailCacheRef.current.set(editingOrder.id, response.data.purchaseOrder);
        toast.success("Purchase order updated successfully");
      } else {
        const response = await procurementService.createPurchaseOrder({
          ...createPayload,
          invoiceImageUrl
        });
        orderDetailCacheRef.current.set(response.data.purchaseOrder.id, response.data.purchaseOrder);
        toast.success("Purchase order created successfully");
      }
      orderModal.onClose();
      setOrderFormBootstrapping(false);
      setOrderFormMode("create");
      setEditingOrder(null);
      await Promise.all([loadOrders(), loadProducts(), loadStockOverview(), loadProductLedger(), loadStats(), loadMeta(payload.purchaseDate)]);
    } catch (error) {
      toast.error(
        editingOrder ? "Unable to update purchase order" : "Unable to create purchase order",
        extractErrorMessage(error)
      );
    } finally {
      setMutationLoading(false);
    }
  };

  const handleSaveProduct = async (payload: {
    name: string;
    category: string;
    sku?: string;
    packSize?: string;
    unit: ProductUnit;
    minStock: number;
    sellingPrice: number;
    targetSection: ProductTargetSection;
    dipAndDashAssignedStock?: number;
    gamingAssignedStock?: number;
    defaultSupplierId?: string | null;
    isActive: boolean;
  }) => {
    setMutationLoading(true);
    try {
      if (selectedProduct) {
        await procurementService.updateProduct(selectedProduct.id, payload);
        toast.success("Product updated successfully");
      } else {
        await procurementService.createProduct(payload);
        toast.success("Product created successfully");
      }
      productModal.onClose();
      setSelectedProduct(null);
      await Promise.all([loadProducts(), loadStockOverview(), loadProductLedger(), loadStats(), loadMeta(meta?.date)]);
    } catch (error) {
      toast.error("Unable to save product", extractErrorMessage(error));
    } finally {
      setMutationLoading(false);
    }
  };

  const handleSaveLedgerRecord = async (payload: {
    productId: string;
    date: string;
    targetSection: ProductTargetSection;
    stockHealth: StockHealth;
    openingStock: number;
    purchased: number;
    consumption: number;
    dipAndDashConsumption: number;
    snookerConsumption: number;
    note?: string;
  }) => {
    if (!editingLedgerRow) {
      return;
    }
    setMutationLoading(true);
    try {
      await procurementService.updateProductLedgerRecord(editingLedgerRow.productId, editingLedgerRow.date, payload);
      toast.success("Ledger record updated successfully");
      ledgerEditModal.onClose();
      setEditingLedgerRow(null);
      await Promise.all([loadProductLedger(), loadProducts(), loadStockOverview(), loadStats(), loadMeta(meta?.date)]);
    } catch (error) {
      toast.error("Unable to update ledger record", extractErrorMessage(error));
    } finally {
      setMutationLoading(false);
    }
  };

  const handleResetLedgerRecord = async () => {
    if (!ledgerRowToReset) {
      return;
    }
    setMutationLoading(true);
    try {
      const response = await procurementService.deleteProductLedgerRecord(ledgerRowToReset.productId, ledgerRowToReset.date);
      if (response.data.deleted) {
        toast.success("Ledger record reset successfully");
      } else {
        toast.info(
          "No manual adjustment found",
          "This row has no custom override to reset."
        );
      }
      resetLedgerDialog.onClose();
      setLedgerRowToReset(null);
      await Promise.all([loadProductLedger(), loadProducts(), loadStockOverview(), loadStats(), loadMeta(meta?.date)]);
    } catch (error) {
      toast.error("Unable to reset ledger record", extractErrorMessage(error));
    } finally {
      setMutationLoading(false);
    }
  };

  const handleDeleteLedgerRow = async () => {
    if (!ledgerRowToDelete) {
      return;
    }
    setMutationLoading(true);
    try {
      const response = await procurementService.removeProductLedgerRow(ledgerRowToDelete.productId, ledgerRowToDelete.date);
      if (response.data.deleted) {
        toast.success("Ledger row deleted successfully");
      } else {
        toast.info("Ledger row not found", "This row may already be removed.");
      }
      deleteLedgerDialog.onClose();
      setLedgerRowToDelete(null);
      await Promise.all([loadProductLedger(), loadProducts(), loadStockOverview(), loadStats(), loadMeta(meta?.date)]);
    } catch (error) {
      toast.error("Unable to delete ledger row", extractErrorMessage(error));
    } finally {
      setMutationLoading(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!selectedProductToDelete) {
      return;
    }
    setMutationLoading(true);
    try {
      const deletedProductId = selectedProductToDelete.id;
      await procurementService.deleteProduct(deletedProductId);
      setProductRows((previous) => previous.filter((row) => row.id !== deletedProductId));
      setStockOverviewRows((previous) => previous.filter((row) => row.id !== deletedProductId));
      setProductLedgerRows((previous) => previous.filter((row) => row.productId !== deletedProductId));
      toast.success("Product deleted successfully");
      deleteProductDialog.onClose();
      setSelectedProductToDelete(null);
      setSelectedProduct(null);
      await Promise.all([loadProducts(), loadStockOverview(), loadProductLedger(), loadStats(), loadMeta(meta?.date)]);
    } catch (error) {
      toast.error("Unable to delete product", extractErrorMessage(error));
    } finally {
      setMutationLoading(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!selectedOrderToDelete) {
      return;
    }
    setMutationLoading(true);
    try {
      const deletedOrderId = selectedOrderToDelete.id;
      const deletedDate = selectedOrderToDelete.purchaseDate;
      await procurementService.deletePurchaseOrder(deletedOrderId);
      orderDetailCacheRef.current.delete(deletedOrderId);
      if (selectedOrder?.id === deletedOrderId) {
        setSelectedOrder(null);
        orderDetailModal.onClose();
      }
      if (editingOrder?.id === deletedOrderId) {
        setEditingOrder(null);
        setOrderFormBootstrapping(false);
        setOrderFormMode("create");
        orderModal.onClose();
      }
      toast.success("Purchase order deleted successfully");
      deleteOrderDialog.onClose();
      setSelectedOrderToDelete(null);
      await Promise.all([loadOrders(), loadProducts(), loadStockOverview(), loadProductLedger(), loadStats(), loadMeta(deletedDate)]);
    } catch (error) {
      toast.error("Unable to delete purchase order", extractErrorMessage(error));
    } finally {
      setMutationLoading(false);
    }
  };

  const handleDeletePurchaseBulkImport = async () => {
    if (!purchaseBulkImportToDelete) {
      return;
    }
    setMutationLoading(true);
    try {
      const response = await procurementService.deletePurchaseBulkImport(purchaseBulkImportToDelete.id);
      const deletedOrderIds = new Set(response.data.deletedOrders.map((order) => order.id));
      response.data.deletedOrders.forEach((order) => orderDetailCacheRef.current.delete(order.id));

      if (selectedOrder && deletedOrderIds.has(selectedOrder.id)) {
        setSelectedOrder(null);
        orderDetailModal.onClose();
      }
      if (editingOrder && deletedOrderIds.has(editingOrder.id)) {
        setEditingOrder(null);
        setOrderFormBootstrapping(false);
        setOrderFormMode("create");
        orderModal.onClose();
      }

      const nextHistoryPage =
        purchaseBulkHistoryRows.length === 1 && purchaseBulkHistoryPage > 1
          ? purchaseBulkHistoryPage - 1
          : purchaseBulkHistoryPage;
      setPurchaseBulkHistoryPage(nextHistoryPage);
      setPurchaseBulkSummary((current) => {
        const currentImportId = current?.importId ?? (current as PurchaseBulkImportHistoryItem | null)?.id;
        return currentImportId === purchaseBulkImportToDelete.id ? null : current;
      });
      setPurchaseBulkImportToDelete(null);
      deletePurchaseBulkDialog.onClose();

      toast.success(
        "Bulk upload deleted successfully",
        `${response.data.deletedOrderCount} purchase orders deleted and stock rolled back.`
      );
      await Promise.all([
        loadPurchaseBulkHistory(nextHistoryPage),
        loadOrders(),
        loadProducts(),
        loadStockOverview(),
        loadProductLedger(),
        loadStats(),
        loadMeta(meta?.date)
      ]);
    } catch (error) {
      toast.error("Unable to delete bulk upload", extractErrorMessage(error));
    } finally {
      setMutationLoading(false);
    }
  };

  const latestPurchase = recentPurchases[0] ?? null;
  const isOrdersSection = activeTabIndex === 0;
  const isStandaloneProducts = standalone && initialSection === "products";
  const topSoldProduct = productStats.topSoldProducts[0] ?? null;
  const pageTitle = standalone && initialSection === "products" ? `${businessTitle} Products` : `${businessTitle} Purchase`;
  const pageSubtitle =
    standalone && initialSection === "products"
      ? `Manage ${businessTitle} products with stock, valuation and ageing visibility.`
      : `Manage ${businessTitle} supplier purchases and stock entries.`;
  const purchaseBulkRowDetails: PurchaseBulkRowDetail[] =
    purchaseBulkSummary?.rowDetails.map((row) => ({ ...row, id: `upload-row-${row.rowNumber}-${row.status}` })) ?? [];
  const purchaseBulkDetailsTotalPages = Math.max(1, Math.ceil(purchaseBulkRowDetails.length / TABLE_PAGE_SIZE));
  const purchaseBulkDetailsCurrentPage = Math.min(purchaseBulkDetailsPage, purchaseBulkDetailsTotalPages);
  const paginatedPurchaseBulkRowDetails = purchaseBulkRowDetails.slice(
    (purchaseBulkDetailsCurrentPage - 1) * TABLE_PAGE_SIZE,
    purchaseBulkDetailsCurrentPage * TABLE_PAGE_SIZE
  );
  const orderColumns = useMemo(
    () => [
      { key: "purchaseNumber", header: "Purchase No", render: (row: PurchaseOrderSummary) => <Text fontWeight={800}>{row.purchaseNumber}</Text> },
      { key: "supplierName", header: "Supplier", render: (row: PurchaseOrderSummary) => row.supplierName },
      { key: "purchaseDate", header: "Date", render: (row: PurchaseOrderSummary) => formatDate(row.purchaseDate) },
      {
        key: "purchaseSection",
        header: "Section",
        render: (row: PurchaseOrderSummary) => formatPurchaseSectionLabel(row.purchaseSection)
      },
      {
        key: "lineCount",
        header: "Total Items",
        render: (row: PurchaseOrderSummary) => (
          <Box>
            <Text fontSize="sm" color="#7A6359">
              Ingredients: {row.ingredientLineCount ?? 0} | Products: {row.productLineCount ?? 0}
            </Text>
          </Box>
        )
      },
      { key: "totalAmount", header: "Total", render: (row: PurchaseOrderSummary) => formatCurrency(row.totalAmount) },
      { key: "createdByUserName", header: "Created By", render: (row: PurchaseOrderSummary) => row.createdByUserName ?? "-" },
      {
        key: "action",
        header: "Action",
        render: (row: PurchaseOrderSummary) => (
          <HStack spacing={2}>
            <ActionIconButton
              aria-label="View details"
              tooltip="View details"
              icon={<Eye size={16} />}
              variant="outline"
              onClick={() => void openViewOrder(row.id)}
            />
            <ActionIconButton
              aria-label="Edit purchase order"
              tooltip="Edit purchase order"
              icon={<Edit2 size={16} />}
              variant="outline"
              onClick={() => void openEditOrder(row)}
            />
            <ActionIconButton
              aria-label="Delete purchase order"
              tooltip="Delete purchase order"
              icon={<Trash2 size={16} />}
              variant="outline"
              colorScheme="accentRed"
              onClick={() => openDeleteOrder(row)}
            />
          </HStack>
        )
      }
    ],
    [openDeleteOrder, openEditOrder, openViewOrder]
  );

  useEffect(() => {
    setActiveTabIndex(initialTabIndex);
  }, [initialTabIndex]);

  const stockOverviewSection = (
    <AppCard p={4}>
      <VStack spacing={4} align="stretch">
        <Box>
          <Text fontWeight={800}>Stocks Overview</Text>
          <Text fontSize="sm" color="#7A6359">
            Overall purchased quantity, consumption and current stock (Purchase - Consumption) for all products.
          </Text>
        </Box>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} alignItems="end">
          <GridItem minW={0}>
            <AppInput
              label="Search Product"
              placeholder="Search by product, sku, category"
              value={stockOverviewSearch}
              onChange={(event) => setStockOverviewSearch((event.target as HTMLInputElement).value)}
            />
          </GridItem>
          <GridItem minW={0}>
            <FormControl>
              <FormLabel>Rows per page</FormLabel>
              <Input value={String(stockOverviewLimit)} isDisabled bg="white" />
            </FormControl>
          </GridItem>
        </SimpleGrid>

        {stockOverviewLoading ? (
          <SkeletonTable rows={10} />
        ) : (
          <DataTable
            columns={[
              {
                key: "name",
                header: "Product",
                render: (row: ProductListItem) => (
                  <Box>
                    <Text fontWeight={800}>{row.name}</Text>
                    <Text fontSize="sm" color="#7A6359">
                      {row.sku || "-"} | {row.category}
                    </Text>
                  </Box>
                )
              },
              {
                key: "section",
                header: "Section",
                render: (row: ProductListItem) => formatTargetSectionLabel(row.targetSection)
              },
              {
                key: "overallPurchased",
                header: "Overall Purchase",
                render: (row: ProductListItem) => `${row.purchasedQuantity} ${row.unit}`
              },
              {
                key: "overallConsumption",
                header: "Overall Consumption",
                render: (row: ProductListItem) => `${row.soldQuantity} ${row.unit}`
              },
              {
                key: "currentStock",
                header: "Current Stock",
                render: (row: ProductListItem) => `${getStockOverviewCalculatedCurrentStock(row)} ${row.unit}`
              },
              {
                key: "health",
                header: "Health",
                render: (row: ProductListItem) => (
                  <Box
                    px={3}
                    py={1}
                    borderRadius="full"
                    bg={getStockOverviewCalculatedCurrentStock(row) <= row.minStock ? "red.100" : "green.100"}
                    color={getStockOverviewCalculatedCurrentStock(row) <= row.minStock ? "red.700" : "green.700"}
                    fontSize="xs"
                    fontWeight={700}
                    w="fit-content"
                  >
                    {getStockOverviewCalculatedCurrentStock(row) <= row.minStock ? "Low Stock" : "Healthy"}
                  </Box>
                )
              },
              {
                key: "history",
                header: "History",
                render: (row: ProductListItem) => (
                  <AppButton size="sm" variant="outline" onClick={() => openProductStockHistory(row)}>
                    View History
                  </AppButton>
                )
              }
            ]}
            rows={stockOverviewRows}
            emptyState={
              <EmptyState
                title="No stock records found"
                description="Try another product search to view stock movement summary."
              />
            }
          />
        )}

        <HStack justify="space-between" flexWrap="wrap" gap={3}>
          <Text color="#6F594F" fontSize="sm">
            Showing {stockOverviewRows.length} of {stockOverviewPagination.total} records
          </Text>
          <HStack flexWrap="wrap">
            <AppButton
              variant="outline"
              isDisabled={stockOverviewPage <= 1}
              onClick={() => setStockOverviewPage((prev) => prev - 1)}
            >
              Previous
            </AppButton>
            <Text fontWeight={700}>
              Page {stockOverviewPagination.page} of {stockOverviewPagination.totalPages}
            </Text>
            <AppButton
              variant="outline"
              isDisabled={stockOverviewPagination.page >= stockOverviewPagination.totalPages}
              onClick={() => setStockOverviewPage((prev) => prev + 1)}
            >
              Next
            </AppButton>
          </HStack>
        </HStack>
      </VStack>
    </AppCard>
  );

  return (
    <VStack spacing={5} align="stretch" w="full" minW={0}>
      <PageHeader title={pageTitle} subtitle={pageSubtitle} />

      <SimpleGrid minChildWidth={{ base: "150px", md: "200px", xl: "220px" }} spacing={3}>
        {isStandaloneProducts ? (
          <>
            <AppCard p={4}>
              <Text fontSize="sm" color="#7B645B">Total Products</Text>
              <Text fontSize="2xl" fontWeight={900}>{productStats.totalProducts}</Text>
              <Text mt={1} fontSize="xs" color="#7B645B">
                Active {productStats.activeProducts} | Inactive {productStats.inactiveProducts}
              </Text>
            </AppCard>
            <AppCard p={4}>
              <Text fontSize="sm" color="#7B645B">Low Stock</Text>
              <Text fontSize="2xl" fontWeight={900} color="#B91C1C">{productStats.lowStockProducts}</Text>
            </AppCard>
            <AppCard p={4}>
              <Text fontSize="sm" color="#7B645B">Stock Valuation</Text>
              <Text fontSize="2xl" fontWeight={900}>{formatCurrency(productStats.stockValuation)}</Text>
            </AppCard>
            <AppCard p={4}>
              <Text fontSize="sm" color="#7B645B">Purchased Qty</Text>
              <Text fontSize="2xl" fontWeight={900}>{productStats.totalPurchasedQuantity}</Text>
            </AppCard>
            <AppCard p={4}>
              <Text fontSize="sm" color="#7B645B">Sold Amount</Text>
              <Text fontSize="2xl" fontWeight={900}>{formatCurrency(productStats.totalSoldAmount)}</Text>
              <Text mt={1} fontSize="xs" color="#7B645B">
                {topSoldProduct
                  ? `${topSoldProduct.name} (${topSoldProduct.quantity} ${topSoldProduct.unit})`
                  : "No sales movement yet"}
              </Text>
            </AppCard>
            <AppCard p={4}>
              <Text fontSize="sm" color="#7B645B">Estimated Profit</Text>
              <Text fontSize="2xl" fontWeight={900}>{formatCurrency(productStats.totalEstimatedProfit)}</Text>
              <Text mt={1} fontSize="xs" color="#7B645B">
                Purchase {formatCurrency(productStats.totalPurchasedAmount)}
              </Text>
            </AppCard>
          </>
        ) : (
          <>
            <AppCard p={4}><Text fontSize="sm" color="#7B645B">Purchase Orders</Text><Text fontSize="2xl" fontWeight={900}>{stats.totalPurchaseOrders}</Text></AppCard>
            <AppCard p={4}><Text fontSize="sm" color="#7B645B">Purchase Amount</Text><Text fontSize="2xl" fontWeight={900}>{formatCurrency(stats.totalPurchaseAmount)}</Text></AppCard>
            <AppCard p={4}><Text fontSize="sm" color="#7B645B">Suppliers</Text><Text fontSize="2xl" fontWeight={900}>{stats.totalSuppliers}</Text></AppCard>
            <AppCard p={4}><Text fontSize="sm" color="#7B645B">Products</Text><Text fontSize="2xl" fontWeight={900}>{stats.totalProducts}</Text></AppCard>
            <AppCard p={4}>
              <Text fontSize="sm" color="#7B645B">Last Bill Amount</Text>
              <Text fontSize="2xl" fontWeight={900}>
                {latestPurchase ? formatCurrency(latestPurchase.totalAmount) : "-"}
              </Text>
              <Text mt={1} fontSize="xs" color="#7B645B">
                {latestPurchase ? latestPurchase.purchaseNumber : "No bill yet"}
              </Text>
            </AppCard>
          </>
        )}
      </SimpleGrid>

      <Input
        ref={purchaseBulkInputRef}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        display="none"
        onChange={(event) => void handlePurchaseBulkFileSelect(event)}
      />
      <Input
        ref={productBulkInputRef}
        type="file"
        accept=".csv,text/csv"
        display="none"
        onChange={(event) => void handleProductBulkFileSelect(event)}
      />

      <Tabs
        variant="soft-rounded"
        colorScheme="brand"
        index={activeTabIndex}
        onChange={standalone ? undefined : setActiveTabIndex}
      >
        <Box
          display="flex"
          flexDirection={{ base: "column", lg: "row" }}
          justifyContent="space-between"
          alignItems={{ base: "stretch", lg: "center" }}
          gap={3}
          minW={0}
        >
          {standalone ? (
            <Text fontSize="2xl" fontWeight={900}>
              {isOrdersSection ? "Purchase Orders" : "Products"}
            </Text>
          ) : (
            <TabList gap={3} flexWrap="wrap">
              <Tab>Purchase Orders</Tab>
              <Tab>Products</Tab>
            </TabList>
          )}
          <HStack
            spacing={2}
            flexWrap={{ base: "wrap", lg: "nowrap" }}
            justify={{ base: "stretch", lg: "flex-end" }}
            align={{ base: "stretch", lg: "center" }}
          >
            {isOrdersSection ? (
              <>
                <AppButton
                  variant="outline"
                  leftIcon={<Download size={16} />}
                  onClick={() => void handleDownloadPurchaseTemplate()}
                  isLoading={purchaseBulkTemplateLoading}
                >
                  Template
                </AppButton>
                <AppButton
                  variant="outline"
                  leftIcon={<Upload size={16} />}
                  onClick={openPurchaseBulkPicker}
                  isLoading={purchaseBulkUploadLoading}
                >
                  Upload
                </AppButton>
                <AppButton
                  variant="outline"
                  leftIcon={<History size={16} />}
                  onClick={openPurchaseBulkHistory}
                  isLoading={purchaseBulkHistoryLoading}
                >
                  History
                </AppButton>
              </>
            ) : (
              <>
                <AppButton
                  variant="outline"
                  leftIcon={<Download size={16} />}
                  onClick={() => void handleDownloadProductTemplate()}
                  isLoading={productBulkTemplateLoading}
                >
                  Template
                </AppButton>
                <AppButton
                  variant="outline"
                  leftIcon={<Upload size={16} />}
                  onClick={openProductBulkPicker}
                  isLoading={productBulkUploadLoading}
                >
                  Upload CSV
                </AppButton>
              </>
            )}
            <AppButton
              leftIcon={<Plus size={16} />}
              onClick={isOrdersSection ? openCreateOrder : openCreateProduct}
              alignSelf={{ base: "stretch", lg: "flex-end" }}
              minW={{ lg: "170px" }}
              whiteSpace="nowrap"
            >
              {isOrdersSection ? "New Purchase" : "Add Product"}
            </AppButton>
          </HStack>
        </Box>
        <TabPanels pt={4}>
          <TabPanel px={0}>
            <AppCard>
              <SimpleGrid columns={{ base: 1, md: 2, xl: 3, "2xl": 5 }} spacing={3} alignItems="end" minW={0}>
                <GridItem minW={0}>
                  <AppInput
                    label="Search"
                    placeholder="Search purchase number or supplier"
                    value={orderSearch}
                    onChange={(event) => setOrderSearch((event.target as HTMLInputElement).value)}
                  />
                </GridItem>
                <GridItem minW={0}>
                  <AppSearchableSelect
                    label="Supplier"
                    value={orderSupplierFilter}
                    options={supplierOptions}
                    onValueChange={setOrderSupplierFilter}
                  />
                </GridItem>
                <GridItem minW={0}>
                  <AppInput
                    label="From Date"
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom((event.target as HTMLInputElement).value)}
                  />
                </GridItem>
                <GridItem minW={0}>
                  <AppInput
                    label="To Date"
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo((event.target as HTMLInputElement).value)}
                  />
                </GridItem>
                <GridItem minW={0}>
                  <FormControl>
                    <FormLabel>Rows per page</FormLabel>
                    <Select
                      value={orderLimit}
                      onChange={(event) => setOrderLimit(Number((event.target as HTMLSelectElement).value))}
                      isDisabled
                      bg="white"
                      borderColor="rgba(193, 14, 14, 0.18)"
                      focusBorderColor="brand.400"
                    >
                      <option value={10}>10</option>
                    </Select>
                  </FormControl>
                </GridItem>
              </SimpleGrid>

              <Box mt={4} minW={0}>
                {ordersLoading ? (
                  <SkeletonTable rows={5} />
                ) : (
                  <DataTable
                    columns={orderColumns}
                    rows={orderRows}
                    emptyState={<EmptyState title="No purchase orders found" description="Create a new purchase order to restock ingredients and products." />}
                  />
                )}
              </Box>

              <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
                <Text color="#6F594F" fontSize="sm">Showing {orderRows.length} of {orderPagination.total} records</Text>
                <HStack flexWrap="wrap">
                  <AppButton variant="outline" isDisabled={orderPage <= 1} onClick={() => setOrderPage((prev) => prev - 1)}>Previous</AppButton>
                  <Text fontWeight={700}>Page {orderPagination.page} of {orderPagination.totalPages}</Text>
                  <AppButton variant="outline" isDisabled={orderPagination.page >= orderPagination.totalPages} onClick={() => setOrderPage((prev) => prev + 1)}>Next</AppButton>
                </HStack>
              </HStack>
              <Text mt={2} color="#6F594F" fontSize="sm">Filtered Total Amount: {formatCurrency(orderStats.totalAmount)}</Text>
            </AppCard>

            <Box ref={purchaseBulkHistorySectionRef} mt={4} scrollMarginTop="24px">
            <AppCard>
              <HStack justify="space-between" align="flex-start" gap={3} flexWrap="wrap" mb={4}>
                <Box>
                  <Text fontSize="xl" fontWeight={900}>Purchase Bulk Upload History</Text>
                  <Text color="#6F594F" fontSize="sm">
                    Upload pannina file-wise summary and row-wise inserted / not inserted details.
                  </Text>
                </Box>
                <AppButton
                  variant="outline"
                  leftIcon={<History size={16} />}
                  onClick={() => void loadPurchaseBulkHistory(1)}
                  isLoading={purchaseBulkHistoryLoading}
                >
                  Refresh History
                </AppButton>
              </HStack>

              {purchaseBulkHistoryLoading ? (
                <SkeletonTable rows={4} />
              ) : (
                <DataTable
                  columns={[
                    {
                      key: "createdAt",
                      header: "Uploaded At",
                      render: (row: PurchaseBulkImportHistoryItem) => formatDateTime(row.createdAt)
                    },
                    {
                      key: "fileName",
                      header: "File",
                      render: (row: PurchaseBulkImportHistoryItem) => (
                        <Box>
                          <Text fontWeight={800}>{row.fileName}</Text>
                          <Text fontSize="xs" color="#7A6359">{formatPurchaseSectionLabel(row.purchaseSection)}</Text>
                        </Box>
                      )
                    },
                    {
                      key: "insertedRows",
                      header: "Inserted",
                      render: (row: PurchaseBulkImportHistoryItem) => row.insertedRows
                    },
                    {
                      key: "notInserted",
                      header: "Not Inserted",
                      render: (row: PurchaseBulkImportHistoryItem) => row.skippedDuplicateRows + row.failedRows
                    },
                    {
                      key: "createdOrders",
                      header: "Orders / Products",
                      render: (row: PurchaseBulkImportHistoryItem) =>
                        `${row.createdOrders?.length ?? 0} orders / ${row.createdProducts ?? 0} products`
                    },
                    {
                      key: "actions",
                      header: "Actions",
                      render: (row: PurchaseBulkImportHistoryItem) => (
                        <HStack flexWrap="wrap">
                          <AppButton
                            size="sm"
                            variant="outline"
                            leftIcon={<Eye size={14} />}
                            onClick={() => {
                              setPurchaseBulkSummary(row);
                              setPurchaseBulkDetailsPage(1);
                              window.setTimeout(() => {
                                purchaseBulkDetailsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                              }, 50);
                            }}
                          >
                            Show Rows
                          </AppButton>
                          <AppButton
                            size="sm"
                            variant="outline"
                            leftIcon={<Trash2 size={14} />}
                            onClick={() => openDeletePurchaseBulkImport(row)}
                            isDisabled={!(row.createdOrders?.length ?? 0) || mutationLoading}
                          >
                            Delete
                          </AppButton>
                        </HStack>
                      )
                    }
                  ]}
                  rows={purchaseBulkHistoryRows}
                  emptyState={<EmptyState title="No upload history" description="Upload history refresh pannunga or new bulk upload pannunga." />}
                />
              )}

              {purchaseBulkHistoryRows.length ? (
                <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
                  <Text color="#6F594F" fontSize="sm">
                    Showing {purchaseBulkHistoryRows.length} of {purchaseBulkHistoryPagination.total} uploads
                  </Text>
                  <HStack flexWrap="wrap">
                    <AppButton
                      variant="outline"
                      isDisabled={purchaseBulkHistoryPagination.page <= 1 || purchaseBulkHistoryLoading}
                      onClick={() => {
                        const nextPage = Math.max(1, purchaseBulkHistoryPagination.page - 1);
                        setPurchaseBulkHistoryPage(nextPage);
                        void loadPurchaseBulkHistory(nextPage);
                      }}
                    >
                      Previous
                    </AppButton>
                    <Text fontWeight={700}>
                      Page {purchaseBulkHistoryPagination.page} of {purchaseBulkHistoryPagination.totalPages}
                    </Text>
                    <AppButton
                      variant="outline"
                      isDisabled={
                        purchaseBulkHistoryPagination.page >= purchaseBulkHistoryPagination.totalPages ||
                        purchaseBulkHistoryLoading
                      }
                      onClick={() => {
                        const nextPage = Math.min(
                          purchaseBulkHistoryPagination.totalPages,
                          purchaseBulkHistoryPagination.page + 1
                        );
                        setPurchaseBulkHistoryPage(nextPage);
                        void loadPurchaseBulkHistory(nextPage);
                      }}
                    >
                      Next
                    </AppButton>
                  </HStack>
                </HStack>
              ) : null}

              {purchaseBulkSummary ? (
                <Box ref={purchaseBulkDetailsSectionRef} mt={4} scrollMarginTop="24px">
                <AppCard p={4} bg="rgba(255, 250, 242, 0.95)" borderColor="rgba(133, 78, 48, 0.22)">
                  <HStack justify="space-between" align="flex-start" gap={3} flexWrap="wrap" mb={4}>
                    <Box>
                      <Text fontWeight={900}>Selected Upload Row Details</Text>
                      <Text fontSize="sm" color="#7A6359">
                        {purchaseBulkSummary.fileName ?? "Latest upload"} | {purchaseBulkSummary.insertedRows} inserted,{" "}
                        {purchaseBulkSummary.skippedDuplicateRows + purchaseBulkSummary.failedRows} not inserted.
                      </Text>
                    </Box>
                    <HStack align="flex-start" gap={3} flexWrap="wrap">
                      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} minW={{ base: "full", md: "420px" }}>
                        <Box><Text fontSize="xs" color="#7B645B">Inserted</Text><Text fontWeight={900}>{purchaseBulkSummary.insertedRows}</Text></Box>
                        <Box><Text fontSize="xs" color="#7B645B">Duplicate</Text><Text fontWeight={900}>{purchaseBulkSummary.skippedDuplicateRows}</Text></Box>
                        <Box><Text fontSize="xs" color="#7B645B">Failed</Text><Text fontWeight={900}>{purchaseBulkSummary.failedRows}</Text></Box>
                        <Box><Text fontSize="xs" color="#7B645B">Total Rows</Text><Text fontWeight={900}>{purchaseBulkSummary.totalRows}</Text></Box>
                      </SimpleGrid>
                      <AppButton variant="outline" onClick={() => setPurchaseBulkSummary(null)}>
                        Close Rows
                      </AppButton>
                    </HStack>
                  </HStack>
                  <DataTable
                    columns={[
                      {
                        key: "rowNumber",
                        header: "Row",
                        render: (row: PurchaseBulkRowDetail) => <Text fontWeight={800}>#{row.rowNumber}</Text>
                      },
                      {
                        key: "status",
                        header: "Status",
                        render: (row: PurchaseBulkRowDetail) => {
                          const tone =
                            row.status === "inserted"
                              ? { bg: "green.100", color: "green.700", label: "Inserted" }
                              : row.status === "skipped_duplicate"
                                ? { bg: "orange.100", color: "orange.700", label: "Duplicate" }
                                : { bg: "red.100", color: "red.700", label: "Failed" };
                          return (
                            <Box px={3} py={1} borderRadius="full" bg={tone.bg} color={tone.color} fontSize="xs" fontWeight={800} w="fit-content">
                              {tone.label}
                            </Box>
                          );
                        }
                      },
                      {
                        key: "itemName",
                        header: "Item / Supplier",
                        render: (row: PurchaseBulkRowDetail) => (
                          <Box>
                            <Text fontWeight={700}>{row.itemName || "-"}</Text>
                            <Text fontSize="xs" color="#7A6359">{row.supplierName || "-"}</Text>
                          </Box>
                        )
                      },
                      {
                        key: "quantity",
                        header: "Qty",
                        render: (row: PurchaseBulkRowDetail) =>
                          row.quantity === null || row.quantity === undefined ? "-" : `${row.quantity} ${row.quantityUnit || "pcs"}`
                      },
                      {
                        key: "unitPrice",
                        header: "Unit Price",
                        render: (row: PurchaseBulkRowDetail) =>
                          row.unitPrice === null || row.unitPrice === undefined ? "-" : formatCurrency(row.unitPrice)
                      },
                      {
                        key: "grandTotal",
                        header: "Grand Total",
                        render: (row: PurchaseBulkRowDetail) =>
                          row.grandTotal === null || row.grandTotal === undefined ? "-" : formatCurrency(row.grandTotal)
                      },
                      {
                        key: "purchaseNumber",
                        header: "Purchase",
                        render: (row: PurchaseBulkRowDetail) => row.purchaseNumber || "-"
                      },
                      {
                        key: "reason",
                        header: "Reason",
                        render: (row: PurchaseBulkRowDetail) => row.reason || "-"
                      }
                    ]}
                    rows={paginatedPurchaseBulkRowDetails}
                    emptyState={<EmptyState title="No row details" description="Select an upload to see row details." />}
                  />
                  <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
                    <Text color="#6F594F" fontSize="sm">
                      Showing {paginatedPurchaseBulkRowDetails.length} of {purchaseBulkRowDetails.length} rows
                    </Text>
                    <HStack flexWrap="wrap">
                      <AppButton
                        variant="outline"
                        isDisabled={purchaseBulkDetailsCurrentPage <= 1}
                        onClick={() => setPurchaseBulkDetailsPage((current) => Math.max(1, current - 1))}
                      >
                        Previous
                      </AppButton>
                      <Text fontWeight={700}>
                        Page {purchaseBulkDetailsCurrentPage} of {purchaseBulkDetailsTotalPages}
                      </Text>
                      <AppButton
                        variant="outline"
                        isDisabled={purchaseBulkDetailsCurrentPage >= purchaseBulkDetailsTotalPages}
                        onClick={() =>
                          setPurchaseBulkDetailsPage((current) =>
                            Math.min(purchaseBulkDetailsTotalPages, current + 1)
                          )
                        }
                      >
                        Next
                      </AppButton>
                    </HStack>
                  </HStack>
                </AppCard>
                </Box>
              ) : null}
            </AppCard>
            </Box>
          </TabPanel>

          <TabPanel px={0}>
            <AppCard>
              <AppCard
                title="Product Stock & Sales Ledger"
                subtitle="Full product history is shown by default. Apply filters only when needed."
                p={4}
              >
                <VStack spacing={4} align="stretch">
                  <SimpleGrid columns={{ base: 1, md: 2, xl: 7 }} spacing={3}>
                    <AppInput
                      label="Search Product"
                      placeholder="Filter ledger rows"
                      value={productLedgerSearch}
                      onChange={(event) => setProductLedgerSearch((event.target as HTMLInputElement).value)}
                    />
                    <AppSearchableSelect
                      label="Product"
                      value={productLedgerProductId}
                      options={ledgerProductOptions}
                      onValueChange={setProductLedgerProductId}
                    />
                    <AppSearchableSelect
                      label="Section"
                      value={productLedgerTargetSection}
                      options={ledgerTargetSectionOptions}
                      onValueChange={(value) => setProductLedgerTargetSection(value as ProductTargetSection)}
                      isDisabled
                    />
                    <AppInput
                      label="Date From"
                      type="date"
                      value={productLedgerDateFrom}
                      onChange={(event) => setProductLedgerDateFrom((event.target as HTMLInputElement).value)}
                    />
                    <AppInput
                      label="Date To"
                      type="date"
                      value={productLedgerDateTo}
                      onChange={(event) => setProductLedgerDateTo((event.target as HTMLInputElement).value)}
                    />
                    <FormControl>
                      <FormLabel>Rows per page</FormLabel>
                      <Select
                        value={String(productLedgerLimit)}
                        onChange={(event) => setProductLedgerLimit(Number((event.target as HTMLSelectElement).value))}
                        isDisabled
                        bg="white"
                        borderColor="rgba(193, 14, 14, 0.18)"
                        focusBorderColor="brand.400"
                      >
                        <option value={10}>10</option>
                      </Select>
                    </FormControl>
                    <Box alignSelf={{ base: "stretch", xl: "end" }}>
                      <AppButton w={{ base: "full", xl: "auto" }} onClick={() => void loadProductLedger()}>
                        Refresh Ledger
                      </AppButton>
                    </Box>
                  </SimpleGrid>

                  <SimpleGrid columns={{ base: 1, sm: 2, xl: 6 }} spacing={3}>
                    <AppCard p={3}>
                      <Text fontSize="xs" color="#7B645B">Products</Text>
                      <Text fontSize="xl" fontWeight={900}>{productLedgerStats.totalProducts}</Text>
                    </AppCard>
                    <AppCard p={3}>
                      <Text fontSize="xs" color="#7B645B">Opening Stock</Text>
                      <Text fontSize="xl" fontWeight={900}>{productLedgerStats.totalOpeningStock}</Text>
                    </AppCard>
                    <AppCard p={3}>
                      <Text fontSize="xs" color="#7B645B">Purchased</Text>
                      <Text fontSize="xl" fontWeight={900} color="green.700">{productLedgerStats.totalPurchased}</Text>
                    </AppCard>
                    <AppCard p={3}>
                      <Text fontSize="xs" color="#7B645B">Total Consumption</Text>
                      <Text fontSize="xl" fontWeight={900}>{productLedgerStats.totalConsumption}</Text>
                    </AppCard>
                    <AppCard p={3}>
                      <Text fontSize="xs" color="#7B645B">Dip & Dash Used</Text>
                      <Text fontSize="xl" fontWeight={900}>{productLedgerStats.dipAndDashConsumption}</Text>
                    </AppCard>
                    <AppCard p={3}>
                      <Text fontSize="xs" color="#7B645B">Snooker Used</Text>
                      <Text fontSize="xl" fontWeight={900}>{productLedgerStats.snookerConsumption}</Text>
                    </AppCard>
                  </SimpleGrid>

                  {productLedgerLoading ? (
                    <SkeletonTable />
                  ) : (
                    <DataTable
                      columns={[
                        {
                          key: "date",
                          header: "Date",
                          render: (row: ProductDayLedgerResponse["rows"][number]) => row.date
                        },
                        {
                          key: "productName",
                          header: "Product",
                          render: (row: ProductDayLedgerResponse["rows"][number]) => (
                            <Box>
                              <Text fontWeight={800}>{row.productName}</Text>
                              <Text fontSize="sm" color="#7A6359">
                                {row.category} | {row.unit.toUpperCase()}
                              </Text>
                              {row.isAdjusted ? (
                                <Text fontSize="xs" color="#9A3412" fontWeight={700}>
                                  Manually adjusted
                                </Text>
                              ) : null}
                              {row.adjustmentNote ? (
                                <Text fontSize="xs" color="#7A6359">
                                  {row.adjustmentNote}
                                </Text>
                              ) : null}
                            </Box>
                          )
                        },
                        {
                          key: "section",
                          header: "Section",
                          render: (row: ProductDayLedgerResponse["rows"][number]) => formatTargetSectionLabel(row.targetSection)
                        },
                        {
                          key: "openingStock",
                          header: "Opening",
                          render: (row: ProductDayLedgerResponse["rows"][number]) => `${row.openingStock} ${row.unit}`
                        },
                        {
                          key: "purchased",
                          header: "Purchase",
                          render: (row: ProductDayLedgerResponse["rows"][number]) => `${row.purchased} ${row.unit}`
                        },
                        {
                          key: "consumption",
                          header: "Consumption",
                          render: (row: ProductDayLedgerResponse["rows"][number]) => `${row.consumption} ${row.unit}`
                        },
                        {
                          key: "dipAndDashConsumption",
                          header: "Dip Used",
                          render: (row: ProductDayLedgerResponse["rows"][number]) => `${row.dipAndDashConsumption} ${row.unit}`
                        },
                        {
                          key: "snookerConsumption",
                          header: "Snooker Used",
                          render: (row: ProductDayLedgerResponse["rows"][number]) => `${row.snookerConsumption} ${row.unit}`
                        },
                        {
                          key: "closingStock",
                          header: "Closing",
                          render: (row: ProductDayLedgerResponse["rows"][number]) => (
                            <Text fontWeight={800}>{row.closingStock} {row.unit}</Text>
                          )
                        },
                        {
                          key: "stockHealth",
                          header: "Health",
                          render: (row: ProductDayLedgerResponse["rows"][number]) => (
                            <Box
                              px={3}
                              py={1}
                              borderRadius="full"
                              bg={row.stockHealth === "LOW_STOCK" ? "red.100" : "green.100"}
                              color={row.stockHealth === "LOW_STOCK" ? "red.700" : "green.700"}
                              fontSize="xs"
                              fontWeight={700}
                              w="fit-content"
                            >
                              {row.stockHealth === "LOW_STOCK" ? "Low Stock" : "Healthy"}
                            </Box>
                          )
                        },
                        {
                          key: "actions",
                          header: "Actions",
                          render: (row: ProductDayLedgerResponse["rows"][number]) => (
                            <HStack spacing={2}>
                              <ActionIconButton
                                aria-label="Edit ledger record"
                                tooltip="Edit ledger record"
                                icon={<Edit2 size={16} />}
                                variant="outline"
                                onClick={() => openEditProductFromLedger(row)}
                              />
                              <ActionIconButton
                                aria-label="Reset manual ledger override"
                                tooltip={row.isAdjusted ? "Reset manual adjustment" : "No manual adjustment"}
                                icon={<RotateCcw size={16} />}
                                variant="outline"
                                isDisabled={!row.isAdjusted}
                                onClick={() => openResetLedgerRecord(row)}
                              />
                              <ActionIconButton
                                aria-label="Delete ledger row"
                                tooltip="Delete this ledger row only"
                                icon={<Trash2 size={16} />}
                                variant="outline"
                                colorScheme="accentRed"
                                onClick={() => openDeleteLedgerRow(row)}
                              />
                            </HStack>
                          )
                        }
                      ]}
                      rows={productLedgerRows}
                      emptyState={
                        <EmptyState
                          title="No ledger rows found"
                          description="No product ledger rows found for selected filters."
                        />
                      }
                    />
                  )}

                  <HStack justify="space-between" flexWrap="wrap" gap={3}>
                    <Text color="#6F594F" fontSize="sm">
                      Showing {productLedgerRows.length} of {productLedgerPagination.total} records
                    </Text>
                    <HStack flexWrap="wrap">
                      <AppButton
                        variant="outline"
                        isDisabled={productLedgerPage <= 1}
                        onClick={() => setProductLedgerPage((prev) => prev - 1)}
                      >
                        Previous
                      </AppButton>
                      <Text fontWeight={700}>
                        Page {productLedgerPagination.page} of {productLedgerPagination.totalPages}
                      </Text>
                      <AppButton
                        variant="outline"
                        isDisabled={productLedgerPagination.page >= productLedgerPagination.totalPages}
                        onClick={() => setProductLedgerPage((prev) => prev + 1)}
                      >
                        Next
                      </AppButton>
                    </HStack>
                  </HStack>
                </VStack>
              </AppCard>

              <Tabs variant="soft-rounded" colorScheme="brand" mt={4}>
                <TabList gap={3} flexWrap="wrap">
                  <Tab>Products</Tab>
                  <Tab>Stocks Overview</Tab>
                </TabList>
                <TabPanels pt={4}>
                  <TabPanel px={0}>
                    <SimpleGrid columns={{ base: 1, md: 2, "2xl": 4 }} spacing={3} alignItems="end" minW={0}>
                      <GridItem minW={0}>
                        <AppInput
                          label="Search Product"
                          placeholder="Search name, sku, pack size"
                          value={productSearch}
                          onChange={(event) => setProductSearch((event.target as HTMLInputElement).value)}
                        />
                      </GridItem>
                      <GridItem minW={0}>
                        <AppSearchableSelect
                          label="Category"
                          value={productCategoryFilter}
                          options={categoryFilterOptions}
                          onValueChange={setProductCategoryFilter}
                        />
                      </GridItem>
                      <GridItem minW={0}>
                        <AppSearchableSelect
                          label="Supplier"
                          value={productSupplierFilter}
                          options={supplierOptions}
                          onValueChange={setProductSupplierFilter}
                        />
                      </GridItem>
                      <GridItem minW={0}>
                        <FormControl>
                          <FormLabel>Rows per page</FormLabel>
                          <Select
                            value={productLimit}
                            onChange={(event) => setProductLimit(Number((event.target as HTMLSelectElement).value))}
                            isDisabled
                            bg="white"
                            borderColor="rgba(193, 14, 14, 0.18)"
                            focusBorderColor="brand.400"
                          >
                            <option value={10}>10</option>
                          </Select>
                        </FormControl>
                      </GridItem>
                    </SimpleGrid>

                    <SimpleGrid mt={4} minChildWidth={{ base: "150px", md: "180px", xl: "200px" }} spacing={3}>
                      <AppCard p={3}><Text fontSize="xs" color="#7B645B">Total Products</Text><Text fontSize="xl" fontWeight={900}>{productStats.totalProducts}</Text></AppCard>
                      <AppCard p={3}><Text fontSize="xs" color="#7B645B">Low Stock</Text><Text fontSize="xl" fontWeight={900} color="#B91C1C">{productStats.lowStockProducts}</Text></AppCard>
                      <AppCard p={3}><Text fontSize="xs" color="#7B645B">Stock Valuation</Text><Text fontSize="xl" fontWeight={900}>{formatCurrency(productStats.stockValuation)}</Text></AppCard>
                      <AppCard p={3}><Text fontSize="xs" color="#7B645B">Sold Qty</Text><Text fontSize="xl" fontWeight={900}>{productStats.totalSoldQuantity}</Text></AppCard>
                      <AppCard p={3}><Text fontSize="xs" color="#7B645B">Sold Amount</Text><Text fontSize="xl" fontWeight={900}>{formatCurrency(productStats.totalSoldAmount)}</Text></AppCard>
                    </SimpleGrid>

                    <AppCard mt={4} p={4}>
                      <Text fontWeight={800} mb={3}>
                        Top Purchased Products
                      </Text>
                      {productStats.topPurchasedProducts.length ? (
                        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
                          {productStats.topPurchasedProducts.map((entry) => (
                            <Box
                              key={entry.productId}
                              border="1px solid"
                              borderColor="rgba(133, 78, 48, 0.22)"
                              borderRadius="12px"
                              p={3}
                              bg="white"
                            >
                              <Text fontWeight={800}>{entry.name}</Text>
                              <Text fontSize="sm" color="#7A6359">
                                {entry.quantity} {entry.unit}
                              </Text>
                            </Box>
                          ))}
                        </SimpleGrid>
                      ) : (
                        <Text color="#7A6359">No purchase movement yet.</Text>
                      )}
                    </AppCard>

                    <AppCard mt={4} p={4}>
                      <Text fontWeight={800} mb={3}>
                        Top Sold Products
                      </Text>
                      {productStats.topSoldProducts.length ? (
                        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
                          {productStats.topSoldProducts.map((entry) => (
                            <Box
                              key={`sold-${entry.productId}`}
                              border="1px solid"
                              borderColor="rgba(133, 78, 48, 0.22)"
                              borderRadius="12px"
                              p={3}
                              bg="white"
                            >
                              <Text fontWeight={800}>{entry.name}</Text>
                              <Text fontSize="sm" color="#7A6359">
                                {entry.quantity} {entry.unit}
                              </Text>
                            </Box>
                          ))}
                        </SimpleGrid>
                      ) : (
                        <Text color="#7A6359">No sales movement yet.</Text>
                      )}
                    </AppCard>

                    <Box mt={4}>
                      {productsLoading ? (
                        <SkeletonTable rows={5} />
                      ) : (
                        <DataTable
                          columns={[
                            {
                              key: "name",
                              header: "Product",
                          render: (row: ProductListItem) => (
                            <Box>
                              <Text fontWeight={800} color={row.expiryStatus === "EXPIRED" ? "red.700" : "#2D1D17"}>
                                {row.name}
                              </Text>
                              <Text fontSize="sm" color="#7A6359">
                                {row.sku || "-"}
                                {row.packSize ? ` | ${row.packSize}` : ""}
                              </Text>
                            </Box>
                          )
                        },
                        { key: "category", header: "Category", render: (row: ProductListItem) => row.category },
                        {
                          key: "section",
                          header: "Section",
                          render: (row: ProductListItem) => formatTargetSectionLabel(row.targetSection)
                        },
                        { key: "stock", header: "Stock", render: (row: ProductListItem) => `${row.currentStock} ${row.unit}` },
                        {
                          key: "assignedSplit",
                          header: "Assigned Split",
                          render: (row: ProductListItem) => (
                            <Box>
                              <Text fontSize="sm">Dip: {row.dipAndDashAssignedStock}</Text>
                              <Text fontSize="sm">Snooker: {row.gamingAssignedStock}</Text>
                            </Box>
                          )
                        },
                        { key: "minStock", header: "Min Stock", render: (row: ProductListItem) => `${row.minStock} ${row.unit}` },
                        {
                          key: "purchasePrice",
                          header: "Purchase Price",
                          render: (row: ProductListItem) => formatCurrency(row.purchaseUnitPrice)
                        },
                        {
                          key: "sellingPrice",
                          header: "Selling Price",
                          render: (row: ProductListItem) => formatCurrency(row.sellingPrice)
                        },
                        {
                          key: "soldQuantity",
                          header: "Sold Qty",
                          render: (row: ProductListItem) => `${row.soldQuantity} ${row.unit}`
                        },
                        {
                          key: "soldAmount",
                          header: "Sold Amount",
                          render: (row: ProductListItem) => formatCurrency(row.soldAmount)
                        },
                        {
                          key: "profit",
                          header: "Est. Profit",
                          render: (row: ProductListItem) => formatCurrency(row.estimatedProfit)
                        },
                        { key: "valuation", header: "Valuation", render: (row: ProductListItem) => formatCurrency(row.valuation) },
                        {
                          key: "ageing",
                          header: "Ageing",
                          render: (row: ProductListItem) => {
                            const badge = getExpiryBadge(row);
                            const bgByTone = {
                              red: "red.100",
                              orange: "orange.100",
                              green: "green.100",
                              neutral: "gray.100"
                            } as const;
                            const colorByTone = {
                              red: "red.700",
                              orange: "orange.700",
                              green: "green.700",
                              neutral: "gray.700"
                            } as const;
                            return (
                              <Box>
                                <Box
                                  px={3}
                                  py={1}
                                  borderRadius="full"
                                  bg={bgByTone[badge.tone]}
                                  color={colorByTone[badge.tone]}
                                  fontSize="xs"
                                  fontWeight={700}
                                  w="fit-content"
                                >
                                  {badge.label}
                                </Box>
                                {row.nextExpiryDate || row.latestExpiryDate ? (
                                  <Text mt={1} fontSize="xs" color="#7A6359">
                                    {formatDate(row.nextExpiryDate ?? row.latestExpiryDate ?? "")}
                                  </Text>
                                ) : null}
                              </Box>
                            );
                          }
                        },
                        { key: "status", header: "Status", render: (row: ProductListItem) => <Box px={3} py={1} borderRadius="full" bg={row.stockStatus === "LOW_STOCK" ? "red.100" : "green.100"} color={row.stockStatus === "LOW_STOCK" ? "red.700" : "green.700"} fontSize="xs" fontWeight={700} w="fit-content">{row.stockStatus === "LOW_STOCK" ? "Low Stock" : "Healthy"}</Box> },
                        { key: "actions", header: "Actions", render: (row: ProductListItem) => <HStack spacing={2}><ActionIconButton aria-label="Edit product" tooltip="Edit product" icon={<Edit2 size={16} />} variant="outline" onClick={() => openEditProduct(row)} /><ActionIconButton aria-label="Delete product" tooltip="Delete product" icon={<Trash2 size={16} />} variant="outline" colorScheme="accentRed" onClick={() => openDeleteProduct(row)} /></HStack> }
                          ]}
                          rows={productRows}
                          emptyState={<EmptyState title="No products found" description="Add products like 7up, chocolate, tin items and track stock." />}
                        />
                      )}
                    </Box>

                    <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
                      <Text color="#6F594F" fontSize="sm">Showing {productRows.length} of {productPagination.total} records</Text>
                      <HStack flexWrap="wrap">
                        <AppButton variant="outline" isDisabled={productPage <= 1} onClick={() => setProductPage((prev) => prev - 1)}>Previous</AppButton>
                        <Text fontWeight={700}>Page {productPagination.page} of {productPagination.totalPages}</Text>
                        <AppButton variant="outline" isDisabled={productPagination.page >= productPagination.totalPages} onClick={() => setProductPage((prev) => prev + 1)}>Next</AppButton>
                      </HStack>
                    </HStack>
                  </TabPanel>
                  <TabPanel px={0}>
                    {stockOverviewSection}
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </AppCard>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {orderModal.isOpen ? (
        <PurchaseOrderModal
          isOpen={orderModal.isOpen}
          onClose={() => {
            orderModal.onClose();
            setOrderFormMode("create");
            setOrderFormBootstrapping(false);
            setEditingOrder(null);
          }}
          loading={mutationLoading}
          mode={orderFormMode}
          initialPurchaseSection={editingOrder?.purchaseSection ?? newPurchaseSection}
          isBootstrapping={orderFormBootstrapping}
          meta={meta}
          initialData={editingOrder}
          onLoadMetaForDate={loadMeta}
          onSubmit={handleSaveOrder}
        />
      ) : null}

      {productModal.isOpen ? (
        <ProductFormModal
          isOpen={productModal.isOpen}
          onClose={() => {
            productModal.onClose();
            setSelectedProduct(null);
          }}
          loading={mutationLoading}
          initialData={selectedProduct}
          suppliers={suppliers}
          units={units}
          forcedTargetSection={scopedTargetSection}
          onSubmit={handleSaveProduct}
        />
      ) : null}

      {ledgerEditModal.isOpen ? (
        <ProductLedgerEditModal
          isOpen={ledgerEditModal.isOpen}
          onClose={() => {
            ledgerEditModal.onClose();
            setEditingLedgerRow(null);
          }}
          loading={mutationLoading}
          row={editingLedgerRow}
          productOptions={productLedgerEditOptions}
          onSubmit={handleSaveLedgerRecord}
        />
      ) : null}

      {stockHistoryModal.isOpen ? (
        <Modal
          isOpen={stockHistoryModal.isOpen}
          onClose={() => {
            stockHistoryModal.onClose();
            setStockHistoryProduct(null);
            setStockHistoryData(null);
            setStockHistoryPurchasePage(1);
            setStockHistoryConsumptionPage(1);
          }}
          size="7xl"
          closeOnOverlayClick={false}
        >
          <ModalOverlay />
          <ModalContent borderRadius="16px">
            <ModalHeader>
              Product Stock History
              {stockHistoryProduct ? (
                <Text mt={1} fontSize="sm" color="#7A6359" fontWeight={500}>
                  {stockHistoryProduct.name} | {stockHistoryProduct.category}
                </Text>
              ) : null}
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              {stockHistoryLoading ? (
                <SkeletonTable rows={8} />
              ) : stockHistoryData ? (
                <VStack align="stretch" spacing={4}>
                  <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                    <AppCard p={3}>
                      <Text fontSize="xs" color="#7B645B">Total Purchase</Text>
                      <Text fontSize="xl" fontWeight={900}>
                        {stockHistoryData.summary.totalPurchasedQuantity} {stockHistoryData.product.unit}
                      </Text>
                    </AppCard>
                    <AppCard p={3}>
                      <Text fontSize="xs" color="#7B645B">Total Consumption</Text>
                      <Text fontSize="xl" fontWeight={900}>
                        {stockHistoryData.summary.totalConsumptionQuantity} {stockHistoryData.product.unit}
                      </Text>
                    </AppCard>
                    <AppCard p={3}>
                      <Text fontSize="xs" color="#7B645B">Current Stock</Text>
                      <Text fontSize="xl" fontWeight={900}>
                        {stockHistoryData.summary.currentStock} {stockHistoryData.product.unit}
                      </Text>
                    </AppCard>
                  </SimpleGrid>

                  <AppCard p={4}>
                    <Text fontWeight={800} mb={3}>Purchase History</Text>
                    <DataTable
                      columns={[
                        {
                          key: "purchaseDate",
                          header: "Date",
                          render: (row: ProductStockHistoryPurchaseRow) => formatDate(row.purchaseDate)
                        },
                        {
                          key: "purchaseId",
                          header: "Purchase ID",
                          render: (row: ProductStockHistoryPurchaseRow) => (
                            <Box>
                              <Text fontWeight={700}>{row.purchaseNumber}</Text>
                              <Text fontSize="xs" color="#7A6359">
                                {formatPurchaseSectionLabel(row.purchaseSection)}
                              </Text>
                            </Box>
                          )
                        },
                        {
                          key: "supplier",
                          header: "Supplier / Store",
                          render: (row: ProductStockHistoryPurchaseRow) => (
                            <Box>
                              <Text fontWeight={700}>{row.supplierName}</Text>
                              <Text fontSize="xs" color="#7A6359">{row.storeName || "-"}</Text>
                            </Box>
                          )
                        },
                        {
                          key: "quantity",
                          header: "Quantity",
                          render: (row: ProductStockHistoryPurchaseRow) =>
                            `${row.quantity} ${row.quantityUnit}`
                        },
                        {
                          key: "lineTotal",
                          header: "Amount",
                          render: (row: ProductStockHistoryPurchaseRow) => formatCurrency(row.lineTotal)
                        },
                        {
                          key: "createdAt",
                          header: "Recorded At",
                          render: (row: ProductStockHistoryPurchaseRow) => formatDateTime(row.createdAt)
                        }
                      ]}
                      rows={stockHistoryData.purchases.rows}
                      emptyState={
                        <EmptyState
                          title="No purchase history"
                          description="No purchase entries found for this product."
                        />
                      }
                    />
                    <HStack justify="space-between" mt={3} flexWrap="wrap" gap={3}>
                      <Text color="#6F594F" fontSize="sm">
                        Showing {stockHistoryData.purchases.rows.length} of {stockHistoryData.purchases.pagination.total}
                      </Text>
                      <HStack>
                        <AppButton
                          variant="outline"
                          isDisabled={stockHistoryPurchasePage <= 1}
                          onClick={() => setStockHistoryPurchasePage((prev) => prev - 1)}
                        >
                          Previous
                        </AppButton>
                        <Text fontWeight={700}>
                          Page {stockHistoryData.purchases.pagination.page} of {stockHistoryData.purchases.pagination.totalPages}
                        </Text>
                        <AppButton
                          variant="outline"
                          isDisabled={
                            stockHistoryData.purchases.pagination.page >=
                            stockHistoryData.purchases.pagination.totalPages
                          }
                          onClick={() => setStockHistoryPurchasePage((prev) => prev + 1)}
                        >
                          Next
                        </AppButton>
                      </HStack>
                    </HStack>
                  </AppCard>

                  <AppCard p={4}>
                    <Text fontWeight={800} mb={3}>Consumption History</Text>
                    <DataTable
                      columns={[
                        {
                          key: "consumptionDate",
                          header: "Date",
                          render: (row: ProductStockHistoryConsumptionRow) => formatDate(row.consumptionDate)
                        },
                        {
                          key: "invoiceId",
                          header: "Invoice ID",
                          render: (row: ProductStockHistoryConsumptionRow) => (
                            <Box>
                              <Text fontWeight={700}>{row.invoiceNumber}</Text>
                              <Text fontSize="xs" color="#7A6359">{formatOrderTypeLabel(row.orderType)}</Text>
                            </Box>
                          )
                        },
                        {
                          key: "customer",
                          header: "Customer",
                          render: (row: ProductStockHistoryConsumptionRow) => (
                            <Box>
                              <Text fontWeight={700}>{row.customerName || "Walk-in"}</Text>
                              <Text fontSize="xs" color="#7A6359">{row.customerPhone || "-"}</Text>
                            </Box>
                          )
                        },
                        {
                          key: "quantity",
                          header: "Quantity",
                          render: (row: ProductStockHistoryConsumptionRow) => `${row.quantity} ${row.unit}`
                        },
                        {
                          key: "lineTotal",
                          header: "Amount",
                          render: (row: ProductStockHistoryConsumptionRow) => formatCurrency(row.lineTotal)
                        },
                        {
                          key: "createdAt",
                          header: "Recorded At",
                          render: (row: ProductStockHistoryConsumptionRow) => formatDateTime(row.createdAt)
                        }
                      ]}
                      rows={stockHistoryData.consumptions.rows}
                      emptyState={
                        <EmptyState
                          title="No consumption history"
                          description="No consumption entries found for this product."
                        />
                      }
                    />
                    <HStack justify="space-between" mt={3} flexWrap="wrap" gap={3}>
                      <Text color="#6F594F" fontSize="sm">
                        Showing {stockHistoryData.consumptions.rows.length} of {stockHistoryData.consumptions.pagination.total}
                      </Text>
                      <HStack>
                        <AppButton
                          variant="outline"
                          isDisabled={stockHistoryConsumptionPage <= 1}
                          onClick={() => setStockHistoryConsumptionPage((prev) => prev - 1)}
                        >
                          Previous
                        </AppButton>
                        <Text fontWeight={700}>
                          Page {stockHistoryData.consumptions.pagination.page} of {stockHistoryData.consumptions.pagination.totalPages}
                        </Text>
                        <AppButton
                          variant="outline"
                          isDisabled={
                            stockHistoryData.consumptions.pagination.page >=
                            stockHistoryData.consumptions.pagination.totalPages
                          }
                          onClick={() => setStockHistoryConsumptionPage((prev) => prev + 1)}
                        >
                          Next
                        </AppButton>
                      </HStack>
                    </HStack>
                  </AppCard>
                </VStack>
              ) : (
                <EmptyState
                  title="No history loaded"
                  description="Select a product again to load purchase and consumption history."
                />
              )}
            </ModalBody>
            <ModalFooter>
              <AppButton
                variant="outline"
                onClick={() => {
                  stockHistoryModal.onClose();
                  setStockHistoryProduct(null);
                  setStockHistoryData(null);
                  setStockHistoryPurchasePage(1);
                  setStockHistoryConsumptionPage(1);
                }}
              >
                Close
              </AppButton>
            </ModalFooter>
          </ModalContent>
        </Modal>
      ) : null}

      {orderDetailModal.isOpen ? (
        <Modal
          isOpen={orderDetailModal.isOpen}
          onClose={() => {
            orderDetailModal.onClose();
            setSelectedOrder(null);
          }}
          size="4xl"
          closeOnOverlayClick={false}
        >
          <ModalOverlay />
          <ModalContent borderRadius="16px">
            <ModalHeader>Purchase Order Details</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              {selectedOrder ? (
                <VStack spacing={4} align="stretch">
                <SimpleGrid columns={{ base: 1, md: 5 }} spacing={3}>
                  <AppCard p={3}><Text fontSize="xs" color="#7B645B">Purchase No</Text><Text fontWeight={900}>{selectedOrder.purchaseNumber}</Text></AppCard>
                  <AppCard p={3}><Text fontSize="xs" color="#7B645B">Supplier</Text><Text fontWeight={900}>{selectedOrder.supplierName}</Text></AppCard>
                  <AppCard p={3}><Text fontSize="xs" color="#7B645B">Date</Text><Text fontWeight={900}>{formatDate(selectedOrder.purchaseDate)}</Text></AppCard>
                  <AppCard p={3}><Text fontSize="xs" color="#7B645B">Section</Text><Text fontWeight={900}>{formatPurchaseSectionLabel(selectedOrder.purchaseSection)}</Text></AppCard>
                  <AppCard p={3}><Text fontSize="xs" color="#7B645B">Total</Text><Text fontWeight={900}>{formatCurrency(selectedOrder.totalAmount)}</Text></AppCard>
                </SimpleGrid>
                {selectedOrder.invoiceImageUrl ? (
                  <AppCard p={3}>
                    <Text fontSize="xs" color="#7B645B" mb={2}>
                      Invoice Image
                    </Text>
                    <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
                      <Box
                        as="img"
                        src={selectedOrder.invoiceImageUrl}
                        alt="Purchase invoice"
                        maxH="220px"
                        borderRadius="10px"
                        border="1px solid"
                        borderColor="rgba(133, 78, 48, 0.24)"
                        objectFit="contain"
                        bg="white"
                      />
                      <AppButton
                        variant="outline"
                        onClick={() => window.open(selectedOrder.invoiceImageUrl ?? "", "_blank", "noopener,noreferrer")}
                      >
                        Open Full Image
                      </AppButton>
                    </HStack>
                  </AppCard>
                ) : null}
                <DataTable
                  columns={[
                    { key: "itemNameSnapshot", header: "Item" },
                    { key: "lineType", header: "Type", render: (row: any) => String(row.lineType).toUpperCase() },
                    {
                      key: "stockAdded",
                      header: "Added",
                      render: (row: any) => `${row.enteredQuantity ?? row.stockAdded} ${row.enteredUnit ?? row.unit}`
                    },
                    { key: "unitPrice", header: "Unit Price", render: (row: any) => formatCurrency(row.unitPrice) },
                    { key: "gstValue", header: "GST Value", render: (row: any) => formatCurrency(row.gstValue ?? 0) },
                    {
                      key: "expiryDate",
                      header: "Expiry",
                      render: (row: any) => {
                        if (row.lineType !== "product") {
                          return "-";
                        }
                        if (!row.expiryDate) {
                          return "No expiry";
                        }
                        const expired = isExpiredDate(row.expiryDate);
                        return (
                          <Box color={expired ? "red.700" : "#2D1D17"} fontWeight={expired ? 700 : 500}>
                            {formatDate(row.expiryDate)}
                          </Box>
                        );
                      }
                    },
                    { key: "lineTotal", header: "Line Total", render: (row: any) => formatCurrency(row.lineTotal) }
                  ]}
                  rows={selectedOrder.lines as any}
                />
                </VStack>
              ) : null}
            </ModalBody>
            <ModalFooter>
              <AppButton
                variant="outline"
                onClick={() => {
                  orderDetailModal.onClose();
                  setSelectedOrder(null);
                }}
              >
                Close
              </AppButton>
            </ModalFooter>
          </ModalContent>
        </Modal>
      ) : null}

      <ConfirmDialog
        isOpen={deleteOrderDialog.isOpen}
        title="Delete purchase order?"
        description={
          selectedOrderToDelete
            ? `Delete ${selectedOrderToDelete.purchaseNumber}? This will rollback related stock and cost entries.`
            : "Are you sure you want to delete this purchase order?"
        }
        onClose={() => {
          deleteOrderDialog.onClose();
          setSelectedOrderToDelete(null);
        }}
        onConfirm={() => void handleDeleteOrder()}
        isLoading={mutationLoading}
      />

      <ConfirmDialog
        isOpen={deletePurchaseBulkDialog.isOpen}
        title="Delete bulk upload?"
        description={
          purchaseBulkImportToDelete
            ? `Delete ${purchaseBulkImportToDelete.fileName}? This removes ${purchaseBulkImportToDelete.createdOrders?.length ?? 0} purchase orders created from this upload and rolls product stock back automatically.`
            : "Are you sure you want to delete this bulk upload?"
        }
        onClose={() => {
          deletePurchaseBulkDialog.onClose();
          setPurchaseBulkImportToDelete(null);
        }}
        onConfirm={() => void handleDeletePurchaseBulkImport()}
        isLoading={mutationLoading}
      />

      <ConfirmDialog
        isOpen={resetLedgerDialog.isOpen}
        title="Reset ledger record?"
        description={
          ledgerRowToReset
            ? `Reset manual changes for ${ledgerRowToReset.productName} on ${ledgerRowToReset.date}? Purchase and sales history will remain as-is.`
            : "Are you sure you want to reset this ledger record?"
        }
        onClose={() => {
          resetLedgerDialog.onClose();
          setLedgerRowToReset(null);
        }}
        onConfirm={() => void handleResetLedgerRecord()}
        isLoading={mutationLoading}
      />

      <ConfirmDialog
        isOpen={deleteLedgerDialog.isOpen}
        title="Delete this ledger row?"
        description={
          ledgerRowToDelete
            ? `Delete only ${ledgerRowToDelete.productName} on ${ledgerRowToDelete.date}? This will not remove the full product history.`
            : "Are you sure you want to delete this ledger row?"
        }
        onClose={() => {
          deleteLedgerDialog.onClose();
          setLedgerRowToDelete(null);
        }}
        onConfirm={() => void handleDeleteLedgerRow()}
        isLoading={mutationLoading}
      />

      <ConfirmDialog
        isOpen={deleteProductDialog.isOpen}
        title="Delete product?"
        description={
          selectedProductToDelete
            ? `Delete ${selectedProductToDelete.name} completely? This removes the product from all product tables and ledger rows.`
            : "Are you sure?"
        }
        onClose={() => {
          deleteProductDialog.onClose();
          setSelectedProductToDelete(null);
        }}
        onConfirm={() => void handleDeleteProduct()}
        isLoading={mutationLoading}
      />
    </VStack>
  );
};



