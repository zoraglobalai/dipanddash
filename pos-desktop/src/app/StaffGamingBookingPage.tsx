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
import { PosDataTable, type PosTableColumn } from "@/components/common/PosDataTable";
import { customersService } from "@/services/customers.service";
import { gamingBookingsService } from "@/services/gaming-bookings.service";
import { snookerOrderService } from "@/services/snooker-order.service";
import type { CatalogSnapshot, GamingBooking, GamingBookingStatus, GamingBookingType, GamingPaymentMode, PosOrder } from "@/types/pos";
import { formatINR } from "@/utils/currency";

type CustomerDraft = { name: string; phone: string };
type FormMode = "create" | "edit";
type FoodDraftLine = { id: string; refId: string; quantity: string };

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

const calcCheckoutAmount = (booking: GamingBooking, checkOutAtIso: string) => {
  const checkIn = new Date(booking.checkInAt).getTime();
  const checkOut = new Date(checkOutAtIso).getTime();
  const extraMembers =
    booking.bookingType === "snooker" ? Math.max(0, booking.playerCount - SNOOKER_INCLUDED_MEMBERS) : 0;
  const extraCharge = extraMembers * EXTRA_MEMBER_CHARGE;
  if (checkOut <= checkIn) return Number(extraCharge.toFixed(2));
  const minutes = Math.ceil((checkOut - checkIn) / 60000);
  return Number((((minutes / 60) * booking.hourlyRate) + extraCharge).toFixed(2));
};

