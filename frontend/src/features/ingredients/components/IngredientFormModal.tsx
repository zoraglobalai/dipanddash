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
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import {
  AppSearchableSelect,
  type AppSearchableSelectOption
} from "@/components/ui/AppSearchableSelect";
import { INGREDIENT_UNIT_OPTIONS } from "@/features/ingredients/constants";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import type { IngredientCategory, IngredientListItem, IngredientUnit } from "@/types/ingredient";
import { mapIngredientCategoriesToOptions } from "@/utils/select-options";

const schema = z.object({
  name: z.string().trim().min(2, "Ingredient name must be at least 2 characters").max(120),
  categoryId: z.string().uuid("Please select a valid category"),
  unit: z.string().min(1, "Unit is required"),
  minStock: z.coerce.number().min(0, "Minimum stock cannot be negative")
});

type IngredientFormValues = {
  name: string;
  categoryId: string;
  unit: IngredientUnit;
  minStock: number;
};

type IngredientFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    categoryId: string;
    unit: IngredientUnit;
    minStock: number;
  }) => Promise<void>;
  loading?: boolean;
  categories: IngredientCategory[];
  initialData?: IngredientListItem | null;
};

export const IngredientFormModal = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  categories,
  initialData
}: IngredientFormModalProps) => {
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);

  const {
    control,
    register,
    reset,
    handleSubmit,
    formState: { errors }
  } = useForm<IngredientFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      categoryId: "",
      unit: "g",
      minStock: 0
    }
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!initialData) {
      reset({
        name: "",
        categoryId: categories[0]?.id ?? "",
        unit: "g",
        minStock: 0
      });
      return;
    }

    reset({
      name: initialData.name,
      categoryId: initialData.categoryId,
      unit: initialData.unit,
      minStock: initialData.minStock
    });
  }, [categories, initialData, isOpen, reset]);

  const categoryOptions: AppSearchableSelectOption[] = mapIngredientCategoriesToOptions(categories);

  const unitOptions: AppSearchableSelectOption[] = INGREDIENT_UNIT_OPTIONS.map((unit) => ({
    label: unit.label,
    value: unit.value,
    searchText: unit.value
  }));

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        isCentered
        size="lg"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
      <ModalOverlay />
      <ModalContent borderRadius="16px">
        <ModalHeader>{initialData ? "Edit Ingredient" : "Create Ingredient"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack
            as="form"
            id="ingredient-form"
            spacing={4}
            align="stretch"
            onSubmit={handleSubmit((values) => onSubmit(values))}
          >
            <AppInput
              label="Ingredient Name"
              placeholder="e.g. Cheese"
              error={errors.name?.message}
              {...register("name")}
            />
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <AppSearchableSelect
                  label="Category"
                  value={field.value ?? ""}
                  options={categoryOptions}
                  onValueChange={field.onChange}
                  placeholder="Select category"
                  searchPlaceholder="Search category"
                  error={errors.categoryId?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="unit"
              render={({ field }) => (
                <AppSearchableSelect
                  label="Unit"
                  value={field.value ?? ""}
                  options={unitOptions}
                  onValueChange={field.onChange}
                  placeholder="Select unit"
                  searchPlaceholder="Search unit"
                  error={errors.unit?.message}
                />
              )}
            />
            <AppInput
              label="Minimum Stock"
              type="number"
              step="0.001"
              min={0}
              error={errors.minStock?.message}
              {...register("minStock")}
            />
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <AppButton variant="outline" onClick={requestClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" form="ingredient-form" isLoading={loading}>
            {initialData ? "Save Changes" : "Create Ingredient"}
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
