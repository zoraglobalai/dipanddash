import {
  Box,
  Button,
  Grid,
  HStack,
  Image,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  useDisclosure,
  useToast
} from "@chakra-ui/react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { CartPanel } from "@/components/pos/CartPanel";
import { CustomerStartModal } from "@/components/pos/CustomerStartModal";
import { ItemGrid } from "@/components/pos/ItemGrid";
import { PaymentModal } from "@/components/pos/PaymentModal";
import { PendingBillsDrawer } from "@/components/pos/PendingBillsDrawer";
import { RecentBillsTableCard } from "@/components/pos/RecentBillsTableCard";
import { usePosAuth } from "@/app/PosAuthContext";
import { usePos } from "@/app/PosContext";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import type { CustomerRecord, PendingBillSummary, PosOrder } from "@/types/pos";
import logo from "@/assets/logo.png";
import {
  buildBillDocumentHtml,
  COMPANY_ADDRESS,
  COMPANY_BRANCH,
  COMPANY_NAME,
  COMPANY_REGISTRY,
  formatRs,
  getLineBaseTotal,
  openBillInPrintFrame
} from "@/utils/bill-print";

type NewOrderPageProps = {
  channel?: "dine-in" | "take-away" | "swiggy" | "zomato";
};

const resolveOrderType = (channel: NewOrderPageProps["channel"]) => {
  switch (channel) {
    case "dine-in":
      return "dine_in" as const;
    case "take-away":
      return "takeaway" as const;
    case "swiggy":
    case "zomato":
      return "delivery" as const;
    default:
      return null;
  }
};

const resolveOrderChannel = (channel: NewOrderPageProps["channel"]) => {
  switch (channel) {
    case "dine-in":
      return "dine-in" as const;
    case "take-away":
      return "take-away" as const;
    case "swiggy":
      return "swiggy" as const;
    case "zomato":
      return "zomato" as const;
    default:
      return null;
  }
};

const matchesPendingBillWithChannel = (bill: PendingBillSummary, channel: NewOrderPageProps["channel"]) => {
  switch (channel) {
    case "dine-in":
      return bill.orderType === "dine_in" && (bill.orderChannel === "dine-in" || bill.orderChannel === null);
    case "take-away":
      return bill.orderType === "takeaway" && (bill.orderChannel === "take-away" || bill.orderChannel === null);
    case "swiggy":
      return bill.orderType === "delivery" && bill.orderChannel === "swiggy";
    case "zomato":
      return bill.orderType === "delivery" && bill.orderChannel === "zomato";
    default:
      return true;
  }
};

const toPaymentModeLabel = (value: PosOrder["paymentMode"] | null | undefined) =>
  value ? value.toUpperCase() : "-";

