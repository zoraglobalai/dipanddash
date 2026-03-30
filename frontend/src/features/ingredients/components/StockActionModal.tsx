import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack
} from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import type { IngredientListItem } from "@/types/ingredient";

const schema = z.object({
  quantity: z.coerce.number(),
  note: z.string().trim().max(255).optional()
});

type StockActionFormValues = {
  quantity: number;
  note: string;
};

type StockActionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  mode: "add" | "adjust";
  ingredient?: IngredientListItem | null;
  loading?: boolean;
  onSubmit: (values: { quantity: number; note?: string }) => Promise<void>;
};

export const StockActionModal = ({
  isOpen,
  onClose,
  mode,
  ingredient,
  loading,
  onSubmit
}: StockActionModalProps) => {
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);

  const {
    register,
    reset,
    handleSubmit,
    formState: { errors }
  } = useForm<StockActionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      quantity: 0,
      note: ""
    }
  });

  useEffect(() => {
    reset({
      quantity: 0,
      note: ""
    });
  }, [ingredient, mode, reset]);

  const title = mode === "add" ? "Add Stock" : "Adjust Stock";
  const actionLabel = mode === "add" ? "Add Stock" : "Save Adjustment";

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        isCentered
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
      <ModalOverlay />
      <ModalContent borderRadius="16px">
        <ModalHeader>{title}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack
            as="form"
            id="stock-action-form"
            spacing={4}
            align="stretch"
            onSubmit={handleSubmit((values) =>
              onSubmit({
                quantity: values.quantity,
                note: values.note || undefined
              })
            )}
          >
            {ingredient ? (
              <Text color="#6D5750" fontSize="sm">
                Ingredient: <strong>{ingredient.name}</strong> ({ingredient.unit.toUpperCase()})
              </Text>
            ) : null}
            <AppInput
              label={mode === "add" ? "Quantity to Add" : "Adjustment Quantity (+/-)"}
              type="number"
              step="0.001"
              error={errors.quantity?.message}
              {...register("quantity")}
            />
            <AppInput label="Note (Optional)" placeholder="Reason for update" {...register("note")} />
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <AppButton variant="outline" onClick={requestClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" form="stock-action-form" isLoading={loading}>
            {actionLabel}
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
