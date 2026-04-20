import {
  Badge,
  Button,
  Box,
  FormControl,
  FormLabel,
  HStack,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
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
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAppToast } from "@/hooks/useAppToast";
import { gamingService } from "@/services/gaming.service";
import { invoicesService } from "@/services/invoices.service";
import { procurementService } from "@/services/procurement.service";
import type {
  GamingBookingCustomer,
  GamingBookingRow,
  GamingBookingStatus,
  GamingBookingType,
  GamingCreateBookingPayload,
  GamingPaymentMode,
  GamingPaymentStatus,
  GamingResourceAvailability,
  GamingStats,
  GamingUpdateBookingPayload
} from "@/types/gaming";
import type { ProductListItem } from "@/types/procurement";
import { UserRole } from "@/types/role";
import { extractErrorMessage } from "@/utils/api-error";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString("en-IN") : "-");

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

const normalizePhone = (value: string) => value.replace(/[^\d+]/g, "").trim();

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const cleanText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};
const extractUpiReferenceFromNote = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }
  const match = value.match(/UPI Ref:\s*([^|]+)/i);
  return match?.[1]?.trim() ?? "";
};
const stripUpiReferenceFromNote = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }
  return value.replace(/\s*\|?\s*UPI Ref:\s*[^|]+/gi, "").trim();
};

const toLocalNow = () => {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  return new Date(now.getTime() - offsetMinutes * 60000).toISOString().slice(0, 16);
};
const SNOOKER_INCLUDED_MEMBERS = 4;
const EXTRA_MEMBER_CHARGE = 50;
const AMOUNT_DIFF_THRESHOLD = 0.01;

type BookingProductLineDraft = {
  id: string;
  productId: string;
  quantity: string;
};

const createDraftId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const createBookingProductLine = (): BookingProductLineDraft => ({
  id: createDraftId(),
  productId: "",
  quantity: "1"
});

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
  return `GM-${datePart}-${timePart}-${random}`;
};

const emptyStats: GamingStats = {
  totals: {
    totalBookings: 0,
    ongoing: 0,
    upcoming: 0,
    completed: 0,
    cancelled: 0,
    pendingPayments: 0,
    paidBookings: 0,
    activePlayers: 0,
    endingSoon: 0,
    totalRevenue: 0,
    pendingCollection: 0
  },
  gamingProducts: {
    purchasedQuantity: 0,
    purchasedAmount: 0,
    soldQuantity: 0,
    soldAmount: 0,
    estimatedProfit: 0,
    stockValuation: 0
  },
  staffCollection: [],
  resourceUsage: []
};

const statusColorMap: Record<GamingBookingStatus, string> = {
  upcoming: "blue",
  ongoing: "green",
  completed: "purple",
  cancelled: "gray"
};

const paymentColorMap: Record<GamingPaymentStatus, string> = {
  pending: "orange",
  paid: "green",
  refunded: "purple"
};

