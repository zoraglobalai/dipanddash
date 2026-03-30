import {
  Box,
  Button,
  Checkbox,
  Divider,
  HStack,
  Input,
  Select,
  Text,
  VStack
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { FiMinus, FiPlus, FiTrash2 } from "react-icons/fi";

import { ActionIconButton } from "@/components/common/ActionIconButton";
import { formatINR, roundMoney } from "@/utils/currency";
import type { CatalogAddOn, CustomerRecord, PosOrder } from "@/types/pos";

type CartPanelProps = {
  order: PosOrder;
  selectedCustomer: CustomerRecord | null;
  addOns: CatalogAddOn[];
  onLineQuantityChange: (lineId: string, quantity: number) => void;
  onLineRemove: (lineId: string) => void;
  onAddOnToLine: (lineId: string, addOn: CatalogAddOn) => void;
  onRemoveAddOnFromLine: (lineId: string, addOnId: string) => void;
  onApplyCoupon: (couponCode: string) => { ok: boolean; message: string };
  onManualDiscountChange: (value: number) => void;
  onOpenPayment: () => void;
  onSendToKitchen: () => Promise<void>;
  onSavePending: () => Promise<void>;
  onOpenPendingBills: () => void;
  onOpenCustomerModal: () => void;
  onClear: () => void;
};

export const CartPanel = ({
  order,
  selectedCustomer,
  addOns,
  onLineQuantityChange,
  onLineRemove,
  onAddOnToLine,
  onRemoveAddOnFromLine,
  onApplyCoupon,
  onManualDiscountChange,
  onOpenPayment,
  onSendToKitchen,
  onSavePending,
  onOpenPendingBills,
  onOpenCustomerModal,
  onClear
}: CartPanelProps) => {
  const [selectedAddOnByLine, setSelectedAddOnByLine] = useState<Record<string, string>>({});
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [manualDiscountInput, setManualDiscountInput] = useState(String(order.manualDiscountAmount || ""));
  const [isPercentageDiscount, setIsPercentageDiscount] = useState(false);

  const canCheckout = Boolean(selectedCustomer) && order.lines.length > 0 && order.totals.totalAmount > 0;

  const addOnMap = useMemo(() => new Map(addOns.map((entry) => [entry.id, entry])), [addOns]);
  const getLineTotal = (line: PosOrder["lines"][number]) => {
    const addOnAmount = line.addOns.reduce(
      (sum, entry) => sum + entry.unitPrice * entry.quantity * line.quantity,
      0
    );
    return line.unitPrice * line.quantity + addOnAmount;
  };

  useEffect(() => {
    if (!isPercentageDiscount) {
      setManualDiscountInput(order.manualDiscountAmount ? String(order.manualDiscountAmount) : "");
      return;
    }
    if (!order.lines.length && order.manualDiscountAmount <= 0) {
      setManualDiscountInput("");
    }
  }, [isPercentageDiscount, order.lines.length, order.manualDiscountAmount]);

  const handleApplyCoupon = () => {
    const result = onApplyCoupon(couponCode);
    setCouponMessage(result.message);
  };

  const applyManualDiscount = (rawValue: string, usePercentage: boolean = isPercentageDiscount) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      onManualDiscountChange(0);
      return;
    }

    if (usePercentage) {
      const percentage = Math.min(100, Math.max(0, parsed));
      const percentageAmount = roundMoney((order.totals.subtotal * percentage) / 100);
      onManualDiscountChange(percentageAmount);
      return;
    }

    onManualDiscountChange(Math.max(0, roundMoney(parsed)));
  };

  const parsedManualDiscountInput = Number(manualDiscountInput);
  const manualDiscountPreviewAmount =
    isPercentageDiscount && Number.isFinite(parsedManualDiscountInput)
      ? roundMoney((order.totals.subtotal * Math.min(100, Math.max(0, parsedManualDiscountInput))) / 100)
      : order.totals.manualDiscountAmount;

  return (
    <VStack
      align="stretch"
      spacing={3}
      p={4}
      borderRadius="14px"
      border="1px solid"
      borderColor="rgba(132, 79, 52, 0.2)"
      bg="white"
      boxShadow="sm"
      minH={{ base: "auto", "2xl": "540px" }}
    >
      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <Text fontWeight={800}>Cart</Text>
        <HStack spacing={2} flexWrap="wrap" w={{ base: "full", md: "auto" }}>
          <Button size="sm" variant="outline" onClick={onOpenCustomerModal}>
            {selectedCustomer ? "Change Customer" : "Select Customer"}
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenPendingBills}>
            Pending Bills
          </Button>
        </HStack>
      </HStack>

      <Box p={3} borderRadius="10px" bg="rgba(241, 236, 229, 0.65)">
        <Text fontSize="sm" color="#6A5248">
          Active customer:{" "}
          <Text as="span" fontWeight={800} color="#2A1A14">
            {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.phone})` : "Not selected"}
          </Text>
        </Text>
      </Box>

      <VStack align="stretch" spacing={2} maxH="320px" overflowY="auto" pr={1}>
        {order.lines.length ? (
          order.lines.map((line) => (
            <Box
              key={line.lineId}
              p={3}
              borderRadius="12px"
              border="1px solid"
              borderColor="rgba(132, 79, 52, 0.16)"
              bg="rgba(255,255,255,0.85)"
            >
              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={0}>
                  <Text fontWeight={700}>{line.name}</Text>
                  <Text fontSize="sm" color="#7A6258">
                    {line.isComplimentary ? "free item" : line.lineType}
                  </Text>
                </VStack>
                <ActionIconButton
                  aria-label={`Remove ${line.name}`}
                  icon={<FiTrash2 />}
                  size="xs"
                  variant="ghost"
                  colorScheme="red"
                  tooltipProps={{ isDisabled: true }}
                  isDisabled={line.isComplimentary}
                  onClick={() => onLineRemove(line.lineId)}
                />
              </HStack>

              <HStack mt={2} justify="space-between" flexWrap="wrap" gap={2}>
                <HStack>
                  <ActionIconButton
                    aria-label={`Decrease quantity of ${line.name}`}
                    icon={<FiMinus />}
                    size="xs"
                    variant="outline"
                    isDisabled={line.isComplimentary}
                    onClick={() => onLineQuantityChange(line.lineId, line.quantity - 1)}
                  />
                  <Text minW="28px" textAlign="center" fontWeight={700}>
                    {line.quantity}
                  </Text>
                  <ActionIconButton
                    aria-label={`Increase quantity of ${line.name}`}
                    icon={<FiPlus />}
                    size="xs"
                    variant="outline"
                    isDisabled={line.isComplimentary}
                    onClick={() => onLineQuantityChange(line.lineId, line.quantity + 1)}
                  />
                </HStack>
                <VStack align="end" spacing={0}>
                  <Text fontSize="xs" color="#7A6258">
                    Base: {line.isComplimentary ? formatINR(0) : formatINR(line.unitPrice)}
                  </Text>
                  <Text fontWeight={700}>Line: {formatINR(getLineTotal(line))}</Text>
                </VStack>
              </HStack>

              {(line.lineType === "item" || line.lineType === "combo") && !line.isComplimentary ? (
                <HStack mt={2} spacing={2} flexWrap="wrap">
                  <Select
                    size="sm"
                    value={selectedAddOnByLine[line.lineId] ?? ""}
                    onChange={(event) =>
                      setSelectedAddOnByLine((previous) => ({
                        ...previous,
                        [line.lineId]: event.target.value
                      }))
                    }
                  >
                    <option value="">Select add-on</option>
                    {addOns
                      .filter((entry) => entry.isActive)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name} ({formatINR(entry.sellingPrice)})
                        </option>
                      ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const selectedId = selectedAddOnByLine[line.lineId];
                      if (!selectedId) {
                        return;
                      }
                      const selected = addOnMap.get(selectedId);
                      if (!selected) {
                        return;
                      }
                      onAddOnToLine(line.lineId, selected);
                    }}
                  >
                    Add
                  </Button>
                </HStack>
              ) : null}

                {line.addOns.length ? (
                  <VStack align="stretch" mt={2} spacing={1}>
                    {line.addOns.map((entry) => (
                      <HStack key={entry.addOnId} justify="space-between">
                        <Text fontSize="sm" color="#6D584E">
                          + {entry.name} x{entry.quantity * line.quantity}
                        </Text>
                        <Text fontSize="sm" color="#6D584E">
                          {formatINR(entry.unitPrice * entry.quantity * line.quantity)}
                        </Text>
                        <ActionIconButton
                          aria-label={`Remove add-on ${entry.name}`}
                          icon={<FiTrash2 />}
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          tooltipProps={{ isDisabled: true }}
                          onClick={() => onRemoveAddOnFromLine(line.lineId, entry.addOnId)}
                        />
                      </HStack>
                    ))}
                  </VStack>
                ) : null}
            </Box>
          ))
        ) : (
          <Box
            p={4}
            borderRadius="12px"
            border="1px dashed"
            borderColor="rgba(132, 79, 52, 0.25)"
            textAlign="center"
            color="#7A6258"
          >
            Add items to start billing.
          </Box>
        )}
      </VStack>

      <Divider />

      <HStack>
        <Input
          placeholder="Coupon code"
          value={couponCode}
          onChange={(event) => setCouponCode(event.target.value)}
        />
        <Button onClick={handleApplyCoupon} variant="outline">
          Apply
        </Button>
      </HStack>
      {couponMessage ? <Text fontSize="sm">{couponMessage}</Text> : null}
      {order.appliedOffer ? (
        <Text fontSize="sm" color="#6D584E" fontWeight={600}>
          Applied: {order.appliedOffer.couponCode}
          {order.appliedOffer.discountType === "free_item" && order.appliedOffer.freeItemName
            ? ` • Free item: ${order.appliedOffer.freeItemName}`
            : ""}
        </Text>
      ) : null}

      <HStack align="start" flexDir={{ base: "column", md: "row" }} gap={2}>
        <Text fontSize="sm" minW={{ base: "auto", md: "120px" }}>
          Manual Discount
        </Text>
        <VStack align="stretch" spacing={1} flex={1}>
          <HStack justify="space-between" align="center" minH="30px">
            <Checkbox
              size="sm"
              colorScheme="brand"
              isChecked={isPercentageDiscount}
              onChange={(event) => {
                const checked = event.target.checked;
                setIsPercentageDiscount(checked);
                applyManualDiscount(manualDiscountInput, checked);
              }}
            >
              Apply as percentage (%)
            </Checkbox>
            <Text fontSize="xs" color="#7A6258" fontWeight={600}>
              {isPercentageDiscount ? "Mode: %" : "Mode: Rs"}
            </Text>
          </HStack>
          <Input
            value={manualDiscountInput}
            type="text"
            inputMode="decimal"
            placeholder={isPercentageDiscount ? "Enter %" : "Enter amount"}
            onChange={(event) => {
              const nextValue = event.target.value;
              setManualDiscountInput(nextValue);
              applyManualDiscount(nextValue);
            }}
            onBlur={() => {
              applyManualDiscount(manualDiscountInput);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyManualDiscount(manualDiscountInput);
              }
            }}
          />
          <Text fontSize="xs" color="#7A6258">
            {isPercentageDiscount
              ? `Discount ${Math.min(100, Math.max(0, Number.isFinite(parsedManualDiscountInput) ? parsedManualDiscountInput : 0))}% = ${formatINR(
                  manualDiscountPreviewAmount
                )} (on subtotal)`
              : `Discount amount: ${formatINR(order.totals.manualDiscountAmount)}`}
          </Text>
        </VStack>
      </HStack>
      <VStack align="stretch" spacing={1}>
        <HStack justify="space-between">
          <Text color="#7A6258">Subtotal</Text>
          <Text>{formatINR(order.totals.subtotal)}</Text>
        </HStack>
        <HStack justify="space-between">
          <Text color="#7A6258">Tax</Text>
          <Text>{formatINR(order.totals.taxAmount)}</Text>
        </HStack>
        <HStack justify="space-between">
          <Text color="#7A6258">Coupon Discount</Text>
          <Text>- {formatINR(order.totals.couponDiscountAmount)}</Text>
        </HStack>
        <HStack justify="space-between">
          <Text color="#7A6258">Manual Discount</Text>
          <Text>- {formatINR(order.totals.manualDiscountAmount)}</Text>
        </HStack>
        <HStack justify="space-between" fontWeight={900} pt={1}>
          <Text>Total</Text>
          <Text>{formatINR(order.totals.totalAmount)}</Text>
        </HStack>
      </VStack>

      <HStack>
        <Button
          flex={1}
          variant="outline"
          onClick={() => void onSendToKitchen()}
          isDisabled={!order.lines.length || !selectedCustomer}
        >
          Send To Kitchen
        </Button>
      </HStack>
      <HStack>
        <Button
          flex={1}
          variant="outline"
          onClick={() => void onSavePending()}
          isDisabled={!order.lines.length || !selectedCustomer}
        >
          Save Pending
        </Button>
        <Button flex={1} onClick={onOpenPayment} isDisabled={!canCheckout}>
          Pay
        </Button>
      </HStack>
      <Button variant="ghost" onClick={onClear}>
        Clear Cart
      </Button>
    </VStack>
  );
};
