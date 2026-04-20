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
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import {
  AppSearchableSelect,
  type AppSearchableSelectOption
} from "@/components/ui/AppSearchableSelect";
import { formatCurrency, convertQuantity, getCompatibleUnits } from "@/features/items/units";
import { useAppToast } from "@/hooks/useAppToast";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import type {
  ItemCategory,
  ItemDetail,
  ItemMetaIngredient,
  ItemMetaSauce,
  ItemRecipeRow,
  ItemUnitMeta
} from "@/types/item";
import { mapItemCategoriesToOptions } from "@/utils/select-options";

type RecipeDraft = {
  key: string;
  ingredientCategoryId: string;
  ingredientId: string;
  quantity: string;
  unit: string;
};

type SauceDraft = {
  key: string;
  sauceId: string;
  quantity: string;
  unit: string;
};

type ItemFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  categories: ItemCategory[];
  ingredients: ItemMetaIngredient[];
  sauces: ItemMetaSauce[];
  unitMeta: ItemUnitMeta[];
  initialData?: ItemDetail | null;
  onSubmit: (values: {
    name: string;
    categoryId: string;
    sellingPrice: number;
    gstPercentage: number;
    imageUrl?: string;
    note?: string;
    isActive?: boolean;
    ingredients: ItemRecipeRow[];
    sauces: Array<{ sauceId: string; quantity: number; unit: ItemMetaIngredient["unit"] }>;
  }) => Promise<void>;
};

const createRow = (ingredient?: ItemMetaIngredient): RecipeDraft => ({
  key: crypto.randomUUID(),
  ingredientCategoryId: ingredient?.categoryId ?? "",
  ingredientId: ingredient?.id ?? "",
  quantity: "1",
  unit: ingredient?.unit ?? ""
});

const createSauceRow = (sauce?: ItemMetaSauce): SauceDraft => ({
  key: crypto.randomUUID(),
  sauceId: sauce?.id ?? "",
  quantity: "0",
  unit: sauce?.outputUnit ?? ""
});

