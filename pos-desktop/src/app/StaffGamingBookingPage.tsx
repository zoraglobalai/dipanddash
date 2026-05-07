import {
  Badge,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  HStack,
  Input,
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
  useDisclosure,
  useToast
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiEdit2, FiEye, FiPlus, FiShoppingBag } from "react-icons/fi";

import { usePosAuth } from "@/app/PosAuthContext";
import { usePos } from "@/app/PosContext";
import { PosLoadingState } from "@/components/common/PosLoadingState";
import { PosDataTable, type PosTableColumn } from "@/components/common/PosDataTable";
import { customersService } from "@/services/customers.service";
import { gamingBookingsService } from "@/services/gaming-bookings.service";
import { snookerOrderService } from "@/services/snooker-order.service";
import type {
  CatalogSnapshot,
  CustomerRecord,
  GamingBooking,
  GamingBookingStatus,
  GamingBookingType,
  GamingDiscountType,
  GamingPaymentMode,
  PosOrder
} from "@/types/pos";
import { formatINR } from "@/utils/currency";

type CustomerDraft = { name: string; phone: string };
type FormMode = "create" | "edit";
type FoodDraftLine = { id: string; refId: string; quantity: string };
type ProductOption = { id: string; label: string; unitPrice: number; gstPercentage: number };

type BookingForm = {
  bookingType: GamingBookingType;
  resourceCodes: string[];
  checkInLocal: string;
  hourlyRate: string;
  playerCount: string;
  bookingStatus: "upcoming" | "ongoing" | "cancelled";
  paymentStatus: "pending" | "paid";
  paymentMode: GamingPaymentMode;
  note: string;
  customers: CustomerDraft[];
};

const getNowLocalDateTime = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const toIsoFromLocal = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const isoToLocalInput = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return getNowLocalDateTime();
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const defaultForm = (): BookingForm => ({
  bookingType: "snooker",
  resourceCodes: [],
  checkInLocal: getNowLocalDateTime(),
  hourlyRate: "0",
  playerCount: "1",
  bookingStatus: "ongoing",
  paymentStatus: "pending",
  paymentMode: "cash",
  note: "",
  customers: [{ name: "", phone: "" }]
});

const createFoodLine = (): FoodDraftLine => ({
  id: Math.random().toString(36).slice(2, 10),
  refId: "",
  quantity: "1"
});

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString("en-IN") : "-");
const statusBadgeColor = (status: GamingBookingStatus) => status === "ongoing" ? "green" : status === "upcoming" ? "blue" : status === "completed" ? "purple" : "gray";
const foodStatusColor = (status: GamingBooking["foodInvoiceStatus"]) => status === "paid" ? "green" : status === "pending" ? "orange" : status === "cancelled" ? "red" : "gray";
const SNOOKER_INCLUDED_MEMBERS = 4;
const EXTRA_MEMBER_CHARGE = 50;
const AMOUNT_DIFF_THRESHOLD = 0.01;
const BOOKINGS_PER_PAGE = 10;
const roundCheckoutAmount = (value: number) => Math.round(Math.max(0, Number(value) || 0));
const parsePaymentSplitAmount = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return roundCheckoutAmount(parsed);
};
const formatPaymentSplitSummary = (split: { cash: number; card: number; upi: number }) => {
  const parts: string[] = [];
  if (split.cash > AMOUNT_DIFF_THRESHOLD) {
    parts.push(`Cash ${formatINR(split.cash)}`);
  }
  if (split.upi > AMOUNT_DIFF_THRESHOLD) {
    parts.push(`UPI ${formatINR(split.upi)}`);
  }
  if (split.card > AMOUNT_DIFF_THRESHOLD) {
    parts.push(`Card ${formatINR(split.card)}`);
  }
  return parts.join(" + ");
};
const formatDuration = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours} hour${hours === 1 ? "" : "s"} ${mins} min${mins === 1 ? "" : "s"}`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${mins} min${mins === 1 ? "" : "s"}`;
};
const calculateDiscountAmount = (type: GamingDiscountType, value: string, systemAmount: number) => {
  const parsedValue = roundCheckoutAmount(Number(value));
  if (type === "percentage") {
    return roundCheckoutAmount(Math.min(systemAmount, (systemAmount * Math.min(parsedValue, 100)) / 100));
  }
  if (type === "manual") {
    return roundCheckoutAmount(Math.min(systemAmount, parsedValue));
  }
  return 0;
};
const normalizePhone = (value: string) => value.replace(/\D/g, "");

const calcCheckoutAmount = (booking: GamingBooking, checkOutAtIso: string) => {
  const checkIn = new Date(booking.checkInAt).getTime();
  const checkOut = new Date(checkOutAtIso).getTime();
  const extraMembers =
    booking.bookingType === "snooker" ? Math.max(0, booking.playerCount - SNOOKER_INCLUDED_MEMBERS) : 0;
  const extraCharge = extraMembers * EXTRA_MEMBER_CHARGE;
  if (checkOut <= checkIn) return roundCheckoutAmount(extraCharge);
  const minutes = Math.ceil((checkOut - checkIn) / 60000);
  return roundCheckoutAmount(((minutes / 60) * booking.hourlyRate) + extraCharge);
};

const getGamingProductOptions = (snapshot: CatalogSnapshot | null) => {
  if (!snapshot) return [] as ProductOption[];
  return (snapshot.products ?? [])
    .filter((x) => x.isActive && (x.targetSection === "gaming" || x.targetSection === "both"))
    .map((x) => ({ id: x.id, label: x.name, unitPrice: x.sellingPrice, gstPercentage: 0 }));
};

const mapOrderToDraftLines = (order: PosOrder | null | undefined): FoodDraftLine[] => {
  if (!order) {
    return [createFoodLine()];
  }
  const mapped = order.lines
    .filter((line) => line.lineType === "product" && Boolean(line.refId))
    .map((line) => ({
      id: createFoodLine().id,
      refId: line.refId,
      quantity: String(Math.max(1, Math.round(Number(line.quantity) || 1)))
    }));
  return mapped.length ? mapped : [createFoodLine()];
};

const matchesCustomerQuery = (customer: CustomerDraft, query: string) => {
  const target = query.trim().toLowerCase();
  if (!target) {
    return true;
  }
  const phoneTarget = normalizePhone(target);
  return (
    customer.name.toLowerCase().includes(target) ||
    normalizePhone(customer.phone).includes(phoneTarget)
  );
};

const searchSnookerCustomerSuggestions = async (query: string): Promise<CustomerRecord[]> => {
  const normalized = query.trim();
  const [customerRows, bookingRows] = await Promise.all([
    customersService.search(normalized, { scope: "snooker" }),
    gamingBookingsService.listBookings({ bookingType: "snooker", search: normalized }, 80)
  ]);
  const byPhone = new Map<string, CustomerRecord>();
  const fallbackRows: CustomerRecord[] = [];

  const addCustomer = (customer: CustomerRecord) => {
    const phoneKey = normalizePhone(customer.phone);
    if (!phoneKey) {
      fallbackRows.push(customer);
      return;
    }
    if (!byPhone.has(phoneKey)) {
      byPhone.set(phoneKey, customer);
    }
  };

  customerRows.forEach(addCustomer);
  bookingRows.forEach((booking) => {
    booking.customers
      .filter((customer: CustomerDraft) => matchesCustomerQuery(customer, normalized))
      .forEach((customer: CustomerDraft) => {
        const phone = normalizePhone(customer.phone);
        addCustomer({
          localId: `snooker-booking-${phone || customer.name.toLowerCase().replace(/\s+/g, "-")}`,
          serverId: null,
          name: customer.name.trim(),
          phone,
          email: null,
          notes: null,
          syncStatus: "synced",
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt
        });
      });
  });

  return [...byPhone.values(), ...fallbackRows].slice(0, 8);
};

