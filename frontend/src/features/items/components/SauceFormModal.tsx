import {
  Box,
  Divider,
  FormControl,
  FormLabel,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Switch,
  Text,
  Textarea,
  VStack
} from "@chakra-ui/react";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { AppSearchableSelect, type AppSearchableSelectOption } from "@/components/ui/AppSearchableSelect";
import { convertQuantity, formatCurrency, getCompatibleUnits } from "@/features/items/units";
import { useAppToast } from "@/hooks/useAppToast";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import type { ItemMetaIngredient, ItemRecipeRow, ItemUnitMeta, SauceDetail } from "@/types/item";

type RecipeDraft = {
  key: string;
  ingredientCategoryId: string;
  ingredientId: string;
  quantity: string;
  unit: string;
};

type SauceFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  ingredients: ItemMetaIngredient[];
  unitMeta: ItemUnitMeta[];
  initialData?: SauceDetail | null;
  onSubmit: (values: {
    name: string;
    outputUnit: ItemMetaIngredient["unit"];
    baseBatchQuantity: number;
    note?: string;
    isActive?: boolean;
    ingredients: ItemRecipeRow[];
  }) => Promise<void>;
};

const createRow = (ingredient?: ItemMetaIngredient): RecipeDraft => ({
  key: crypto.randomUUID(),
  ingredientCategoryId: ingredient?.categoryId ?? "",
  ingredientId: ingredient?.id ?? "",
  quantity: "1",
  unit: ingredient?.unit ?? ""
});