const StatsCard = ({ label, value, helper }: { label: string; value: string; helper?: string }) => (
  <Box
    p={4}
    borderRadius="18px"
    border="1px solid"
    borderColor="rgba(133, 78, 48, 0.24)"
    bg="linear-gradient(180deg, #FFFFFF 0%, #FFF7EA 100%)"
    boxShadow="0 10px 18px rgba(72, 29, 11, 0.08)"
    minH="118px"
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

type BookingFormState = {
  bookingType: GamingBookingType;
  resourceCodes: string[];
  customers: GamingBookingCustomer[];
  playerCount: string;
  checkInAt: string;
  checkOutAt: string;
  hourlyRate: string;
  status: GamingBookingStatus;
  paymentStatus: GamingPaymentStatus;
  paymentMode: GamingPaymentMode | "";
  systemCalculatedAmount: string;
  finalAmount: string;
  amountOverrideReason: string;
  paymentReference: string;
  bookingChannel: string;
  note: string;
};

const createDefaultFormState = (resources: GamingResourceAvailability[]): BookingFormState => {
  const defaultType: GamingBookingType = "snooker";
  const defaultResource =
    resources.find((resource) => resource.bookingType === defaultType)?.resourceCode ??
    resources[0]?.resourceCode ??
    "";

  return {
    bookingType: defaultType,
    resourceCodes: defaultResource ? [defaultResource] : [],
    customers: [{ name: "", phone: "" }],
    playerCount: "1",
    checkInAt: toLocalNow(),
    checkOutAt: "",
    hourlyRate: "0",
    status: "ongoing",
    paymentStatus: "pending",
    paymentMode: "",
    systemCalculatedAmount: "",
    finalAmount: "",
    amountOverrideReason: "",
    paymentReference: "",
    bookingChannel: "desktop",
    note: ""
  };
};

const mapBookingToForm = (booking: GamingBookingRow): BookingFormState => ({
  bookingType: booking.bookingType,
  resourceCodes: booking.resourceCodes?.length ? booking.resourceCodes : [booking.resourceCode],
  customers:
    booking.customers?.length > 0
      ? booking.customers.map((member) => ({
          name: member.name ?? "",
          phone: member.phone ?? ""
        }))
      : [{ name: booking.primaryCustomerName ?? "", phone: booking.primaryCustomerPhone ?? "" }],
  playerCount: String(Math.max(1, booking.customerCount ?? booking.customers?.length ?? 1)),
  checkInAt: toDateTimeLocalInput(booking.checkInAt),
  checkOutAt: toDateTimeLocalInput(booking.checkOutAt),
  hourlyRate: String(booking.hourlyRate ?? 0),
  status: booking.status,
  paymentStatus: booking.paymentStatus,
  paymentMode: booking.paymentMode ?? "",
  systemCalculatedAmount: String(booking.systemCalculatedAmount ?? 0),
  finalAmount: String(booking.finalAmount ?? 0),
  amountOverrideReason: booking.amountOverrideReason ?? "",
  paymentReference: extractUpiReferenceFromNote(booking.note),
  bookingChannel: booking.bookingChannel ?? "desktop",
  note: stripUpiReferenceFromNote(booking.note)
});

const collectCustomersFromRows = (
  rows: GamingBookingRow[],
  customerMap: Map<string, AppSearchableSelectOption>
) => {
  rows.forEach((row) => {
    const members = row.customers?.length
      ? row.customers
      : [{ name: row.primaryCustomerName ?? "", phone: row.primaryCustomerPhone ?? "" }];

    members.forEach((member) => {
      const name = member.name?.trim();
      const phone = normalizePhone(member.phone ?? "");
      if (!name || !phone || customerMap.has(phone)) {
        return;
      }

      customerMap.set(phone, {
        value: phone,
        label: name,
        description: phone,
        searchText: `${name} ${phone}`
      });
    });
  });
};

export const GamingPage = () => {
  const { user } = useAuth();
  const toast = useAppToast();
  const bookingModal = useDisclosure();
  const deleteDialog = useDisclosure();

  const [stats, setStats] = useState<GamingStats>(emptyStats);
  const [statsLoading, setStatsLoading] = useState(true);
  const [bookings, setBookings] = useState<GamingBookingRow[]>([]);
  const [resources, setResources] = useState<GamingResourceAvailability[]>([]);
  const [tableLoading, setTableLoading] = useState(true);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState("");
  const [bookingType, setBookingType] = useState<"all" | GamingBookingType>("all");
  const [status, setStatus] = useState<"all" | GamingBookingStatus>("all");
  const [paymentStatus, setPaymentStatus] = useState<"all" | GamingPaymentStatus>("all");
  const [resourceCode, setResourceCode] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [customerOptions, setCustomerOptions] = useState<AppSearchableSelectOption[]>([]);
  const [customerOptionsLoading, setCustomerOptionsLoading] = useState(false);

  const [editingBooking, setEditingBooking] = useState<GamingBookingRow | null>(null);
  const [deletingBooking, setDeletingBooking] = useState<GamingBookingRow | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bookingForm, setBookingForm] = useState<BookingFormState>(() => createDefaultFormState([]));
  const [gamingProducts, setGamingProducts] = useState<ProductListItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [bookingProductSearch, setBookingProductSearch] = useState("");
  const [bookingProductLines, setBookingProductLines] = useState<BookingProductLineDraft[]>([
    createBookingProductLine()
  ]);
  const [bookingProductLinesLoading, setBookingProductLinesLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await gamingService.getStats({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      });
      setStats(response.data);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch gaming analytics."));
    } finally {
      setStatsLoading(false);
    }
  }, [dateFrom, dateTo, toast]);

  const fetchResources = useCallback(async () => {
    try {
      const response = await gamingService.getResources();
      setResources(response.data.resources);
    } catch {
      setResources([]);
    }
  }, []);

  const fetchGamingProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const collected: ProductListItem[] = [];
      let currentPage = 1;
      let totalPages = 1;

      while (currentPage <= totalPages) {
        const response = await procurementService.getProducts({
          includeInactive: false,
          page: currentPage,
          limit: 200
        });
        collected.push(
          ...response.data.products.filter(
            (product) => product.targetSection === "gaming" || product.targetSection === "both"
          )
        );
        totalPages = response.data.pagination.totalPages;
        currentPage += 1;
      }

      setGamingProducts(collected);
    } catch {
      setGamingProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const fetchBookings = useCallback(async () => {
    setTableLoading(true);
    try {
      const response = await gamingService.getBookings({
        search: debouncedSearch || undefined,
        customerPhone: selectedCustomerPhone || undefined,
        bookingType: bookingType === "all" ? undefined : bookingType,
        status: status === "all" ? undefined : status,
        paymentStatus: paymentStatus === "all" ? undefined : paymentStatus,
        resourceCode: resourceCode || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit
      });
      setBookings(response.data.bookings);
      setTotal(response.data.pagination.total);
      setTotalPages(response.data.pagination.totalPages);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch bookings."));
    } finally {
      setTableLoading(false);
    }
  }, [debouncedSearch, selectedCustomerPhone, bookingType, status, paymentStatus, resourceCode, dateFrom, dateTo, page, limit, toast]);

  const fetchCustomerDirectory = useCallback(async () => {
    setCustomerOptionsLoading(true);
    try {
      const customerMap = new Map<string, AppSearchableSelectOption>();
      let currentPage = 1;
      let pages = 1;

      while (currentPage <= pages) {
        const response = await gamingService.getBookings({
          page: currentPage,
          limit: 200
        });
        collectCustomersFromRows(response.data.bookings, customerMap);
        pages = response.data.pagination.totalPages;
        currentPage += 1;
      }

      setCustomerOptions(
        [...customerMap.values()].sort((left, right) => {
          const labelOrder = left.label.localeCompare(right.label);
          if (labelOrder !== 0) {
            return labelOrder;
          }
          return left.value.localeCompare(right.value);
        })
      );
    } catch {
      setCustomerOptions([]);
    } finally {
      setCustomerOptionsLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchBookings(), fetchResources(), fetchGamingProducts()]);
  }, [fetchBookings, fetchGamingProducts, fetchResources, fetchStats]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    void fetchGamingProducts();
  }, [fetchGamingProducts]);

  useEffect(() => {
    void fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    void fetchCustomerDirectory();
  }, [fetchCustomerDirectory]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedCustomerPhone, bookingType, status, paymentStatus, resourceCode, dateFrom, dateTo, limit]);

  useEffect(() => {
    setBookingForm((current) => {
      if (current.paymentStatus === "paid") {
        return current;
      }
      if (!current.paymentMode) {
        return current;
      }
      return {
        ...current,
        paymentMode: ""
      };
    });
  }, [bookingForm.paymentStatus]);

  useEffect(() => {
    setBookingForm((current) => {
      if (current.paymentStatus === "paid" && current.paymentMode === "upi") {
        return current;
      }
      if (!current.paymentReference) {
        return current;
      }
      return {
        ...current,
        paymentReference: ""
      };
    });
  }, [bookingForm.paymentMode, bookingForm.paymentStatus]);

  const formResourceOptions = useMemo(
    () => resources.filter((resource) => resource.bookingType === bookingForm.bookingType),
    [bookingForm.bookingType, resources]
  );
  const formSelectedResourceCodes = useMemo(
    () => [...new Set(bookingForm.resourceCodes.filter(Boolean))],
    [bookingForm.resourceCodes]
  );
  const selectedFormResourceLabels = useMemo(
    () =>
      formResourceOptions
        .filter((resource) => formSelectedResourceCodes.includes(resource.resourceCode))
        .map((resource) => resource.resourceLabel),
    [formResourceOptions, formSelectedResourceCodes]
  );
  const playerCount = useMemo(
    () => Math.max(1, Math.floor(Number(bookingForm.playerCount) || 1)),
    [bookingForm.playerCount]
  );
  const includedSnookerPlayers = useMemo(() => {
    if (bookingForm.bookingType !== "snooker") {
      return 0;
    }
    const slotCount = Math.max(1, formSelectedResourceCodes.length);
    return slotCount * SNOOKER_INCLUDED_MEMBERS;
  }, [bookingForm.bookingType, formSelectedResourceCodes.length]);

  const productMap = useMemo(
    () => new Map(gamingProducts.map((product) => [product.id, product])),
    [gamingProducts]
  );

  const filteredProductOptions = useMemo(() => {
    const query = bookingProductSearch.trim().toLowerCase();
    if (!query) {
      return gamingProducts;
    }
    return gamingProducts.filter((product) => product.name.toLowerCase().includes(query));
  }, [bookingProductSearch, gamingProducts]);

  const bookingProductDraftTotal = useMemo(
    () =>
      bookingProductLines.reduce((sum, line) => {
        if (!line.productId) {
          return sum;
        }
        const product = productMap.get(line.productId);
        const quantity = Math.max(1, Math.round(Number(line.quantity) || 0));
        if (!product || quantity <= 0) {
          return sum;
        }
        return sum + Number(product.sellingPrice || 0) * quantity;
      }, 0),
    [bookingProductLines, productMap]
  );

  const parsedHourlyRate = useMemo(
    () => Math.max(0, Number(bookingForm.hourlyRate) || 0),
    [bookingForm.hourlyRate]
  );
  const autoGameAmount = useMemo(() => {
    const checkIn = bookingForm.checkInAt ? new Date(bookingForm.checkInAt) : null;
    if (!checkIn || Number.isNaN(checkIn.getTime())) {
      return 0;
    }
    const explicitOut = bookingForm.checkOutAt ? new Date(bookingForm.checkOutAt) : null;
    const effectiveOut =
      explicitOut && !Number.isNaN(explicitOut.getTime())
        ? explicitOut
        : bookingForm.status === "upcoming"
          ? checkIn
          : new Date();
    const minutes = Math.max(0, Math.ceil((effectiveOut.getTime() - checkIn.getTime()) / 60000));
    return Number(((minutes / 60) * parsedHourlyRate).toFixed(2));
  }, [bookingForm.checkInAt, bookingForm.checkOutAt, bookingForm.status, parsedHourlyRate]);
  const autoExtraMemberCount = useMemo(
    () => (bookingForm.bookingType === "snooker" ? Math.max(0, playerCount - includedSnookerPlayers) : 0),
    [bookingForm.bookingType, includedSnookerPlayers, playerCount]
  );
  const autoExtraCharge = useMemo(
    () => Number((autoExtraMemberCount * EXTRA_MEMBER_CHARGE).toFixed(2)),
    [autoExtraMemberCount]
  );
  const autoSystemAmount = useMemo(
    () => Number((autoGameAmount + autoExtraCharge + bookingProductDraftTotal).toFixed(2)),
    [autoExtraCharge, autoGameAmount, bookingProductDraftTotal]
  );

  useEffect(() => {
    if (!formResourceOptions.length) {
      return;
    }

    setBookingForm((current) => {
      const validCodes = current.resourceCodes.filter((code) =>
        formResourceOptions.some((resource) => resource.resourceCode === code)
      );
      if (validCodes.length > 0) {
        if (validCodes.length === current.resourceCodes.length) {
          return current;
        }
        return { ...current, resourceCodes: validCodes };
      }
      return {
        ...current,
        resourceCodes: [formResourceOptions[0].resourceCode]
      };
    });
  }, [formResourceOptions]);

  useEffect(() => {
    setBookingForm((current) => {
      if (current.customers.length === playerCount) {
        return current;
      }
      if (playerCount > current.customers.length) {
        const nextCustomers = [...current.customers];
        while (nextCustomers.length < playerCount) {
          nextCustomers.push({ name: "", phone: "" });
        }
        return { ...current, customers: nextCustomers };
      }
      return { ...current, customers: current.customers.slice(0, playerCount) };
    });
  }, [playerCount]);

  useEffect(() => {
    setBookingForm((current) => {
      const nextSystem = autoSystemAmount.toFixed(2);
      const nextFinal =
        !current.finalAmount.trim() || Math.abs((Number(current.systemCalculatedAmount) || 0) - (Number(current.finalAmount) || 0)) <= AMOUNT_DIFF_THRESHOLD
          ? nextSystem
          : current.finalAmount;
      if (current.systemCalculatedAmount === nextSystem && current.finalAmount === nextFinal) {
        return current;
      }
      return {
        ...current,
        systemCalculatedAmount: nextSystem,
        finalAmount: nextFinal
      };
    });
  }, [autoSystemAmount]);

  const statusPieData = useMemo(
    () => [
      { name: "Ongoing", value: stats.totals.ongoing, color: "#1E9C58" },
      { name: "Upcoming", value: stats.totals.upcoming, color: "#1D5DB4" },
      { name: "Completed", value: stats.totals.completed, color: "#9747FF" },
      { name: "Cancelled", value: stats.totals.cancelled, color: "#7A6358" }
    ],
    [stats.totals]
  );

  const sessionSplit = useMemo(() => {
    const snookerSessions = stats.resourceUsage
      .filter((resource) => resource.resourceCode.startsWith("board_"))
      .reduce((sum, resource) => sum + resource.bookings, 0);
    const consoleSessions = stats.resourceUsage
      .filter((resource) => !resource.resourceCode.startsWith("board_"))
      .reduce((sum, resource) => sum + resource.bookings, 0);

    const snookerResources = resources.filter((resource) => resource.bookingType === "snooker");
    const consoleResources = resources.filter((resource) => resource.bookingType === "console");

    const snookerOccupied = snookerResources.filter((resource) => !resource.isAvailable).length;
    const consoleOccupied = consoleResources.filter((resource) => !resource.isAvailable).length;

    const snookerPlayers = snookerResources.reduce(
      (sum, resource) => sum + (resource.activeBooking?.customerCount ?? 0),
      0
    );
    const consolePlayers = consoleResources.reduce(
      (sum, resource) => sum + (resource.activeBooking?.customerCount ?? 0),
      0
    );

    return {
      snookerSessions,
      consoleSessions,
      snookerOccupied,
      consoleOccupied,
      snookerTotal: snookerResources.length,
      consoleTotal: consoleResources.length,
      snookerPlayers,
      consolePlayers
    };
  }, [resources, stats.resourceUsage]);

  const loadBookingProductLines = useCallback(
    async (booking: GamingBookingRow) => {
      if (!booking.foodInvoiceNumber && !booking.foodOrderReference) {
        setBookingProductLines([createBookingProductLine()]);
        return;
      }

      setBookingProductLinesLoading(true);
      try {
        const searchToken = booking.foodInvoiceNumber || booking.foodOrderReference || "";
        const listResponse = await invoicesService.getInvoices({ search: searchToken, page: 1, limit: 30 });
        const linkedInvoice = listResponse.data.invoices.find(
          (invoice) =>
            (booking.foodInvoiceNumber && invoice.invoiceNumber === booking.foodInvoiceNumber) ||
            (booking.foodOrderReference && invoice.orderReference === booking.foodOrderReference)
        );

        if (!linkedInvoice) {
          setBookingProductLines([createBookingProductLine()]);
          return;
        }

        const detailResponse = await invoicesService.getInvoice(linkedInvoice.id);
        const mapped = detailResponse.data.lines
          .filter((line) => line.lineType === "product" && Boolean(line.referenceId))
          .map((line) => ({
            id: createDraftId(),
            productId: line.referenceId ?? "",
            quantity: String(Math.max(1, Math.round(Number(line.quantity) || 1)))
          }));
        setBookingProductLines(mapped.length ? mapped : [createBookingProductLine()]);
      } catch {
        setBookingProductLines([createBookingProductLine()]);
      } finally {
        setBookingProductLinesLoading(false);
      }
    },
    []
  );

  const openCreateModal = useCallback(() => {
    setEditingBooking(null);
    setBookingForm(createDefaultFormState(resources));
    setBookingProductSearch("");
    setBookingProductLines([createBookingProductLine()]);
    setBookingProductLinesLoading(false);
    bookingModal.onOpen();
  }, [bookingModal, resources]);

  const openEditModal = useCallback(
    (booking: GamingBookingRow) => {
      setEditingBooking(booking);
      setBookingForm(mapBookingToForm(booking));
      setBookingProductSearch("");
      setBookingProductLines([createBookingProductLine()]);
      setBookingProductLinesLoading(false);
      bookingModal.onOpen();
      void loadBookingProductLines(booking);
    },
    [bookingModal, loadBookingProductLines]
  );

  const requestDeleteBooking = useCallback(
    (booking: GamingBookingRow) => {
      setDeletingBooking(booking);
      deleteDialog.onOpen();
    },
    [deleteDialog]
  );

  const handleCloseModal = useCallback(() => {
    if (saveLoading) {
      return;
    }
    bookingModal.onClose();
  }, [bookingModal, saveLoading]);

  const handleAddCustomerRow = useCallback(() => {
    setBookingForm((current) => ({
      ...current,
      customers: [...current.customers, { name: "", phone: "" }],
      playerCount: String(current.customers.length + 1)
    }));
  }, []);

  const handleRemoveCustomerRow = useCallback((index: number) => {
    setBookingForm((current) => {
      if (current.customers.length <= 1) {
        return current;
      }
      return {
        ...current,
        customers: current.customers.filter((_, customerIndex) => customerIndex !== index),
        playerCount: String(Math.max(1, current.customers.length - 1))
      };
    });
  }, []);

  const handleCustomerChange = useCallback((index: number, field: "name" | "phone", value: string) => {
    setBookingForm((current) => ({
      ...current,
      customers: current.customers.map((member, customerIndex) =>
        customerIndex === index
          ? {
              ...member,
              [field]: value
            }
          : member
      )
    }));
  }, []);

  const handleAddProductLine = useCallback(() => {
    setBookingProductLines((current) => [...current, createBookingProductLine()]);
  }, []);

  const handleRemoveProductLine = useCallback((lineId: string) => {
    setBookingProductLines((current) =>
      current.length <= 1 ? current : current.filter((line) => line.id !== lineId)
    );
  }, []);

  const handleProductLineChange = useCallback((lineId: string, patch: Partial<BookingProductLineDraft>) => {
    setBookingProductLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
  }, []);

  const buildPayloadFromForm = useCallback(() => {
    const preparedCustomers = bookingForm.customers
      .map((member) => ({
        name: member.name.trim(),
        phone: normalizePhone(member.phone)
      }));

    if (!preparedCustomers.length || preparedCustomers.some((member) => !member.name.length)) {
      throw new Error("Enter customer name for each player.");
    }
    if (preparedCustomers.some((member) => member.phone.length > 0 && member.phone.length < 8)) {
      throw new Error("Enter a valid phone number (min 8 digits) or leave it empty.");
    }
    if (!preparedCustomers.some((member) => member.phone.length >= 8)) {
      throw new Error("At least one customer contact number is required.");
    }

    const hourlyRate = parseOptionalNumber(bookingForm.hourlyRate);
    if (hourlyRate === undefined || hourlyRate < 0) {
      throw new Error("Enter a valid hourly rate.");
    }
    const selectedResourceCodes = [...new Set(bookingForm.resourceCodes.filter(Boolean))];
    if (!selectedResourceCodes.length) {
      throw new Error("Select a board/console.");
    }
    if (bookingForm.paymentStatus === "paid" && !bookingForm.paymentMode) {
      throw new Error("Select payment mode for paid bookings.");
    }
    const upiReference =
      bookingForm.paymentStatus === "paid" && bookingForm.paymentMode === "upi"
        ? bookingForm.paymentReference.trim() || extractUpiReferenceFromNote(editingBooking?.note)
        : "";
    if (bookingForm.paymentStatus === "paid" && bookingForm.paymentMode === "upi" && !upiReference) {
      throw new Error("UPI reference ID is required for paid UPI booking.");
    }
    const finalAmount = parseOptionalNumber(bookingForm.finalAmount);
    const overrideReason = cleanText(bookingForm.amountOverrideReason);
    if (finalAmount !== undefined && Math.abs(finalAmount - autoSystemAmount) > AMOUNT_DIFF_THRESHOLD && !overrideReason) {
      throw new Error("Override reason is required when final amount differs from system amount.");
    }

    const noteSegments = [cleanText(stripUpiReferenceFromNote(bookingForm.note))];
    if (bookingForm.paymentStatus === "paid" && bookingForm.paymentMode === "upi" && upiReference) {
      noteSegments.push(`UPI Ref: ${upiReference}`);
    }
    const sharedPayload = {
      bookingType: bookingForm.bookingType,
      resourceCode: selectedResourceCodes[0],
      resourceCodes: selectedResourceCodes,
      playerCount,
      checkInAt: toIsoDateTime(bookingForm.checkInAt),
      checkOutAt: toIsoDateTime(bookingForm.checkOutAt),
      hourlyRate,
      customers: preparedCustomers,
      status: bookingForm.status,
      paymentStatus: bookingForm.paymentStatus,
      paymentMode: bookingForm.paymentStatus === "paid" ? bookingForm.paymentMode || undefined : undefined,
      finalAmount,
      systemCalculatedAmount: autoSystemAmount,
      extraMemberCount: autoExtraMemberCount,
      extraMemberCharge: autoExtraCharge,
      amountOverrideReason: overrideReason,
      foodAndBeverageAmount: bookingProductDraftTotal,
      bookingChannel: cleanText(bookingForm.bookingChannel),
      note: cleanText(noteSegments.filter(Boolean).join(" | "))
    };

    return sharedPayload;
  }, [autoExtraCharge, autoExtraMemberCount, autoSystemAmount, bookingForm, bookingProductDraftTotal, editingBooking?.note, playerCount]);

  const handleSaveBooking = useCallback(async () => {
    setSaveLoading(true);
    try {
      const sharedPayload = buildPayloadFromForm();
      const selectedProductLines = bookingProductLines.filter((line) => line.productId);
      const parsedProductLines = selectedProductLines.map((line) => {
        const product = productMap.get(line.productId);
        const quantity = Math.max(1, Math.round(Number(line.quantity) || 0));
        if (!product || !Number.isFinite(quantity) || quantity <= 0) {
          return null;
        }
        const unitPrice = Number(product.sellingPrice) || 0;
        return {
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice,
          lineTotal: Number((unitPrice * quantity).toFixed(2))
        };
      });
      if (parsedProductLines.some((line) => line === null)) {
        throw new Error("Please fix selected product lines before saving.");
      }
      const validProductLines = parsedProductLines.filter(
        (line): line is NonNullable<(typeof parsedProductLines)[number]> => Boolean(line)
      );
      const hasProductLines = validProductLines.length > 0;
      const productTotalAmount = Number(
        validProductLines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2)
      );
      const payloadWithProducts = {
        ...sharedPayload,
        foodAndBeverageAmount: hasProductLines ? productTotalAmount : sharedPayload.foodAndBeverageAmount
      };
      let savedBooking: GamingBookingRow;

      if (editingBooking) {
        const payload: GamingUpdateBookingPayload = {
          ...payloadWithProducts
        };
        const response = await gamingService.updateBooking(editingBooking.id, payload);
        savedBooking = response.data.booking;
      } else {
        const payload: GamingCreateBookingPayload = {
          ...payloadWithProducts
        };
        const response = await gamingService.createBooking(payload);
        savedBooking = response.data.booking;
      }

      if (hasProductLines) {
        const invoiceNumber = cleanText(savedBooking.foodInvoiceNumber ?? "") ?? createInvoiceNumber();
        const orderReference =
          cleanText(savedBooking.foodOrderReference ?? "") ??
          `GM-FOOD-${savedBooking.id}`;
        const invoiceStatus = payloadWithProducts.paymentStatus === "paid" ? "paid" : "pending";
        const paymentMode = payloadWithProducts.paymentMode ?? "cash";
        const paymentReference = bookingForm.paymentReference.trim() || extractUpiReferenceFromNote(editingBooking?.note);
        const payments =
          invoiceStatus === "paid"
            ? [
                {
                  mode: paymentMode,
                  amount: productTotalAmount,
                  receivedAmount: productTotalAmount,
                  changeAmount: 0,
                  referenceNo: paymentMode === "upi" ? paymentReference : undefined
                }
              ]
            : [];

        await invoicesService.syncUpsert({
          idempotencyKey: createDraftId(),
          invoiceNumber,
          orderReference,
          customerPhone: savedBooking.primaryCustomerPhone,
          customerName: savedBooking.primaryCustomerName,
          orderType: "snooker",
          tableLabel: savedBooking.resourceLabel,
          kitchenStatus: invoiceStatus === "paid" ? "served" : "queued",
          status: invoiceStatus,
          paymentMode,
          subtotal: productTotalAmount,
          itemDiscountAmount: 0,
          couponDiscountAmount: 0,
          manualDiscountAmount: 0,
          taxAmount: 0,
          totalAmount: productTotalAmount,
          notes: `Gaming booking ${savedBooking.bookingNumber}`,
          sourceCreatedAt: new Date().toISOString(),
          lines: validProductLines.map((line) => ({
            lineType: "product",
            referenceId: line.productId,
            nameSnapshot: line.productName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal
          })),
          payments
        });

        const bookingUpdate = await gamingService.updateBooking(savedBooking.id, {
          foodAndBeverageAmount: productTotalAmount,
          foodInvoiceStatus: invoiceStatus,
          foodOrderReference: orderReference,
          foodInvoiceNumber: invoiceNumber
        });
        savedBooking = bookingUpdate.data.booking;
      } else if (
        savedBooking.foodOrderReference ||
        savedBooking.foodInvoiceNumber ||
        savedBooking.foodInvoiceStatus !== "none" ||
        (savedBooking.foodAndBeverageAmount ?? 0) > 0
      ) {
        const bookingUpdate = await gamingService.updateBooking(savedBooking.id, {
          foodAndBeverageAmount: 0,
          foodInvoiceStatus: "none",
          foodOrderReference: "",
          foodInvoiceNumber: ""
        });
        savedBooking = bookingUpdate.data.booking;
      }

      toast.success(editingBooking ? "Gaming booking updated." : "Gaming booking created.");
      bookingModal.onClose();
      await Promise.all([refreshAll(), fetchCustomerDirectory()]);
    } catch (error) {
      const fallback = editingBooking ? "Unable to update booking." : "Unable to create booking.";
      toast.error(extractErrorMessage(error, fallback));
    } finally {
      setSaveLoading(false);
    }
  }, [
    bookingForm.paymentReference,
    bookingProductLines,
    buildPayloadFromForm,
    bookingModal,
    editingBooking,
    fetchCustomerDirectory,
    productMap,
    refreshAll,
    toast
  ]);

  const handleDeleteBooking = useCallback(async () => {
    if (!deletingBooking) {
      return;
    }
    setDeleteLoading(true);
    try {
      await gamingService.deleteBooking(deletingBooking.id);
      toast.success("Gaming booking deleted.");
      deleteDialog.onClose();
      setDeletingBooking(null);
      await Promise.all([refreshAll(), fetchCustomerDirectory()]);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to delete booking."));
    } finally {
      setDeleteLoading(false);
    }
  }, [deletingBooking, deleteDialog, fetchCustomerDirectory, refreshAll, toast]);

  const resetToFullRecords = useCallback(() => {
    setDateFrom("");
    setDateTo("");
    setSelectedCustomerPhone("");
    setPage(1);
  }, []);

  const columns = useMemo(
    () =>
      [
        {
          key: "booking",
          header: "Booking",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={800}>{row.bookingNumber}</Text>
              <Text fontSize="xs" color="#7A6258">
                {row.bookingChannel ?? "desktop"}
              </Text>
            </VStack>
          )
        },
        {
          key: "customer",
          header: "Customer",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.primaryCustomerName}</Text>
              <Text fontSize="xs" color="#7A6258">
                {row.primaryCustomerPhone} | {row.customerCount} player(s)
              </Text>
            </VStack>
          )
        },
        {
          key: "slot",
          header: "Type / Slot",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Text textTransform="capitalize">{row.bookingType}</Text>
              <Text fontSize="xs" color="#7A6258">
                {row.resourceLabel}
              </Text>
            </VStack>
          )
        },
        {
          key: "timing",
          header: "Check In / Out",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Text>{formatDateTime(row.checkInAt)}</Text>
              <Text fontSize="xs" color="#7A6258">
                Out: {formatDateTime(row.checkOutAt)}
              </Text>
            </VStack>
          )
        },
        {
          key: "amount",
          header: "System / Final",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Text fontSize="xs" color="#7A6258">
                System {formatCurrency(row.systemCalculatedAmount)}
              </Text>
              <Text fontWeight={700}>{formatCurrency(row.finalAmount)}</Text>
              <Text fontSize="xs" color="#7A6258">
                Game {formatCurrency(row.calculatedAmount)} | Extra {formatCurrency(row.extraMemberCharge)} (
                {row.extraMemberCount})
              </Text>
              <Text fontSize="xs" color="#7A6258">
                F&B {formatCurrency(row.foodAndBeverageAmount)} | {row.foodInvoiceStatus}
              </Text>
              {row.isAmountOverridden ? (
                <Text fontSize="xs" color="#B45309">
                  Override: {row.amountOverrideReason || "Reason not provided"}
                </Text>
              ) : null}
            </VStack>
          )
        },
        {
          key: "status",
          header: "Status",
          render: (row: GamingBookingRow) => (
            <Badge colorScheme={statusColorMap[row.status]} textTransform="capitalize">
              {row.status}
            </Badge>
          )
        },
        {
          key: "payment",
          header: "Payment",
          render: (row: GamingBookingRow) => (
            <VStack align="start" spacing={0}>
              <Badge colorScheme={paymentColorMap[row.paymentStatus]} textTransform="capitalize">
                {row.paymentStatus}
              </Badge>
              {row.paymentMode ? (
                <Text fontSize="xs" color="#7A6258" textTransform="uppercase">
                  {row.paymentMode}
                </Text>
              ) : null}
            </VStack>
          )
        },
        {
          key: "staff",
          header: "Staff",
          render: (row: GamingBookingRow) => row.staffName || row.staffUsername || "-"
        },
        {
          key: "actions",
          header: "Actions",
          render: (row: GamingBookingRow) => (
            <HStack spacing={2}>
              <ActionIconButton
                aria-label="Edit booking"
                tooltip="Edit booking"
                icon={<Edit2 size={16} />}
                size="sm"
                variant="outline"
                onClick={() => openEditModal(row)}
              />
              <ActionIconButton
                aria-label="Delete booking"
                tooltip="Delete booking"
                icon={<Trash2 size={16} />}
                size="sm"
                variant="outline"
                colorScheme="red"
                onClick={() => requestDeleteBooking(row)}
              />
            </HStack>
          )
        }
      ] as Array<{ key: string; header: string; render?: (row: GamingBookingRow) => ReactNode }>,
    [openEditModal, requestDeleteBooking]
  );

  if (user?.role !== UserRole.ADMIN) {
    return (
      <VStack spacing={6} align="stretch">
        <PageHeader title="Gaming" subtitle="This module is restricted to admin users." />
        <AppCard>
          <EmptyState title="Unauthorized" description="Only admin users can access gaming operations." />
        </AppCard>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Gaming Management"
        subtitle="Admin operations dashboard for snooker and console sessions, collections, edits, and historical entries."
      />

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4}>
        <StatsCard
          label="Current Active Sessions"
          value={statsLoading ? "..." : String(stats.totals.ongoing)}
          helper={`${stats.totals.activePlayers} active players`}
        />
        <StatsCard
          label="Upcoming Bookings"
          value={statsLoading ? "..." : String(stats.totals.upcoming)}
          helper={`${stats.totals.endingSoon} ending soon`}
        />
        <StatsCard
          label="Total Revenue"
          value={statsLoading ? "..." : formatCurrency(stats.totals.totalRevenue)}
          helper={`${stats.totals.paidBookings} paid bookings`}
        />
        <StatsCard
          label="Pending Collection"
          value={statsLoading ? "..." : formatCurrency(stats.totals.pendingCollection)}
          helper={`${stats.totals.pendingPayments} payment pending`}
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 3 }} spacing={4}>
        <StatsCard
          label="Gaming Product Purchase"
          value={statsLoading ? "..." : formatCurrency(stats.gamingProducts.purchasedAmount)}
          helper={`${stats.gamingProducts.purchasedQuantity} units purchased`}
        />
        <StatsCard
          label="Gaming Product Sales"
          value={statsLoading ? "..." : formatCurrency(stats.gamingProducts.soldAmount)}
          helper={`${stats.gamingProducts.soldQuantity} units sold`}
        />
        <StatsCard
          label="Gaming Product Profit"
          value={statsLoading ? "..." : formatCurrency(stats.gamingProducts.estimatedProfit)}
          helper={`Stock value ${formatCurrency(stats.gamingProducts.stockValuation)}`}
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4}>
        <StatsCard
          label="Snooker Sessions"
          value={statsLoading ? "..." : String(sessionSplit.snookerSessions)}
          helper={`${sessionSplit.snookerPlayers} active players | ${sessionSplit.snookerOccupied}/${sessionSplit.snookerTotal} tables occupied`}
        />
        <StatsCard
          label="Console Sessions"
          value={statsLoading ? "..." : String(sessionSplit.consoleSessions)}
          helper={`${sessionSplit.consolePlayers} active players | ${sessionSplit.consoleOccupied}/${sessionSplit.consoleTotal} consoles occupied`}
        />
        <StatsCard
          label="Snooker Occupancy"
          value={statsLoading ? "..." : `${sessionSplit.snookerOccupied}/${sessionSplit.snookerTotal}`}
          helper="Current board usage"
        />
        <StatsCard
          label="Console Occupancy"
          value={statsLoading ? "..." : `${sessionSplit.consoleOccupied}/${sessionSplit.consoleTotal}`}
          helper="Current console usage"
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
        <AppCard title="Session Status Mix" subtitle="Distribution of booking lifecycle statuses.">
          <Box h="290px">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPieData} dataKey="value" nameKey="name" innerRadius={68} outerRadius={105}>
                  {statusPieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </AppCard>

        <AppCard title="Top Revenue Slots" subtitle="Highest billed boards / consoles in selected range.">
          <Box h="290px">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.resourceUsage.slice(0, 8)}>
                <XAxis dataKey="resourceLabel" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#D97706" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </AppCard>
      </SimpleGrid>

      <AppCard title="Bookings" subtitle="Search, filter, create, edit, and delete gaming sessions.">
        <VStack spacing={4} align="stretch">
          <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
            <AppInput
              label="Search"
              placeholder="Booking / customer / phone / slot"
              value={search}
              onChange={(event) =>
                setSearch((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)
              }
            />
            <AppSearchableSelect
              label="Customer"
              value={selectedCustomerPhone}
              options={customerOptions}
              onValueChange={setSelectedCustomerPhone}
              placeholder="All customers"
              searchPlaceholder="Search customer name / phone"
              isLoading={customerOptionsLoading}
            />
            <FormControl>
              <FormLabel>Booking Type</FormLabel>
              <Select value={bookingType} onChange={(event) => setBookingType(event.target.value as typeof bookingType)}>
                <option value="all">All Types</option>
                <option value="snooker">Snooker</option>
                <option value="console">Console</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Status</FormLabel>
              <Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                <option value="all">All Status</option>
                <option value="ongoing">Ongoing</option>
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Payment</FormLabel>
              <Select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as typeof paymentStatus)}>
                <option value="all">All Payments</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
              </Select>
            </FormControl>
            <AppInput
              label="Date From"
              type="date"
              value={dateFrom}
              onChange={(event) =>
                setDateFrom((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)
              }
            />
            <AppInput
              label="Date To"
              type="date"
              value={dateTo}
              onChange={(event) =>
                setDateTo((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)
              }
            />
            <FormControl>
              <FormLabel>Slot</FormLabel>
              <Select value={resourceCode} onChange={(event) => setResourceCode(event.target.value)}>
                <option value="">All Slots</option>
                {resources.map((resource) => (
                  <option key={resource.resourceCode} value={resource.resourceCode}>
                    {resource.resourceLabel}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Records per page</FormLabel>
              <Select
                value={String(limit)}
                onChange={(event) => {
                  setLimit(Number(event.target.value) || 8);
                  setPage(1);
                }}
              >
                <option value="8">8</option>
                <option value="12">12</option>
                <option value="20">20</option>
              </Select>
            </FormControl>
          </SimpleGrid>

          <HStack justify="space-between" flexWrap="wrap" gap={3}>
            <HStack spacing={2} flexWrap="wrap">
              {resources.map((resource) => (
                <Badge
                  key={`slot-${resource.resourceCode}`}
                  colorScheme={resource.isAvailable ? "green" : "orange"}
                  px={3}
                  py={1}
                  borderRadius="full"
                  textTransform="none"
                >
                  {resource.resourceLabel} | {resource.isAvailable ? "Free" : "Occupied"}
                </Badge>
              ))}
            </HStack>
            <HStack>
              <AppButton variant="outline" onClick={resetToFullRecords}>
                Full Records
              </AppButton>
              <AppButton variant="outline" onClick={() => void refreshAll()}>
                Refresh
              </AppButton>
              <AppButton leftIcon={<Plus size={16} />} onClick={openCreateModal}>
                New Record
              </AppButton>
            </HStack>
          </HStack>

          {tableLoading ? (
            <SkeletonTable />
          ) : (
            <DataTable
              columns={columns}
              rows={bookings}
              emptyState={<EmptyState title="No bookings found" description="No gaming sessions for selected filters." />}
            />
          )}

          <HStack justify="space-between" flexWrap="wrap" gap={3}>
            <Text color="#705B52" fontSize="sm">
              Showing {bookings.length} of {total} records
            </Text>
            <HStack>
              <AppButton variant="outline" isDisabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Previous
              </AppButton>
              <Text fontWeight={700}>
                Page {page} of {totalPages}
              </Text>
              <AppButton
                variant="outline"
                isDisabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </AppButton>
            </HStack>
          </HStack>
        </VStack>
      </AppCard>

      <Modal
        isOpen={bookingModal.isOpen}
        onClose={handleCloseModal}
        size="4xl"
        closeOnOverlayClick={!saveLoading}
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent borderRadius="16px" maxH="calc(100vh - 64px)" my={8}>
          <ModalHeader>{editingBooking ? "Edit Gaming Record" : "Create Gaming Record"}</ModalHeader>
          <ModalCloseButton isDisabled={saveLoading} />
          <ModalBody overflowY="auto">
            <VStack spacing={4} align="stretch">
              <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                <FormControl>
                  <FormLabel>Booking Type</FormLabel>
                  <Select
                    value={bookingForm.bookingType}
                    onChange={(event) =>
                      setBookingForm((current) => ({
                        ...current,
                        bookingType: event.target.value as GamingBookingType
                      }))
                    }
                  >
                    <option value="snooker">Snooker</option>
                    <option value="console">Console</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>Slot</FormLabel>
                  <Box>
                    <Menu closeOnSelect={false}>
                      <MenuButton as={Button} variant="outline" w="100%" justifyContent="space-between">
                        {selectedFormResourceLabels.length
                          ? `${selectedFormResourceLabels.length} selected`
                          : "Select board/console"}
                      </MenuButton>
                      <MenuList minW="100%" maxH="220px" overflowY="auto" zIndex={2000}>
                        <MenuOptionGroup
                          type="checkbox"
                          value={formSelectedResourceCodes}
                          onChange={(value) => {
                            const next = Array.isArray(value) ? value : [value];
                            setBookingForm((current) => ({
                              ...current,
                              resourceCodes: next.filter(Boolean)
                            }));
                          }}
                        >
                          {formResourceOptions.map((resource) => (
                            <MenuItemOption key={resource.resourceCode} value={resource.resourceCode}>
                              {resource.resourceLabel}
                            </MenuItemOption>
                          ))}
                        </MenuOptionGroup>
                      </MenuList>
                    </Menu>
                    <Text mt={2} fontSize="xs" color="#7A6258">
                      Selected: {selectedFormResourceLabels.join(", ") || "None"}
                    </Text>
                  </Box>
                </FormControl>
                <FormControl>
                  <FormLabel>Status</FormLabel>
                  <Select
                    value={bookingForm.status}
                    onChange={(event) =>
                      setBookingForm((current) => ({
                        ...current,
                        status: event.target.value as GamingBookingStatus
                      }))
                    }
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>Payment Status</FormLabel>
                  <Select
                    value={bookingForm.paymentStatus}
                    onChange={(event) =>
                      setBookingForm((current) => ({
                        ...current,
                        paymentStatus: event.target.value as GamingPaymentStatus
                      }))
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="refunded">Refunded</option>
                  </Select>
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                <FormControl isDisabled={bookingForm.paymentStatus !== "paid"}>
                  <FormLabel>Payment Mode</FormLabel>
                  <Select
                    value={bookingForm.paymentMode}
                    onChange={(event) =>
                      setBookingForm((current) => ({
                        ...current,
                        paymentMode: event.target.value as GamingPaymentMode | ""
                      }))
                    }
                  >
                    <option value="">Select mode</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                  </Select>
                </FormControl>
                <AppInput
                  label="Hourly Rate"
                  type="number"
                  min={0}
                  step="0.01"
                  value={bookingForm.hourlyRate}
                  onChange={(event) =>
                    setBookingForm((current) => ({
                      ...current,
                      hourlyRate: (event.target as HTMLInputElement).value
                    }))
                  }
                />
                <AppInput
                  label="Players"
                  type="number"
                  min={1}
                  step="1"
                  value={bookingForm.playerCount}
                  onChange={(event) =>
                    setBookingForm((current) => ({
                      ...current,
                      playerCount: (event.target as HTMLInputElement).value
                    }))
                  }
                />
                <AppInput
                  label="Booking Channel"
                  value={bookingForm.bookingChannel}
                  onChange={(event) =>
                    setBookingForm((current) => ({
                      ...current,
                      bookingChannel: (event.target as HTMLInputElement).value
                    }))
                  }
                />
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                <AppInput
                  label="Check In"
                  type="datetime-local"
                  value={bookingForm.checkInAt}
                  onChange={(event) =>
                    setBookingForm((current) => ({
                      ...current,
                      checkInAt: (event.target as HTMLInputElement).value
                    }))
                  }
                />
                <AppInput
                  label="Check Out (optional)"
                  type="datetime-local"
                  value={bookingForm.checkOutAt}
                  onChange={(event) =>
                    setBookingForm((current) => ({
                      ...current,
                      checkOutAt: (event.target as HTMLInputElement).value
                    }))
                  }
                />
                <AppInput
                  label="System Amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={autoSystemAmount.toFixed(2)}
                  isReadOnly
                />
                <AppInput
                  label="Final Amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={bookingForm.finalAmount}
                  onChange={(event) =>
                    setBookingForm((current) => ({
                      ...current,
                      finalAmount: (event.target as HTMLInputElement).value
                    }))
                  }
                />
              </SimpleGrid>

              {bookingForm.paymentStatus === "paid" && bookingForm.paymentMode === "upi" ? (
                <AppInput
                  label="UPI Reference ID"
                  value={bookingForm.paymentReference}
                  onChange={(event) =>
                    setBookingForm((current) => ({
                      ...current,
                      paymentReference: (event.target as HTMLInputElement).value
                    }))
                  }
                />
              ) : null}

              <Text fontSize="sm" color="#7A6258">
                Auto Calculation: Game {formatCurrency(autoGameAmount)} + Extra Player Charge{" "}
                {formatCurrency(autoExtraCharge)} + Products {formatCurrency(bookingProductDraftTotal)} = System{" "}
                {formatCurrency(autoSystemAmount)}
              </Text>
              {bookingForm.bookingType === "snooker" ? (
                <Text fontSize="xs" color="#8A6F63">
                  Included players: {includedSnookerPlayers} ({formSelectedResourceCodes.length || 1} board x{" "}
                  {SNOOKER_INCLUDED_MEMBERS}) | Extra player fee: {formatCurrency(EXTRA_MEMBER_CHARGE)} each
                </Text>
              ) : null}

              <AppInput
                label="Override Reason (required when Final differs from System)"
                value={bookingForm.amountOverrideReason}
                onChange={(event) =>
                  setBookingForm((current) => ({
                    ...current,
                    amountOverrideReason: (event.target as HTMLInputElement).value
                  }))
                }
              />

              <AppInput
                label="Notes"
                value={bookingForm.note}
                onChange={(event) =>
                  setBookingForm((current) => ({
                    ...current,
                    note: (event.target as HTMLInputElement).value
                  }))
                }
              />

              <VStack align="stretch" spacing={2}>
                <HStack justify="space-between">
                  <Text fontWeight={700}>Customers</Text>
                  <AppButton size="sm" variant="outline" onClick={handleAddCustomerRow}>
                    Add Customer
                  </AppButton>
                </HStack>
                <Text fontSize="xs" color="#8A6F63">
                  Phone number is optional per player. At least one contact number is mandatory.
                </Text>
                {bookingForm.customers.map((customer, index) => (
                  <SimpleGrid key={`customer-${index}`} columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
                    <AppInput
                      label={`Customer ${index + 1} Name`}
                      value={customer.name}
                      onChange={(event) =>
                        handleCustomerChange(index, "name", (event.target as HTMLInputElement).value)
                      }
                    />
                    <AppInput
                      label={`Customer ${index + 1} Phone`}
                      value={customer.phone}
                      onChange={(event) =>
                        handleCustomerChange(index, "phone", (event.target as HTMLInputElement).value)
                      }
                    />
                    <HStack align="end">
                      <AppButton
                        variant="outline"
                        colorScheme="red"
                        isDisabled={bookingForm.customers.length <= 1}
                        onClick={() => handleRemoveCustomerRow(index)}
                      >
                        Remove
                      </AppButton>
                    </HStack>
                  </SimpleGrid>
                ))}
              </VStack>

              <VStack
                align="stretch"
                spacing={3}
                p={3}
                borderRadius="12px"
                border="1px solid"
                borderColor="rgba(133, 78, 48, 0.18)"
                bg="#FFFBF4"
              >
                <HStack justify="space-between" flexWrap="wrap" gap={2}>
                  <Text fontWeight={700}>Snooker Products (Optional)</Text>
                  <AppButton size="sm" variant="outline" onClick={handleAddProductLine}>
                    Add Product
                  </AppButton>
                </HStack>
                <AppInput
                  label="Search Product"
                  placeholder="Type product name"
                  value={bookingProductSearch}
                  onChange={(event) =>
                    setBookingProductSearch((event.target as HTMLInputElement).value)
                  }
                />
                {bookingProductLinesLoading ? (
                  <Text fontSize="sm" color="#7A6258">
                    Loading linked products...
                  </Text>
                ) : (
                  <VStack align="stretch" spacing={3}>
                    {bookingProductLines.map((line) => {
                      const quantity = Math.max(1, Math.round(Number(line.quantity) || 1));
                      const selectedProduct = productMap.get(line.productId);
                      const lineTotal = Number((Number(selectedProduct?.sellingPrice || 0) * quantity).toFixed(2));
                      return (
                        <SimpleGrid key={line.id} columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                          <FormControl>
                            <FormLabel>Product</FormLabel>
                            <Select
                              value={line.productId}
                              onChange={(event) =>
                                handleProductLineChange(line.id, { productId: event.target.value })
                              }
                            >
                              <option value="">Select product</option>
                              {filteredProductOptions.map((product) => (
                                <option key={`${line.id}-${product.id}`} value={product.id}>
                                  {product.name} ({formatCurrency(product.sellingPrice)})
                                </option>
                              ))}
                            </Select>
                          </FormControl>
                          <AppInput
                            label="Quantity"
                            type="number"
                            min={1}
                            step="1"
                            value={line.quantity}
                            onChange={(event) =>
                              handleProductLineChange(line.id, {
                                quantity: (event.target as HTMLInputElement).value
                              })
                            }
                          />
                          <AppInput label="Line Total" value={formatCurrency(lineTotal)} isReadOnly />
                          <HStack align="end">
                            <AppButton
                              variant="outline"
                              colorScheme="red"
                              isDisabled={bookingProductLines.length <= 1}
                              onClick={() => handleRemoveProductLine(line.id)}
                            >
                              Remove
                            </AppButton>
                          </HStack>
                        </SimpleGrid>
                      );
                    })}
                  </VStack>
                )}
                <Text fontSize="sm" color="#7A6258">
                  Draft Product Total: {formatCurrency(bookingProductDraftTotal)}
                  {productsLoading ? " | Refreshing products..." : ""}
                </Text>
              </VStack>
            </VStack>
          </ModalBody>
          <ModalFooter gap={3}>
            <AppButton variant="outline" onClick={handleCloseModal} isDisabled={saveLoading}>
              Cancel
            </AppButton>
            <AppButton onClick={() => void handleSaveBooking()} isLoading={saveLoading}>
              {editingBooking ? "Save Changes" : "Create Record"}
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Delete booking record?"
        description="This removes the selected gaming booking and updates revenue/analytics accordingly."
        onClose={() => {
          if (!deleteLoading) {
            deleteDialog.onClose();
            setDeletingBooking(null);
          }
        }}
        onConfirm={() => void handleDeleteBooking()}
        isLoading={deleteLoading}
      >
        {deletingBooking ? (
          <Text fontSize="sm" color="#7A6258">
            {deletingBooking.bookingNumber} | {deletingBooking.primaryCustomerName} | {deletingBooking.resourceLabel}
          </Text>
        ) : null}
      </ConfirmDialog>
    </VStack>
  );
};
