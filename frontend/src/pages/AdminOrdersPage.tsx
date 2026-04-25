import {
  Badge,
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
  Text,
  Textarea,
  VStack,
  useDisclosure
} from "@chakra-ui/react";
import { Edit2, Eye, Plus, Trash2 } from "lucide-react";
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
import { useAuth } from "@/context/AuthContext";
import { InvoiceDetailsModal } from "@/features/invoices/components/InvoiceDetailsModal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAppToast } from "@/hooks/useAppToast";
import { invoicesService } from "@/services/invoices.service";
import { posCatalogService } from "@/services/pos-catalog.service";
import type { CatalogSnapshot } from "@/types/pos-catalog";
import type {
  InvoiceActivityRow,
  InvoiceDetail,
  InvoiceKitchenStatus,
  InvoiceLineRow,
  InvoiceListRow,
  InvoiceOrderType,
  InvoicePagination,
  InvoicePaymentMode,
  InvoicePaymentRow,
  InvoiceStatus,
  InvoiceUsageEventRow
} from "@/types/invoice";
import { UserRole } from "@/types/role";
import { extractErrorMessage } from "@/utils/api-error";
import {
  buildUsageEventsForInvoice,
  computeInvoiceTotals,
  createDraftId,
  hydrateInvoiceLines
} from "@/utils/invoice-billing";

const defaultPagination: InvoicePagination = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1
};

const kitchenStatusOptions: Array<{ label: string; value: InvoiceKitchenStatus }> = [
  { label: "Not Sent", value: "not_sent" },
  { label: "Queued", value: "queued" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready" },
  { label: "Served", value: "served" }
];

const orderBoardStatusOptions: Array<{ label: string; value: InvoiceStatus }> = [
  { label: "Pending", value: "pending" },
  { label: "Completed", value: "paid" }
];

const paymentModeOptions: Array<{ label: string; value: InvoicePaymentMode }> = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "UPI", value: "upi" },
  { label: "Mixed", value: "mixed" }
];

const orderTypeOptions: Array<{ label: string; value: InvoiceOrderType }> = [
  { label: "Dine In", value: "dine_in" },
  { label: "Takeaway", value: "takeaway" },
  { label: "Delivery", value: "delivery" }
];

const lineTypeOptions = [
  { label: "Item", value: "item" },
  { label: "Add-on", value: "add_on" },
  { label: "Combo", value: "combo" },
  { label: "Product", value: "product" },
  { label: "Custom", value: "custom" }
] as const;

type OrderLineType = (typeof lineTypeOptions)[number]["value"];

type OrderLineDraft = {
  id: string;
  lineType: OrderLineType;
  referenceId: string;
  nameSnapshot: string;
  quantity: string;
  unitPrice: string;
  gstPercentage: string;
  discountAmount: string;
};

type PaymentDraftRow = {
  id: string;
  mode: Exclude<InvoicePaymentMode, "mixed">;
  amount: string;
  referenceNo: string;
  paidAt: string;
};

type OrderFormState = {
  invoiceNumber: string;
  orderReference: string;
  customerName: string;
  customerPhone: string;
  orderType: InvoiceOrderType;
  tableLabel: string;
  status: InvoiceStatus;
  kitchenStatus: InvoiceKitchenStatus;
  paymentMode: InvoicePaymentMode;
  couponCode: string;
  couponDiscountAmount: string;
  manualDiscountAmount: string;
  sourceCreatedAt: string;
  notes: string;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString("en-IN") : "-");

const formatPaymentSplitSummary = (row: Pick<
  InvoiceListRow,
  "paidCashAmount" | "paidCardAmount" | "paidUpiAmount" | "paymentMode"
>) => {
  const segments = [
    row.paidCashAmount > 0.001 ? `Cash ${formatCurrency(row.paidCashAmount)}` : null,
    row.paidCardAmount > 0.001 ? `Card ${formatCurrency(row.paidCardAmount)}` : null,
    row.paidUpiAmount > 0.001 ? `UPI ${formatCurrency(row.paidUpiAmount)}` : null
  ].filter(Boolean) as string[];

  if (!segments.length) {
    return row.paymentMode.toUpperCase();
  }
  return segments.join(" | ");
};

const parseNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const cleanText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const toDateTimeLocalInput = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const offsetMinutes = parsed.getTimezoneOffset();
  return new Date(parsed.getTime() - offsetMinutes * 60000).toISOString().slice(0, 16);
};

const toIsoDateTime = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
};

const toIsoDateFrom = (value: string) => {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
};

const toIsoDateTo = (value: string) => {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(`${value}T23:59:59.999`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
};

const createInvoiceNumber = () => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const timePart = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(
    2,
    "0"
  )}${String(now.getSeconds()).padStart(2, "0")}`;
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ADM-${datePart}-${timePart}-${random}`;
};

const statusStyleMap: Record<InvoiceStatus, { colorScheme: string; label: string }> = {
  paid: { colorScheme: "green", label: "Paid" },
  pending: { colorScheme: "orange", label: "Pending" },
  cancelled: { colorScheme: "red", label: "Cancelled" },
  refunded: { colorScheme: "purple", label: "Refunded" }
};

const createOrderLineDraft = (): OrderLineDraft => ({
  id: createDraftId(),
  lineType: "item",
  referenceId: "",
  nameSnapshot: "",
  quantity: "1",
  unitPrice: "0",
  gstPercentage: "0",
  discountAmount: "0"
});

const createPaymentDraft = (mode: Exclude<InvoicePaymentMode, "mixed"> = "cash"): PaymentDraftRow => ({
  id: createDraftId(),
  mode,
  amount: "0",
  referenceNo: "",
  paidAt: new Date().toISOString()
});

