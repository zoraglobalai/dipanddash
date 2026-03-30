import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
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
import type { ItemCategory } from "@/types/item";

const schema = z.object({
  name: z.string().trim().min(2, "Category name must be at least 2 characters").max(120),
  description: z.string().trim().max(255).optional()
});

type CategoryFormValues = {
  name: string;
  description: string;
};

type ItemCategoryFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; description?: string }) => Promise<void>;
  loading?: boolean;
  initialData?: ItemCategory | null;
};

export const ItemCategoryFormModal = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  initialData
}: ItemCategoryFormModalProps) => {
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);

  const {
    register,
    reset,
    handleSubmit,
    formState: { errors }
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: ""
    }
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!initialData) {
      reset({ name: "", description: "" });
      return;
    }

    reset({
      name: initialData.name,
      description: initialData.description ?? ""
    });
  }, [initialData, isOpen, reset]);

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
        <ModalHeader>{initialData ? "Edit Item Category" : "Create Item Category"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack
            as="form"
            id="item-category-form"
            spacing={4}
            align="stretch"
            onSubmit={handleSubmit((values) =>
              onSubmit({
                name: values.name,
                description: values.description || undefined
              })
            )}
          >
            <AppInput
              label="Category Name"
              placeholder="e.g. Burger"
              error={errors.name?.message}
              {...register("name")}
            />
            <AppInput
              label="Description (Optional)"
              placeholder="Short category note"
              error={errors.description?.message}
              {...register("description")}
            />
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <AppButton variant="outline" onClick={requestClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" form="item-category-form" isLoading={loading}>
            {initialData ? "Save Changes" : "Create Category"}
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
