import {
  Box,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
  Textarea,
  VStack
} from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { formatCurrency } from "@/features/items/units";
import { useAppToast } from "@/hooks/useAppToast";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import type { SauceDetail, SauceListItem } from "@/types/item";

type SauceBatchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  sauce?: SauceListItem | SauceDetail | null;
  onSubmit: (values: { producedQuantity: number; note?: string }) => Promise<void>;
};

export const SauceBatchModal = ({
  isOpen,
  onClose,
  loading,
  sauce,
  onSubmit
}: SauceBatchModalProps) => {
  const toast = useAppToast();
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);
  const [producedQuantity, setProducedQuantity] = useState("1");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setProducedQuantity(String(sauce?.baseBatchQuantity ?? 1));
    setNote("");
  }, [isOpen, sauce]);

  const handleSave = async () => {
    const quantity = Number(producedQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.warning("Please enter a valid produced quantity.");
      return;
    }

    await onSubmit({
      producedQuantity: quantity,
      note: note.trim() || undefined
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        isCentered
        size="lg"
        scrollBehavior="inside"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <ModalOverlay />
        <ModalContent borderRadius="16px">
          <ModalHeader>Record Sauce Batch</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={5} align="stretch">
              <Box
                p={3}
                borderRadius="12px"
                border="1px solid"
                borderColor="rgba(133, 78, 48, 0.22)"
                bg="rgba(255, 253, 249, 0.85)"
              >
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <Box>
                    <Text fontSize="sm" color="#6A5049">
                      Sauce
                    </Text>
                    <Text fontWeight={700}>{sauce?.name ?? "-"}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="sm" color="#6A5049">
                      Current Stock
                    </Text>
                    <Text fontWeight={700}>
                      {sauce?.totalStock ?? 0} {sauce?.outputUnit?.toUpperCase() ?? ""}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="sm" color="#6A5049">
                      Base Batch
                    </Text>
                    <Text fontWeight={700}>
                      {sauce?.baseBatchQuantity ?? 0} {sauce?.outputUnit?.toUpperCase() ?? ""}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="sm" color="#6A5049">
                      Estimated Cost / {sauce?.outputUnit?.toUpperCase() ?? "UNIT"}
                    </Text>
                    <Text fontWeight={700}>{formatCurrency(sauce?.estimatedUnitCost ?? 0)}</Text>
                  </Box>
                </SimpleGrid>
              </Box>

              <AppInput
                label={`Produced Quantity (${sauce?.outputUnit?.toUpperCase() ?? "UNIT"})`}
                type="number"
                min={0}
                step="0.001"
                value={producedQuantity}
                onChange={(event) =>
                  setProducedQuantity(
                    (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
                  )
                }
              />

              <Textarea
                value={note}
                onChange={(event) => setNote((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                placeholder="Optional note for this batch"
              />
            </VStack>
          </ModalBody>
          <ModalFooter gap={3}>
            <AppButton variant="outline" onClick={requestClose}>
              Cancel
            </AppButton>
            <AppButton onClick={() => void handleSave()} isLoading={loading}>
              Save Batch
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
};