const createDefaultForm = (): OrderFormState => ({
  invoiceNumber: createInvoiceNumber(),
  orderReference: "",
  customerName: "",
  customerPhone: "",
  orderType: "dine_in",
  tableLabel: "",
  status: "pending",
  kitchenStatus: "queued",
  paymentMode: "cash",
  couponCode: "",
  couponDiscountAmount: "0",
  manualDiscountAmount: "0",
  sourceCreatedAt: toDateTimeLocalInput(new Date().toISOString()),
  notes: ""
});

export const AdminOrdersPage = () => {
  const { user } = useAuth();
  const toast = useAppToast();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const [kitchenStatusFilter, setKitchenStatusFilter] = useState<InvoiceKitchenStatus | "">("");
  const [paymentModeFilter, setPaymentModeFilter] = useState<InvoicePaymentMode | "">("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [pagination, setPagination] = useState<InvoicePagination>(defaultPagination);
  const [statusDraft, setStatusDraft] = useState<Record<string, InvoiceKitchenStatus>>({});

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [selectedLines, setSelectedLines] = useState<InvoiceLineRow[]>([]);
  const [selectedPayments, setSelectedPayments] = useState<InvoicePaymentRow[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<InvoiceActivityRow[]>([]);
  const [selectedUsageEvents, setSelectedUsageEvents] = useState<InvoiceUsageEventRow[]>([]);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const orderModal = useDisclosure();
  const deleteDialog = useDisclosure();

  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSnapshot, setCatalogSnapshot] = useState<CatalogSnapshot | null>(null);

  const [editingRow, setEditingRow] = useState<InvoiceListRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<InvoiceListRow | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [form, setForm] = useState<OrderFormState>(createDefaultForm);
  const [lineDrafts, setLineDrafts] = useState<OrderLineDraft[]>([createOrderLineDraft()]);
  const [paymentDrafts, setPaymentDrafts] = useState<PaymentDraftRow[]>([createPaymentDraft("cash")]);
  const [selectedOfferId, setSelectedOfferId] = useState("");

  const itemMap = useMemo(
    () => new Map((catalogSnapshot?.items ?? []).map((item) => [item.id, item])),
    [catalogSnapshot]
  );
  const addOnMap = useMemo(
    () => new Map((catalogSnapshot?.addOns ?? []).map((addOn) => [addOn.id, addOn])),
    [catalogSnapshot]
  );
  const comboMap = useMemo(
    () => new Map((catalogSnapshot?.combos ?? []).map((combo) => [combo.id, combo])),
    [catalogSnapshot]
  );
  const productMap = useMemo(
    () => new Map((catalogSnapshot?.products ?? []).map((product) => [product.id, product])),
    [catalogSnapshot]
  );
  const offerMap = useMemo(
    () => new Map((catalogSnapshot?.offers ?? []).map((offer) => [offer.id, offer])),
    [catalogSnapshot]
  );

  const itemOptions = useMemo<AppSearchableSelectOption[]>(
    () =>
      (catalogSnapshot?.items ?? [])
        .filter((item) => item.isActive)
        .map((item) => ({
          value: item.id,
          label: item.name,
          description: `${formatCurrency(item.sellingPrice)} | GST ${item.gstPercentage}%`
        })),
    [catalogSnapshot]
  );

  const addOnOptions = useMemo<AppSearchableSelectOption[]>(
    () =>
      (catalogSnapshot?.addOns ?? [])
        .filter((addOn) => addOn.isActive)
        .map((addOn) => ({
          value: addOn.id,
          label: addOn.name,
          description: `${formatCurrency(addOn.sellingPrice)} | GST ${addOn.gstPercentage}%`
        })),
    [catalogSnapshot]
  );

  const comboOptions = useMemo<AppSearchableSelectOption[]>(
    () =>
      (catalogSnapshot?.combos ?? [])
        .filter((combo) => combo.isActive)
        .map((combo) => ({
          value: combo.id,
          label: combo.name,
          description: `${formatCurrency(combo.sellingPrice)} | GST ${combo.gstPercentage}%`
        })),
    [catalogSnapshot]
  );

  const productOptions = useMemo<AppSearchableSelectOption[]>(
    () =>
      (catalogSnapshot?.products ?? [])
        .filter((product) => product.isActive)
        .filter((product) =>
          form.orderType === "snooker"
            ? product.targetSection === "gaming" || product.targetSection === "both"
            : product.targetSection === "dip_and_dash" || product.targetSection === "both"
        )
        .map((product) => ({
          value: product.id,
          label: product.name,
          description: `${product.category} | ${formatCurrency(product.sellingPrice)} | Stock ${product.currentStock} ${product.unit}`
        })),
    [catalogSnapshot, form.orderType]
  );

  const offerOptions = useMemo<AppSearchableSelectOption[]>(
    () =>
      (catalogSnapshot?.offers ?? []).map((offer) => ({
        value: offer.id,
        label: offer.couponCode,
        description:
          offer.discountType === "percentage"
            ? `${offer.discountValue ?? 0}% off`
            : offer.discountType === "fixed_amount"
              ? `${formatCurrency(offer.discountValue ?? 0)} off`
              : "Free item coupon"
      })),
    [catalogSnapshot]
  );

  const getReferenceOptionsByLineType = useCallback(
    (lineType: OrderLineType) => {
      if (lineType === "item") {
        return itemOptions;
      }
      if (lineType === "add_on") {
        return addOnOptions;
      }
      if (lineType === "combo") {
        return comboOptions;
      }
      if (lineType === "product") {
        return productOptions;
      }
      return [];
    },
    [addOnOptions, comboOptions, itemOptions, productOptions]
  );

  const resolveReferenceSnapshot = useCallback(
    (lineType: OrderLineType, referenceId: string) => {
      if (!referenceId) {
        return undefined;
      }
      if (lineType === "item") {
        const item = itemMap.get(referenceId);
        if (!item) {
          return undefined;
        }
        return {
          nameSnapshot: item.name,
          unitPrice: item.sellingPrice.toFixed(2),
          gstPercentage: item.gstPercentage.toString()
        };
      }
      if (lineType === "add_on") {
        const addOn = addOnMap.get(referenceId);
        if (!addOn) {
          return undefined;
        }
        return {
          nameSnapshot: addOn.name,
          unitPrice: addOn.sellingPrice.toFixed(2),
          gstPercentage: addOn.gstPercentage.toString()
        };
      }
      if (lineType === "combo") {
        const combo = comboMap.get(referenceId);
        if (!combo) {
          return undefined;
        }
        return {
          nameSnapshot: combo.name,
          unitPrice: combo.sellingPrice.toFixed(2),
          gstPercentage: combo.gstPercentage.toString()
        };
      }
      if (lineType === "product") {
        const product = productMap.get(referenceId);
        if (!product) {
          return undefined;
        }
        return {
          nameSnapshot: product.name,
          unitPrice: product.sellingPrice.toFixed(2),
          gstPercentage: "0"
        };
      }
      return undefined;
    },
    [addOnMap, comboMap, itemMap, productMap]
  );

  const normalizedLineInput = useMemo(() => {
    return lineDrafts
      .map((line) => {
        const resolvedSnapshot = resolveReferenceSnapshot(line.lineType, line.referenceId);
        const nameSnapshot = cleanText(line.nameSnapshot) ?? resolvedSnapshot?.nameSnapshot ?? "";
        const quantity = Math.max(0, parseNumber(line.quantity));
        const unitPrice = Math.max(0, parseNumber(line.unitPrice));
        const gstPercentage = Math.max(0, parseNumber(line.gstPercentage));
        const discountAmount = Math.max(0, parseNumber(line.discountAmount));
        return {
          lineType: line.lineType,
          referenceId: line.referenceId || undefined,
          nameSnapshot,
          quantity,
          unitPrice,
          gstPercentage,
          discountAmount,
          meta: null as Record<string, unknown> | null
        };
      })
      .filter((line) => line.quantity > 0 && line.nameSnapshot.length > 0);
  }, [lineDrafts, resolveReferenceSnapshot]);

  const hydratedLines = useMemo(() => hydrateInvoiceLines(normalizedLineInput), [normalizedLineInput]);

  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        lines: hydratedLines,
        couponDiscountAmount: parseNumber(form.couponDiscountAmount),
        manualDiscountAmount: parseNumber(form.manualDiscountAmount)
      }),
    [form.couponDiscountAmount, form.manualDiscountAmount, hydratedLines]
  );

  const loadCatalog = useCallback(async () => {
    if (catalogSnapshot) {
      return catalogSnapshot;
    }
    setCatalogLoading(true);
    try {
      const response = await posCatalogService.getSnapshot();
      setCatalogSnapshot(response.data.snapshot);
      return response.data.snapshot;
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to load POS catalog."));
      return null;
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogSnapshot, toast]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await invoicesService.getInvoices({
        search: debouncedSearch || undefined,
        statuses: statusFilter ? [statusFilter] : ["pending", "paid"],
        kitchenStatus: kitchenStatusFilter || undefined,
        paymentMode: paymentModeFilter || undefined,
        excludeOrderType: "snooker",
        dateFrom: toIsoDateFrom(dateFromFilter),
        dateTo: toIsoDateTo(dateToFilter),
        page,
        limit
      });
      setRows(response.data.invoices);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch orders."));
    } finally {
      setLoading(false);
    }
  }, [
    dateFromFilter,
    dateToFilter,
    debouncedSearch,
    kitchenStatusFilter,
    limit,
    page,
    paymentModeFilter,
    statusFilter,
    toast
  ]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, kitchenStatusFilter, paymentModeFilter, dateFromFilter, dateToFilter, limit]);

  useEffect(() => {
    if (!orderModal.isOpen || form.status !== "paid" || paymentDrafts.length !== 1) {
      return;
    }
    setPaymentDrafts((previous) => {
      if (previous.length !== 1) {
        return previous;
      }
      const currentAmount = Math.max(0, parseNumber(previous[0].amount));
      if (currentAmount > 0) {
        return previous;
      }
      return [
        {
          ...previous[0],
          amount: totals.totalAmount.toFixed(2)
        }
      ];
    });
  }, [form.status, orderModal.isOpen, paymentDrafts.length, totals.totalAmount]);

  const resetDetailsState = () => {
    setSelectedInvoice(null);
    setSelectedLines([]);
    setSelectedPayments([]);
    setSelectedActivities([]);
    setSelectedUsageEvents([]);
  };

  const openDetails = useCallback(
    async (row: InvoiceListRow) => {
      setDetailsLoading(true);
      setIsDetailsOpen(true);
      try {
        const response = await invoicesService.getInvoice(row.id);
        setSelectedInvoice(response.data.invoice);
        setSelectedLines(response.data.lines);
        setSelectedPayments(response.data.payments);
        setSelectedActivities(response.data.activities);
        setSelectedUsageEvents(response.data.usageEvents);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to fetch order details."));
      } finally {
        setDetailsLoading(false);
      }
    },
    [toast]
  );

  const updateKitchenStatus = useCallback(
    async (row: InvoiceListRow) => {
      const nextStatus = statusDraft[row.id] ?? row.kitchenStatus;
      try {
        const response = await invoicesService.updateKitchenStatus(row.id, nextStatus);
        toast.success(response.message);
        await fetchOrders();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to update kitchen status."));
      }
    },
    [fetchOrders, statusDraft, toast]
  );

  const openCreateModal = useCallback(async () => {
    const snapshot = await loadCatalog();
    if (!snapshot) {
      return;
    }
    setEditingRow(null);
    setSelectedOfferId("");
    setForm(createDefaultForm());
    setLineDrafts([createOrderLineDraft()]);
    setPaymentDrafts([createPaymentDraft("cash")]);
    orderModal.onOpen();
  }, [loadCatalog, orderModal]);

  const openEditModal = useCallback(
    async (row: InvoiceListRow) => {
      const snapshot = await loadCatalog();
      if (!snapshot) {
        return;
      }

      setSaveLoading(true);
      try {
        const response = await invoicesService.getInvoice(row.id);
        const { invoice, lines, payments } = response.data;

        setEditingRow(row);
        setForm({
          invoiceNumber: invoice.invoiceNumber,
          orderReference: invoice.orderReference ?? "",
          customerName: invoice.customer?.name ?? "",
          customerPhone: invoice.customer?.phone ?? "",
          orderType: invoice.orderType,
          tableLabel: invoice.tableLabel ?? "",
          status: invoice.status,
          kitchenStatus: invoice.kitchenStatus,
          paymentMode: invoice.paymentMode,
          couponCode: invoice.couponCode ?? "",
          couponDiscountAmount: String(invoice.couponDiscountAmount ?? 0),
          manualDiscountAmount: String(invoice.manualDiscountAmount ?? 0),
          sourceCreatedAt: toDateTimeLocalInput(invoice.sourceCreatedAt ?? row.sourceCreatedAt ?? invoice.createdAt),
          notes: invoice.notes ?? ""
        });

        setLineDrafts(
          lines.length
            ? lines.map((line) => ({
                id: createDraftId(),
                lineType: line.lineType,
                referenceId: line.referenceId ?? "",
                nameSnapshot: line.nameSnapshot,
                quantity: String(line.quantity),
                unitPrice: String(line.unitPrice),
                gstPercentage: String(line.gstPercentage),
                discountAmount: String(line.discountAmount)
              }))
            : [createOrderLineDraft()]
        );

        setPaymentDrafts(
          payments.length
            ? payments.map((payment) => ({
                id: createDraftId(),
                mode: payment.mode === "mixed" ? "cash" : payment.mode,
                amount: String(payment.amount),
                referenceNo: payment.referenceNo ?? "",
                paidAt: payment.paidAt
              }))
            : [createPaymentDraft(invoice.paymentMode === "mixed" ? "cash" : invoice.paymentMode)]
        );

        const matchedOffer = snapshot.offers.find(
          (offer) => offer.couponCode.toLowerCase() === (invoice.couponCode ?? "").toLowerCase()
        );
        setSelectedOfferId(matchedOffer?.id ?? "");
        orderModal.onOpen();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to load order for editing."));
      } finally {
        setSaveLoading(false);
      }
    },
    [loadCatalog, orderModal, toast]
  );

  const handleLineChange = useCallback((lineId: string, patch: Partial<OrderLineDraft>) => {
    setLineDrafts((previous) =>
      previous.map((line) => {
        if (line.id !== lineId) {
          return line;
        }
        return { ...line, ...patch };
      })
    );
  }, []);

  const handleLineTypeChange = useCallback((lineId: string, nextLineType: OrderLineType) => {
    setLineDrafts((previous) =>
      previous.map((line) =>
        line.id === lineId
          ? {
              ...line,
              lineType: nextLineType,
              referenceId: "",
              nameSnapshot: "",
              unitPrice: "0",
              gstPercentage: "0"
            }
          : line
      )
    );
  }, []);

  const handleLineReferenceChange = useCallback(
    (lineId: string, referenceId: string) => {
      setLineDrafts((previous) =>
        previous.map((line) => {
          if (line.id !== lineId) {
            return line;
          }
          const resolved = resolveReferenceSnapshot(line.lineType, referenceId);
          return {
            ...line,
            referenceId,
            nameSnapshot: resolved?.nameSnapshot ?? line.nameSnapshot,
            unitPrice: resolved?.unitPrice ?? line.unitPrice,
            gstPercentage: resolved?.gstPercentage ?? line.gstPercentage
          };
        })
      );
    },
    [resolveReferenceSnapshot]
  );

  const applyOffer = useCallback(
    (offerId: string) => {
      setSelectedOfferId(offerId);
      if (!offerId) {
        setForm((previous) => ({
          ...previous,
          couponCode: "",
          couponDiscountAmount: "0"
        }));
        return;
      }

      const offer = offerMap.get(offerId);
      if (!offer) {
        return;
      }

      const subtotal = hydratedLines.reduce((sum, line) => sum + line.lineTotal, 0);
      let computedDiscount = 0;
      if (offer.discountType === "percentage") {
        computedDiscount = (subtotal * Number(offer.discountValue ?? 0)) / 100;
      } else if (offer.discountType === "fixed_amount") {
        computedDiscount = Number(offer.discountValue ?? 0);
      }
      if (offer.maximumDiscountAmount !== null && offer.maximumDiscountAmount !== undefined) {
        computedDiscount = Math.min(computedDiscount, Number(offer.maximumDiscountAmount));
      }
      computedDiscount = Math.max(0, Math.min(computedDiscount, subtotal));

      setForm((previous) => ({
        ...previous,
        couponCode: offer.couponCode,
        couponDiscountAmount: computedDiscount.toFixed(2)
      }));
    },
    [hydratedLines, offerMap]
  );

  const buildPayload = useCallback(() => {
    const trimmedInvoiceNumber = cleanText(form.invoiceNumber) ?? createInvoiceNumber();
    const sourceCreatedAtIso = toIsoDateTime(form.sourceCreatedAt);
    const usageDate = (sourceCreatedAtIso ?? new Date().toISOString()).slice(0, 10);

    const normalizedPayments =
      form.status === "paid"
        ? paymentDrafts
            .map((payment) => ({
              mode: payment.mode,
              amount: Math.max(0, parseNumber(payment.amount)),
              referenceNo: cleanText(payment.referenceNo) ?? null,
              paidAt: payment.paidAt || new Date().toISOString()
            }))
            .filter((payment) => payment.amount > 0)
        : [];

    const paymentMode: InvoicePaymentMode =
      normalizedPayments.length > 1
        ? "mixed"
        : normalizedPayments.length === 1
          ? normalizedPayments[0].mode
          : form.paymentMode;

    const usageEvents =
      form.status === "paid" && catalogSnapshot
        ? buildUsageEventsForInvoice(
            hydratedLines.map((line) => ({
              lineType: line.lineType,
              referenceId: line.referenceId ?? null,
              quantity: line.quantity
            })),
            catalogSnapshot,
            {
              usageDate,
              invoiceNumber: trimmedInvoiceNumber
            }
          )
        : [];

    return {
      idempotencyKey: createDraftId(),
      invoiceNumber: trimmedInvoiceNumber,
      orderReference: cleanText(form.orderReference) ?? null,
      customerId: null,
      customerPhone: cleanText(form.customerPhone) ?? null,
      customerName: cleanText(form.customerName) ?? null,
      branchId: null,
      deviceId: "admin-web",
      orderType: form.orderType,
      tableLabel: cleanText(form.tableLabel) ?? null,
      kitchenStatus: form.kitchenStatus,
      status: form.status,
      paymentMode,
      subtotal: totals.subtotal,
      itemDiscountAmount: totals.itemDiscountAmount,
      couponDiscountAmount: totals.couponDiscountAmount,
      manualDiscountAmount: totals.manualDiscountAmount,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      couponCode: cleanText(form.couponCode) ?? null,
      notes: cleanText(form.notes) ?? null,
      customerSnapshot:
        cleanText(form.customerName) || cleanText(form.customerPhone)
          ? {
              name: cleanText(form.customerName) ?? null,
              phone: cleanText(form.customerPhone) ?? null
            }
          : null,
      totalsSnapshot: totals,
      linesSnapshot: {
        count: hydratedLines.length
      },
      sourceCreatedAt: sourceCreatedAtIso,
      lines: hydratedLines.map((line) => ({
        lineType: line.lineType,
        referenceId: line.referenceId ?? null,
        nameSnapshot: line.nameSnapshot,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        gstPercentage: line.gstPercentage,
        lineTotal: line.lineTotal,
        meta: line.meta ?? null
      })),
      payments: normalizedPayments.map((payment) => ({
        ...payment,
        status: "success" as const
      })),
      usageEvents
    };
  }, [catalogSnapshot, form, hydratedLines, paymentDrafts, totals]);

  const validateBeforeSave = useCallback(() => {
    if (!cleanText(form.invoiceNumber)) {
      toast.warning("Invoice number is required.");
      return false;
    }

    if (!hydratedLines.length) {
      toast.warning("Add at least one order line.");
      return false;
    }

    const missingReferenceLine = lineDrafts.find(
      (line) =>
        (line.lineType === "item" ||
          line.lineType === "add_on" ||
          line.lineType === "combo" ||
          line.lineType === "product") &&
        cleanText(line.referenceId) === undefined
    );
    if (missingReferenceLine) {
      toast.warning("Select product/item reference for every non-custom line.");
      return false;
    }

    if (form.status === "paid") {
      const payments = paymentDrafts
        .map((payment) => ({
          mode: payment.mode,
          amount: Math.max(0, parseNumber(payment.amount)),
          referenceNo: cleanText(payment.referenceNo) ?? ""
        }))
        .filter((payment) => payment.amount > 0);

      if (!payments.length && totals.totalAmount > 0) {
        toast.warning("Add at least one payment row for paid orders.");
        return false;
      }

      const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
      if (totals.totalAmount > 0 && Math.abs(totalPaid - totals.totalAmount) > 0.5) {
        toast.warning("Payment amount and final total should match.");
        return false;
      }

      const missingReference = payments.find(
        (payment) =>
          (payment.mode === "upi" || payment.mode === "card") && cleanText(payment.referenceNo) === undefined
      );
      if (missingReference) {
        toast.warning("Reference ID is required for Card/UPI payments.");
        return false;
      }
    }

    return true;
  }, [form.invoiceNumber, form.status, hydratedLines.length, lineDrafts, paymentDrafts, toast, totals.totalAmount]);

  const handleSaveOrder = useCallback(async () => {
    if (!validateBeforeSave()) {
      return;
    }

    if (!catalogSnapshot && form.status === "paid") {
      const snapshot = await loadCatalog();
      if (!snapshot) {
        return;
      }
    }

    setSaveLoading(true);
    try {
      const payload = buildPayload();
      const response = await invoicesService.syncUpsert(payload);
      toast.success(editingRow ? "Order updated successfully." : "Order created successfully.");
      if (response.data.invoice?.id) {
        setStatusDraft((previous) => {
          const next = { ...previous };
          delete next[response.data.invoice.id];
          return next;
        });
      }
      orderModal.onClose();
      setEditingRow(null);
      await fetchOrders();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to save order."));
    } finally {
      setSaveLoading(false);
    }
  }, [buildPayload, catalogSnapshot, editingRow, fetchOrders, form.status, loadCatalog, orderModal, toast, validateBeforeSave]);

  const handleDeleteOrder = useCallback(async () => {
    if (!deletingRow) {
      return;
    }
    setDeleteLoading(true);
    try {
      const response = await invoicesService.deleteInvoice(deletingRow.id);
      toast.success(response.message);
      deleteDialog.onClose();
      setDeletingRow(null);
      await fetchOrders();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete order."));
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteDialog, deletingRow, fetchOrders, toast]);

  const columns = useMemo(
    () =>
      [
        { key: "invoiceNumber", header: "Invoice #" },
        {
          key: "customer",
          header: "Customer",
          render: (row: InvoiceListRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.customerName ?? "Walk-in"}</Text>
              <Text fontSize="xs" color="#7A6258">
                {row.customerPhone ?? "-"}
              </Text>
            </VStack>
          )
        },
        {
          key: "orderType",
          header: "Order Type",
          render: (row: InvoiceListRow) => <Text textTransform="capitalize">{row.orderType.replace("_", " ")}</Text>
        },
        {
          key: "status",
          header: "Status",
          render: (row: InvoiceListRow) => (
            <Badge colorScheme={statusStyleMap[row.status].colorScheme} borderRadius="full" px={3} py={1}>
              {statusStyleMap[row.status].label}
            </Badge>
          )
        },
        {
          key: "kitchenStatus",
          header: "Kitchen",
          render: (row: InvoiceListRow) => (
            <HStack>
              <Select
                size="sm"
                value={statusDraft[row.id] ?? row.kitchenStatus}
                onChange={(event) =>
                  setStatusDraft((previous) => ({
                    ...previous,
                    [row.id]: event.target.value as InvoiceKitchenStatus
                  }))
                }
              >
                {kitchenStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <AppButton size="sm" variant="outline" onClick={() => void updateKitchenStatus(row)}>
                Save
              </AppButton>
            </HStack>
          )
        },
        {
          key: "paymentMode",
          header: "Payment",
          render: (row: InvoiceListRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.paymentMode.toUpperCase()}</Text>
              <Text fontSize="xs" color="#705B52">
                {formatPaymentSplitSummary(row)}
              </Text>
            </VStack>
          )
        },
        {
          key: "totalAmount",
          header: "Total",
          render: (row: InvoiceListRow) => formatCurrency(row.totalAmount)
        },
        {
          key: "createdAt",
          header: "Order Date",
          render: (row: InvoiceListRow) => formatDateTime(row.sourceCreatedAt ?? row.createdAt)
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: InvoiceListRow) => (
            <HStack spacing={2}>
              <ActionIconButton
                aria-label={`View order ${row.invoiceNumber}`}
                icon={<Eye size={16} />}
                size="sm"
                variant="outline"
                onClick={() => void openDetails(row)}
              />
              <ActionIconButton
                aria-label={`Edit order ${row.invoiceNumber}`}
                icon={<Edit2 size={16} />}
                size="sm"
                variant="outline"
                onClick={() => void openEditModal(row)}
              />
              <ActionIconButton
                aria-label={`Delete order ${row.invoiceNumber}`}
                icon={<Trash2 size={16} />}
                size="sm"
                variant="outline"
                onClick={() => {
                  setDeletingRow(row);
                  deleteDialog.onOpen();
                }}
              />
            </HStack>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: InvoiceListRow) => ReactNode }>,
    [deleteDialog, openDetails, openEditModal, statusDraft, updateKitchenStatus]
  );

  if (user?.role !== UserRole.ADMIN) {
    return (
      <VStack spacing={6} align="stretch">
        <PageHeader title="Orders" subtitle="This module is restricted to admin users." />
        <AppCard>
          <EmptyState title="Unauthorized" description="Only admin users can access order board." />
        </AppCard>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader title="Orders" subtitle="Manage all orders with full history, edit and delete controls." />

      <AppCard>
        <VStack align="stretch" spacing={4}>
          <SimpleGrid columns={{ base: 1, md: 3, xl: 6 }} spacing={4}>
            <AppInput
              label="Search"
              placeholder="Invoice / customer / phone"
              value={search}
              onChange={(event) =>
                setSearch(
                  (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
                )
              }
            />
            <FormControl>
              <FormLabel>Status</FormLabel>
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as InvoiceStatus | "")}
              >
                <option value="">Pending + Completed</option>
                {orderBoardStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Kitchen</FormLabel>
              <Select
                value={kitchenStatusFilter}
                onChange={(event) => setKitchenStatusFilter(event.target.value as InvoiceKitchenStatus | "")}
              >
                <option value="">All Kitchen Status</option>
                {kitchenStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Payment</FormLabel>
              <Select
                value={paymentModeFilter}
                onChange={(event) => setPaymentModeFilter(event.target.value as InvoicePaymentMode | "")}
              >
                <option value="">All Payment Modes</option>
                {paymentModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormControl>
            <AppInput
              label="Date From"
              type="date"
              value={dateFromFilter}
              onChange={(event) => setDateFromFilter((event.target as HTMLInputElement).value)}
            />
            <AppInput
              label="Date To"
              type="date"
              value={dateToFilter}
              onChange={(event) => setDateToFilter((event.target as HTMLInputElement).value)}
            />
          </SimpleGrid>

          <HStack justify="space-between" flexWrap="wrap" gap={3}>
            <HStack>
              <FormControl w="180px">
                <FormLabel>Records per page</FormLabel>
                <Select
                  value={String(limit)}
                  onChange={(event) => {
                    setLimit(Number(event.target.value) || 10);
                    setPage(1);
                  }}
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </Select>
              </FormControl>
              <Box alignSelf="end">
                <AppButton variant="outline" onClick={() => void fetchOrders()}>
                  Refresh
                </AppButton>
              </Box>
            </HStack>
            <AppButton leftIcon={<Plus size={16} />} onClick={() => void openCreateModal()}>
              New Order
            </AppButton>
          </HStack>

          {loading ? (
            <SkeletonTable />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              emptyState={
                <EmptyState title="No orders found" description="All orders will appear here without any default filter." />
              }
            />
          )}

          <HStack justify="space-between" flexWrap="wrap" gap={3}>
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

      <Modal isOpen={orderModal.isOpen} onClose={() => !saveLoading && orderModal.onClose()} size="6xl">
        <ModalOverlay />
        <ModalContent borderRadius="16px" maxH="calc(100vh - 64px)" my={8}>
          <ModalHeader>{editingRow ? "Edit Order" : "Create Order"}</ModalHeader>
          <ModalCloseButton isDisabled={saveLoading} />
          <ModalBody overflowY="auto">
            <VStack align="stretch" spacing={4}>
              <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                <AppInput
                  label="Invoice Number"
                  value={form.invoiceNumber}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      invoiceNumber: (event.target as HTMLInputElement).value
                    }))
                  }
                />
                <AppInput
                  label="Order Reference"
                  value={form.orderReference}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      orderReference: (event.target as HTMLInputElement).value
                    }))
                  }
                />
                <FormControl>
                  <FormLabel>Order Type</FormLabel>
                  <Select
                    value={form.orderType}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        orderType: event.target.value as InvoiceOrderType
                      }))
                    }
                  >
                    {orderTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <AppInput
                  label="Table / Label"
                  value={form.tableLabel}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      tableLabel: (event.target as HTMLInputElement).value
                    }))
                  }
                />
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                <AppInput
                  label="Customer Name"
                  value={form.customerName}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      customerName: (event.target as HTMLInputElement).value
                    }))
                  }
                />
                <AppInput
                  label="Customer Phone"
                  value={form.customerPhone}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      customerPhone: (event.target as HTMLInputElement).value
                    }))
                  }
                />
                <FormControl>
                  <FormLabel>Status</FormLabel>
                  <Select
                    value={form.status}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        status: event.target.value as InvoiceStatus
                      }))
                    }
                  >
                    {orderBoardStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>Kitchen Status</FormLabel>
                  <Select
                    value={form.kitchenStatus}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        kitchenStatus: event.target.value as InvoiceKitchenStatus
                      }))
                    }
                  >
                    {kitchenStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                <FormControl>
                  <FormLabel>Payment Mode</FormLabel>
                  <Select
                    value={form.paymentMode}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        paymentMode: event.target.value as InvoicePaymentMode
                      }))
                    }
                  >
                    {paymentModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <AppInput
                  label="Source Date & Time"
                  type="datetime-local"
                  value={form.sourceCreatedAt}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      sourceCreatedAt: (event.target as HTMLInputElement).value
                    }))
                  }
                />
                <AppInput
                  label="Coupon Discount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.couponDiscountAmount}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      couponDiscountAmount: (event.target as HTMLInputElement).value
                    }))
                  }
                />
                <AppInput
                  label="Manual Discount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.manualDiscountAmount}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      manualDiscountAmount: (event.target as HTMLInputElement).value
                    }))
                  }
                />
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <AppSearchableSelect
                  label="Coupon"
                  value={selectedOfferId}
                  options={offerOptions}
                  onValueChange={applyOffer}
                  placeholder="Select coupon"
                  searchPlaceholder="Search coupon"
                  isClearable
                  isLoading={catalogLoading}
                />
                <AppInput
                  label="Coupon Code"
                  value={form.couponCode}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      couponCode: (event.target as HTMLInputElement).value
                    }))
                  }
                />
              </SimpleGrid>

              <AppCard bg="#FFFBF4" borderColor="rgba(133, 78, 48, 0.22)">
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between" flexWrap="wrap" gap={2}>
                    <Text fontWeight={700}>Order Lines</Text>
                    <AppButton
                      size="sm"
                      variant="outline"
                      leftIcon={<Plus size={14} />}
                      onClick={() => setLineDrafts((previous) => [...previous, createOrderLineDraft()])}
                    >
                      Add Line
                    </AppButton>
                  </HStack>

                  {lineDrafts.map((line) => {
                    const lineQuantity = Math.max(0, parseNumber(line.quantity));
                    const lineUnitPrice = Math.max(0, parseNumber(line.unitPrice));
                    const lineDiscount = Math.max(0, parseNumber(line.discountAmount));
                    const lineTotal = Math.max(lineQuantity * lineUnitPrice - lineDiscount, 0);
                    const lineOptions = getReferenceOptionsByLineType(line.lineType);
                    return (
                      <AppCard key={line.id} p={3} borderColor="rgba(133, 78, 48, 0.22)">
                        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                          <FormControl>
                            <FormLabel>Line Type</FormLabel>
                            <Select
                              value={line.lineType}
                              onChange={(event) =>
                                handleLineTypeChange(line.id, event.target.value as OrderLineType)
                              }
                            >
                              {lineTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                          </FormControl>

                          {line.lineType === "custom" ? (
                            <AppInput
                              label="Name"
                              value={line.nameSnapshot}
                              onChange={(event) =>
                                handleLineChange(line.id, {
                                  nameSnapshot: (event.target as HTMLInputElement).value
                                })
                              }
                            />
                          ) : (
                            <AppSearchableSelect
                              label="Reference"
                              value={line.referenceId}
                              options={lineOptions}
                              onValueChange={(value) => handleLineReferenceChange(line.id, value)}
                              placeholder="Select"
                              searchPlaceholder="Search"
                              isLoading={catalogLoading}
                              isClearable={false}
                            />
                          )}

                          <AppInput
                            label="Qty"
                            type="number"
                            min={0}
                            step="1"
                            value={line.quantity}
                            onChange={(event) =>
                              handleLineChange(line.id, {
                                quantity: (event.target as HTMLInputElement).value
                              })
                            }
                          />
                          <AppInput
                            label="Unit Price"
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(event) =>
                              handleLineChange(line.id, {
                                unitPrice: (event.target as HTMLInputElement).value
                              })
                            }
                          />
                          <AppInput
                            label="GST %"
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.gstPercentage}
                            onChange={(event) =>
                              handleLineChange(line.id, {
                                gstPercentage: (event.target as HTMLInputElement).value
                              })
                            }
                          />
                          <AppInput
                            label="Line Discount"
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.discountAmount}
                            onChange={(event) =>
                              handleLineChange(line.id, {
                                discountAmount: (event.target as HTMLInputElement).value
                              })
                            }
                          />
                          <AppInput label="Line Total" value={lineTotal.toFixed(2)} isReadOnly />
                          <HStack align="end">
                            <AppButton
                              variant="outline"
                              colorScheme="red"
                              isDisabled={lineDrafts.length <= 1}
                              onClick={() =>
                                setLineDrafts((previous) => previous.filter((entry) => entry.id !== line.id))
                              }
                            >
                              Remove
                            </AppButton>
                          </HStack>
                        </SimpleGrid>
                      </AppCard>
                    );
                  })}
                </VStack>
              </AppCard>

              <AppCard bg="#FFF8F0" borderColor="rgba(133, 78, 48, 0.22)">
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between" flexWrap="wrap" gap={2}>
                    <Text fontWeight={700}>Payments</Text>
                    <AppButton
                      size="sm"
                      variant="outline"
                      leftIcon={<Plus size={14} />}
                      onClick={() => setPaymentDrafts((previous) => [...previous, createPaymentDraft("cash")])}
                      isDisabled={form.status !== "paid"}
                    >
                      Add Payment
                    </AppButton>
                  </HStack>
                  <Text fontSize="xs" color="#7A6258">
                    For paid orders, Card/UPI payment rows require reference ID.
                  </Text>

                  {paymentDrafts.map((payment) => (
                    <SimpleGrid key={payment.id} columns={{ base: 1, md: 2, xl: 5 }} spacing={3}>
                      <FormControl>
                        <FormLabel>Mode</FormLabel>
                        <Select
                          value={payment.mode}
                          onChange={(event) =>
                            setPaymentDrafts((previous) =>
                              previous.map((entry) =>
                                entry.id === payment.id
                                  ? { ...entry, mode: event.target.value as Exclude<InvoicePaymentMode, "mixed"> }
                                  : entry
                              )
                            )
                          }
                          isDisabled={form.status !== "paid"}
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="upi">UPI</option>
                        </Select>
                      </FormControl>
                      <AppInput
                        label="Amount"
                        type="number"
                        min={0}
                        step="0.01"
                        value={payment.amount}
                        isDisabled={form.status !== "paid"}
                        onChange={(event) =>
                          setPaymentDrafts((previous) =>
                            previous.map((entry) =>
                              entry.id === payment.id
                                ? { ...entry, amount: (event.target as HTMLInputElement).value }
                                : entry
                            )
                          )
                        }
                      />
                      <AppInput
                        label="Reference ID"
                        value={payment.referenceNo}
                        isDisabled={form.status !== "paid"}
                        onChange={(event) =>
                          setPaymentDrafts((previous) =>
                            previous.map((entry) =>
                              entry.id === payment.id
                                ? { ...entry, referenceNo: (event.target as HTMLInputElement).value }
                                : entry
                            )
                          )
                        }
                      />
                      <AppInput
                        label="Paid At"
                        type="datetime-local"
                        value={toDateTimeLocalInput(payment.paidAt)}
                        isDisabled={form.status !== "paid"}
                        onChange={(event) =>
                          setPaymentDrafts((previous) =>
                            previous.map((entry) =>
                              entry.id === payment.id
                                ? {
                                    ...entry,
                                    paidAt: toIsoDateTime((event.target as HTMLInputElement).value) ??
                                      entry.paidAt
                                  }
                                : entry
                            )
                          )
                        }
                      />
                      <HStack align="end">
                        <AppButton
                          variant="outline"
                          colorScheme="red"
                          isDisabled={paymentDrafts.length <= 1 || form.status !== "paid"}
                          onClick={() =>
                            setPaymentDrafts((previous) =>
                              previous.filter((entry) => entry.id !== payment.id)
                            )
                          }
                        >
                          Remove
                        </AppButton>
                      </HStack>
                    </SimpleGrid>
                  ))}
                </VStack>
              </AppCard>

              <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                <AppInput label="Subtotal" value={formatCurrency(totals.subtotal)} isReadOnly />
                <AppInput label="Tax" value={formatCurrency(totals.taxAmount)} isReadOnly />
                <AppInput
                  label="Discount"
                  value={formatCurrency(totals.couponDiscountAmount + totals.manualDiscountAmount)}
                  isReadOnly
                />
                <AppInput label="Final Amount" value={formatCurrency(totals.totalAmount)} isReadOnly />
              </SimpleGrid>

              <FormControl>
                <FormLabel>Notes</FormLabel>
                <Textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      notes: event.target.value
                    }))
                  }
                  placeholder="Add internal notes"
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={3}>
            <AppButton
              variant="outline"
              isDisabled={saveLoading}
              onClick={() => {
                orderModal.onClose();
                setEditingRow(null);
              }}
            >
              Cancel
            </AppButton>
            <AppButton onClick={() => void handleSaveOrder()} isLoading={saveLoading}>
              {editingRow ? "Save Changes" : "Create Order"}
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title={`Delete ${deletingRow?.invoiceNumber ?? "order"}?`}
        description="This will remove the order and reverse stock/usage impact."
        onClose={() => {
          if (!deleteLoading) {
            deleteDialog.onClose();
            setDeletingRow(null);
          }
        }}
        onConfirm={() => void handleDeleteOrder()}
        isLoading={deleteLoading}
      />

      <InvoiceDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false);
          resetDetailsState();
        }}
        loading={detailsLoading}
        invoice={selectedInvoice}
        lines={selectedLines}
        payments={selectedPayments}
        activities={selectedActivities}
        usageEvents={selectedUsageEvents}
      />
    </VStack>
  );
};
