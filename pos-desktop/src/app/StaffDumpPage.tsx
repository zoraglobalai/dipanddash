import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Text,
  Textarea,
  VStack,
  useToast
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { dumpService } from "@/services/dump.service";
import type { DumpEntryOptions, DumpEntryRecord, DumpEntryType } from "@/types/pos";
import { extractApiErrorMessage } from "@/utils/api-error";

type UnitMeta = {
  group: string;
  factorToBase: number;
};

type PendingWastageEntry = {
  id: string;
  entryType: DumpEntryType;
  sourceId: string;
  sourceName: string;
  enteredQuantity: number;
  enteredUnit: string;
  baseQuantity: number;
  baseUnit: string;
  estimatedLoss: number;
  note: string | null;
};

const ENTRY_TYPE_LABEL: Record<DumpEntryType, string> = {
  ingredient: "Ingredient",
  item: "Item",
  product: "Product"
};

const UNIT_META: Record<string, UnitMeta> = {
  mcg: { group: "weight", factorToBase: 0.000001 },
  mg: { group: "weight", factorToBase: 0.001 },
  g: { group: "weight", factorToBase: 1 },
  kg: { group: "weight", factorToBase: 1000 },
  quintal: { group: "weight", factorToBase: 100000 },
  ton: { group: "weight", factorToBase: 1000000 },
  ml: { group: "volume", factorToBase: 1 },
  cl: { group: "volume", factorToBase: 10 },
  dl: { group: "volume", factorToBase: 100 },
  l: { group: "volume", factorToBase: 1000 },
  gallon: { group: "volume", factorToBase: 3785.411784 },
  teaspoon: { group: "volume", factorToBase: 5 },
  tablespoon: { group: "volume", factorToBase: 15 },
  cup: { group: "volume", factorToBase: 240 },
  pcs: { group: "count", factorToBase: 1 },
  piece: { group: "count", factorToBase: 1 },
  count: { group: "count", factorToBase: 1 },
  unit: { group: "count", factorToBase: 1 },
  units: { group: "count", factorToBase: 1 },
  pair: { group: "count", factorToBase: 2 },
  dozen: { group: "count", factorToBase: 12 },
  tray: { group: "count", factorToBase: 1 },
  tin: { group: "count", factorToBase: 1 },
  item: { group: "item", factorToBase: 1 }
};

const normalizeUnit = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const convertQuantityUnit = (quantity: number, fromUnit: string, toUnit: string) => {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) {
    return null;
  }
  if (from === to) {
    return Number(quantity.toFixed(3));
  }
  const fromMeta = UNIT_META[from];
  const toMeta = UNIT_META[to];
  if (!fromMeta || !toMeta || fromMeta.group !== toMeta.group) {
    return null;
  }
  return Number(((quantity * fromMeta.factorToBase) / toMeta.factorToBase).toFixed(3));
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);

const formatQuantity = (value: number) => Number(value.toFixed(3));
const getTodayDate = () => new Date().toISOString().slice(0, 10);