const getGamingProductOptions = (snapshot: CatalogSnapshot | null) => {
  if (!snapshot) return [] as Array<{ id: string; label: string; unitPrice: number; gstPercentage: number }>;
  return (snapshot.products ?? []).filter((x) => x.isActive).map((x) => ({ id: x.id, label: x.name, unitPrice: x.sellingPrice, gstPercentage: 0 }));
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
  const [statusFilter, setStatusFilter] = useState<GamingBookingStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingBooking, setEditingBooking] = useState<GamingBooking | null>(null);
  const [form, setForm] = useState<BookingForm>(defaultForm());

  const [checkoutBooking, setCheckoutBooking] = useState<GamingBooking | null>(null);
  const [checkoutFoodOrder, setCheckoutFoodOrder] = useState<PosOrder | null>(null);
  const [isCheckoutFoodOrderLoading, setIsCheckoutFoodOrderLoading] = useState(false);
  const [checkoutAtLocal, setCheckoutAtLocal] = useState(getNowLocalDateTime());
  const [checkoutFinalAmount, setCheckoutFinalAmount] = useState("0");
  const [checkoutPaymentStatus, setCheckoutPaymentStatus] = useState<"pending" | "paid">("paid");
  const [checkoutPaymentMode, setCheckoutPaymentMode] = useState<GamingPaymentMode>("cash");
  const [checkoutPaymentReference, setCheckoutPaymentReference] = useState("");
  const [checkoutOverrideReason, setCheckoutOverrideReason] = useState("");
  const [viewBooking, setViewBooking] = useState<GamingBooking | null>(null);
  const [viewFoodOrder, setViewFoodOrder] = useState<PosOrder | null>(null);
  const [isViewFoodOrderLoading, setIsViewFoodOrderLoading] = useState(false);

  const [foodBooking, setFoodBooking] = useState<GamingBooking | null>(null);
  const [foodLines, setFoodLines] = useState<FoodDraftLine[]>([createFoodLine()]);
  const [foodSearch, setFoodSearch] = useState("");
  const isEditMode = formMode === "edit";

  const loadBookings = useCallback(async (forceServerSync = false) => {
    const rows = await gamingBookingsService.listBookings({ status: statusFilter, search }, 500, {
      forceServerSync
    });
    setBookings(rows);
  }, [search, statusFilter]);

  useEffect(() => { void loadBookings(); }, [loadBookings]);

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

  const applyCustomerLookup = async (index: number) => {
    const row = form.customers[index];
    if (!row?.phone.trim() || row.name.trim()) return;
    const found = await customersService.findByPhone(row.phone.trim());
    if (!found) return;
    setForm((prev) => ({ ...prev, customers: prev.customers.map((entry, i) => (i === index ? { name: found.name, phone: found.phone } : entry)) }));
  };

  const openCreate = () => { setFormMode("create"); setEditingBooking(null); setForm(defaultForm()); bookingModal.onOpen(); };

  const openEdit = (booking: GamingBooking) => {
    if (booking.status === "completed") return;
    setFormMode("edit");
    setEditingBooking(booking);
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
  };

  const saveBooking = async () => {
    if (!session) return;
    if (!selectedResourceCodes.length) {
      toast({ status: "warning", title: "Select at least one board/console." });
      return;
    }
    const playerCount = formPlayerCount;
    setSaving(true);
    try {
      if (formMode === "create") {
        await gamingBookingsService.createBooking({
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
        await gamingBookingsService.updateBooking(editingBooking.localBookingId, {
          customers: form.customers,
          playerCount,
          paymentStatus: form.paymentStatus,
          paymentMode: form.paymentStatus === "paid" ? form.paymentMode : undefined
        });
        toast({ status: "success", title: "Booking updated successfully" });
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
      const foodAmount = booking.foodAndBeverageAmount || 0;
      const systemTotal = Number((systemAmount + foodAmount).toFixed(2));
      setCheckoutBooking(booking);
      setCheckoutFoodOrder(null);
      setIsCheckoutFoodOrderLoading(Boolean(booking.foodOrderReference));
      setCheckoutAtLocal(nowLocal);
      setCheckoutFinalAmount(String(systemTotal));
      setCheckoutPaymentStatus(booking.paymentStatus === "paid" ? "paid" : "pending");
      setCheckoutPaymentMode(booking.paymentMode ?? "cash");
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
    () => checkoutFoodOrder?.totals.totalAmount ?? checkoutBooking?.foodAndBeverageAmount ?? 0,
    [checkoutBooking, checkoutFoodOrder]
  );
  const checkoutSystemTotal = useMemo(
    () => Number((checkoutSystemAmount + checkoutFoodAmount).toFixed(2)),
    [checkoutFoodAmount, checkoutSystemAmount]
  );
  const checkoutExtraMembers = useMemo(
    () =>
      checkoutBooking?.bookingType === "snooker"
        ? Math.max(0, checkoutBooking.playerCount - SNOOKER_INCLUDED_MEMBERS)
        : 0,
    [checkoutBooking]
  );
  const checkoutExtraCharge = useMemo(
    () => Number((checkoutExtraMembers * EXTRA_MEMBER_CHARGE).toFixed(2)),
    [checkoutExtraMembers]
  );
  const checkoutProductLines = useMemo(() => checkoutFoodOrder?.lines ?? [], [checkoutFoodOrder]);
  const checkoutFinalAmountNumber = useMemo(() => {
    const parsed = Number(checkoutFinalAmount);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : checkoutSystemTotal;
  }, [checkoutFinalAmount, checkoutSystemTotal]);
  const checkoutRequiresOverrideReason = useMemo(
    () => Math.abs(checkoutFinalAmountNumber - checkoutSystemTotal) > AMOUNT_DIFF_THRESHOLD,
    [checkoutFinalAmountNumber, checkoutSystemTotal]
  );
  const checkoutRequiresReference = useMemo(
    () => checkoutPaymentStatus === "paid" && (checkoutPaymentMode === "upi" || checkoutPaymentMode === "card"),
    [checkoutPaymentMode, checkoutPaymentStatus]
  );
  const viewProductLines = useMemo(() => viewFoodOrder?.lines ?? [], [viewFoodOrder]);

  const confirmCheckout = async () => {
    if (!checkoutBooking) return;
    if (checkoutRequiresReference && !checkoutPaymentReference.trim()) {
      toast({
        status: "warning",
        title: "Reference ID required",
        description: "Enter card/UPI reference before checkout."
      });
      return;
    }
    setSaving(true);
    try {
      let latestFoodAmount = checkoutFoodAmount;
      if (catalog && checkoutPaymentStatus === "paid") {
        const paidFoodOrder = await snookerOrderService.markFoodOrderPaidForCheckout({ booking: checkoutBooking, snapshot: catalog, paymentMode: checkoutPaymentMode });
        if (paidFoodOrder) latestFoodAmount = paidFoodOrder.totals.totalAmount;
      }

      const derivedSystemTotal = Number((checkoutSystemAmount + latestFoodAmount).toFixed(2));
      const grandTotal = checkoutFinalAmountNumber;
      const overrideReason = checkoutOverrideReason.trim();
      if (Math.abs(grandTotal - derivedSystemTotal) > AMOUNT_DIFF_THRESHOLD && !overrideReason) {
        toast({
          status: "warning",
          title: "Reason required",
          description: "Please enter why final amount differs from system amount."
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
        amountOverrideReason: overrideReason || undefined,
        paymentStatus: checkoutPaymentStatus,
        paymentMode: checkoutPaymentStatus === "paid" ? checkoutPaymentMode : undefined
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
        description: "Please enter why final amount differs from system amount."
      });
      return;
    }
    checkoutConfirmModal.onOpen();
  };

  const openFoodOrderModal = (booking: GamingBooking) => {
    setFoodBooking(booking);
    setFoodSearch("");
    setFoodLines([createFoodLine()]);
    foodModal.onOpen();
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
      const option = getGamingProductOptions(catalog).find((entry) => entry.id === line.refId);
      if (!option || quantity <= 0) return sum;
      return sum + option.unitPrice * quantity;
    }, 0);
  }, [catalog, foodLines]);

  const getFilteredOptions = () => {
    const query = foodSearch.trim().toLowerCase();
    const options = getGamingProductOptions(catalog);
    if (!query) return options;
    return options.filter((entry) => entry.label.toLowerCase().includes(query));
  };

  const saveFoodOrder = async () => {
    if (!foodBooking || !catalog) return;
    const payloadLines = foodLines.map((line) => {
      const option = getGamingProductOptions(catalog).find((entry) => entry.id === line.refId);
      const quantity = Number(line.quantity);
      if (!option || !Number.isFinite(quantity) || quantity <= 0) return null;
      return { lineType: "product" as const, refId: option.id, name: option.label, quantity, unitPrice: option.unitPrice, gstPercentage: option.gstPercentage };
    }).filter((line): line is NonNullable<typeof line> => Boolean(line));

    if (!payloadLines.length || payloadLines.length !== foodLines.length) {
      toast({ status: "warning", title: "Please select valid product lines" });
      return;
    }

    setSaving(true);
    try {
      await snookerOrderService.upsertFoodOrder({ booking: foodBooking, snapshot: catalog, lines: payloadLines, notes: `Snooker booking ${foodBooking.bookingNumber}` });
      foodModal.onClose();
      await refreshAllViews();
      toast({ status: "success", title: "Sent to Dip & Dash pending orders" });
    } catch (error) {
      toast({ status: "error", title: "Unable to send order", description: error instanceof Error ? error.message : "Please retry." });
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
        header: "Food Order",
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
        render: (booking) => (
          <Box>
            <Badge colorScheme={booking.paymentStatus === "paid" ? "green" : "orange"} textTransform="capitalize">
              {booking.paymentStatus}
            </Badge>
            {booking.paymentStatus === "paid" && booking.paymentMode ? (
              <Text fontSize="xs" textTransform="uppercase">
                {booking.paymentMode}
              </Text>
            ) : null}
          </Box>
        )
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
                <Button size="xs" variant="outline" leftIcon={<FiEdit2 size={12} />} onClick={() => openEdit(booking)}>
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  leftIcon={<FiShoppingBag size={12} />}
                  onClick={() => openFoodOrderModal(booking)}
                >
                  F&B Order
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
            <Button variant="outline" onClick={() => void refreshAllViews()} w={{ base: "full", md: "auto" }}>
              Refresh
            </Button>
          </Box>
        </SimpleGrid>

        <PosDataTable
          rows={bookings}
          columns={bookingColumns}
          getRowId={(booking) => booking.localBookingId}
          emptyMessage="No bookings found for current filters."
          maxColumns={6}
        />
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
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}><FormControl><FormLabel>Payment Status</FormLabel><Select value={form.paymentStatus} onChange={(e) => setForm((p) => ({ ...p, paymentStatus: e.target.value as "pending" | "paid" }))}><option value="pending">Pending</option><option value="paid">Paid</option></Select></FormControl><FormControl isDisabled={form.paymentStatus !== "paid"}><FormLabel>Payment Mode</FormLabel><Select value={form.paymentMode} onChange={(e) => setForm((p) => ({ ...p, paymentMode: e.target.value as GamingPaymentMode }))}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></Select></FormControl></SimpleGrid>
              {isEditMode ? <Text fontSize="sm" color="#705A50">Locked fields: booking type, board/console, check-in time, rate and status. Only customers and payment can be updated after check-in.</Text> : null}
              <Box border="1px solid rgba(132,79,52,0.16)" borderRadius="12px" p={3}><HStack justify="space-between" mb={2}><Text fontWeight={800}>Customers</Text><Button size="sm" variant="outline" leftIcon={<FiPlus size={14} />} onClick={() => setForm((p) => ({ ...p, customers: [...p.customers, { name: "", phone: "" }] }))}>Add Customer</Button></HStack><VStack align="stretch" spacing={2}>{form.customers.map((customer, index) => <HStack key={`customer-${index}`} align="end"><FormControl><FormLabel fontSize="xs">Name</FormLabel><Input value={customer.name} onChange={(e) => setForm((p) => ({ ...p, customers: p.customers.map((entry, i) => i === index ? { ...entry, name: e.target.value } : entry) }))} /></FormControl><FormControl><FormLabel fontSize="xs">Phone</FormLabel><Input value={customer.phone} onBlur={() => void applyCustomerLookup(index)} onChange={(e) => setForm((p) => ({ ...p, customers: p.customers.map((entry, i) => i === index ? { ...entry, phone: e.target.value } : entry) }))} /></FormControl></HStack>)}</VStack></Box>
              {!isEditMode ? <FormControl><FormLabel>Note</FormLabel><Input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder="Booking note" /></FormControl> : null}
            </VStack>
          </ModalBody>
          <ModalFooter><HStack><Button variant="outline" onClick={bookingModal.onClose}>Cancel</Button><Button isLoading={saving} onClick={() => void saveBooking()}>{formMode === "create" ? "Create Booking" : "Save Changes"}</Button></HStack></ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={foodModal.isOpen} onClose={foodModal.onClose} size="4xl" closeOnOverlayClick={false}>
        <ModalOverlay /><ModalContent><ModalHeader>Food / Product Order to Dip & Dash</ModalHeader><ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Box p={3} borderRadius="12px" border="1px solid rgba(132,79,52,0.18)" bg="#FFFCF7"><Text fontWeight={800}>{foodBooking?.bookingNumber ?? "-"}</Text><Text fontSize="sm" color="#6D584E">{foodBooking?.primaryCustomerName} ({foodBooking?.primaryCustomerPhone}) • {foodBooking?.resourceLabel}</Text></Box>
              <FormControl><FormLabel>Search Product</FormLabel><Input value={foodSearch} onChange={(e) => setFoodSearch(e.target.value)} placeholder="Type to filter products" /></FormControl>
              {foodLines.map((line) => (
                <SimpleGrid key={line.id} columns={{ base: 1, md: 3 }} spacing={3} border="1px solid rgba(132,79,52,0.14)" borderRadius="10px" p={3}>
                  <FormControl><FormLabel>Product</FormLabel><Select value={line.refId} onChange={(e) => updateFoodLine(line.id, { refId: e.target.value })}><option value="">Select product</option>{getFilteredOptions().map((option) => <option key={`${line.id}-${option.id}`} value={option.id}>{option.label} ({formatINR(option.unitPrice)})</option>)}</Select></FormControl>
                  <FormControl><FormLabel>Quantity</FormLabel><Input type="number" min={1} value={line.quantity} onChange={(e) => updateFoodLine(line.id, { quantity: e.target.value })} /></FormControl>
                  <FormControl><FormLabel>Action</FormLabel><Button variant="outline" size="sm" onClick={() => removeFoodLine(line.id)} isDisabled={foodLines.length <= 1}>Remove</Button></FormControl>
                </SimpleGrid>
              ))}
              <HStack justify="space-between" flexWrap="wrap" gap={2}>
                <Button leftIcon={<FiPlus size={14} />} variant="outline" onClick={() => setFoodLines((prev) => [...prev, createFoodLine()])}>
                  Add Line
                </Button>
                <Text fontWeight={800}>Draft Total: {formatINR(foodDraftTotal)}</Text>
              </HStack>
              <Text fontSize="sm" color="#705A50">
                This will create a pending <b>snooker</b> order in the Dip & Dash staff queue.
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter><HStack><Button variant="outline" onClick={foodModal.onClose}>Cancel</Button><Button isLoading={saving} onClick={() => void saveFoodOrder()}>Send to Dip & Dash</Button></HStack></ModalFooter>
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
              <Divider />
              <Box>
                <Text fontWeight={700} mb={2}>Products Bought</Text>
                {isViewFoodOrderLoading ? (
                  <Text fontSize="sm" color="#705A50">Loading linked products...</Text>
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
                      <FormLabel>Final Amount (Editable)</FormLabel>
                      <Input type="number" min={0} value={checkoutFinalAmount} onChange={(e) => setCheckoutFinalAmount(e.target.value)} />
                    </FormControl>
                  </SimpleGrid>
                  <FormControl isRequired={checkoutRequiresOverrideReason}>
                    <FormLabel>Amount Change Reason</FormLabel>
                    <Input
                      placeholder="Why final amount changed from system amount?"
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
                  <Box border="1px solid rgba(132,79,52,0.14)" borderRadius="10px" p={3}>
                    <Text fontWeight={700} mb={2}>Products Bought</Text>
                    {isCheckoutFoodOrderLoading ? (
                      <Text fontSize="sm" color="#705A50">Loading linked products...</Text>
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
              <Text>
                Payment: <b>{checkoutPaymentStatus.toUpperCase()}</b>
                {checkoutPaymentStatus === "paid" ? <> via <b>{checkoutPaymentMode.toUpperCase()}</b></> : null}
              </Text>
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