export const SauceFormModal = ({
  isOpen,
  onClose,
  loading,
  ingredients,
  unitMeta,
  initialData,
  onSubmit
}: SauceFormModalProps) => {
  const toast = useAppToast();
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);
  const [name, setName] = useState("");
  const [outputUnit, setOutputUnit] = useState<ItemMetaIngredient["unit"]>("g");
  const [baseBatchQuantity, setBaseBatchQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [recipeRows, setRecipeRows] = useState<RecipeDraft[]>([createRow()]);

  const ingredientMap = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients]
  );
  const ingredientCategoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    ingredients.forEach((ingredient) => {
      if (!map.has(ingredient.categoryId)) {
        map.set(ingredient.categoryId, ingredient.categoryName);
      }
    });

    return Array.from(map.entries())
      .map(([id, value]) => ({ id, value }))
      .sort((left, right) => left.value.localeCompare(right.value));
  }, [ingredients]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!initialData) {
      setName("");
      setOutputUnit("g");
      setBaseBatchQuantity("1");
      setNote("");
      setIsActive(true);
      setRecipeRows([createRow(ingredients[0])]);
      return;
    }

    setName(initialData.name);
    setOutputUnit(initialData.outputUnit);
    setBaseBatchQuantity(String(initialData.baseBatchQuantity));
    setNote(initialData.note ?? "");
    setIsActive(initialData.isActive);
    setRecipeRows(
      initialData.ingredients.length
        ? initialData.ingredients.map((ingredient) => ({
            key: crypto.randomUUID(),
            ingredientCategoryId: ingredient.ingredientCategoryId,
            ingredientId: ingredient.ingredientId,
            quantity: String(ingredient.quantity),
            unit: ingredient.unit
          }))
        : [createRow(ingredients[0])]
    );
  }, [ingredients, initialData, isOpen]);

  const rowSummaries = useMemo(() => {
    return recipeRows.map((row) => {
      const ingredient = ingredientMap.get(row.ingredientId);
      if (!ingredient) {
        return { compatible: false, cost: 0, helper: "Choose an ingredient", baseUnit: "" };
      }

      const quantity = Number(row.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return { compatible: false, cost: 0, helper: "Enter a valid quantity", baseUnit: ingredient.unit };
      }

      const converted = convertQuantity(quantity, row.unit as ItemMetaIngredient["unit"], ingredient.unit, unitMeta);
      if (converted === null) {
        return {
          compatible: false,
          cost: 0,
          helper: "Selected unit is not compatible with base unit",
          baseUnit: ingredient.unit
        };
      }

      const cost = Number((converted * ingredient.perUnitPrice).toFixed(3));
      return {
        compatible: true,
        cost,
        helper: `${quantity} ${row.unit} = ${converted} ${ingredient.unit} | Last purchase ${formatCurrency(ingredient.perUnitPrice)} / ${ingredient.unit.toUpperCase()}`,
        baseUnit: ingredient.unit
      };
    });
  }, [ingredientMap, recipeRows, unitMeta]);

  const estimatedBatchCost = useMemo(
    () => Number(rowSummaries.reduce((sum, row) => sum + row.cost, 0).toFixed(3)),
    [rowSummaries]
  );
  const baseBatchQuantityNumber = Number(baseBatchQuantity) || 0;
  const estimatedUnitCost = baseBatchQuantityNumber > 0 ? Number((estimatedBatchCost / baseBatchQuantityNumber).toFixed(2)) : 0;

  const handleRowUpdate = (index: number, patch: Partial<RecipeDraft>) => {
    setRecipeRows((previous) =>
      previous.map((row, currentIndex) => {
        if (currentIndex !== index) {
          return row;
        }

        const updated = { ...row, ...patch };
        if (patch.ingredientCategoryId !== undefined && updated.ingredientId) {
          const selectedIngredient = ingredientMap.get(updated.ingredientId);
          if (selectedIngredient && selectedIngredient.categoryId !== patch.ingredientCategoryId) {
            updated.ingredientId = "";
          }
        }

        if (patch.ingredientId !== undefined) {
          const ingredient = ingredientMap.get(patch.ingredientId);
          if (ingredient) {
            updated.ingredientCategoryId = ingredient.categoryId;
            const compatible = getCompatibleUnits(ingredient.unit, unitMeta);
            if (!compatible.includes(updated.unit as ItemMetaIngredient["unit"])) {
              updated.unit = compatible[0] ?? ingredient.unit;
            }
          }
        }

        return updated;
      })
    );
  };

  const addRow = () => {
    setRecipeRows((previous) => [...previous, createRow(ingredients[0])]);
  };

  const removeRow = (index: number) => {
    setRecipeRows((previous) => (previous.length === 1 ? previous : previous.filter((_, rowIndex) => rowIndex !== index)));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.warning("Sauce name is required.");
      return;
    }

    const batchQuantity = Number(baseBatchQuantity);
    if (!Number.isFinite(batchQuantity) || batchQuantity <= 0) {
      toast.warning("Please enter a valid batch output quantity.");
      return;
    }

    const duplicateCheck = recipeRows.map((row) => row.ingredientId).filter(Boolean);
    if (new Set(duplicateCheck).size !== duplicateCheck.length) {
      toast.warning("Duplicate ingredients are not allowed.");
      return;
    }

    const ingredientsPayload: ItemRecipeRow[] = [];
    for (const row of recipeRows) {
      const quantity = Number(row.quantity);
      if (!row.ingredientId || !row.unit || !Number.isFinite(quantity) || quantity <= 0) {
        toast.warning("Please provide valid ingredient, quantity and unit for all rows.");
        return;
      }

      const ingredient = ingredientMap.get(row.ingredientId);
      if (!ingredient) {
        toast.warning("Please select valid ingredients.");
        return;
      }

      const converted = convertQuantity(quantity, row.unit as ItemMetaIngredient["unit"], ingredient.unit, unitMeta);
      if (converted === null) {
        toast.warning("Selected unit is not compatible with ingredient base unit.");
        return;
      }

      ingredientsPayload.push({
        ingredientId: row.ingredientId,
        quantity,
        unit: row.unit as ItemMetaIngredient["unit"]
      });
    }

    await onSubmit({
      name: name.trim(),
      outputUnit,
      baseBatchQuantity: batchQuantity,
      note: note.trim() || undefined,
      isActive: initialData ? isActive : undefined,
      ingredients: ingredientsPayload
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        isCentered
        size="4xl"
        scrollBehavior="inside"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <ModalOverlay />
        <ModalContent borderRadius="16px">
          <ModalHeader>{initialData ? "Edit Sauce Recipe" : "Create Sauce Recipe"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={5} align="stretch">
              <Box>
                <Text fontWeight={800} mb={3}>
                  Sauce Info
                </Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <AppInput
                    label="Sauce Name"
                    value={name}
                    onChange={(event) => setName((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                  />
                  <FormControl>
                    <FormLabel>Output Unit</FormLabel>
                    <Select
                      value={outputUnit}
                      isDisabled={Boolean(initialData)}
                      onChange={(event) =>
                        setOutputUnit(
                          (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
                            .value as ItemMetaIngredient["unit"]
                        )
                      }
                    >
                      {unitMeta.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </Select>
                    {initialData ? (
                      <Text mt={1} fontSize="xs" color="#705B52">
                        Output unit cannot be changed after creation.
                      </Text>
                    ) : null}
                  </FormControl>
                  <AppInput
                    label={`Batch Output (${outputUnit.toUpperCase()})`}
                    type="number"
                    min={0}
                    step="0.001"
                    value={baseBatchQuantity}
                    onChange={(event) =>
                      setBaseBatchQuantity((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)
                    }
                  />
                </SimpleGrid>

                <FormControl mt={4}>
                  <FormLabel>Note (Optional)</FormLabel>
                  <Textarea
                    value={note}
                    onChange={(event) => setNote((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                    placeholder="Example: Used for burgers and wraps"
                  />
                </FormControl>

                {initialData ? (
                  <HStack mt={4} spacing={3}>
                    <Switch colorScheme="brand" isChecked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                    <Text fontWeight={600}>{isActive ? "Sauce Enabled" : "Sauce Disabled"}</Text>
                  </HStack>
                ) : null}
              </Box>

              <Divider />

              <Box>
                <Text fontWeight={800} mb={3}>
                  Ingredient Mix
                </Text>
                <Text fontSize="sm" color="#6A5049" mb={3}>
                  Define what goes into one batch. Sauce stock is added when batch is recorded.
                </Text>

                <VStack spacing={3} align="stretch">
                  {recipeRows.map((row, index) => {
                    const ingredient = ingredientMap.get(row.ingredientId);
                    const compatibleUnits = ingredient
                      ? getCompatibleUnits(ingredient.unit, unitMeta)
                      : unitMeta.map((unit) => unit.value);
                    const summary = rowSummaries[index];
                    const selectedIds = new Set(
                      recipeRows.filter((_, rowIndex) => rowIndex !== index).map((entry) => entry.ingredientId)
                    );
                    const categoryOptions: AppSearchableSelectOption[] = ingredientCategoryOptions.map((category) => ({
                      value: category.id,
                      label: category.value
                    }));
                    const filteredIngredients = ingredients.filter((entry) => {
                      const categoryMatches = !row.ingredientCategoryId || entry.categoryId === row.ingredientCategoryId;
                      const duplicateSafe = !selectedIds.has(entry.id) || entry.id === row.ingredientId;
                      return categoryMatches && duplicateSafe;
                    });
                    const ingredientOptions: AppSearchableSelectOption[] = filteredIngredients.map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                      description: entry.categoryName,
                      searchText: `${entry.name} ${entry.categoryName}`
                    }));

                    return (
                      <Box
                        key={row.key}
                        p={3}
                        borderRadius="12px"
                        border="1px solid"
                        borderColor="rgba(133, 78, 48, 0.22)"
                        bg="rgba(255, 253, 249, 0.85)"
                      >
                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                          <AppSearchableSelect
                            label="Ingredient Category"
                            placeholder="Select category"
                            searchPlaceholder="Search category"
                            value={row.ingredientCategoryId}
                            options={categoryOptions}
                            onValueChange={(value) => handleRowUpdate(index, { ingredientCategoryId: value })}
                          />
                          <AppSearchableSelect
                            label="Ingredient"
                            placeholder="Select ingredient"
                            searchPlaceholder="Search ingredient"
                            emptyText="No ingredients found for this category"
                            value={row.ingredientId}
                            options={ingredientOptions}
                            onValueChange={(value) => handleRowUpdate(index, { ingredientId: value })}
                          />
                        </SimpleGrid>
                        <SimpleGrid mt={3} columns={{ base: 1, md: 3 }} spacing={3}>
                          <AppInput
                            label="Quantity"
                            type="number"
                            min={0}
                            step="0.001"
                            value={row.quantity}
                            onChange={(event) =>
                              handleRowUpdate(index, {
                                quantity: (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
                              })
                            }
                          />
                          <FormControl>
                            <FormLabel>Unit</FormLabel>
                            <Select
                              value={row.unit}
                              onChange={(event) =>
                                handleRowUpdate(index, {
                                  unit: (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
                                })
                              }
                            >
                              {compatibleUnits.map((unit) => (
                                <option key={`${row.key}-${unit}`} value={unit}>
                                  {unit.toUpperCase()}
                                </option>
                              ))}
                            </Select>
                          </FormControl>
                          <FormControl>
                            <FormLabel>Action</FormLabel>
                            <ActionIconButton
                              aria-label="Remove ingredient"
                              icon={<Trash2 size={16} />}
                              variant="outline"
                              colorScheme="red"
                              isDisabled={recipeRows.length === 1}
                              onClick={() => removeRow(index)}
                            />
                          </FormControl>
                        </SimpleGrid>

                        <HStack mt={2} justify="space-between" flexWrap="wrap">
                          <Text fontSize="sm" color={summary.compatible ? "#6A5049" : "red.600"}>
                            Base unit: {summary.baseUnit ? summary.baseUnit.toUpperCase() : "-"} | {summary.helper}
                          </Text>
                          <Text fontWeight={700} color="#2A1B16">
                            Cost: {formatCurrency(summary.cost)}
                          </Text>
                        </HStack>
                      </Box>
                    );
                  })}

                  <AppButton
                    size="sm"
                    alignSelf={{ base: "stretch", md: "flex-start" }}
                    leftIcon={<Plus size={14} />}
                    onClick={addRow}
                  >
                    Add Ingredient
                  </AppButton>
                </VStack>
              </Box>

              <Divider />

              <Box
                p={3}
                borderRadius="12px"
                border="1px solid"
                borderColor="rgba(193, 14, 14, 0.2)"
                bg="linear-gradient(120deg, rgba(255, 246, 225, 0.8) 0%, rgba(255, 255, 255, 0.95) 100%)"
              >
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                  <Box>
                    <Text fontSize="sm" color="#6A5049">
                      Estimated Batch Cost
                    </Text>
                    <Text fontWeight={800}>{formatCurrency(estimatedBatchCost)}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="sm" color="#6A5049">
                      Batch Output
                    </Text>
                    <Text fontWeight={800}>
                      {baseBatchQuantityNumber || 0} {outputUnit.toUpperCase()}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="sm" color="#6A5049">
                      Estimated Unit Cost
                    </Text>
                    <Text fontWeight={800}>{formatCurrency(estimatedUnitCost)}</Text>
                  </Box>
                </SimpleGrid>
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter gap={3}>
            <AppButton variant="outline" onClick={requestClose}>
              Cancel
            </AppButton>
            <AppButton onClick={() => void handleSave()} isLoading={loading}>
              {initialData ? "Save Sauce" : "Create Sauce"}
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