export const ItemFormModal = ({
  isOpen,
  onClose,
  loading,
  categories,
  ingredients,
  sauces,
  unitMeta,
  initialData,
  onSubmit
}: ItemFormModalProps) => {
  const toast = useAppToast();
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sellingPrice, setSellingPrice] = useState("0");
  const [gstPercentage, setGstPercentage] = useState("0");
  const [note, setNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [recipeRows, setRecipeRows] = useState<RecipeDraft[]>([createRow()]);
  const [sauceRows, setSauceRows] = useState<SauceDraft[]>([createSauceRow()]);

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
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients]);
  const itemCategoryOptions = useMemo<AppSearchableSelectOption[]>(
    () => mapItemCategoriesToOptions(categories),
    [categories]
  );
  const sauceMap = useMemo(() => new Map(sauces.map((sauce) => [sauce.id, sauce])), [sauces]);
  const sauceOptions = useMemo<AppSearchableSelectOption[]>(
    () =>
      sauces.map((sauce) => ({
        value: sauce.id,
        label: sauce.name,
        description: `${sauce.outputUnit.toUpperCase()} | ${formatCurrency(sauce.estimatedUnitCost)}/${sauce.outputUnit.toUpperCase()}`
      })),
    [sauces]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!initialData) {
      setName("");
      setCategoryId(categories[0]?.id ?? "");
      setSellingPrice("0");
      setGstPercentage("0");
      setNote("");
      setIsActive(true);

      const defaultIngredient = ingredients[0];
      setRecipeRows([createRow(defaultIngredient)]);
      setSauceRows([createSauceRow()]);
      return;
    }

    setName(initialData.name);
    setCategoryId(initialData.categoryId);
    setSellingPrice(String(initialData.sellingPrice));
    setGstPercentage(String(initialData.gstPercentage));
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
        : [createRow()]
    );
    setSauceRows(
      initialData.sauces.length
        ? initialData.sauces.map((row) => ({
            key: crypto.randomUUID(),
            sauceId: row.sauceId,
            quantity: String(row.quantity),
            unit: row.unit ?? ""
          }))
        : [createSauceRow()]
    );
  }, [categories, ingredients, initialData, isOpen]);

  const rowSummaries = useMemo(() => {
    return recipeRows.map((row) => {
      const ingredient = ingredientMap.get(row.ingredientId);
      if (!ingredient) {
        return {
          compatible: false,
          cost: 0,
          helper: "Choose an ingredient",
          baseUnit: ""
        };
      }

      const quantity = Number(row.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return {
          compatible: false,
          cost: 0,
          helper: "Enter a valid quantity",
          baseUnit: ingredient.unit
        };
      }

      const converted = convertQuantity(
        quantity,
        row.unit as ItemMetaIngredient["unit"],
        ingredient.unit,
        unitMeta
      );
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

  const sauceSummaries = useMemo(() => {
    return sauceRows.map((row) => {
      const sauce = sauceMap.get(row.sauceId);
      if (!sauce) {
        return {
          compatible: false,
          cost: 0,
          helper: "Choose a sauce"
        };
      }

      const quantity = Number(row.quantity);
      if (!row.unit || !Number.isFinite(quantity) || quantity <= 0) {
        return {
          compatible: false,
          cost: 0,
          helper: "Enter a valid quantity and unit"
        };
      }

      const converted = convertQuantity(
        quantity,
        row.unit as ItemMetaIngredient["unit"],
        sauce.outputUnit,
        unitMeta
      );
      if (converted === null) {
        return {
          compatible: false,
          cost: 0,
          helper: "Selected unit is not compatible with sauce output unit"
        };
      }

      const cost = Number((converted * sauce.estimatedUnitCost).toFixed(3));
      return {
        compatible: true,
        cost,
        helper: `${quantity} ${row.unit.toUpperCase()} = ${converted} ${sauce.outputUnit.toUpperCase()} | ${formatCurrency(sauce.estimatedUnitCost)} / ${sauce.outputUnit.toUpperCase()}`
      };
    });
  }, [sauceMap, sauceRows, unitMeta]);

  const estimatedCost = useMemo(
    () =>
      Number(
        (rowSummaries.reduce((sum, row) => sum + row.cost, 0) + sauceSummaries.reduce((sum, row) => sum + row.cost, 0)).toFixed(
          3
        )
      ),
    [rowSummaries, sauceSummaries]
  );
  const sellingPriceNumber = Number(sellingPrice) || 0;
  const margin = Number((sellingPriceNumber - estimatedCost).toFixed(2));

  const handleRowUpdate = (index: number, patch: Partial<RecipeDraft>) => {
    setRecipeRows((previous) =>
      previous.map((row, currentIndex) => {
        if (currentIndex !== index) {
          return row;
        }

        const updated = { ...row, ...patch };
        if (patch.ingredientCategoryId !== undefined) {
          if (updated.ingredientId) {
            const selectedIngredient = ingredientMap.get(updated.ingredientId);
            if (selectedIngredient && selectedIngredient.categoryId !== patch.ingredientCategoryId) {
              updated.ingredientId = "";
            }
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
    const defaultIngredient = ingredients[0];
    setRecipeRows((previous) => [...previous, createRow(defaultIngredient)]);
  };

  const removeRow = (index: number) => {
    setRecipeRows((previous) => previous.filter((_, i) => i !== index));
  };

  const handleSauceRowUpdate = (index: number, patch: Partial<SauceDraft>) => {
    setSauceRows((previous) =>
      previous.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }
        const updated = {
          ...row,
          ...patch
        };

        if (patch.sauceId !== undefined) {
          const selectedSauce = sauceMap.get(patch.sauceId);
          if (!selectedSauce) {
            updated.unit = "";
            return updated;
          }
          const compatibleUnits = getCompatibleUnits(selectedSauce.outputUnit, unitMeta);
          if (!compatibleUnits.includes(updated.unit as ItemMetaIngredient["unit"])) {
            updated.unit = compatibleUnits[0] ?? selectedSauce.outputUnit;
          }
        }

        return updated;
      })
    );
  };

  const addSauceRow = () => {
    setSauceRows((previous) => [...previous, createSauceRow()]);
  };

  const removeSauceRow = (index: number) => {
    setSauceRows((previous) => previous.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.warning("Item name is required.");
      return;
    }
    if (!categoryId) {
      toast.warning("Please select an item category.");
      return;
    }

    const duplicateCheck = recipeRows.map((row) => row.ingredientId).filter(Boolean);
    if (new Set(duplicateCheck).size !== duplicateCheck.length) {
      toast.warning("Duplicate ingredients are not allowed.");
      return;
    }
    const duplicateSauces = sauceRows.map((row) => row.sauceId).filter(Boolean);
    if (new Set(duplicateSauces).size !== duplicateSauces.length) {
      toast.warning("Duplicate sauces are not allowed.");
      return;
    }

    const ingredientsPayload: ItemRecipeRow[] = [];
    for (let index = 0; index < recipeRows.length; index += 1) {
      const row = recipeRows[index];
      const hasAnyValue = Boolean(row.ingredientId) || Boolean(row.quantity && row.quantity.trim().length) || Boolean(row.unit);
      if (!hasAnyValue || !row.ingredientId) {
        continue;
      }

      const quantity = Number(row.quantity);
      if (!row.unit || !Number.isFinite(quantity) || quantity <= 0) {
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

    const saucesPayload: Array<{ sauceId: string; quantity: number; unit: ItemMetaIngredient["unit"] }> = [];
    for (let index = 0; index < sauceRows.length; index += 1) {
      const row = sauceRows[index];
      const hasAnyValue =
        Boolean(row.sauceId) || Boolean(row.quantity && row.quantity.trim().length) || Boolean(row.unit);
      if (!hasAnyValue || !row.sauceId) {
        continue;
      }

      const quantity = Number(row.quantity);
      if (!row.unit || !Number.isFinite(quantity) || quantity <= 0) {
        toast.warning("Please provide valid sauce quantity and unit for all sauce rows.");
        return;
      }

      const sauce = sauceMap.get(row.sauceId);
      if (!sauce) {
        toast.warning("Please select valid sauces.");
        return;
      }

      const converted = convertQuantity(
        quantity,
        row.unit as ItemMetaIngredient["unit"],
        sauce.outputUnit,
        unitMeta
      );
      if (converted === null) {
        toast.warning("Selected sauce unit is not compatible with sauce output unit.");
        return;
      }

      saucesPayload.push({
        sauceId: row.sauceId,
        quantity,
        unit: row.unit as ItemMetaIngredient["unit"]
      });
    }

    if (!ingredientsPayload.length && !saucesPayload.length) {
      toast.warning("Please add at least one ingredient or sauce.");
      return;
    }

    await onSubmit({
      name: name.trim(),
      categoryId,
      sellingPrice: Number(sellingPrice) || 0,
      gstPercentage: Number(gstPercentage) || 0,
      note: note.trim() || undefined,
      isActive: initialData ? isActive : undefined,
      ingredients: ingredientsPayload,
      sauces: saucesPayload
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
        <ModalHeader>{initialData ? "Edit Item" : "Create Item"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={5} align="stretch">
            <Box>
              <Text fontWeight={800} mb={3}>
                Basic Info
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <AppInput label="Item Name" value={name} onChange={(event) => setName((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)} />
                <AppSearchableSelect
                  label="Category"
                  placeholder="Select category"
                  searchPlaceholder="Search category"
                  value={categoryId}
                  options={itemCategoryOptions}
                  onValueChange={setCategoryId}
                  isClearable={false}
                />
                <AppInput
                  label="Selling Price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={sellingPrice}
                  onChange={(event) => setSellingPrice((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                />
                <AppInput
                  label="GST %"
                  type="number"
                  min={0}
                  step="0.01"
                  value={gstPercentage}
                  onChange={(event) => setGstPercentage((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                />
              </SimpleGrid>

              <FormControl mt={4}>
                <FormLabel>Note (Optional)</FormLabel>
                <Textarea
                  value={note}
                  onChange={(event) => setNote((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                  placeholder="Add a short note for this item"
                />
              </FormControl>

              {initialData ? (
                <HStack mt={4} spacing={3}>
                  <Switch colorScheme="brand" isChecked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                  <Text fontWeight={600}>{isActive ? "Item Enabled" : "Item Disabled"}</Text>
                </HStack>
              ) : null}
            </Box>

            <Divider />

            <Box>
              <Text fontWeight={800} mb={3}>
                Sauce Mapping (Optional)
              </Text>
              <Text fontSize="sm" color="#6A5049" mb={3}>
                Add prepared sauces line-by-line (example: Tomato Sauce 100 g). Sauce recipe ingredients auto-deduct by this quantity.
              </Text>

              <VStack spacing={3} align="stretch">
                {sauceRows.map((row, index) => {
                  const selectedIds = new Set(
                    sauceRows.filter((_, rowIndex) => rowIndex !== index).map((entry) => entry.sauceId)
                  );
                  const filteredSauceOptions = sauceOptions.filter(
                    (option) => !selectedIds.has(option.value) || option.value === row.sauceId
                  );
                  const selectedSauce = sauceMap.get(row.sauceId);
                  const compatibleUnits = selectedSauce
                    ? getCompatibleUnits(selectedSauce.outputUnit, unitMeta)
                    : unitMeta.map((unit) => unit.value);
                  const summary = sauceSummaries[index];

                  return (
                    <Box
                      key={row.key}
                      p={3}
                      borderRadius="12px"
                      border="1px solid"
                      borderColor="rgba(133, 78, 48, 0.22)"
                      bg="rgba(255, 253, 249, 0.85)"
                    >
                      <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3}>
                        <AppSearchableSelect
                          label="Sauce"
                          placeholder="Select sauce"
                          searchPlaceholder="Search sauce"
                          emptyText="No sauces found"
                          value={row.sauceId}
                          options={filteredSauceOptions}
                          onValueChange={(value) => handleSauceRowUpdate(index, { sauceId: value })}
                        />
                        <AppInput
                          label="Quantity"
                          type="number"
                          min={0}
                          step="0.001"
                          value={row.quantity}
                          onChange={(event) =>
                            handleSauceRowUpdate(index, {
                              quantity: (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
                            })
                          }
                        />
                        <FormControl>
                          <FormLabel>Unit</FormLabel>
                          <Select
                            value={row.unit}
                            onChange={(event) =>
                              handleSauceRowUpdate(index, {
                                unit: (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
                              })
                            }
                          >
                            {!row.unit ? (
                              <option value="" disabled>
                                Select unit
                              </option>
                            ) : null}
                            {compatibleUnits.map((unit) => (
                              <option key={`${row.key}-sauce-unit-${unit}`} value={unit}>
                                {unit.toUpperCase()}
                              </option>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl>
                          <FormLabel>Action</FormLabel>
                          <ActionIconButton
                            aria-label="Remove sauce"
                            icon={<Trash2 size={16} />}
                            variant="outline"
                            colorScheme="red"
                            onClick={() => removeSauceRow(index)}
                          />
                        </FormControl>
                      </SimpleGrid>
                      <HStack mt={2} justify="space-between" flexWrap="wrap">
                        <Text fontSize="sm" color={summary?.compatible ? "#6A5049" : "red.600"}>
                          {summary?.helper ?? "Choose a sauce"}
                        </Text>
                        <Text fontWeight={700} color="#2A1B16">
                          Cost: {formatCurrency(summary?.cost ?? 0)}
                        </Text>
                      </HStack>
                    </Box>
                  );
                })}

                <AppButton
                  size="sm"
                  alignSelf={{ base: "stretch", md: "flex-start" }}
                  leftIcon={<Plus size={14} />}
                  onClick={addSauceRow}
                >
                  Add Sauce
                </AppButton>
              </VStack>
            </Box>

            <Divider />

            <Box>
              <Text fontWeight={800} mb={3}>
                Ingredients / Additional Consumption Mapping
              </Text>
              <Text fontSize="sm" color="#6A5049" mb={3}>
                Optional: map packaging items like box, straw, cup to auto-reduce stock when this item is sold.
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
                    label: category.name
                  }));
                  const filteredIngredients = ingredients.filter((entry) => {
                    const categoryMatches =
                      !row.ingredientCategoryId || entry.categoryId === row.ingredientCategoryId;
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
                          onChange={(event) => handleRowUpdate(index, { quantity: (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value })}
                        />
                        <FormControl>
                          <FormLabel>Unit</FormLabel>
                          <Select value={row.unit} onChange={(event) => handleRowUpdate(index, { unit: (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value })}>
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
                    Estimated Ingredient Cost
                  </Text>
                  <Text fontWeight={800}>{formatCurrency(estimatedCost)}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="#6A5049">
                    Selling Price
                  </Text>
                  <Text fontWeight={800}>{formatCurrency(sellingPriceNumber)}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="#6A5049">
                    Estimated Margin
                  </Text>
                  <Text fontWeight={800} color={margin >= 0 ? "green.700" : "red.600"}>
                    {formatCurrency(margin)}
                  </Text>
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
            {initialData ? "Save Item" : "Create Item"}
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
