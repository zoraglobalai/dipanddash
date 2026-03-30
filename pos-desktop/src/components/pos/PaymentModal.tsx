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
  onConfirm: (input: { mode: PaymentMode; receivedAmount?: number; referenceNo?: string }) => Promise<void>;
};

export const PaymentModal = ({ isOpen, totalAmount, onClose, onConfirm }: PaymentModalProps) => {
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [receivedAmount, setReceivedAmount] = useState<number>(roundMoney(totalAmount));
  const [referenceNo, setReferenceNo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setReceivedAmount(roundMoney(totalAmount));
  }, [totalAmount]);

  const roundedTotal = roundMoney(totalAmount);
  const roundedReceived = roundMoney(receivedAmount);
  const changeAmount = useMemo(
    () => roundMoney(Math.max(roundedReceived - roundedTotal, 0)),
    [roundedReceived, roundedTotal]
  );
  const requiresReference = mode === "card" || mode === "upi";
  const hasValidReference = referenceNo.trim().length > 0;
  const showReferenceError = requiresReference && !hasValidReference;

  const handleConfirm = async () => {
    if (mode === "cash" && roundedReceived < roundedTotal) {
      return;
    }
    if (requiresReference && !hasValidReference) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm({
        mode,
        receivedAmount: mode === "cash" ? roundedReceived : undefined,
        referenceNo: mode === "cash" ? undefined : referenceNo.trim()
      });
      onClose();
      setMode("cash");
      setReceivedAmount(roundedTotal);
      setReferenceNo("");
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
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
            <Button
              onClick={() => void handleConfirm()}
              isLoading={isSubmitting}
              isDisabled={(mode === "cash" && roundedReceived < roundedTotal) || (requiresReference && !hasValidReference)}
            >
              Confirm Payment
            </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