export const StaffDumpPage = () => {
  const toast = useToast();

  const [entryDate, setEntryDate] = useState(getTodayDate());
  const [entryType, setEntryType] = useState<DumpEntryType>("ingredient");
  const [sourceId, setSourceId] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [options, setOptions] = useState<DumpEntryOptions | null>(null);
  const [pendingEntries, setPendingEntries] = useState<PendingWastageEntry[]>([]);
  const [lastEntry, setLastEntry] = useState<DumpEntryRecord | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const response = await dumpService.getEntryOptions();
      setOptions(response);
    } catch (error) {
      toast({
        status: "error",
        title: "Unable to load dump options",
        description: extractApiErrorMessage(error, "Please try again.")
      });
    } finally {
      setLoadingOptions(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const sourceOptions = useMemo(() => {
    if (!options) {
      return [];
    }
    if (entryType === "ingredient") {
      return options.ingredients.map((row) => ({ id: row.id, name: row.name }));
    }
    if (entryType === "item") {
      return options.items.map((row) => ({ id: row.id, name: row.name }));
    }
    return options.products.map((row) => ({ id: row.id, name: row.name }));
  }, [entryType, options]);

  const selectedSource = useMemo(() => {
    if (!sourceId || !options) {
      return null;
    }
    if (entryType === "ingredient") {
      const row = options.ingredients.find((item) => item.id === sourceId);
      if (!row) {
        return null;
      }
      return {
        sourceName: row.name,
        baseUnit: row.baseUnit,
        unitOptions: row.unitOptions,
        currentStock: row.currentStock,
        unitPrice: row.perUnitPrice,
        type: "ingredient" as const
      };
    }
    if (entryType === "item") {
      const row = options.items.find((item) => item.id === sourceId);
      if (!row) {
        return null;
      }
      return {
        sourceName: row.name,
        baseUnit: row.baseUnit,
        unitOptions: row.unitOptions,
        estimatedIngredientCost: row.estimatedIngredientCost,
        type: "item" as const
      };
    }
    const row = options.products.find((item) => item.id === sourceId);
    if (!row) {
      return null;
    }
    return {
      sourceName: row.name,
      baseUnit: row.baseUnit,
      unitOptions: row.unitOptions,
      currentStock: row.currentStock,
      unitPrice: row.purchaseUnitPrice,
      type: "product" as const
    };
  }, [entryType, options, sourceId]);

  useEffect(() => {
    if (!selectedSource) {
      setQuantityUnit("");
      return;
    }
    setQuantityUnit(selectedSource.unitOptions[0] ?? selectedSource.baseUnit);
  }, [selectedSource]);

  const totalEstimatedLoss = useMemo(
    () => Number(pendingEntries.reduce((sum, row) => sum + row.estimatedLoss, 0).toFixed(2)),
    [pendingEntries]
  );

  const getDraftEntry = useCallback(() => {
    const parsedQuantity = Number(quantity);
    if (!selectedSource) {
      return { error: "Select an item to mark as wastage." };
    }
    if (!quantityUnit) {
      return { error: "Select quantity unit." };
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      return { error: "Quantity must be greater than zero." };
    }

    const convertedBaseQuantity = convertQuantityUnit(parsedQuantity, quantityUnit, selectedSource.baseUnit);
    if (convertedBaseQuantity === null || convertedBaseQuantity <= 0) {
      return { error: "Selected unit cannot be converted to base unit." };
    }

    let estimatedLoss = 0;
    if (selectedSource.type === "item") {
      estimatedLoss = Number((convertedBaseQuantity * selectedSource.estimatedIngredientCost).toFixed(2));
    } else {
      const queuedBaseQuantity = pendingEntries
        .filter((row) => row.entryType === entryType && row.sourceId === sourceId)
        .reduce((sum, row) => sum + row.baseQuantity, 0);
      const availableStock = Number((selectedSource.currentStock - queuedBaseQuantity).toFixed(3));
      if (availableStock < convertedBaseQuantity) {
        return {
          error: `Not enough stock. Available ${formatQuantity(Math.max(0, availableStock))} ${selectedSource.baseUnit}.`
        };
      }
      estimatedLoss = Number((convertedBaseQuantity * selectedSource.unitPrice).toFixed(2));
    }

    const draft: PendingWastageEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entryType,
      sourceId,
      sourceName: selectedSource.sourceName,
      enteredQuantity: formatQuantity(parsedQuantity),
      enteredUnit: normalizeUnit(quantityUnit),
      baseQuantity: convertedBaseQuantity,
      baseUnit: normalizeUnit(selectedSource.baseUnit),
      estimatedLoss,
      note: note.trim() || null
    };
    return { draft };
  }, [entryType, note, pendingEntries, quantity, quantityUnit, selectedSource, sourceId]);

  const handleAddEntry = () => {
    if (!sourceId) {
      toast({
        status: "warning",
        title: "Select an item to mark as wastage"
      });
      return;
    }

    const result = getDraftEntry();
    if (!result.draft) {
      toast({
        status: "warning",
        title: result.error ?? "Unable to add entry"
      });
      return;
    }

    setPendingEntries((current) => [...current, result.draft!]);
    setSourceId("");
    setQuantity("");
    setQuantityUnit("");
    setNote("");
    toast({
      status: "success",
      title: "Wastage row added"
    });
  };

  const handleRemoveEntry = (entryId: string) => {
    setPendingEntries((current) => current.filter((row) => row.id !== entryId));
  };

  const handleSubmitAll = async () => {
    if (!pendingEntries.length) {
      toast({
        status: "warning",
        title: "Add at least one wastage row before submit"
      });
      return;
    }

    setSubmitting(true);
    let workingQueue = [...pendingEntries];
    let submittedCount = 0;
    let lastSaved: DumpEntryRecord | null = null;
    let failedReason: string | null = null;

    for (const row of pendingEntries) {
      try {
        const response = await dumpService.submitEntry({
          entryDate: entryDate || undefined,
          entryType: row.entryType,
          sourceId: row.sourceId,
          quantity: row.enteredQuantity,
          quantityUnit: row.enteredUnit,
          note: row.note ?? undefined
        });
        submittedCount += 1;
        lastSaved = response.data.entry;
        workingQueue = workingQueue.filter((entry) => entry.id !== row.id);
        setPendingEntries(workingQueue);
      } catch (error) {
        failedReason = `${row.sourceName}: ${extractApiErrorMessage(error, "Unable to save entry.")}`;
        break;
      }
    }

    if (lastSaved) {
      setLastEntry(lastSaved);
    }

    try {
      await loadOptions();
    } finally {
      setSubmitting(false);
    }

    if (failedReason) {
      toast({
        status: submittedCount > 0 ? "warning" : "error",
        title:
          submittedCount > 0
            ? `${submittedCount} entries submitted. Remaining rows not submitted.`
            : "Unable to submit dump entries",
        description: failedReason
      });
      return;
    }

    toast({
      status: "success",
      title: `${submittedCount} wastage entries submitted successfully.`
    });
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
        <Text fontWeight={900} mb={1}>
          Dump / Wastage Entry
        </Text>
        <Text color="#6D584E" fontSize="sm" mb={4}>
          Add multiple wastage rows and submit together. Stock is deducted in base unit automatically.
        </Text>

        <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={3}>
          <FormControl>
            <FormLabel fontWeight={700}>Entry Date</FormLabel>
            <Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
          </FormControl>

          <FormControl>
            <FormLabel fontWeight={700}>Type</FormLabel>
            <Select
              value={entryType}
              onChange={(event) => {
                setEntryType(event.target.value as DumpEntryType);
                setSourceId("");
                setQuantity("");
                setQuantityUnit("");
              }}
            >
              <option value="ingredient">Ingredient</option>
              <option value="item">Item</option>
              <option value="product">Product</option>
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel fontWeight={700}>
              Select {entryType.charAt(0).toUpperCase()}
              {entryType.slice(1)}
            </FormLabel>
            <Select value={sourceId} onChange={(event) => setSourceId(event.target.value)} isDisabled={loadingOptions}>
              <option value="">Select</option>
              {sourceOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel fontWeight={700}>Volume / Unit</FormLabel>
            <Select
              value={quantityUnit}
              onChange={(event) => setQuantityUnit(event.target.value)}
              isDisabled={!selectedSource}
            >
              <option value="">Select Unit</option>
              {selectedSource?.unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel fontWeight={700}>Quantity</FormLabel>
            <Input type="number" min={0} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </FormControl>
        </SimpleGrid>

        <FormControl mt={3}>
          <FormLabel fontWeight={700}>Note (Optional)</FormLabel>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reason for wastage / incident details"
            rows={3}
          />
        </FormControl>

        <HStack mt={4} spacing={3} flexWrap="wrap">
          <Button
            color="white"
            bgGradient="linear(95deg, #8E0909 0%, #BE3329 46%, #D3A23D 100%)"
            _hover={{ bgGradient: "linear(95deg, #7A0707 0%, #A12822 46%, #BA8A34 100%)" }}
            onClick={handleAddEntry}
          >
            Add Wastage
          </Button>
          <Button
            color="white"
            bg="#177245"
            _hover={{ bg: "#125A37" }}
            isLoading={submitting}
            onClick={() => void handleSubmitAll()}
          >
            Submit All ({pendingEntries.length})
          </Button>
          <Button variant="outline" onClick={() => void loadOptions()} isLoading={loadingOptions}>
            Refresh Stock
          </Button>
        </HStack>

        <Box mt={4} p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="12px" bg="#FFF9EE">
          <HStack justify="space-between" flexWrap="wrap" gap={2}>
            <Text fontWeight={800}>Wastage Rows ({pendingEntries.length})</Text>
            <Text fontWeight={900} color="#A32626">
              Estimated Total Loss: {formatCurrency(totalEstimatedLoss)}
            </Text>
          </HStack>

          {pendingEntries.length ? (
            <VStack align="stretch" spacing={2} mt={3}>
              {pendingEntries.map((row) => (
                <HStack
                  key={row.id}
                  justify="space-between"
                  align="start"
                  border="1px solid rgba(132, 79, 52, 0.2)"
                  borderRadius="10px"
                  bg="white"
                  px={3}
                  py={2}
                >
                  <Box>
                    <Text fontWeight={800}>
                      {ENTRY_TYPE_LABEL[row.entryType]} | {row.sourceName}
                    </Text>
                    <Text fontSize="sm" color="#705B52">
                      Entered {row.enteredQuantity} {row.enteredUnit} | Deduct {row.baseQuantity} {row.baseUnit}
                    </Text>
                    <Text fontSize="sm" color="#A32626" fontWeight={700}>
                      Loss {formatCurrency(row.estimatedLoss)}
                    </Text>
                    {row.note ? (
                      <Text fontSize="xs" color="#705B52">
                        Note: {row.note}
                      </Text>
                    ) : null}
                  </Box>
                  <Button size="sm" variant="outline" onClick={() => handleRemoveEntry(row.id)}>
                    Remove
                  </Button>
                </HStack>
              ))}
            </VStack>
          ) : (
            <Text mt={3} color="#705B52" fontSize="sm">
              Add wastage rows and submit together.
            </Text>
          )}
        </Box>
      </Box>

      {lastEntry ? (
        <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
          <Text fontWeight={800}>Last Submitted Entry</Text>
          <Text mt={1} color="#705B52" fontSize="sm">
            {lastEntry.entryDate} | {lastEntry.sourceName} | {lastEntry.quantity} {lastEntry.unit}
          </Text>
          <Text color="#705B52" fontSize="sm">
            Deducted {lastEntry.baseQuantity} {lastEntry.baseUnit}
          </Text>
          <Text mt={2} fontWeight={900} color="#A32626" fontSize="xl">
            Loss: {formatCurrency(lastEntry.lossAmount)}
          </Text>

          {lastEntry.ingredientImpacts.length ? (
            <VStack align="stretch" spacing={2} mt={3}>
              {lastEntry.ingredientImpacts.map((impact) => (
                <Box key={`${impact.ingredientId}-${impact.quantity}`} p={2} borderRadius="10px" bg="#FFF9EE">
                  <Text fontWeight={800}>
                    {impact.ingredientName}: {impact.quantity} {impact.unit}
                  </Text>
                  <Text fontSize="sm" color="#705B52">
                    Loss {formatCurrency(impact.lossAmount)}
                  </Text>
                </Box>
              ))}
            </VStack>
          ) : null}
        </Box>
      ) : null}
    </VStack>
  );
};
