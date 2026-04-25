import {
  Button,
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
  Radio,
  RadioGroup,
  Text,
  VStack
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";

import { formatINR, roundMoney } from "@/utils/currency";
import type { PaymentMode } from "@/types/pos";

type PaymentModalProps = {
  isOpen: boolean;
  totalAmount: number;
  onClose: () => void;
  onConfirm: (input: {
    paymentStatus: "paid" | "pending";
    mode: PaymentMode;
    receivedAmount?: number;
    referenceNo?: string;
    splitAmounts?: {
      cash: number;
      card: number;
      upi: number;
    };
    cardReferenceNo?: string;
    upiReferenceNo?: string;
  }) => Promise<void>;
};

export const PaymentModal = ({ isOpen, totalAmount, onClose, onConfirm }: PaymentModalProps) => {
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">("paid");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [receivedAmount, setReceivedAmount] = useState<number>(roundMoney(totalAmount));
  const [referenceNo, setReferenceNo] = useState("");
  const [splitCashAmount, setSplitCashAmount] = useState<string>("");
  const [splitCardAmount, setSplitCardAmount] = useState<string>("");
  const [splitUpiAmount, setSplitUpiAmount] = useState<string>("");
  const [splitCardReferenceNo, setSplitCardReferenceNo] = useState("");
  const [splitUpiReferenceNo, setSplitUpiReferenceNo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setReceivedAmount(roundMoney(totalAmount));
  }, [totalAmount]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setPaymentStatus("paid");
    setMode("cash");
    setReceivedAmount(roundMoney(totalAmount));
    setReferenceNo("");
    setSplitCashAmount("");
    setSplitCardAmount("");
    setSplitUpiAmount("");
    setSplitCardReferenceNo("");
    setSplitUpiReferenceNo("");
    setSubmitError(null);
  }, [isOpen, totalAmount]);

  const roundedTotal = roundMoney(totalAmount);
  const roundedReceived = roundMoney(receivedAmount);
  const changeAmount = useMemo(
    () => roundMoney(Math.max(roundedReceived - roundedTotal, 0)),
    [roundedReceived, roundedTotal]
  );
  const splitValues = useMemo(
    () => ({
      cash: roundMoney(Number(splitCashAmount || 0)),
      card: roundMoney(Number(splitCardAmount || 0)),
      upi: roundMoney(Number(splitUpiAmount || 0))
    }),
    [splitCardAmount, splitCashAmount, splitUpiAmount]
  );
  const splitTotal = useMemo(
    () => roundMoney(splitValues.cash + splitValues.card + splitValues.upi),
    [splitValues]
  );
  const splitGap = useMemo(() => roundMoney(roundedTotal - splitTotal), [roundedTotal, splitTotal]);
  const splitModeCount = useMemo(
    () => [splitValues.cash, splitValues.card, splitValues.upi].filter((value) => value > 0.001).length,
    [splitValues]
  );
  const requiresReference = mode === "card" || mode === "upi";
  const hasValidReference = referenceNo.trim().length > 0;
  const showReferenceError = requiresReference && !hasValidReference;
  const mixedCardNeedsReference = mode === "mixed" && splitValues.card > 0.001 && !splitCardReferenceNo.trim();
  const mixedUpiNeedsReference = mode === "mixed" && splitValues.upi > 0.001 && !splitUpiReferenceNo.trim();
  const mixedHasInvalidSplit =
    mode === "mixed" && (splitTotal <= 0 || Math.abs(splitGap) > 0.01 || splitModeCount < 2);

  const handleConfirm = async () => {
    if (paymentStatus === "pending") {
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        await onConfirm({
          paymentStatus: "pending",
          mode
        });
        onClose();
        setPaymentStatus("paid");
        setMode("cash");
        setReceivedAmount(roundedTotal);
        setReferenceNo("");
        setSplitCashAmount("");
        setSplitCardAmount("");
        setSplitUpiAmount("");
        setSplitCardReferenceNo("");
        setSplitUpiReferenceNo("");
        setSubmitError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save pending bill. Please try again.";
        setSubmitError(message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === "cash" && roundedReceived < roundedTotal) {
      return;
    }
    if (requiresReference && !hasValidReference) {
      return;
    }
    if (mode === "mixed") {
      if (mixedHasInvalidSplit || mixedCardNeedsReference || mixedUpiNeedsReference) {
        return;
      }
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onConfirm({
        paymentStatus: "paid",
        mode,
        receivedAmount: mode === "cash" ? roundedReceived : undefined,
        referenceNo: mode === "cash" || mode === "mixed" ? undefined : referenceNo.trim(),
        splitAmounts:
          mode === "mixed"
            ? {
                cash: splitValues.cash,
                card: splitValues.card,
                upi: splitValues.upi
              }
            : undefined,
        cardReferenceNo: mode === "mixed" ? splitCardReferenceNo.trim() || undefined : undefined,
        upiReferenceNo: mode === "mixed" ? splitUpiReferenceNo.trim() || undefined : undefined
      });
      onClose();
      setPaymentStatus("paid");
      setMode("cash");
      setReceivedAmount(roundedTotal);
      setReferenceNo("");
      setSplitCashAmount("");
      setSplitCardAmount("");
      setSplitUpiAmount("");
      setSplitCardReferenceNo("");
      setSplitUpiReferenceNo("");
      setSubmitError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to complete payment. Please try again.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered closeOnOverlayClick={false} closeOnEsc={false}>
      <ModalOverlay />
      <ModalContent borderRadius="16px">
        <ModalHeader>Complete Payment</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <Text fontWeight={800} fontSize="xl">
              Total: {formatINR(roundedTotal)}
            </Text>

            <FormControl>
              <FormLabel>Payment Status</FormLabel>
              <RadioGroup value={paymentStatus} onChange={(value) => setPaymentStatus(value as "paid" | "pending")}>
                <HStack spacing={4}>
                  <Radio value="paid">Paid</Radio>
                  <Radio value="pending">Pending</Radio>
                </HStack>
              </RadioGroup>
            </FormControl>

            {paymentStatus === "paid" ? (
              <>
                <FormControl>
              <FormLabel>Payment Mode</FormLabel>
              <RadioGroup
                value={mode}
                onChange={(value) => {
                  setMode(value as PaymentMode);
                }}
              >
                <HStack spacing={4}>
                  <Radio value="cash">Cash</Radio>
                  <Radio value="card">Card</Radio>
                  <Radio value="upi">UPI</Radio>
                  <Radio value="mixed">Mixed</Radio>
                </HStack>
              </RadioGroup>
            </FormControl>

            {mode === "cash" ? (
              <FormControl>
                <FormLabel>Amount Received</FormLabel>
                <Input
                  type="number"
                  value={roundedReceived}
                  onChange={(event) => setReceivedAmount(roundMoney(Number(event.target.value) || 0))}
                />
                <Text mt={1} fontSize="sm" color="#705B52">
                  Change: {formatINR(changeAmount)}
                </Text>
                {roundedReceived < roundedTotal ? (
                  <Text mt={1} fontSize="xs" color="red.500">
                    Received amount should be at least total amount.
                  </Text>
                ) : null}
              </FormControl>
            ) : mode === "mixed" ? (
              <VStack align="stretch" spacing={3}>
                <HStack spacing={3}>
                  <FormControl>
                    <FormLabel>Cash Amount</FormLabel>
                    <Input
                      type="number"
                      min={0}
                      value={splitCashAmount}
                      onChange={(event) => setSplitCashAmount(event.target.value)}
                      placeholder="0"
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Card Amount</FormLabel>
                    <Input
                      type="number"
                      min={0}
                      value={splitCardAmount}
                      onChange={(event) => setSplitCardAmount(event.target.value)}
                      placeholder="0"
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>UPI Amount</FormLabel>
                    <Input
                      type="number"
                      min={0}
                      value={splitUpiAmount}
                      onChange={(event) => setSplitUpiAmount(event.target.value)}
                      placeholder="0"
                    />
                  </FormControl>
                </HStack>
                <HStack spacing={3}>
                  <FormControl isInvalid={mixedCardNeedsReference}>
                    <FormLabel>Card Reference</FormLabel>
                    <Input
                      value={splitCardReferenceNo}
                      onChange={(event) => setSplitCardReferenceNo(event.target.value)}
                      placeholder="Required if card amount entered"
                    />
                  </FormControl>
                  <FormControl isInvalid={mixedUpiNeedsReference}>
                    <FormLabel>UPI Reference</FormLabel>
                    <Input
                      value={splitUpiReferenceNo}
                      onChange={(event) => setSplitUpiReferenceNo(event.target.value)}
                      placeholder="Required if UPI amount entered"
                    />
                  </FormControl>
                </HStack>
                <Text mt={1} fontSize="sm" color="#705B52">
                  Split Total: {formatINR(splitTotal)}
                </Text>
                {splitModeCount < 2 ? (
                  <Text mt={1} fontSize="xs" color="red.500">
                    Mixed payment needs at least two payment methods.
                  </Text>
                ) : null}
                {Math.abs(splitGap) > 0.01 ? (
                  <Text mt={1} fontSize="xs" color="red.500">
                    {splitGap > 0
                      ? `${formatINR(splitGap)} pending to allocate`
                      : `${formatINR(Math.abs(splitGap))} exceeds total amount`}
                  </Text>
                ) : null}
                {mixedCardNeedsReference ? (
                  <Text mt={1} fontSize="xs" color="red.500">
                    Card reference is required for card split amount.
                  </Text>
                ) : null}
                {mixedUpiNeedsReference ? (
                  <Text mt={1} fontSize="xs" color="red.500">
                    UPI reference is required for UPI split amount.
                  </Text>
                ) : null}
              </VStack>
            ) : (
              <FormControl isInvalid={showReferenceError}>
                <FormLabel>Reference ID (required)</FormLabel>
                <Input
                  value={referenceNo}
                  onChange={(event) => setReferenceNo(event.target.value)}
                  placeholder="Txn reference"
                />
                {showReferenceError ? (
                  <Text mt={1} fontSize="xs" color="red.500">
                    Reference ID is required for Card and UPI payments.
                  </Text>
                ) : null}
              </FormControl>
            )}
              </>
            ) : (
              <Text fontSize="sm" color="#705B52">
                This order will be saved as pending and shown in Pending Collections.
              </Text>
            )}
            {submitError ? (
              <Text mt={1} fontSize="xs" color="red.500">
                {submitError}
              </Text>
            ) : null}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
            <Button
              onClick={() => void handleConfirm()}
              isLoading={isSubmitting}
              isDisabled={
                paymentStatus === "paid"
                  ? (mode === "cash" && roundedReceived < roundedTotal) ||
                    (requiresReference && !hasValidReference) ||
                    mixedHasInvalidSplit ||
                    mixedCardNeedsReference ||
                    mixedUpiNeedsReference
                  : false
              }
            >
              {paymentStatus === "pending" ? "Save Pending" : "Confirm Payment"}
            </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