export const StaffGamingBookingPage = () => {
  const toast = useToast();
  const { session } = usePosAuth();
  const { catalog, refreshPendingBills, refreshRecentBills, refreshCompletedBills, refreshKitchenOrders } = usePos();

  const bookingModal = useDisclosure();
  const checkoutModal = useDisclosure();
  const checkoutConfirmModal = useDisclosure();
  const viewModal = useDisclosure();
  const foodModal = useDisclosure();

  const [bookings, setBookings] = useState<GamingBooking[]>([]);
  const [isBookingsLoading, setIsBookingsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<GamingBookingStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [saving, setSaving] = useState(false);

  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingBooking, setEditingBooking] = useState<GamingBooking | null>(null);
  const [form, setForm] = useState<BookingForm>(defaultForm());
  const [customerLookup, setCustomerLookup] = useState<{
    index: number | null;
    query: string;
    results: CustomerRecord[];
    isSearching: boolean;
  }>({
    index: null,
    query: "",
    results: [],
    isSearching: false
  });

  const [checkoutBooking, setCheckoutBooking] = useState<GamingBooking | null>(null);
  const [checkoutFoodOrder, setCheckoutFoodOrder] = useState<PosOrder | null>(null);
  const [isCheckoutFoodOrderLoading, setIsCheckoutFoodOrderLoading] = useState(false);
  const [checkoutAtLocal, setCheckoutAtLocal] = useState(getNowLocalDateTime());
  const [checkoutFinalAmount, setCheckoutFinalAmount] = useState("0");
  const [checkoutFinalAmountTouched, setCheckoutFinalAmountTouched] = useState(false);
  const [checkoutDiscountType, setCheckoutDiscountType] = useState<GamingDiscountType>("none");
  const [checkoutDiscountValue, setCheckoutDiscountValue] = useState("0");
  const [checkoutPaymentStatus, setCheckoutPaymentStatus] = useState<"pending" | "paid">("paid");
  const [checkoutPaymentMode, setCheckoutPaymentMode] = useState<GamingPaymentMode>("cash");
  const [checkoutSplitCash, setCheckoutSplitCash] = useState("");
  const [checkoutSplitCard, setCheckoutSplitCard] = useState("");
  const [checkoutSplitUpi, setCheckoutSplitUpi] = useState("");
  const [checkoutPaymentReference, setCheckoutPaymentReference] = useState("");
  const [checkoutOverrideReason, setCheckoutOverrideReason] = useState("");
  const [viewBooking, setViewBooking] = useState<GamingBooking | null>(null);
  const [viewFoodOrder, setViewFoodOrder] = useState<PosOrder | null>(null);
  const [isViewFoodOrderLoading, setIsViewFoodOrderLoading] = useState(false);

  const [foodBooking, setFoodBooking] = useState<GamingBooking | null>(null);
  const [foodLines, setFoodLines] = useState<FoodDraftLine[]>([createFoodLine()]);
  const [foodSearch, setFoodSearch] = useState("");
  const [isFoodOrderLoading, setIsFoodOrderLoading] = useState(false);
  const [bookingProductLines, setBookingProductLines] = useState<FoodDraftLine[]>([createFoodLine()]);
  const [bookingProductSearch, setBookingProductSearch] = useState("");
  const [isBookingProductLoading, setIsBookingProductLoading] = useState(false);
  const isEditMode = formMode === "edit";

  const productOptions = useMemo(() => getGamingProductOptions(catalog), [catalog]);
  const productOptionMap = useMemo(() => new Map(productOptions.map((entry) => [entry.id, entry])), [productOptions]);

  const loadBookings = useCallback(async (forceServerSync = false) => {
    setIsBookingsLoading(true);
    try {
      const rows = await gamingBookingsService.listBookings({ status: statusFilter, search }, 500, {
        forceServerSync
      });
      setBookings(rows);
    } catch (error) {
      toast({
        status: "error",
        title: "Unable to load bookings",
        description: error instanceof Error ? error.message : "Please retry."
      });
    } finally {
      setIsBookingsLoading(false);
    }
  }, [search, statusFilter, toast]);

  useEffect(() => { void loadBookings(); }, [loadBookings]);

  useEffect(() => {
    setTablePage(1);
  }, [search, statusFilter]);

  const refreshAllViews = useCallback(async () => {
    await Promise.all([
      loadBookings(true),
      refreshPendingBills(),
      refreshRecentBills(),
      refreshCompletedBills(),
      refreshKitchenOrders()
    ]);
  }, [loadBookings, refreshCompletedBills, refreshKitchenOrders, refreshPendingBills, refreshRecentBills]);

  const resourceOptions = useMemo(() => gamingBookingsService.getResourcesByType(form.bookingType), [form.bookingType]);
  const selectedResourceCodes = useMemo(
    () => [...new Set(form.resourceCodes.filter(Boolean))] as GamingBooking["resourceCode"][],
    [form.resourceCodes]
  );
  const selectedResourceLabels = useMemo(
    () =>
      resourceOptions
        .filter((entry) => selectedResourceCodes.includes(entry.code))
        .map((entry) => entry.label),
    [resourceOptions, selectedResourceCodes]
  );
  const formPlayerCount = useMemo(() => Math.max(1, Math.floor(Number(form.playerCount) || 1)), [form.playerCount]);
  const formExtraMembers = useMemo(
    () => (form.bookingType === "snooker" ? Math.max(0, formPlayerCount - SNOOKER_INCLUDED_MEMBERS) : 0),
    [form.bookingType, formPlayerCount]
  );
  const formExtraCharge = useMemo(
    () => Number((formExtraMembers * EXTRA_MEMBER_CHARGE).toFixed(2)),
    [formExtraMembers]
  );

  useEffect(() => {
    if (!resourceOptions.length) return;
    setForm((prev) => {
      const existing = prev.resourceCodes.filter((code) => resourceOptions.some((entry) => entry.code === code));
      if (existing.length) {
        return { ...prev, resourceCodes: existing };
      }
      return { ...prev, resourceCodes: [resourceOptions[0].code] };
    });
  }, [resourceOptions]);

  const summary = useMemo(() => {
    const ongoing = bookings.filter((row) => row.status === "ongoing");
    return {
      ongoing: ongoing.length,
      upcoming: bookings.filter((row) => row.status === "upcoming").length,
      completed: bookings.filter((row) => row.status === "completed").length,
      pending: bookings.filter((row) => row.paymentStatus === "pending").length,
      players: ongoing.reduce((sum, row) => sum + row.playerCount, 0)
    };
  }, [bookings]);

  const totalTablePages = useMemo(
    () => Math.max(1, Math.ceil(bookings.length / BOOKINGS_PER_PAGE)),
    [bookings.length]
  );
  const safeTablePage = Math.min(tablePage, totalTablePages);
  const pagedBookings = useMemo(() => {
    const start = (safeTablePage - 1) * BOOKINGS_PER_PAGE;
    return bookings.slice(start, start + BOOKINGS_PER_PAGE);
  }, [bookings, safeTablePage]);
  const tableStartIndex = bookings.length ? (safeTablePage - 1) * BOOKINGS_PER_PAGE + 1 : 0;
  const tableEndIndex = Math.min(safeTablePage * BOOKINGS_PER_PAGE, bookings.length);

  useEffect(() => {
    const query = customerLookup.query.trim();
    if (customerLookup.index === null || query.length < 2) {
      if (customerLookup.results.length || customerLookup.isSearching) {
        setCustomerLookup((prev) => ({ ...prev, results: [], isSearching: false }));
      }
      return;
    }

    let isActive = true;
    setCustomerLookup((prev) => ({ ...prev, isSearching: true }));
    const timer = window.setTimeout(() => {
      void searchSnookerCustomerSuggestions(query)
        .then((results) => {
          if (!isActive) return;
          setCustomerLookup((prev) =>
            prev.query.trim() === query ? { ...prev, results, isSearching: false } : prev
          );
        })
        .catch(() => {
          if (!isActive) return;
          setCustomerLookup((prev) =>
            prev.query.trim() === query ? { ...prev, results: [], isSearching: false } : prev
          );
        });
    }, 300);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [customerLookup.index, customerLookup.query]);

  const updateCustomerDraft = (index: number, next: Partial<CustomerDraft>) => {
    setForm((prev) => ({
      ...prev,
      customers: prev.customers.map((entry, i) => (i === index ? { ...entry, ...next } : entry))
    }));
  };

  const selectCustomerSuggestion = (index: number, customer: CustomerRecord) => {
    updateCustomerDraft(index, { name: customer.name, phone: customer.phone });
    setCustomerLookup({ index: null, query: "", results: [], isSearching: false });
  };

  const applyCustomerLookup = async (index: number) => {
    const row = form.customers[index];
    const phone = normalizePhone(row?.phone ?? "");
    if (phone.length !== 10) return;
    const found =
      (await searchSnookerCustomerSuggestions(phone)).find((customer) => normalizePhone(customer.phone) === phone) ??
      null;
    if (!found) return;
    selectCustomerSuggestion(index, found);
  };

  const openCreate = () => {
    setFormMode("create");
    setEditingBooking(null);
    setForm(defaultForm());
    setBookingProductSearch("");
    setBookingProductLines([createFoodLine()]);
    setIsBookingProductLoading(false);
    bookingModal.onOpen();
  };

  const openEdit = async (booking: GamingBooking) => {
    if (booking.status === "completed") return;
    setFormMode("edit");
    setEditingBooking(booking);
    setBookingProductSearch("");
    setBookingProductLines([createFoodLine()]);
    setIsBookingProductLoading(Boolean(booking.foodOrderReference));
    setForm({
      bookingType: booking.bookingType,
      resourceCodes: booking.resourceCodes?.length ? booking.resourceCodes : [booking.resourceCode],
      checkInLocal: isoToLocalInput(booking.checkInAt),
      hourlyRate: String(booking.hourlyRate),
      playerCount: String(booking.playerCount),
      bookingStatus: booking.status,
      paymentStatus: booking.paymentStatus === "paid" ? "paid" : "pending",
      paymentMode: booking.paymentMode ?? "cash",
      note: booking.note ?? "",
      customers: booking.customers.length ? booking.customers.map((entry) => ({ ...entry })) : [{ name: "", phone: "" }]
    });
    bookingModal.onOpen();
    if (!booking.foodOrderReference) {
      setIsBookingProductLoading(false);
      return;
    }
    try {
      const linkedOrder = await snookerOrderService.getFoodOrderByReference(booking.foodOrderReference);
      setBookingProductLines(mapOrderToDraftLines(linkedOrder));
    } catch (error) {
      toast({
        status: "warning",
        title: "Unable to load linked products",
        description: error instanceof Error ? error.message : "Please retry."
      });
    } finally {
      setIsBookingProductLoading(false);
    }
  };

  const saveBooking = async () => {
    if (!session) return;
    if (!selectedResourceCodes.length) {
      toast({ status: "warning", title: "Select at least one board/console." });
      return;
    }
    const playerCount = formPlayerCount;
    const selectedProductLines = bookingProductLines.filter((line) => line.refId);
    const parsedProductLines = selectedProductLines.map((line) => {
      const option = productOptionMap.get(line.refId);
      const quantity = Math.max(1, Math.round(Number(line.quantity) || 0));
      if (!option || !Number.isFinite(quantity) || quantity <= 0) {
        return null;
      }
      return {
        lineType: "product" as const,
        refId: option.id,
        name: option.label,
        quantity,
        unitPrice: option.unitPrice,
        gstPercentage: option.gstPercentage
      };
    });
    const hasInvalidProductLine = parsedProductLines.some((line) => line === null);
    if (hasInvalidProductLine) {
      toast({ status: "warning", title: "Please fix selected product lines" });
      return;
    }
    if (selectedProductLines.length > 0 && !catalog) {
      toast({
        status: "warning",
        title: "Catalog still syncing",
        description: "Please wait for product catalog sync and retry."
      });
      return;
    }
    setSaving(true);
    try {
      let savedBooking: GamingBooking | null = null;
      if (formMode === "create") {
        savedBooking = await gamingBookingsService.createBooking({
          bookingType: form.bookingType,
          resourceCodes: selectedResourceCodes,
          playerCount,
          customers: form.customers,
          checkInAt: toIsoFromLocal(form.checkInLocal),
          hourlyRate: Number(form.hourlyRate) || 0,
          status: form.bookingStatus,
          paymentStatus: form.paymentStatus,
          paymentMode: form.paymentStatus === "paid" ? form.paymentMode : undefined,
          note: form.note,
          bookingChannel: "desktop"
        }, session);
        toast({ status: "success", title: "Booking created successfully" });
      } else if (editingBooking) {
        savedBooking = await gamingBookingsService.updateBooking(editingBooking.localBookingId, {
          customers: form.customers,
          playerCount,
          paymentStatus: form.paymentStatus,
          paymentMode: form.paymentStatus === "paid" ? form.paymentMode : undefined
        });
        toast({ status: "success", title: "Booking updated successfully" });
      }
      const payloadLines = parsedProductLines.filter((line): line is NonNullable<typeof line> => Boolean(line));
      if (savedBooking && catalog && payloadLines.length > 0) {
        await snookerOrderService.upsertFoodOrder({
          booking: savedBooking,
          snapshot: catalog,
          lines: payloadLines,
          notes: `Snooker booking ${savedBooking.bookingNumber}`
        });
      }
      bookingModal.onClose();
      await loadBookings();
    } catch (error) {
      toast({ status: "error", title: formMode === "create" ? "Unable to create booking" : "Unable to update booking", description: error instanceof Error ? error.message : "Please retry." });
    } finally { setSaving(false); }
  };
  const loadLinkedFoodOrder = useCallback(
    async (orderReference: string | null | undefined) => {
      if (!orderReference) {
        return null;
      }
      try {
        return await snookerOrderService.getFoodOrderByReference(orderReference);
      } catch (error) {
        toast({
          status: "warning",
          title: "Unable to load linked products",
          description: error instanceof Error ? error.message : "Please retry."
        });
        return null;
      }
    },
    [toast]
  );

  const openView = useCallback(
    async (booking: GamingBooking) => {
      setViewBooking(booking);
      setViewFoodOrder(null);
      setIsViewFoodOrderLoading(Boolean(booking.foodOrderReference));
      viewModal.onOpen();
      const linkedOrder = await loadLinkedFoodOrder(booking.foodOrderReference);
      setViewFoodOrder(linkedOrder);
      setIsViewFoodOrderLoading(false);
    },
    [loadLinkedFoodOrder, viewModal]
  );

  const openCheckout = useCallback(
    async (booking: GamingBooking) => {
      if (booking.status === "completed") return;
      const nowLocal = getNowLocalDateTime();
      const systemAmount = calcCheckoutAmount(booking, toIsoFromLocal(nowLocal));
      const foodAmount = roundCheckoutAmount(booking.foodAndBeverageAmount || 0);
      const systemTotal = roundCheckoutAmount(systemAmount + foodAmount);
      setCheckoutBooking(booking);
      setCheckoutFoodOrder(null);
      setIsCheckoutFoodOrderLoading(Boolean(booking.foodOrderReference));
      setCheckoutAtLocal(nowLocal);
      setCheckoutFinalAmount(String(systemTotal));
      setCheckoutFinalAmountTouched(false);
      setCheckoutDiscountType("none");
      setCheckoutDiscountValue("0");
      setCheckoutPaymentStatus(booking.paymentStatus === "paid" ? "paid" : "pending");
      const initialPaymentMode = booking.paymentMode ?? "cash";
      setCheckoutPaymentMode(initialPaymentMode);
      const storedSplit = {
        cash: Number(booking.paidCashAmount ?? 0),
        card: Number(booking.paidCardAmount ?? 0),
        upi: Number(booking.paidUpiAmount ?? 0)
      };
      const storedSplitTotal = roundCheckoutAmount(storedSplit.cash + storedSplit.card + storedSplit.upi);
      if (booking.paymentStatus === "paid" && storedSplitTotal > AMOUNT_DIFF_THRESHOLD) {
        setCheckoutSplitCash(storedSplit.cash ? String(storedSplit.cash) : "");
        setCheckoutSplitCard(storedSplit.card ? String(storedSplit.card) : "");
        setCheckoutSplitUpi(storedSplit.upi ? String(storedSplit.upi) : "");
      } else if (booking.paymentStatus === "paid" && initialPaymentMode !== "mixed") {
        setCheckoutSplitCash(initialPaymentMode === "cash" ? String(systemTotal) : "");
        setCheckoutSplitCard(initialPaymentMode === "card" ? String(systemTotal) : "");
        setCheckoutSplitUpi(initialPaymentMode === "upi" ? String(systemTotal) : "");
      } else {
        setCheckoutSplitCash("");
        setCheckoutSplitCard("");
        setCheckoutSplitUpi("");
      }
      setCheckoutPaymentReference("");
      setCheckoutOverrideReason(booking.amountOverrideReason ?? "");
      checkoutConfirmModal.onClose();
      checkoutModal.onOpen();
      const linkedOrder = await loadLinkedFoodOrder(booking.foodOrderReference);
      setCheckoutFoodOrder(linkedOrder);
      setIsCheckoutFoodOrderLoading(false);
    },
    [checkoutConfirmModal, checkoutModal, loadLinkedFoodOrder]
  );

  const checkoutSystemAmount = useMemo(() => (checkoutBooking ? calcCheckoutAmount(checkoutBooking, toIsoFromLocal(checkoutAtLocal)) : 0), [checkoutAtLocal, checkoutBooking]);
  const checkoutFoodAmount = useMemo(
    () => roundCheckoutAmount(checkoutFoodOrder?.totals.totalAmount ?? checkoutBooking?.foodAndBeverageAmount ?? 0),
    [checkoutBooking, checkoutFoodOrder]
  );
  const checkoutSystemTotal = useMemo(
    () => roundCheckoutAmount(checkoutSystemAmount + checkoutFoodAmount),
    [checkoutFoodAmount, checkoutSystemAmount]
  );
  const checkoutPlayMinutes = useMemo(() => {
    if (!checkoutBooking) return 0;
    const checkIn = new Date(checkoutBooking.checkInAt).getTime();
    const checkOut = new Date(toIsoFromLocal(checkoutAtLocal)).getTime();
    return Math.max(0, Math.ceil((checkOut - checkIn) / 60000));
  }, [checkoutAtLocal, checkoutBooking]);
  const checkoutDiscountAmount = useMemo(
    () => calculateDiscountAmount(checkoutDiscountType, checkoutDiscountValue, checkoutSystemTotal),
    [checkoutDiscountType, checkoutDiscountValue, checkoutSystemTotal]
  );
  const checkoutDiscountedFinalAmount = useMemo(
    () => roundCheckoutAmount(checkoutSystemTotal - checkoutDiscountAmount),
    [checkoutDiscountAmount, checkoutSystemTotal]
  );
  const checkoutExtraMembers = useMemo(
    () =>
      checkoutBooking?.bookingType === "snooker"
        ? Math.max(0, checkoutBooking.playerCount - SNOOKER_INCLUDED_MEMBERS)
        : 0,
    [checkoutBooking]
  );
  const checkoutExtraCharge = useMemo(
    () => roundCheckoutAmount(checkoutExtraMembers * EXTRA_MEMBER_CHARGE),
    [checkoutExtraMembers]
  );
  const checkoutProductLines = useMemo(() => checkoutFoodOrder?.lines ?? [], [checkoutFoodOrder]);
  const checkoutFinalAmountNumber = useMemo(() => {
    const parsed = Number(checkoutFinalAmount);
    return Number.isFinite(parsed) ? roundCheckoutAmount(parsed) : checkoutSystemTotal;
  }, [checkoutFinalAmount, checkoutSystemTotal]);
  const checkoutPaymentBreakdown = useMemo(
    () => ({
      cash: parsePaymentSplitAmount(checkoutSplitCash),
      card: parsePaymentSplitAmount(checkoutSplitCard),
      upi: parsePaymentSplitAmount(checkoutSplitUpi)
    }),
    [checkoutSplitCard, checkoutSplitCash, checkoutSplitUpi]
  );
  const checkoutPaymentBreakdownTotal = useMemo(
    () => roundCheckoutAmount(checkoutPaymentBreakdown.cash + checkoutPaymentBreakdown.card + checkoutPaymentBreakdown.upi),
    [checkoutPaymentBreakdown]
  );
  const checkoutPaymentSplitGap = useMemo(
    () => checkoutFinalAmountNumber - checkoutPaymentBreakdownTotal,
    [checkoutFinalAmountNumber, checkoutPaymentBreakdownTotal]
  );
  const checkoutPaymentSplitChannelCount = useMemo(
    () =>
      [checkoutPaymentBreakdown.cash, checkoutPaymentBreakdown.card, checkoutPaymentBreakdown.upi].filter(
        (amount) => amount > AMOUNT_DIFF_THRESHOLD
      ).length,
    [checkoutPaymentBreakdown]
  );
  const checkoutHasSplitMismatch = useMemo(
    () => Math.abs(checkoutPaymentSplitGap) > AMOUNT_DIFF_THRESHOLD,
    [checkoutPaymentSplitGap]
  );
  const checkoutPaymentSplitSummary = useMemo(
    () => formatPaymentSplitSummary(checkoutPaymentBreakdown),
    [checkoutPaymentBreakdown]
  );
  const checkoutRequiresOverrideReason = useMemo(
    () => Math.abs(checkoutFinalAmountNumber - checkoutDiscountedFinalAmount) > AMOUNT_DIFF_THRESHOLD,
    [checkoutDiscountedFinalAmount, checkoutFinalAmountNumber]
  );
  const checkoutRequiresReference = useMemo(
    () =>
      checkoutPaymentStatus === "paid" &&
      (checkoutPaymentMode === "upi" ||
        checkoutPaymentMode === "card" ||
        (checkoutPaymentMode === "mixed" &&
          (checkoutPaymentBreakdown.card > AMOUNT_DIFF_THRESHOLD ||
            checkoutPaymentBreakdown.upi > AMOUNT_DIFF_THRESHOLD))),
    [checkoutPaymentBreakdown.card, checkoutPaymentBreakdown.upi, checkoutPaymentMode, checkoutPaymentStatus]
  );
  const viewProductLines = useMemo(() => viewFoodOrder?.lines ?? [], [viewFoodOrder]);

  useEffect(() => {
    if (checkoutPaymentStatus !== "paid") {
      return;
    }
    if (checkoutPaymentMode === "mixed") {
      return;
    }
    const total = checkoutFinalAmountNumber;
    setCheckoutSplitCash(checkoutPaymentMode === "cash" ? String(total) : "");
    setCheckoutSplitCard(checkoutPaymentMode === "card" ? String(total) : "");
    setCheckoutSplitUpi(checkoutPaymentMode === "upi" ? String(total) : "");
  }, [checkoutFinalAmountNumber, checkoutPaymentMode, checkoutPaymentStatus]);

  useEffect(() => {
    if (!checkoutFinalAmountTouched) {
      setCheckoutFinalAmount(String(checkoutDiscountedFinalAmount));
    }
  }, [checkoutDiscountedFinalAmount, checkoutFinalAmountTouched]);

  const validateCheckoutPayment = useCallback(() => {
    if (checkoutPaymentStatus !== "paid") {
      return true;
    }

    if (checkoutPaymentMode === "mixed" && checkoutPaymentSplitChannelCount < 2) {
      toast({
        status: "warning",
        title: "Split payment required",
        description: "For Mixed mode, enter at least 2 payment channels."
      });
      return false;
    }

    if (checkoutHasSplitMismatch) {
      toast({
        status: "warning",
        title: "Split amount mismatch",
        description: "Split total should match the final amount."
      });
      return false;
    }

    if (checkoutRequiresReference && !checkoutPaymentReference.trim()) {
      toast({
        status: "warning",
        title: "Reference ID required",
        description: "Enter card/UPI reference before checkout."
      });
      return false;
    }

    return true;
  }, [
    checkoutHasSplitMismatch,
    checkoutPaymentMode,
    checkoutPaymentSplitChannelCount,
    checkoutPaymentStatus,
    checkoutPaymentReference,
    checkoutRequiresReference,
    toast
  ]);

  const confirmCheckout = async () => {
    if (!checkoutBooking) return;
    if (!validateCheckoutPayment()) {
      return;
    }
    setSaving(true);
    try {
      let latestFoodAmount = checkoutFoodAmount;
      if (catalog && checkoutPaymentStatus === "paid") {
        const paidFoodOrder = await snookerOrderService.markFoodOrderPaidForCheckout({
          booking: checkoutBooking,
          snapshot: catalog,
          paymentMode: checkoutPaymentMode,
          paymentBreakdown: checkoutPaymentBreakdown,
          paymentBreakdownTotal: checkoutFinalAmountNumber,
          referenceNo: checkoutRequiresReference ? checkoutPaymentReference.trim() : undefined
        });
        if (paidFoodOrder) latestFoodAmount = paidFoodOrder.totals.totalAmount;
      }

      const derivedSystemTotal = roundCheckoutAmount(checkoutSystemAmount + latestFoodAmount);
      const derivedDiscountAmount = calculateDiscountAmount(checkoutDiscountType, checkoutDiscountValue, derivedSystemTotal);
      const derivedDiscountedFinal = roundCheckoutAmount(derivedSystemTotal - derivedDiscountAmount);
      const grandTotal = checkoutFinalAmountNumber;
      const overrideReason = checkoutOverrideReason.trim();
      if (Math.abs(grandTotal - derivedDiscountedFinal) > AMOUNT_DIFF_THRESHOLD && !overrideReason) {
        toast({
          status: "warning",
          title: "Reason required",
          description: "Please enter why final amount differs from discounted amount."
        });
        setSaving(false);
        return;
      }
      await gamingBookingsService.checkoutBooking(checkoutBooking.localBookingId, {
        checkOutAt: toIsoFromLocal(checkoutAtLocal),
        finalAmount: grandTotal,
        systemCalculatedAmount: derivedSystemTotal,
        extraMemberCount: checkoutExtraMembers,
        extraMemberCharge: checkoutExtraCharge,
        discountType: checkoutDiscountType,
        discountValue: checkoutDiscountType === "none" ? 0 : roundCheckoutAmount(Number(checkoutDiscountValue)),
        discountAmount: derivedDiscountAmount,
        amountOverrideReason: overrideReason || undefined,
        paymentStatus: checkoutPaymentStatus,
        paymentMode: checkoutPaymentStatus === "paid" ? checkoutPaymentMode : undefined,
        paymentBreakdown: checkoutPaymentStatus === "paid" ? checkoutPaymentBreakdown : undefined,
        paymentReference: checkoutRequiresReference ? checkoutPaymentReference.trim() : undefined
      });

      checkoutConfirmModal.onClose();
      checkoutModal.onClose();
      await refreshAllViews();
      toast({
        status: "success",
        title: "Checkout completed",
        description:
          checkoutPaymentStatus === "paid"
            ? "Booking is now locked as paid."
            : "Booking is now locked with pending payment."
      });
    } catch (error) {
      toast({ status: "error", title: "Checkout failed", description: error instanceof Error ? error.message : "Please retry." });
    } finally { setSaving(false); }
  };

  const openCheckoutConfirmation = () => {
    if (!checkoutBooking) return;
    if (checkoutRequiresOverrideReason && !checkoutOverrideReason.trim()) {
      toast({
        status: "warning",
        title: "Reason required",
        description: "Please enter why final amount differs from discounted amount."
      });
      return;
    }
    if (!validateCheckoutPayment()) {
      return;
    }
    checkoutConfirmModal.onOpen();
  };

  const openFoodOrderModal = async (booking: GamingBooking) => {
    setFoodBooking(booking);
    setFoodSearch("");
    setFoodLines([createFoodLine()]);
    setIsFoodOrderLoading(Boolean(booking.foodOrderReference));
    foodModal.onOpen();
    const linkedOrder = await loadLinkedFoodOrder(booking.foodOrderReference);
    setFoodLines(mapOrderToDraftLines(linkedOrder));
    setIsFoodOrderLoading(false);
  };

  const updateFoodLine = (lineId: string, next: Partial<FoodDraftLine>) => {
    setFoodLines((previous) => previous.map((line) => (line.id === lineId ? { ...line, ...next } : line)));
  };

  const removeFoodLine = (lineId: string) => {
    setFoodLines((previous) => (previous.length <= 1 ? previous : previous.filter((line) => line.id !== lineId)));
  };

  const foodDraftTotal = useMemo(() => {
    return foodLines.reduce((sum, line) => {
      const quantity = Number(line.quantity) || 0;
      const option = productOptionMap.get(line.refId);
      if (!option || quantity <= 0) return sum;
      return sum + option.unitPrice * quantity;
    }, 0);
  }, [foodLines, productOptionMap]);

  const getFilteredOptions = () => {
    const query = foodSearch.trim().toLowerCase();
    if (!query) return productOptions;
    return productOptions.filter((entry) => entry.label.toLowerCase().includes(query));
  };

  const saveFoodOrder = async () => {
    if (!foodBooking || !catalog) return;
    const payloadLines = foodLines.map((line) => {
      if (!line.refId) {
        return null;
      }
      const option = productOptionMap.get(line.refId);
      const quantity = Number(line.quantity);
      if (!option || !Number.isFinite(quantity) || quantity <= 0) return null;
      return { lineType: "product" as const, refId: option.id, name: option.label, quantity, unitPrice: option.unitPrice, gstPercentage: option.gstPercentage };
    }).filter((line): line is NonNullable<typeof line> => Boolean(line));

    if (!payloadLines.length) {
      toast({ status: "warning", title: "Select at least one product line" });
      return;
    }

    if (payloadLines.length !== foodLines.filter((line) => line.refId).length) {
      toast({ status: "warning", title: "Please select valid product lines" });
      return;
    }

    setSaving(true);
    try {
      await snookerOrderService.upsertFoodOrder({ booking: foodBooking, snapshot: catalog, lines: payloadLines, notes: `Snooker booking ${foodBooking.bookingNumber}` });
      foodModal.onClose();
      await refreshAllViews();
      toast({ status: "success", title: "Snooker product order saved" });
    } catch (error) {
      toast({ status: "error", title: "Unable to save product order", description: error instanceof Error ? error.message : "Please retry." });
    } finally { setSaving(false); }
  };

  const bookingColumns = useMemo<PosTableColumn<GamingBooking>[]>(
    () => [
      {
        key: "bookingNumber",
        header: "Booking",
        alwaysVisible: true,
        render: (booking) => <Text fontWeight={800}>{booking.bookingNumber}</Text>
      },
      {
        key: "customer",
        header: "Customer",
        render: (booking) => (
          <Box>
            <Text fontWeight={700}>{booking.primaryCustomerName}</Text>
            <Text fontSize="xs" color="#705A50">
              {booking.primaryCustomerPhone}
            </Text>
          </Box>
        )
      },
      {
        key: "slot",
        header: "Slot",
        render: (booking) => (
          <Box>
            <Text textTransform="capitalize">{booking.bookingType}</Text>
            <Text fontSize="xs" color="#705A50">
              {booking.resourceCodes?.length
                ? booking.resourceCodes.map((code) => gamingBookingsService.getResourcesByType(booking.bookingType).find((entry) => entry.code === code)?.label ?? code).join(", ")
                : booking.resourceLabel}
            </Text>
          </Box>
        )
      },
      {
        key: "players",
        header: "Players",
        render: (booking) => <Text fontWeight={700}>{booking.playerCount}</Text>
      },
      {
        key: "checkInAt",
        header: "Check In",
        render: (booking) => (
          <Box>
            <Text>{formatDateTime(booking.checkInAt)}</Text>
            {booking.checkOutAt ? (
              <Text fontSize="xs" color="#705A50">
                Out: {formatDateTime(booking.checkOutAt)}
              </Text>
            ) : null}
            <Text fontSize="xs" color="#705A50">
              Playing {formatDuration(Math.ceil(((booking.checkOutAt ? new Date(booking.checkOutAt).getTime() : Date.now()) - new Date(booking.checkInAt).getTime()) / 60000))}
            </Text>
          </Box>
        )
      },
      {
        key: "amount",
        header: "Amount",
        render: (booking) => (
          <VStack align="start" spacing={0}>
            <Text fontWeight={800}>
              {formatINR(booking.status === "completed" ? booking.finalAmount : gamingBookingsService.getLiveAmount(booking))}
            </Text>
            <Text fontSize="xs" color="#705A50">
              System {formatINR(booking.systemCalculatedAmount)}
            </Text>
            {(booking.discountAmount ?? 0) > AMOUNT_DIFF_THRESHOLD ? (
              <Text fontSize="xs" color="#046C4E">
                Discount {formatINR(booking.discountAmount ?? 0)}
                {booking.discountType === "percentage" ? ` (${booking.discountValue ?? 0}%)` : ""}
              </Text>
            ) : null}
            {booking.amountOverrideReason ? (
              <Text fontSize="xs" color="#B45309">
                Override: {booking.amountOverrideReason}
              </Text>
            ) : null}
          </VStack>
        )
      },
      {
        key: "foodOrder",
        header: "Product Order",
        render: (booking) => (
          <VStack align="start" spacing={1}>
            <Badge colorScheme={foodStatusColor(booking.foodInvoiceStatus)} textTransform="capitalize">
              {booking.foodInvoiceStatus === "none" ? "No Order" : booking.foodInvoiceStatus}
            </Badge>
            <Text fontSize="xs" color="#705A50">
              {formatINR(booking.foodAndBeverageAmount)}
            </Text>
            {booking.foodInvoiceNumber ? (
              <Text fontSize="xs" color="#705A50">
                {booking.foodInvoiceNumber}
              </Text>
            ) : null}
          </VStack>
        )
      },
      {
        key: "status",
        header: "Status",
        render: (booking) => (
          <Badge colorScheme={statusBadgeColor(booking.status)} textTransform="capitalize">
            {booking.status}
          </Badge>
        )
      },
      {
        key: "payment",
        header: "Payment",
        render: (booking) => {
          const splitSummary =
            booking.paymentStatus === "paid"
              ? formatPaymentSplitSummary({
                  cash: booking.paidCashAmount,
                  card: booking.paidCardAmount,
                  upi: booking.paidUpiAmount
                })
              : "";
          return (
            <Box>
              <Badge colorScheme={booking.paymentStatus === "paid" ? "green" : "orange"} textTransform="capitalize">
                {booking.paymentStatus}
              </Badge>
              {booking.paymentStatus === "paid" && booking.paymentMode ? (
                <Text fontSize="xs" textTransform="uppercase">
                  {booking.paymentMode}
                </Text>
              ) : null}
              {splitSummary ? (
                <Text fontSize="xs" color="#705A50">
                  {splitSummary}
                </Text>
              ) : null}
            </Box>
          );
        }
      },
      {
        key: "actions",
        header: "Actions",
        alwaysVisible: true,
        render: (booking) => (
          <HStack>
            <Button size="xs" variant="outline" leftIcon={<FiEye size={12} />} onClick={() => void openView(booking)}>
              View
            </Button>
            {booking.status === "completed" ? (
              <Text fontSize="xs" fontWeight={700} color="#705A50">
                Locked
              </Text>
            ) : (
              <>
                <Button size="xs" variant="outline" leftIcon={<FiEdit2 size={12} />} onClick={() => void openEdit(booking)}>
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  leftIcon={<FiShoppingBag size={12} />}
                  onClick={() => void openFoodOrderModal(booking)}
                >
                  Products
                </Button>
                <Button size="xs" onClick={() => void openCheckout(booking)}>
                  Checkout
                </Button>
              </>
            )}
          </HStack>
        )
      }
    ],
    [openCheckout, openEdit, openFoodOrderModal, openView]
  );

  return (
    <VStack align="stretch" spacing={4}>
      <SimpleGrid columns={{ base: 1, sm: 2, xl: 6 }} spacing={3}>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white"><Text fontSize="sm">Playing</Text><Text fontSize="2xl" fontWeight={900}>{summary.ongoing}</Text></Box>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white"><Text fontSize="sm">Upcoming</Text><Text fontSize="2xl" fontWeight={900}>{summary.upcoming}</Text></Box>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white"><Text fontSize="sm">Completed</Text><Text fontSize="2xl" fontWeight={900}>{summary.completed}</Text></Box>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white"><Text fontSize="sm">Pending Payment</Text><Text fontSize="2xl" fontWeight={900}>{summary.pending}</Text></Box>
        <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white"><Text fontSize="sm">Active Players</Text><Text fontSize="2xl" fontWeight={900}>{summary.players}</Text></Box>
        <Box display="flex" alignItems={{ base: "stretch", xl: "end" }} justifyContent={{ base: "stretch", xl: "end" }}>
          <Button leftIcon={<FiPlus size={16} />} onClick={openCreate} w={{ base: "full", xl: "auto" }}>
            New Booking
          </Button>
        </Box>
      </SimpleGrid>

      <Box p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="14px" bg="white">
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mb={3}>
          <FormControl><FormLabel>Status</FormLabel><Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as GamingBookingStatus | "all")}><option value="all">All</option><option value="ongoing">Ongoing</option><option value="upcoming">Upcoming</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></FormControl>
          <FormControl><FormLabel>Search</FormLabel><Input placeholder="Booking/customer/phone" value={search} onChange={(e) => setSearch(e.target.value)} /></FormControl>
          <Box display="flex" alignItems={{ base: "stretch", md: "end" }}>
            <Button variant="outline" isLoading={isBookingsLoading} onClick={() => void refreshAllViews()} w={{ base: "full", md: "auto" }}>
              Refresh
            </Button>
          </Box>
        </SimpleGrid>

        <PosDataTable
          rows={pagedBookings}
          columns={bookingColumns}
          getRowId={(booking) => booking.localBookingId}
          emptyMessage="No bookings found for current filters."
          loading={isBookingsLoading}
          loadingMessage="Loading snooker bookings..."
          maxColumns={6}
        />
        <HStack justify="space-between" flexWrap="wrap" gap={3} mt={3}>
          <Text fontSize="sm" color="#705A50">
            Showing {tableStartIndex}-{tableEndIndex} of {bookings.length} records
          </Text>
          <HStack>
            <Button
              size="sm"
              variant="outline"
              isDisabled={safeTablePage <= 1}
              onClick={() => setTablePage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Text fontWeight={700} fontSize="sm">
              Page {safeTablePage} of {totalTablePages}
            </Text>
            <Button
              size="sm"
              variant="outline"
              isDisabled={safeTablePage >= totalTablePages}
              onClick={() => setTablePage((current) => Math.min(totalTablePages, current + 1))}
            >
              Next
            </Button>
          </HStack>
        </HStack>
      </Box>

      <Modal isOpen={bookingModal.isOpen} onClose={bookingModal.onClose} size="3xl" closeOnOverlayClick={false}>
        <ModalOverlay /><ModalContent maxH="90vh" overflow="hidden"><ModalHeader>{formMode === "create" ? "Create New Booking" : "Edit Booking"}</ModalHeader><ModalCloseButton />
          <ModalBody overflowY="auto" pr={2}>
            <VStack align="stretch" spacing={3}>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl>
                  <FormLabel>Booking Type</FormLabel>
                  <Select
                    isDisabled={isEditMode}
                    value={form.bookingType}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        bookingType: e.target.value as GamingBookingType,
                        resourceCodes: []
                      }))
                    }
                  >
                    <option value="snooker">Snooker</option>
                    <option value="console">Console</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>Board / Console</FormLabel>
                  {isEditMode ? (
                    <Input isReadOnly value={selectedResourceLabels.join(", ")} />
                  ) : (
                    <Box>
                      <Menu closeOnSelect={false}>
                        <MenuButton
                          as={Button}
                          variant="outline"
                          width="100%"
                          justifyContent="space-between"
                          borderColor="rgba(227, 95, 107, 0.22)"
                          bg="white"
                          _hover={{ bg: "white" }}
                          _active={{ bg: "white" }}
                          fontWeight={500}
                        >
                          {selectedResourceLabels.length
                            ? `${selectedResourceLabels.length} selected`
                            : "Select board/console"}
                        </MenuButton>
                        <MenuList minW="100%" maxH="220px" overflowY="auto" zIndex={2000}>
                          <MenuOptionGroup
                            type="checkbox"
                            value={selectedResourceCodes}
                            onChange={(value) => {
                              const next = Array.isArray(value) ? value : [value];
                              setForm((previous) => ({ ...previous, resourceCodes: next }));
                            }}
                          >
                            {resourceOptions.map((entry) => (
                              <MenuItemOption key={entry.code} value={entry.code}>
                                {entry.label}
                              </MenuItemOption>
                            ))}
                          </MenuOptionGroup>
                        </MenuList>
                      </Menu>
                      <Text mt={2} fontSize="xs" color="#705A50">
                        Selected: {selectedResourceLabels.join(", ") || "None"}
                      </Text>
                    </Box>
                  )}
                </FormControl>
              </SimpleGrid>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl><FormLabel>Check In</FormLabel><Input isReadOnly={isEditMode} type="datetime-local" value={form.checkInLocal} onChange={(e) => setForm((p) => ({ ...p, checkInLocal: e.target.value }))} /></FormControl>
                <FormControl><FormLabel>Rate / Hour</FormLabel><Input isReadOnly={isEditMode} type="number" min={0} value={form.hourlyRate} onChange={(e) => setForm((p) => ({ ...p, hourlyRate: e.target.value }))} /></FormControl>
              </SimpleGrid>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl><FormLabel>Players</FormLabel><Input type="number" min={1} step={1} value={form.playerCount} onChange={(e) => setForm((p) => ({ ...p, playerCount: e.target.value }))} /></FormControl>
                <FormControl><FormLabel>Status</FormLabel><Select isDisabled={isEditMode} value={form.bookingStatus} onChange={(e) => setForm((p) => ({ ...p, bookingStatus: e.target.value as BookingForm["bookingStatus"] }))}><option value="ongoing">Ongoing</option><option value="upcoming">Upcoming</option>{formMode === "edit" ? <option value="cancelled">Cancelled</option> : null}</Select></FormControl>
              </SimpleGrid>
              {form.bookingType === "snooker" ? (
                <Text fontSize="sm" color="#705A50">
                  4 players included. Extra players: {formExtraMembers} x {formatINR(EXTRA_MEMBER_CHARGE)} ={" "}
                  {formatINR(formExtraCharge)}
                </Text>
              ) : null}
              {!isEditMode ? <Text fontSize="sm" color="#705A50">You can select multiple boards/consoles and create bookings in one click.</Text> : null}
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}><FormControl><FormLabel>Payment Status</FormLabel><Select value={form.paymentStatus} onChange={(e) => setForm((p) => ({ ...p, paymentStatus: e.target.value as "pending" | "paid" }))}><option value="pending">Pending</option><option value="paid">Paid</option></Select></FormControl><FormControl isDisabled={form.paymentStatus !== "paid"}><FormLabel>Payment Mode</FormLabel><Select value={form.paymentMode} onChange={(e) => setForm((p) => ({ ...p, paymentMode: e.target.value as GamingPaymentMode }))}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="mixed" disabled={!isEditMode}>Mixed</option></Select></FormControl></SimpleGrid>
              {isEditMode ? <Text fontSize="sm" color="#705A50">Locked fields: booking type, board/console, check-in time, rate and status. You can update players, customers and payment after check-in.</Text> : null}
              <Box border="1px solid rgba(132,79,52,0.16)" borderRadius="12px" p={3}>
                <HStack justify="space-between" mb={2}>
                  <Text fontWeight={800}>Customers</Text>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<FiPlus size={14} />}
                    onClick={() => setForm((p) => ({ ...p, customers: [...p.customers, { name: "", phone: "" }] }))}
                  >
                    Add Customer
                  </Button>
                </HStack>
                <VStack align="stretch" spacing={2}>
                  {form.customers.map((customer, index) => {
                    const isLookupOpen =
                      customerLookup.index === index &&
                      (customerLookup.isSearching || customerLookup.results.length > 0);
                    return (
                      <Box key={`customer-${index}`} position="relative">
                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                          <FormControl>
                            <FormLabel fontSize="xs">Name</FormLabel>
                            <Input
                              value={customer.name}
                              autoComplete="off"
                              onFocus={() =>
                                setCustomerLookup((prev) => ({
                                  ...prev,
                                  index,
                                  query: customer.name.trim() || customer.phone.trim()
                                }))
                              }
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setCustomerLookup((prev) =>
                                    prev.index === index ? { index: null, query: "", results: [], isSearching: false } : prev
                                  );
                                }, 180);
                              }}
                              onChange={(e) => {
                                updateCustomerDraft(index, { name: e.target.value });
                                setCustomerLookup((prev) => ({ ...prev, index, query: e.target.value }));
                              }}
                              placeholder="Type name"
                            />
                          </FormControl>
                          <FormControl>
                            <FormLabel fontSize="xs">Phone</FormLabel>
                            <Input
                              value={customer.phone}
                              autoComplete="off"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={10}
                              onFocus={() =>
                                setCustomerLookup((prev) => ({
                                  ...prev,
                                  index,
                                  query: customer.phone.trim() || customer.name.trim()
                                }))
                              }
                              onBlur={() => {
                                void applyCustomerLookup(index);
                                window.setTimeout(() => {
                                  setCustomerLookup((prev) =>
                                    prev.index === index ? { index: null, query: "", results: [], isSearching: false } : prev
                                  );
                                }, 180);
                              }}
                              onChange={(e) => {
                                const phone = normalizePhone(e.target.value).slice(0, 10);
                                updateCustomerDraft(index, { phone });
                                setCustomerLookup((prev) => ({ ...prev, index, query: phone }));
                              }}
                              placeholder="Type phone number"
                            />
                          </FormControl>
                        </SimpleGrid>
                        {isLookupOpen ? (
                          <Box
                            position="absolute"
                            top="calc(100% + 4px)"
                            left={0}
                            right={0}
                            zIndex={20}
                            bg="white"
                            border="1px solid rgba(132,79,52,0.18)"
                            borderRadius="10px"
                            boxShadow="0 14px 32px rgba(49,32,24,0.14)"
                            overflow="hidden"
                          >
                            {customerLookup.isSearching ? (
                              <Text px={3} py={2} fontSize="sm" color="#705A50">
                                Searching customers...
                              </Text>
                            ) : (
                              customerLookup.results.map((result) => (
                                <Button
                                  key={result.localId}
                                  variant="ghost"
                                  w="full"
                                  h="auto"
                                  justifyContent="flex-start"
                                  borderRadius={0}
                                  px={3}
                                  py={2}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectCustomerSuggestion(index, result);
                                  }}
                                >
                                  <VStack align="start" spacing={0}>
                                    <Text fontWeight={800}>{result.name}</Text>
                                    <Text fontSize="xs" color="#705A50">
                                      {result.phone}
                                    </Text>
                                  </VStack>
                                </Button>
                              ))
                            )}
                          </Box>
                        ) : null}
                      </Box>
                    );
                  })}
                </VStack>
              </Box>
              <Box border="1px solid rgba(132,79,52,0.16)" borderRadius="12px" p={3}>
                <HStack justify="space-between" mb={2} flexWrap="wrap" gap={2}>
                  <Text fontWeight={800}>Snooker Products (Optional)</Text>
                  <Button size="sm" variant="outline" leftIcon={<FiPlus size={14} />} onClick={() => setBookingProductLines((prev) => [...prev, createFoodLine()])}>
                    Add Product
                  </Button>
                </HStack>
                <FormControl mb={2}>
                  <FormLabel fontSize="xs">Search Product</FormLabel>
                  <Input value={bookingProductSearch} onChange={(e) => setBookingProductSearch(e.target.value)} placeholder="Type product name" />
                </FormControl>
                {isBookingProductLoading ? (
                  <PosLoadingState message="Loading linked products..." detail="Checking food order items for this booking" compact />
                ) : (
                  <VStack align="stretch" spacing={2}>
                    {bookingProductLines.map((line) => {
                      const quantity = Math.max(1, Math.round(Number(line.quantity) || 1));
                      const option = productOptionMap.get(line.refId);
                      const lineTotal = (option?.unitPrice ?? 0) * quantity;
                      const filteredOptions = bookingProductSearch.trim()
                        ? productOptions.filter((entry) => entry.label.toLowerCase().includes(bookingProductSearch.trim().toLowerCase()))
                        : productOptions;
                      return (
                        <SimpleGrid key={line.id} columns={{ base: 1, md: 4 }} spacing={2} border="1px solid rgba(132,79,52,0.14)" borderRadius="10px" p={2}>
                          <FormControl>
                            <FormLabel fontSize="xs">Product</FormLabel>
                            <Select value={line.refId} onChange={(e) => setBookingProductLines((prev) => prev.map((entry) => entry.id === line.id ? { ...entry, refId: e.target.value } : entry))}>
                              <option value="">Select product</option>
                              {filteredOptions.map((entry) => (
                                <option key={`${line.id}-${entry.id}`} value={entry.id}>
                                  {entry.label} ({formatINR(entry.unitPrice)})
                                </option>
                              ))}
                            </Select>
                          </FormControl>
                          <FormControl>
                            <FormLabel fontSize="xs">Quantity</FormLabel>
                            <Input type="number" min={1} value={line.quantity} onChange={(e) => setBookingProductLines((prev) => prev.map((entry) => entry.id === line.id ? { ...entry, quantity: e.target.value } : entry))} />
                          </FormControl>
                          <FormControl>
                            <FormLabel fontSize="xs">Line Total</FormLabel>
                            <Input value={formatINR(lineTotal)} readOnly />
                          </FormControl>
                          <FormControl>
                            <FormLabel fontSize="xs">Action</FormLabel>
                            <Button variant="outline" size="sm" onClick={() => setBookingProductLines((prev) => prev.length <= 1 ? prev : prev.filter((entry) => entry.id !== line.id))} isDisabled={bookingProductLines.length <= 1}>
                              Remove
                            </Button>
                          </FormControl>
                        </SimpleGrid>
                      );
                    })}
                  </VStack>
                )}
                <Text mt={2} fontSize="sm" color="#705A50">
                  Product lines are saved with this booking and can be edited later.
                </Text>
              </Box>
              {!isEditMode ? <FormControl><FormLabel>Note</FormLabel><Input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder="Booking note" /></FormControl> : null}
            </VStack>
          </ModalBody>
          <ModalFooter><HStack><Button variant="outline" onClick={bookingModal.onClose}>Cancel</Button><Button isLoading={saving} onClick={() => void saveBooking()}>{formMode === "create" ? "Create Booking" : "Save Changes"}</Button></HStack></ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={foodModal.isOpen} onClose={foodModal.onClose} size="4xl" closeOnOverlayClick={false}>
        <ModalOverlay /><ModalContent><ModalHeader>Snooker Product Order</ModalHeader><ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Box p={3} borderRadius="12px" border="1px solid rgba(132,79,52,0.18)" bg="#FFFCF7"><Text fontWeight={800}>{foodBooking?.bookingNumber ?? "-"}</Text><Text fontSize="sm" color="#6D584E">{foodBooking?.primaryCustomerName} ({foodBooking?.primaryCustomerPhone}) • {foodBooking?.resourceLabel}</Text></Box>
              <FormControl><FormLabel>Search Product</FormLabel><Input value={foodSearch} onChange={(e) => setFoodSearch(e.target.value)} placeholder="Type to filter products" /></FormControl>
              {isFoodOrderLoading ? (
                <PosLoadingState message="Loading linked products..." detail="Checking food order items for this booking" compact />
              ) : (
                foodLines.map((line) => (
                  <SimpleGrid key={line.id} columns={{ base: 1, md: 3 }} spacing={3} border="1px solid rgba(132,79,52,0.14)" borderRadius="10px" p={3}>
                    <FormControl><FormLabel>Product</FormLabel><Select value={line.refId} onChange={(e) => updateFoodLine(line.id, { refId: e.target.value })}><option value="">Select product</option>{getFilteredOptions().map((option) => <option key={`${line.id}-${option.id}`} value={option.id}>{option.label} ({formatINR(option.unitPrice)})</option>)}</Select></FormControl>
                    <FormControl><FormLabel>Quantity</FormLabel><Input type="number" min={1} value={line.quantity} onChange={(e) => updateFoodLine(line.id, { quantity: e.target.value })} /></FormControl>
                    <FormControl><FormLabel>Action</FormLabel><Button variant="outline" size="sm" onClick={() => removeFoodLine(line.id)} isDisabled={foodLines.length <= 1}>Remove</Button></FormControl>
                  </SimpleGrid>
                ))
              )}
              <HStack justify="space-between" flexWrap="wrap" gap={2}>
                <Button leftIcon={<FiPlus size={14} />} variant="outline" onClick={() => setFoodLines((prev) => [...prev, createFoodLine()])}>
                  Add Line
                </Button>
                <Text fontWeight={800}>Draft Total: {formatINR(foodDraftTotal)}</Text>
              </HStack>
              <Text fontSize="sm" color="#705A50">
                This creates or updates the linked snooker product order for this booking.
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter><HStack><Button variant="outline" onClick={foodModal.onClose}>Cancel</Button><Button isLoading={saving} onClick={() => void saveFoodOrder()}>Save Product Order</Button></HStack></ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={viewModal.isOpen} onClose={viewModal.onClose} size="lg" closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Booking View</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Box p={3} borderRadius="12px" border="1px solid rgba(132,79,52,0.18)" bg="#FFFCF7">
                <Text fontWeight={800}>{viewBooking?.bookingNumber ?? "-"}</Text>
                <Text fontSize="sm" color="#6D584E">
                  {viewBooking?.resourceLabel ?? "-"} • {viewBooking?.primaryCustomerName ?? "-"} ({viewBooking?.primaryCustomerPhone ?? "-"})
                </Text>
              </Box>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <Box p={3} borderRadius="10px" border="1px solid rgba(132,79,52,0.14)">
                  <Text fontSize="xs" color="#705A50">Check In Time</Text>
                  <Text fontWeight={700}>{formatDateTime(viewBooking?.checkInAt ?? null)}</Text>
                </Box>
                <Box p={3} borderRadius="10px" border="1px solid rgba(132,79,52,0.14)">
                  <Text fontSize="xs" color="#705A50">Players</Text>
                  <Text fontWeight={700}>{viewBooking?.playerCount ?? 0}</Text>
                </Box>
              </SimpleGrid>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                <Box p={3} borderRadius="10px" border="1px solid rgba(132,79,52,0.14)">
                  <Text fontSize="xs" color="#705A50">Game Amount</Text>
                  <Text fontWeight={700}>{formatINR(viewBooking ? gamingBookingsService.getLiveAmount(viewBooking) : 0)}</Text>
                </Box>
                <Box p={3} borderRadius="10px" border="1px solid rgba(132,79,52,0.14)">
                  <Text fontSize="xs" color="#705A50">Extra Charge</Text>
                  <Text fontWeight={700}>{formatINR(viewBooking?.extraMemberCharge ?? 0)}</Text>
                </Box>
                <Box p={3} borderRadius="10px" border="1px solid rgba(132,79,52,0.14)">
                  <Text fontSize="xs" color="#705A50">Total</Text>
                  <Text fontWeight={800}>{formatINR(viewBooking?.systemCalculatedAmount ?? 0)}</Text>
                </Box>
              </SimpleGrid>
              <Box p={3} borderRadius="10px" border="1px solid rgba(132,79,52,0.14)">
                <Text fontSize="xs" color="#705A50">Payment</Text>
                <Text fontWeight={700} textTransform="uppercase">
                  {viewBooking?.paymentStatus ?? "pending"}
                  {viewBooking?.paymentStatus === "paid" && viewBooking.paymentMode
                    ? ` (${viewBooking.paymentMode})`
                    : ""}
                </Text>
                {viewBooking?.paymentStatus === "paid" ? (
                  <Text fontSize="sm" color="#705A50">
                    {formatPaymentSplitSummary({
                      cash: viewBooking.paidCashAmount,
                      card: viewBooking.paidCardAmount,
                      upi: viewBooking.paidUpiAmount
                    }) || "-"}
                  </Text>
                ) : null}
              </Box>
              <Divider />
              <Box>
                <Text fontWeight={700} mb={2}>Products Bought</Text>
                {isViewFoodOrderLoading ? (
                  <PosLoadingState message="Loading linked products..." detail="Checking food order items for this booking" compact />
                ) : viewProductLines.length ? (
                  <VStack align="stretch" spacing={2}>
                    {viewProductLines.map((line) => (
                      <HStack key={line.lineId} justify="space-between" p={2} borderRadius="8px" bg="#FFF9F0">
                        <Text>{line.name} x {line.quantity}</Text>
                        <Text fontWeight={700}>{formatINR(line.quantity * line.unitPrice)}</Text>
                      </HStack>
                    ))}
                  </VStack>
                ) : (
                  <Text fontSize="sm" color="#705A50">No linked product order.</Text>
                )}
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={viewModal.onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={checkoutModal.isOpen} onClose={checkoutModal.onClose} size="2xl" closeOnOverlayClick={false}>
        <ModalOverlay /><ModalContent maxW="1100px"><ModalHeader>Checkout Booking</ModalHeader><ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Box p={3} borderRadius="12px" border="1px solid rgba(132,79,52,0.18)" bg="#FFFCF7">
                <Text fontWeight={800}>{checkoutBooking?.bookingNumber ?? "-"}</Text>
                <Text fontSize="sm" color="#6D584E">
                  {checkoutBooking?.resourceLabel ?? "-"} • {checkoutBooking?.primaryCustomerName ?? "-"} ({checkoutBooking?.primaryCustomerPhone ?? "-"})
                </Text>
              </Box>
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
                <VStack align="stretch" spacing={3}>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <FormControl>
                      <FormLabel>Check In Time</FormLabel>
                      <Input value={formatDateTime(checkoutBooking?.checkInAt ?? null)} readOnly />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Checkout Time</FormLabel>
                      <Input type="datetime-local" value={checkoutAtLocal} onChange={(e) => setCheckoutAtLocal(e.target.value)} />
                    </FormControl>
                  </SimpleGrid>
                  <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3}>
                    <Box p={3} borderRadius="10px" border="1px solid rgba(132,79,52,0.14)">
                      <Text fontSize="xs" color="#705A50">Total Players</Text>
                      <Text fontWeight={700}>{checkoutBooking?.playerCount ?? 0}</Text>
                    </Box>
                    <Box p={3} borderRadius="10px" border="1px solid rgba(132,79,52,0.14)">
                      <Text fontSize="xs" color="#705A50">Extra Players</Text>
                      <Text fontWeight={700}>{checkoutExtraMembers}</Text>
                    </Box>
                    <Box p={3} borderRadius="10px" border="1px solid rgba(132,79,52,0.14)">
                      <Text fontSize="xs" color="#705A50">Extra Charge</Text>
                      <Text fontWeight={700}>{formatINR(checkoutExtraCharge)}</Text>
                    </Box>
                    <Box p={3} borderRadius="10px" border="1px solid rgba(132,79,52,0.14)">
                      <Text fontSize="xs" color="#705A50">Playing Time</Text>
                      <Text fontWeight={700}>{formatDuration(checkoutPlayMinutes)}</Text>
                    </Box>
                  </SimpleGrid>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <FormControl>
                      <FormLabel>Game Amount (System)</FormLabel>
                      <Input value={formatINR(checkoutSystemAmount)} readOnly />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Food & Beverage</FormLabel>
                      <Input value={formatINR(checkoutFoodAmount)} readOnly />
                    </FormControl>
                  </SimpleGrid>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <FormControl>
                      <FormLabel>System Total</FormLabel>
                      <Input value={formatINR(checkoutSystemTotal)} readOnly />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Discount Type</FormLabel>
                      <Select
                        value={checkoutDiscountType}
                        onChange={(event) => {
                          const nextType = event.target.value as GamingDiscountType;
                          setCheckoutDiscountType(nextType);
                          setCheckoutFinalAmountTouched(false);
                          if (nextType === "none") {
                            setCheckoutDiscountValue("0");
                          }
                        }}
                      >
                        <option value="none">No Discount</option>
                        <option value="manual">Manual Amount</option>
                        <option value="percentage">Percentage</option>
                      </Select>
                    </FormControl>
                  </SimpleGrid>
                  <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} alignItems="end">
                    <FormControl isDisabled={checkoutDiscountType === "none"}>
                      <FormLabel whiteSpace="nowrap">
                        {checkoutDiscountType === "percentage" ? "Discount %" : "Discount Amount"}
                      </FormLabel>
                      <Input
                        type="number"
                        min={0}
                        max={checkoutDiscountType === "percentage" ? 100 : checkoutSystemTotal}
                        step={1}
                        value={checkoutDiscountValue}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setCheckoutFinalAmountTouched(false);
                          setCheckoutDiscountValue(nextValue === "" ? "" : String(roundCheckoutAmount(Number(nextValue))));
                        }}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel whiteSpace="nowrap">Discount Applied</FormLabel>
                      <Input value={formatINR(checkoutDiscountAmount)} readOnly />
                    </FormControl>
                    <FormControl>
                      <FormLabel whiteSpace="nowrap">Final Amount (Editable)</FormLabel>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={checkoutFinalAmount}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setCheckoutFinalAmountTouched(true);
                          setCheckoutFinalAmount(nextValue === "" ? "" : String(roundCheckoutAmount(Number(nextValue))));
                        }}
                      />
                    </FormControl>
                  </SimpleGrid>
                  <FormControl isRequired={checkoutRequiresOverrideReason}>
                    <FormLabel>Amount Change Reason</FormLabel>
                    <Input
                      placeholder="Why final amount changed after discount?"
                      value={checkoutOverrideReason}
                      onChange={(e) => setCheckoutOverrideReason(e.target.value)}
                    />
                  </FormControl>
                </VStack>
                <VStack align="stretch" spacing={3}>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <FormControl>
                      <FormLabel>Payment Status</FormLabel>
                      <Select
                        value={checkoutPaymentStatus}
                        onChange={(event) => setCheckoutPaymentStatus(event.target.value as "pending" | "paid")}
                      >
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                      </Select>
                    </FormControl>
                    <FormControl isDisabled={checkoutPaymentStatus !== "paid"}>
                      <FormLabel>Payment Mode</FormLabel>
                      <Select value={checkoutPaymentMode} onChange={(e) => setCheckoutPaymentMode(e.target.value as GamingPaymentMode)}>
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                        <option value="mixed">Mixed</option>
                      </Select>
                    </FormControl>
                  </SimpleGrid>
                  {checkoutRequiresReference ? (
                    <FormControl>
                      <FormLabel>Reference ID</FormLabel>
                      <Input
                        placeholder="Enter UPI/Card reference"
                        value={checkoutPaymentReference}
                        onChange={(event) => setCheckoutPaymentReference(event.target.value)}
                      />
                    </FormControl>
                  ) : null}
                  {checkoutPaymentStatus === "paid" && checkoutPaymentMode === "mixed" ? (
                    <Box border="1px solid rgba(132,79,52,0.14)" borderRadius="10px" p={3}>
                      <Text fontWeight={700} mb={2}>Split Payment</Text>
                      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                        <FormControl isRequired>
                          <FormLabel>Cash Amount</FormLabel>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={checkoutSplitCash}
                            onChange={(event) => setCheckoutSplitCash(event.target.value === "" ? "" : String(roundCheckoutAmount(Number(event.target.value))))}
                            placeholder="0"
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel>UPI Amount</FormLabel>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={checkoutSplitUpi}
                            onChange={(event) => setCheckoutSplitUpi(event.target.value === "" ? "" : String(roundCheckoutAmount(Number(event.target.value))))}
                            placeholder="0"
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel>Card Amount</FormLabel>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={checkoutSplitCard}
                            onChange={(event) => setCheckoutSplitCard(event.target.value === "" ? "" : String(roundCheckoutAmount(Number(event.target.value))))}
                            placeholder="0"
                          />
                        </FormControl>
                      </SimpleGrid>
                      <HStack mt={2} justify="space-between" flexWrap="wrap">
                        <Text fontSize="sm" color="#705A50">
                          Split Total: <b>{formatINR(checkoutPaymentBreakdownTotal)}</b> / Final:{" "}
                          <b>{formatINR(checkoutFinalAmountNumber)}</b>
                        </Text>
                        {checkoutHasSplitMismatch ? (
                          <Text fontSize="xs" color="#B42318">
                            {checkoutPaymentSplitGap > 0
                              ? `${formatINR(Math.abs(checkoutPaymentSplitGap))} pending to allocate`
                              : `${formatINR(Math.abs(checkoutPaymentSplitGap))} exceeds final amount`}
                          </Text>
                        ) : (
                          <Text fontSize="xs" color="#046C4E">
                            Split total matched.
                          </Text>
                        )}
                      </HStack>
                    </Box>
                  ) : null}
                  <Box border="1px solid rgba(132,79,52,0.14)" borderRadius="10px" p={3}>
                    <Text fontWeight={700} mb={2}>Products Bought</Text>
                    {isCheckoutFoodOrderLoading ? (
                      <PosLoadingState message="Loading linked products..." detail="Checking food order items for checkout" compact />
                    ) : checkoutProductLines.length ? (
                      <VStack align="stretch" spacing={2} maxH="240px" overflowY="auto" pr={1}>
                        {checkoutProductLines.map((line) => (
                          <HStack key={line.lineId} justify="space-between" p={2} borderRadius="8px" bg="#FFF9F0">
                            <Text>{line.name} x {line.quantity}</Text>
                            <Text fontWeight={700}>{formatINR(line.quantity * line.unitPrice)}</Text>
                          </HStack>
                        ))}
                      </VStack>
                    ) : (
                      <Text fontSize="sm" color="#705A50">No linked product order.</Text>
                    )}
                  </Box>
                </VStack>
              </SimpleGrid>
              <Text fontSize="sm" color="#705A50">
                You can close booking with `Paid` or `Pending`. Pending dues can be settled later from Pending menu.
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter><HStack><Button variant="outline" onClick={checkoutModal.onClose}>Cancel</Button><Button isLoading={saving} onClick={openCheckoutConfirmation}>Review Confirmation</Button></HStack></ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={checkoutConfirmModal.isOpen} onClose={checkoutConfirmModal.onClose} isCentered closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm Checkout</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={2}>
              <Text>Booking: <b>{checkoutBooking?.bookingNumber ?? "-"}</b></Text>
              <Text>Customer: <b>{checkoutBooking?.primaryCustomerName ?? "-"}</b></Text>
              <Text>Players: <b>{checkoutBooking?.playerCount ?? 0}</b> (Extra: <b>{checkoutExtraMembers}</b>)</Text>
              <Text>Playing Time: <b>{formatDuration(checkoutPlayMinutes)}</b></Text>
              <Text>Discount: <b>{formatINR(checkoutDiscountAmount)}</b></Text>
              <Text>
                Payment: <b>{checkoutPaymentStatus.toUpperCase()}</b>
                {checkoutPaymentStatus === "paid" ? <> via <b>{checkoutPaymentMode.toUpperCase()}</b></> : null}
              </Text>
              {checkoutPaymentStatus === "paid" ? (
                <Text>Collected: <b>{checkoutPaymentSplitSummary || "-"}</b></Text>
              ) : null}
              {checkoutRequiresReference ? (
                <Text>Reference: <b>{checkoutPaymentReference.trim() || "-"}</b></Text>
              ) : null}
              <Text>Final Total: <b>{formatINR(checkoutFinalAmountNumber)}</b></Text>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button variant="outline" onClick={checkoutConfirmModal.onClose}>Back</Button>
              <Button isLoading={saving} onClick={() => void confirmCheckout()}>Confirm Checkout</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
};