export const NewOrderPage = ({ channel }: NewOrderPageProps) => {
  const toast = useToast();
  const { session } = usePosAuth();
  const {
    catalog,
    currentOrder,
    pendingBills,
    isBootstrapping,
    allocationWarning,
    closingStatus,
    isPunchedIn,
    attachCustomer,
    addItem,
    addCombo,
    addProduct,
    setOrderType,
    setOrderChannel,
    setTableLabel,
    addAddOnToLine,
    removeAddOnFromLine,
    updateLineQuantity,
    removeLine,
    applyCouponCode,
    setManualDiscount,
    sendToKitchen,
    saveAsPending,
    resumePending,
    clearOrder,
    completePayment,
    quickCreateCustomer,
    searchCustomers,
    findCustomerByPhone,
    getOrderById,
    clearAllocationWarning,
    refreshCatalogSnapshot
  } = usePos();

  const paymentModal = useDisclosure();
  const pendingDrawer = useDisclosure();
  const customerStartModal = useDisclosure();
  const previewModal = useDisclosure();

  const [isOrderFlowActive, setIsOrderFlowActive] = useState(
    () => Boolean(currentOrder.customer) && currentOrder.lines.length > 0
  );
  const [isRefreshingStock, setIsRefreshingStock] = useState(false);
  const [customerModalPurpose, setCustomerModalPurpose] = useState<"start" | "change">("start");
  const [previewOrder, setPreviewOrder] = useState<PosOrder | null>(null);
  const resolvedOrderType = useMemo(() => resolveOrderType(channel), [channel]);
  const resolvedOrderChannel = useMemo(() => resolveOrderChannel(channel), [channel]);
  const canChangeOrderType = !resolvedOrderType;
  const filteredPendingBills = useMemo(
    () => pendingBills.filter((bill) => matchesPendingBillWithChannel(bill, channel)),
    [pendingBills, channel]
  );

  useEffect(() => {
    const hasActiveDraft = Boolean(currentOrder.customer) || currentOrder.lines.length > 0;
    const isLegacyDineOrTakeawayDraft =
      currentOrder.orderChannel === null &&
      (resolvedOrderChannel === "dine-in" || resolvedOrderChannel === "take-away") &&
      currentOrder.orderType === resolvedOrderType;
    const isSameChannelDraft =
      resolvedOrderType !== null &&
      currentOrder.orderType === resolvedOrderType &&
      (currentOrder.orderChannel === resolvedOrderChannel || isLegacyDineOrTakeawayDraft);

    if (hasActiveDraft && isSameChannelDraft) {
      setIsOrderFlowActive(true);
      return;
    }

    clearOrder();
    if (resolvedOrderType) {
      setOrderType(resolvedOrderType);
    }
    setOrderChannel(resolvedOrderChannel);
    setIsOrderFlowActive(false);
  }, [
    channel,
    clearOrder,
    currentOrder.customer,
    currentOrder.lines.length,
    currentOrder.orderChannel,
    currentOrder.orderType,
    resolvedOrderType,
    resolvedOrderChannel,
    setOrderChannel,
    setOrderType
  ]);

  useEffect(() => {
    if (!resolvedOrderType) {
      return;
    }
    if (currentOrder.orderType !== resolvedOrderType) {
      setOrderType(resolvedOrderType);
    }
  }, [currentOrder.orderType, resolvedOrderType, setOrderType]);

  useEffect(() => {
    if (currentOrder.orderChannel !== resolvedOrderChannel) {
      setOrderChannel(resolvedOrderChannel);
    }
  }, [currentOrder.orderChannel, resolvedOrderChannel, setOrderChannel]);

  useEffect(() => {
    if (currentOrder.customer && currentOrder.lines.length > 0) {
      setIsOrderFlowActive(true);
    }
  }, [currentOrder.customer, currentOrder.lines.length]);

  const orderTypeLabel =
    currentOrder.orderType === "snooker"
      ? "Snooker"
      : currentOrder.orderType === "dine_in"
      ? "Dine In"
      : currentOrder.orderType === "delivery"
        ? "Delivery"
      : "Takeaway";

  useEffect(() => {
    if (!allocationWarning) {
      return;
    }
    toast({
      status: "warning",
      title: "Stock check failed",
      description: allocationWarning,
      duration: 5000
    });
    clearAllocationWarning();
  }, [allocationWarning, clearAllocationWarning, toast]);

  const openCustomerStartModal = useCallback((purpose: "start" | "change") => {
    setCustomerModalPurpose(purpose);
    customerStartModal.onOpen();
    window.setTimeout(() => {
      document.getElementById("customer-phone-input")?.focus();
    }, 60);
  }, [customerStartModal]);

  const startNewOrder = useCallback(() => {
    if (closingStatus && !closingStatus.canTakeOrders) {
      toast({
        status: "warning",
        title: "Order taking is locked",
        description: closingStatus.reason || "Complete required closing before taking new orders."
      });
      return;
    }

    if (catalog && !catalog.controls.isBillingEnabled) {
      toast({
        status: "warning",
        title: "POS billing disabled",
        description: catalog.controls.reason || "Admin disabled billing temporarily."
      });
      return;
    }

    if (isPunchedIn !== true) {
      toast({
        status: "warning",
        title: "Punch in required",
        description:
          isPunchedIn === false
            ? "You are currently punched out. Please punch in from Attendance before taking orders."
            : "Unable to verify attendance state. Open Attendance and refresh your shift status before taking orders."
      });
      return;
    }

    const selectedOrderType = currentOrder.orderType;
    const selectedOrderChannel = currentOrder.orderChannel;
    clearOrder();
    setOrderType(selectedOrderType);
    setOrderChannel(selectedOrderChannel);
    setIsOrderFlowActive(true);
    openCustomerStartModal("start");
  }, [
    catalog,
    clearOrder,
    closingStatus,
    currentOrder.orderChannel,
    currentOrder.orderType,
    isPunchedIn,
    openCustomerStartModal,
    setOrderChannel,
    setOrderType,
    toast
  ]);

  const onCloseCustomerModal = useCallback(() => {
    customerStartModal.onClose();
    if (customerModalPurpose === "start" && !currentOrder.customer) {
      clearOrder();
      setIsOrderFlowActive(false);
    }
  }, [clearOrder, currentOrder.customer, customerModalPurpose, customerStartModal]);

  const selectCustomerAndStart = (customer: CustomerRecord) => {
    attachCustomer(customer);
    customerStartModal.onClose();
    setIsOrderFlowActive(true);
    toast({
      status: "success",
      title: `Customer attached: ${customer.name}`
    });
  };

  const openPreviewByOrderId = useCallback(async (localOrderId: string) => {
    const order = await getOrderById(localOrderId);
    if (!order) {
      toast({
        status: "warning",
        title: "Bill not found"
      });
      return;
    }
    setPreviewOrder(order);
    previewModal.onOpen();
  }, [getOrderById, previewModal, toast]);

  const printByOrderId = useCallback(async (localOrderId: string) => {
    const order = await getOrderById(localOrderId);
    if (!order) {
      toast({
        status: "warning",
        title: "Unable to find bill for print"
      });
      return;
    }
    const printable = buildBillDocumentHtml(order, session?.fullName);
    const success = openBillInPrintFrame(printable);
    if (!success) {
      toast({
        status: "error",
        title: "Unable to open print window"
      });
    }
  }, [getOrderById, session?.fullName, toast]);

  const handleRefreshStock = useCallback(async () => {
    setIsRefreshingStock(true);
    try {
      await refreshCatalogSnapshot();
      toast({
        status: "success",
        title: "Stock refreshed",
        description: "Latest stock snapshot has been loaded."
      });
    } catch {
      toast({
        status: "warning",
        title: "Unable to refresh stock now",
        description: "Please check network and try again."
      });
    } finally {
      setIsRefreshingStock(false);
    }
  }, [refreshCatalogSnapshot, toast]);

  useKeyboardShortcuts([
    {
      key: "n",
      ctrl: true,
      action: () => startNewOrder()
    },
    {
      key: "f",
      ctrl: true,
      action: () => {
        if (!isOrderFlowActive) {
          return;
        }
        document.getElementById("item-search-input")?.focus();
      }
    },
    {
      key: "b",
      ctrl: true,
      action: () => openCustomerStartModal(isOrderFlowActive ? "change" : "start")
    },
    {
      key: "1",
      ctrl: true,
      action: () => {
        if (!canChangeOrderType) {
          return;
        }
        setOrderType("takeaway");
      }
    },
    {
      key: "2",
      ctrl: true,
      action: () => {
        if (!canChangeOrderType) {
          return;
        }
        setOrderType("dine_in");
      }
    },
    {
      key: "3",
      ctrl: true,
      action: () => {
        if (!canChangeOrderType) {
          return;
        }
        setOrderType("delivery");
      }
    },
    {
      key: "p",
      ctrl: true,
      action: () => {
        if (!isOrderFlowActive || !currentOrder.customer) {
          openCustomerStartModal("start");
          return;
        }
        if (currentOrder.lines.length) {
          paymentModal.onOpen();
        }
      }
    },
    {
      key: "s",
      ctrl: true,
      action: () => {
        if (!isOrderFlowActive || !currentOrder.customer || !currentOrder.lines.length) {
          return;
        }
        void (async () => {
          await saveAsPending();
          setIsOrderFlowActive(false);
          toast({
            status: "success",
            title: "Saved as pending"
          });
        })();
      }
    },
    {
      key: "o",
      ctrl: true,
      action: () => pendingDrawer.onOpen()
    },
    {
      key: "Escape",
      action: () => {
        paymentModal.onClose();
        pendingDrawer.onClose();
        previewModal.onClose();
        customerStartModal.onClose();
      }
    }
  ]);

  const shouldShowLanding = useMemo(() => !isOrderFlowActive, [isOrderFlowActive]);

  if (isBootstrapping) {
    return (
      <VStack minH="100vh" justify="center">
        <Text>Loading POS session...</Text>
      </VStack>
    );
  }

  return (
    <Box overflowX="hidden">
      <HStack
        mt={1}
        mb={3}
        p={3}
        border="1px solid"
        borderColor="rgba(132, 79, 52, 0.2)"
        borderRadius="12px"
        bg="white"
        justify="space-between"
        align="center"
        flexWrap="wrap"
        gap={3}
      >
        <HStack spacing={4} align="center" flexWrap="wrap">
          <Text fontWeight={700}>Order Type:</Text>
          {currentOrder.orderType === "snooker" ? (
            <Box
              px={3}
              py={1}
              borderRadius="full"
              bg="purple.100"
              color="purple.700"
              fontWeight={800}
              fontSize="sm"
            >
              Snooker Transfer Order
            </Box>
          ) : (
            <>
                <Button
                  size="sm"
                  variant={currentOrder.orderType === "takeaway" ? "solid" : "outline"}
                  onClick={() => {
                    if (!canChangeOrderType) {
                      return;
                    }
                    setOrderType("takeaway");
                  }}
                >
                  Takeaway
                </Button>
                <Button
                  size="sm"
                  variant={currentOrder.orderType === "dine_in" ? "solid" : "outline"}
                  onClick={() => {
                    if (!canChangeOrderType) {
                      return;
                    }
                    setOrderType("dine_in");
                  }}
                >
                  Dine In
                </Button>
                <Button
                  size="sm"
                  variant={currentOrder.orderType === "delivery" ? "solid" : "outline"}
                  onClick={() => {
                    if (!canChangeOrderType) {
                      return;
                    }
                    setOrderType("delivery");
                  }}
                >
                  Delivery
                </Button>
            </>
          )}
        </HStack>
        <VStack align={{ base: "start", md: "end" }} spacing={0} w={{ base: "full", md: "auto" }}>
          <Button size="xs" variant="outline" mb={1} isLoading={isRefreshingStock} onClick={() => void handleRefreshStock()}>
            Refresh Stock
          </Button>
          <Text color="#6D584E" fontSize="sm">
            Invoice: {currentOrder.invoiceNumber}
          </Text>
          {isPunchedIn !== true ? (
            <Text fontSize="xs" color="#B91C1C" fontWeight={700}>
              {isPunchedIn === false
                ? "Punch in required to take orders"
                : "Attendance status not verified. Refresh Attendance"}
            </Text>
          ) : null}
          {closingStatus && !closingStatus.canTakeOrders ? (
            <Text fontSize="xs" color="#B91C1C" fontWeight={700}>
              {closingStatus.reason}
            </Text>
          ) : null}
        </VStack>
      </HStack>

      {shouldShowLanding ? (
        <RecentBillsTableCard
          bills={filteredPendingBills}
          onNewOrder={startNewOrder}
          onResume={async (localOrderId) => {
            await resumePending(localOrderId);
            setIsOrderFlowActive(true);
            toast({
              status: "success",
              title: "Pending order resumed"
            });
          }}
        />
      ) : (
        <>
          <HStack
            mb={3}
            p={3}
            border="1px solid"
            borderColor="rgba(132, 79, 52, 0.2)"
            borderRadius="12px"
            bg="white"
            justify="space-between"
            flexWrap="wrap"
            gap={3}
          >
            <Text color="#6D584E" fontSize="sm">
              Customer:{" "}
              <Text as="span" color="#2A1A14" fontWeight={800}>
                {currentOrder.customer ? `${currentOrder.customer.name} (${currentOrder.customer.phone})` : "Not selected"}
              </Text>
            </Text>
            <HStack flexWrap="wrap" gap={2} justify={{ base: "flex-start", md: "flex-end" }} w={{ base: "full", md: "auto" }}>
              {currentOrder.orderType === "dine_in" ? (
                <Input
                  placeholder="Table no / name"
                  size="sm"
                  value={currentOrder.tableLabel ?? ""}
                  onChange={(event) => setTableLabel(event.target.value)}
                  w={{ base: "full", sm: "220px", md: "180px" }}
                />
              ) : null}
              <Button size="sm" variant="outline" onClick={() => openCustomerStartModal("change")}>
                Change Customer
              </Button>
            </HStack>
          </HStack>

          <Grid templateColumns={{ base: "1fr", xl: "minmax(0, 1fr) 380px", "2xl": "minmax(0, 1fr) 420px" }} gap={4}>
            <ItemGrid
              snapshot={catalog}
              onAddItem={addItem}
              onAddCombo={addCombo}
              onAddProduct={addProduct}
              isOrderLocked={!currentOrder.customer}
            />

            <CartPanel
              order={currentOrder}
              selectedCustomer={currentOrder.customer}
              addOns={catalog?.addOns ?? []}
              onLineQuantityChange={updateLineQuantity}
              onLineRemove={removeLine}
              onAddOnToLine={addAddOnToLine}
              onRemoveAddOnFromLine={removeAddOnFromLine}
              onApplyCoupon={(code) => {
                const result = applyCouponCode(code);
                toast({
                  status: result.ok ? "success" : "warning",
                  title: result.message
                });
                return result;
              }}
              onManualDiscountChange={setManualDiscount}
              onOpenPayment={paymentModal.onOpen}
              onSendToKitchen={async () => {
                const result = await sendToKitchen();
                toast({
                  status: result.ok ? "success" : "warning",
                  title: result.message
                });
                if (result.ok) {
                  setIsOrderFlowActive(false);
                }
              }}
              onSavePending={async () => {
                if (!currentOrder.customer) {
                  openCustomerStartModal("start");
                  return;
                }
                await saveAsPending();
                setIsOrderFlowActive(false);
                toast({
                  status: "success",
                  title: "Bill moved to pending"
                });
              }}
              onOpenPendingBills={pendingDrawer.onOpen}
              onOpenCustomerModal={() => openCustomerStartModal("change")}
              onClear={() => {
                const selectedOrderType = currentOrder.orderType;
                const selectedOrderChannel = currentOrder.orderChannel;
                clearOrder();
                setOrderType(selectedOrderType);
                setOrderChannel(selectedOrderChannel);
                setIsOrderFlowActive(false);
              }}
            />
          </Grid>
        </>
      )}

      <PaymentModal
        isOpen={paymentModal.isOpen}
        totalAmount={currentOrder.totals.totalAmount}
        onClose={paymentModal.onClose}
        onConfirm={async (input) => {
          await completePayment(input);
          setIsOrderFlowActive(false);
          toast({
            status: "success",
            title: "Payment completed",
            description: "Invoice saved locally and queued for sync."
          });
        }}
      />

      <PendingBillsDrawer
        isOpen={pendingDrawer.isOpen}
        onClose={pendingDrawer.onClose}
        pendingBills={filteredPendingBills}
        onResume={async (localOrderId) => {
          await resumePending(localOrderId);
          setIsOrderFlowActive(true);
          pendingDrawer.onClose();
          toast({
            status: "success",
            title: "Pending bill resumed"
          });
        }}
      />

      <CustomerStartModal
        isOpen={customerStartModal.isOpen}
        onClose={onCloseCustomerModal}
        orderTypeLabel={orderTypeLabel}
        onSearchCustomers={searchCustomers}
        onFindByPhone={findCustomerByPhone}
        onCreateCustomer={quickCreateCustomer}
        onSelectCustomer={selectCustomerAndStart}
      />

      <Modal isOpen={previewModal.isOpen} onClose={previewModal.onClose} size="4xl" isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Bill Preview</ModalHeader>
          <ModalCloseButton />
          <ModalBody bg="#F8F8F8">
            {previewOrder ? (
              <Box
                id="pos-invoice-bill-template"
                maxW="780px"
                mx="auto"
                bg="white"
                border="1px dashed"
                borderColor="#C5D2E3"
                borderRadius="12px"
                px={{ base: 4, md: 8 }}
                py={{ base: 4, md: 6 }}
                fontFamily="'Courier New', monospace"
                color="#11223B"
              >
                <VStack spacing={2} align="center">
                  <Image src={logo} alt="Dip & Dash logo" h="30px" objectFit="contain" />
                  <Text fontWeight={800} fontSize="lg" letterSpacing="0.7px" textAlign="center">
                    {COMPANY_NAME}
                  </Text>
                  <Text fontWeight={700} fontSize="sm" textAlign="center">
                    {COMPANY_BRANCH}
                  </Text>
                  <Text fontSize="sm" textAlign="center" lineHeight={1.35}>
                    {COMPANY_ADDRESS[0]}
                    <br />
                    {COMPANY_ADDRESS[1]}
                    <br />
                    {COMPANY_ADDRESS[2]}
                  </Text>
                </VStack>

                <Box borderTop="1px dashed" borderColor="#A8BACF" mt={4} pt={3}>
                  <Text fontSize="sm" textAlign="center">
                    {COMPANY_REGISTRY[0]}
                    <br />
                    {COMPANY_REGISTRY[1]}
                    <br />
                    {COMPANY_REGISTRY[2]}
                  </Text>
                </Box>

                <Box borderTop="1px dashed" borderColor="#A8BACF" mt={4} pt={3}>
                  <Text textAlign="center" fontWeight={700} letterSpacing="0.8px">
                    TAX INVOICE
                  </Text>
                  <HStack justify="space-between" mt={2} fontSize="sm">
                    <Text>
                      <Text as="span" fontWeight={700}>
                        Bill No:
                      </Text>{" "}
                      {previewOrder.invoiceNumber}
                    </Text>
                    <Text>
                      <Text as="span" fontWeight={700}>
                        Bill Dt:
                      </Text>{" "}
                      {new Date(previewOrder.createdAt).toISOString().slice(0, 10)}
                    </Text>
                  </HStack>
                  <HStack justify="space-between" mt={1} fontSize="sm">
                    <Text>
                      <Text as="span" fontWeight={700}>
                        Customer:
                      </Text>{" "}
                      {previewOrder.customer?.name ?? "Walk-in Customer"}
                    </Text>
                    <Text>
                      <Text as="span" fontWeight={700}>
                        Cashier:
                      </Text>{" "}
                      {session?.fullName ?? "-"}
                    </Text>
                  </HStack>
                  <HStack justify="space-between" mt={1} fontSize="sm">
                    <Text>
                      <Text as="span" fontWeight={700}>
                        Payment Mode:
                      </Text>{" "}
                      {toPaymentModeLabel(previewOrder.paymentMode)}
                    </Text>
                    <Text />
                  </HStack>
                  {previewOrder.orderType === "dine_in" ? (
                    <HStack justify="space-between" mt={1} fontSize="sm">
                      <Text>
                        <Text as="span" fontWeight={700}>
                          Table:
                        </Text>{" "}
                        {previewOrder.tableLabel ?? "-"}
                      </Text>
                      <Text />
                    </HStack>
                  ) : null}
                </Box>

                <Box borderTop="1px dashed" borderColor="#A8BACF" mt={4} pt={3}>
                  <Text fontWeight={700} mb={2}>
                    Items List
                  </Text>
                  <HStack fontSize="sm" fontWeight={700} px={1}>
                    <Text flex={2}>Item</Text>
                    <Text flex={1} textAlign="center">
                      Qty
                    </Text>
                    <Text flex={1} textAlign="right">
                      Price
                    </Text>
                    <Text flex={1} textAlign="right">
                      Total
                    </Text>
                  </HStack>
                  <VStack align="stretch" spacing={1} mt={1}>
                    {previewOrder.lines.length ? (
                      previewOrder.lines.map((line) => (
                        <Fragment key={line.lineId}>
                          <HStack fontSize="sm" px={1} align="start">
                            <Text flex={2}>{line.name}</Text>
                            <Text flex={1} textAlign="center">
                              {Math.round(line.quantity)}
                            </Text>
                          <Text flex={1} textAlign="right">
                            {formatRs(line.unitPrice)}
                          </Text>
                          <Text flex={1} textAlign="right">
                            {formatRs(getLineBaseTotal(line))}
                          </Text>
                        </HStack>
                          {line.addOns.map((addOn) => (
                            <HStack key={addOn.addOnId} fontSize="sm" px={1} align="start" color="#355274">
                              <Text flex={2} pl={3}>
                                + {addOn.name}
                              </Text>
                              <Text flex={1} textAlign="center">
                                {Math.round(addOn.quantity * line.quantity)}
                              </Text>
                              <Text flex={1} textAlign="right">
                                {formatRs(addOn.unitPrice)}
                              </Text>
                              <Text flex={1} textAlign="right">
                                {formatRs(addOn.unitPrice * addOn.quantity * line.quantity)}
                              </Text>
                            </HStack>
                          ))}
                        </Fragment>
                      ))
                    ) : (
                      <Text fontSize="sm" px={1} color="#355274">
                        No items available in invoice payload.
                      </Text>
                    )}
                  </VStack>
                </Box>

                <Box borderTop="1px dashed" borderColor="#A8BACF" mt={4} pt={3}>
                  <VStack align="stretch" spacing={1} fontSize="sm">
                    <HStack justify="space-between">
                      <Text>Subtotal</Text>
                      <Text>{formatRs(previewOrder.totals.subtotal)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text>Total GST</Text>
                      <Text>{formatRs(previewOrder.totals.taxAmount)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text>Manual Discount</Text>
                      <Text>{formatRs(previewOrder.totals.manualDiscountAmount)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text>Coupon Discount</Text>
                      <Text>{formatRs(previewOrder.totals.couponDiscountAmount)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text>Total Discount</Text>
                      <Text>
                        {formatRs(
                          previewOrder.totals.itemDiscountAmount +
                            previewOrder.totals.couponDiscountAmount +
                            previewOrder.totals.manualDiscountAmount
                        )}
                      </Text>
                    </HStack>
                  </VStack>

                  <HStack
                    justify="space-between"
                    borderTop="1px dashed"
                    borderColor="#A8BACF"
                    mt={2}
                    pt={2}
                    fontSize="2xl"
                    fontWeight={900}
                    color="#001C45"
                  >
                    <Text>Final Amount</Text>
                    <Text>{formatRs(previewOrder.totals.totalAmount)}</Text>
                  </HStack>
                </Box>

                <VStack mt={6} spacing={1} textAlign="center" color="#355274">
                  <Text fontSize="sm">Thank you. Visit again.</Text>
                  <Text fontSize="sm">Follow us on Instagram</Text>
                  <Text fontSize="sm" fontWeight={700}>
                    @dip_dash_
                  </Text>
                </VStack>
              </Box>
            ) : (
              <Text>No bill selected.</Text>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" mr={2} onClick={previewModal.onClose}>
              Close
            </Button>
            {previewOrder ? (
              <Button
                variant="outline"
                mr={2}
                onClick={() => {
                  void printByOrderId(previewOrder.localOrderId);
                }}
              >
                Print
              </Button>
            ) : null}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};
