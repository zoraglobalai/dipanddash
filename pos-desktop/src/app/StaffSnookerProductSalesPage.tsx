import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Grid,
  HStack,
  Input,
  Select,
  Text,
  Textarea,
  VStack,
  useToast
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { FiPlus, FiRefreshCw, FiTrash2 } from "react-icons/fi";

import { usePos } from "@/app/PosContext";
import { posBillingService } from "@/services/invoice-builder.service";
import { snookerOrderService } from "@/services/snooker-order.service";
import type { CartLine } from "@/types/pos";
import { formatINR, roundMoney } from "@/utils/currency";
import { makeId } from "@/utils/idempotency";

type DirectSaleLine = {
  id: string;
  productId: string;
  quantity: number;
};

const makeLine = (): DirectSaleLine => ({
  id: makeId(),
  productId: "",
  quantity: 1
});

export const StaffSnookerProductSalesPage = () => {
  const toast = useToast();
  const { catalog, refreshCatalogSnapshot } = usePos();

  const [lines, setLines] = useState<DirectSaleLine[]>([makeLine()]);
  const [manualDiscountAmount, setManualDiscountAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "card">("cash");
  const [paymentReferenceNo, setPaymentReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const products = useMemo(
    () => (catalog?.products ?? []).filter((product) => product.isActive),
    [catalog?.products]
  );

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const payableCartLines = useMemo<CartLine[]>(
    () => {
      const next: CartLine[] = [];
      lines.forEach((line) => {
        const product = productMap.get(line.productId);
        if (!product) {
          return;
        }
        next.push({
          lineId: line.id,
          lineType: "product",
          refId: product.id,
          name: product.name,
          quantity: Math.max(1, Math.round(Number(line.quantity) || 0)),
          unitPrice: Number(product.sellingPrice) || 0,
          gstPercentage: 0,
          addOns: [],
          notes: null
        });
      });
      return next;
    },
    [lines, productMap]
  );

  const normalizedManualDiscount = useMemo(
    () => Math.max(0, roundMoney(Number(manualDiscountAmount) || 0)),
    [manualDiscountAmount]
  );

  const totals = useMemo(
    () =>
      posBillingService.computeTotals({
        lines: payableCartLines,
        manualDiscountAmount: normalizedManualDiscount
      }),
    [payableCartLines, normalizedManualDiscount]
  );

  const requiresReference = paymentMode === "upi" || paymentMode === "card";
  const referenceValue = paymentReferenceNo.trim();

  const lineErrors = useMemo(() => {
    const errors: string[] = [];
    if (!payableCartLines.length) {
      errors.push("Add at least one valid product line.");
    }

    const quantityByProduct = new Map<string, number>();
    lines.forEach((line) => {
      if (!line.productId) {
        return;
      }
      const qty = Math.max(1, Math.round(Number(line.quantity) || 0));
      quantityByProduct.set(line.productId, (quantityByProduct.get(line.productId) ?? 0) + qty);
    });

    quantityByProduct.forEach((qty, productId) => {
      const product = productMap.get(productId);
      if (!product) {
        return;
      }
      if (qty > Number(product.currentStock ?? 0)) {
        errors.push(`${product.name}: only ${product.currentStock} in stock.`);
      }
    });

    if (requiresReference && !referenceValue) {
      errors.push("Reference ID is required for UPI/Card payments.");
    }

    return errors;
  }, [lines, payableCartLines.length, productMap, referenceValue, requiresReference]);

  const canSubmit = !isSubmitting && lineErrors.length === 0 && totals.totalAmount >= 0;

  const updateLine = (lineId: string, patch: Partial<DirectSaleLine>) => {
    setLines((previous) =>
      previous.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
  };

  const removeLine = (lineId: string) => {
    setLines((previous) => {
      if (previous.length === 1) {
        return [makeLine()];
      }
      return previous.filter((line) => line.id !== lineId);
    });
  };

  const handleRefreshStock = async () => {
    setIsRefreshing(true);
    try {
      await refreshCatalogSnapshot();
      toast({
        status: "success",
        title: "Stock refreshed",
        description: "Latest product stock loaded."
      });
    } catch {
      toast({
        status: "warning",
        title: "Unable to refresh now",
        description: "Please check network and retry."
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSubmit = async () => {
    if (!catalog) {
      toast({
        status: "warning",
        title: "Catalog not ready",
        description: "Please wait for sync and retry."
      });
      return;
    }
    if (lineErrors.length) {
      toast({
        status: "warning",
        title: "Please fix highlighted issues",
        description: lineErrors[0]
      });
      return;
    }

    const payloadLines = lines
      .filter((line) => line.productId)
      .map((line) => ({
        productId: line.productId,
        quantity: Math.max(1, Math.round(Number(line.quantity) || 0))
      }));

    if (!payloadLines.length) {
      return;
    }

    setIsSubmitting(true);
    try {
      const order = await snookerOrderService.createDirectProductSale({
        snapshot: catalog,
        lines: payloadLines,
        manualDiscountAmount: normalizedManualDiscount,
        paymentMode,
        paymentReferenceNo: requiresReference ? referenceValue : undefined,
        notes: notes.trim() || undefined
      });

      toast({
        status: "success",
        title: "Product sale billed",
        description: `${order.invoiceNumber} • ${formatINR(order.totals.totalAmount)}`
      });

      setLines([makeLine()]);
      setManualDiscountAmount(0);
      setPaymentMode("cash");
      setPaymentReferenceNo("");
      setNotes("");

      try {
        await refreshCatalogSnapshot();
      } catch {
        // No-op: sale is already queued locally for sync.
      }
    } catch (error) {
      toast({
        status: "error",
        title: "Unable to create product sale",
        description: error instanceof Error ? error.message : "Please retry."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Box
        p={4}
        borderRadius="16px"
        border="1px solid rgba(139, 78, 49, 0.22)"
        bg="rgba(255, 255, 255, 0.9)"
      >
        <HStack justify="space-between" align={{ base: "stretch", md: "center" }} flexWrap="wrap" gap={3}>
          <Box>
            <Text fontWeight={900} fontSize="lg">Snooker Product Billing</Text>
            <Text fontSize="sm" color="#705B52">
              Sell gaming products directly without booking. Totals are rounded for final billing.
            </Text>
          </Box>
          <Button
            leftIcon={<FiRefreshCw size={14} />}
            variant="outline"
            onClick={() => void handleRefreshStock()}
            isLoading={isRefreshing}
          >
            Refresh Stock
          </Button>
        </HStack>
      </Box>

      <Box
        p={4}
        borderRadius="16px"
        border="1px solid rgba(139, 78, 49, 0.22)"
        bg="rgba(255, 255, 255, 0.9)"
      >
        <VStack align="stretch" spacing={3}>
          {lines.map((line, index) => {
            const product = productMap.get(line.productId);
            const quantity = Math.max(1, Math.round(Number(line.quantity) || 0));
            const lineTotal = roundMoney((product?.sellingPrice ?? 0) * quantity);
            return (
              <Grid key={line.id} templateColumns={{ base: "1fr", md: "2.3fr 1fr auto auto" }} gap={3} alignItems="end">
                <FormControl>
                  <FormLabel fontSize="sm" mb={1}>Product {index + 1}</FormLabel>
                  <Select
                    value={line.productId}
                    onChange={(event) => updateLine(line.id, { productId: event.target.value })}
                  >
                    <option value="">Select product</option>
                    {products.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name} ({entry.currentStock} {entry.unit})
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm" mb={1}>Quantity</FormLabel>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(event) =>
                      updateLine(line.id, {
                        quantity: Math.max(1, Math.round(Number(event.target.value) || 1))
                      })
                    }
                  />
                </FormControl>
                <Box pb={1}>
                  <Text fontSize="xs" color="#7B645B">Line Total</Text>
                  <Text fontWeight={800}>{formatINR(lineTotal)}</Text>
                </Box>
                <Button
                  variant="ghost"
                  colorScheme="red"
                  onClick={() => removeLine(line.id)}
                  leftIcon={<FiTrash2 size={14} />}
                >
                  Remove
                </Button>
              </Grid>
            );
          })}

          <HStack justify="space-between" flexWrap="wrap" gap={3} pt={1}>
            <Button leftIcon={<FiPlus size={14} />} variant="outline" onClick={() => setLines((prev) => [...prev, makeLine()])}>
              Add Product
            </Button>
            <Text fontSize="sm" color="#7B645B">
              Selected lines: <b>{payableCartLines.length}</b>
            </Text>
          </HStack>
        </VStack>
      </Box>

      <Box
        p={4}
        borderRadius="16px"
        border="1px solid rgba(139, 78, 49, 0.22)"
        bg="rgba(255, 255, 255, 0.9)"
      >
        <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={3}>
          <FormControl>
            <FormLabel fontSize="sm" mb={1}>Manual Discount</FormLabel>
            <Input
              type="number"
              min={0}
              value={normalizedManualDiscount}
              onChange={(event) => setManualDiscountAmount(Math.max(0, roundMoney(Number(event.target.value) || 0)))}
            />
          </FormControl>
          <FormControl>
            <FormLabel fontSize="sm" mb={1}>Payment Mode</FormLabel>
            <Select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as "cash" | "upi" | "card")}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
            </Select>
          </FormControl>

          {requiresReference ? (
            <FormControl>
              <FormLabel fontSize="sm" mb={1}>Reference ID</FormLabel>
              <Input
                value={paymentReferenceNo}
                onChange={(event) => setPaymentReferenceNo(event.target.value)}
                placeholder="Enter UPI/Card reference ID"
              />
            </FormControl>
          ) : null}

          <FormControl gridColumn={{ base: "1", md: "1 / span 2" }}>
            <FormLabel fontSize="sm" mb={1}>Notes (Optional)</FormLabel>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add note for this sale"
              minH="84px"
            />
          </FormControl>
        </Grid>

        <HStack
          mt={4}
          p={3}
          borderRadius="12px"
          border="1px solid rgba(139, 78, 49, 0.18)"
          bg="#FFF9EF"
          justify="space-between"
          align="flex-start"
          flexWrap="wrap"
          gap={3}
        >
          <VStack align="start" spacing={0}>
            <Text fontSize="sm" color="#7B645B">Subtotal</Text>
            <Text fontWeight={800}>{formatINR(totals.subtotal)}</Text>
          </VStack>
          <VStack align="start" spacing={0}>
            <Text fontSize="sm" color="#7B645B">Discount</Text>
            <Text fontWeight={800}>{formatINR(totals.manualDiscountAmount)}</Text>
          </VStack>
          <VStack align="start" spacing={0}>
            <Text fontSize="sm" color="#7B645B">Tax</Text>
            <Text fontWeight={800}>{formatINR(totals.taxAmount)}</Text>
          </VStack>
          <VStack align="start" spacing={0}>
            <Text fontSize="sm" color="#7B645B">Total (Rounded)</Text>
            <Text fontWeight={900} fontSize="xl">{formatINR(totals.totalAmount)}</Text>
          </VStack>
          <Button
            onClick={() => void handleSubmit()}
            isLoading={isSubmitting}
            isDisabled={!canSubmit}
            minW="190px"
          >
            Submit Product Bill
          </Button>
        </HStack>

        {lineErrors.length ? (
          <Box mt={3}>
            {lineErrors.map((error) => (
              <Text key={error} fontSize="sm" color="red.600">
                {error}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>
    </VStack>
  );
};
