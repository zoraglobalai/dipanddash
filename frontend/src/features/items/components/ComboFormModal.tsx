import {
  Box,
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
import { formatCurrency } from "@/features/items/units";
import { useAppToast } from "@/hooks/useAppToast";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import type { ComboDetail, ComboItemRow, ItemListItem } from "@/types/item";
import { mapItemsToOptions } from "@/utils/select-options";

type ComboDraftRow = {
  key: string;
  itemId: string;
  quantity: string;
};

type ComboFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  items: ItemListItem[];
  initialData?: ComboDetail | null;
  onSubmit: (values: {
    name: string;
    sellingPrice: number;
    gstPercentage: number;
    imageUrl?: string;
    note?: string;
    isActive?: boolean;
    items: ComboItemRow[];
  }) => Promise<void>;
};

const createRow = (itemId = ""): ComboDraftRow => ({
  key: crypto.randomUUID(),
  itemId,
  quantity: "1"
});

export const ComboFormModal = ({
  isOpen,
  onClose,
  loading,
  items,
  initialData,
  onSubmit
}: ComboFormModalProps) => {
  const toast = useAppToast();
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);
  const [name, setName] = useState("");
  const [sellingPrice, setSellingPrice] = useState("0");
  const [gstPercentage, setGstPercentage] = useState("0");
  const [note, setNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [comboRows, setComboRows] = useState<ComboDraftRow[]>([createRow()]);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!initialData) {
      setName("");
      setSellingPrice("0");
      setGstPercentage("0");
      setNote("");
      setIsActive(true);
      setComboRows([createRow(items[0]?.id ?? "")]);
      return;
    }

    setName(initialData.name);
    setSellingPrice(String(initialData.sellingPrice));
    setGstPercentage(String(initialData.gstPercentage));
    setNote(initialData.note ?? "");
    setIsActive(initialData.isActive);
    setComboRows(
      initialData.items.length
        ? initialData.items.map((item) => ({
            key: crypto.randomUUID(),
            itemId: item.itemId,
            quantity: String(item.quantity)
          }))
        : [createRow()]
    );
  }, [initialData, isOpen, items]);

  const includedValue = useMemo(() => {
    return Number(
      comboRows
        .reduce((sum, row) => {
          const item = itemMap.get(row.itemId);
          if (!item) {
            return sum;
          }
          const quantity = Number(row.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0) {
            return sum;
          }
          return sum + quantity * item.sellingPrice;
        }, 0)
        .toFixed(2)
    );
  }, [comboRows, itemMap]);

  const addRow = () => setComboRows((previous) => [...previous, createRow(items[0]?.id ?? "")]);
  const removeRow = (index: number) =>
    setComboRows((previous) => (previous.length === 1 ? previous : previous.filter((_, i) => i !== index)));

  const handleRowUpdate = (index: number, patch: Partial<ComboDraftRow>) => {
    setComboRows((previous) =>
      previous.map((row, currentIndex) => (currentIndex === index ? { ...row, ...patch } : row))
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.warning("Combo name is required.");
      return;
    }

    const selectedIds = comboRows.map((row) => row.itemId).filter(Boolean);
    if (new Set(selectedIds).size !== selectedIds.length) {
      toast.warning("Duplicate items are not allowed in combo.");
      return;
    }

    const payloadRows: ComboItemRow[] = [];
    for (const row of comboRows) {
      const quantity = Number(row.quantity);
      if (!row.itemId || !Number.isFinite(quantity) || quantity <= 0) {
        toast.warning("Please provide valid combo item and quantity.");
        return;
      }

      payloadRows.push({
        itemId: row.itemId,
        quantity
      });
    }

    await onSubmit({
      name: name.trim(),
      sellingPrice: Number(sellingPrice) || 0,
      gstPercentage: Number(gstPercentage) || 0,
      note: note.trim() || undefined,
      isActive: initialData ? isActive : undefined,
      items: payloadRows
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        isCentered
        size="3xl"
        scrollBehavior="inside"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
      <ModalOverlay />
      <ModalContent borderRadius="16px">
        <ModalHeader>{initialData ? "Edit Combo" : "Create Combo"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={5} align="stretch">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <AppInput label="Combo Name" value={name} onChange={(event) => setName((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)} />
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

            <FormControl>
              <FormLabel>Note (Optional)</FormLabel>
              <Textarea
                value={note}
                onChange={(event) => setNote((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                placeholder="Add a short note for this combo"
              />
            </FormControl>

            {initialData ? (
              <HStack spacing={3}>
                <Switch colorScheme="brand" isChecked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                <Text fontWeight={600}>{isActive ? "Combo Enabled" : "Combo Disabled"}</Text>
              </HStack>
            ) : null}

            <Box>
              <HStack justify="space-between" mb={3}>
                <Text fontWeight={800}>Included Items</Text>
                <AppButton size="sm" leftIcon={<Plus size={14} />} onClick={addRow}>
                  Add Item
                </AppButton>
              </HStack>
              <VStack spacing={3} align="stretch">
                {comboRows.map((row, index) => {
                  const selectedIds = new Set(
                    comboRows.filter((_, rowIndex) => rowIndex !== index).map((entry) => entry.itemId)
                  );
                  const availableOptions: AppSearchableSelectOption[] = mapItemsToOptions(
                    items.filter((entry) => !selectedIds.has(entry.id) || entry.id === row.itemId)
                  );
                  const item = itemMap.get(row.itemId);
                  const quantity = Number(row.quantity);
                  const lineTotal =
                    item && Number.isFinite(quantity) && quantity > 0
                      ? Number((quantity * item.sellingPrice).toFixed(2))
                      : 0;

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
                        <Box gridColumn={{ md: "span 2" }}>
                          <AppSearchableSelect
                            label="Item"
                            placeholder="Select item"
                            searchPlaceholder="Search item"
                            value={row.itemId}
                            options={availableOptions}
                            onValueChange={(value) => handleRowUpdate(index, { itemId: value })}
                          />
                        </Box>
                        <AppInput
                          label="Quantity"
                          type="number"
                          min={0}
                          step="0.001"
                          value={row.quantity}
                          onChange={(event) => handleRowUpdate(index, { quantity: (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value })}
                        />
                        <FormControl>
                          <FormLabel>Action</FormLabel>
                          <ActionIconButton
                            aria-label="Remove item"
                            icon={<Trash2 size={16} />}
                            variant="outline"
                            colorScheme="red"
                            isDisabled={comboRows.length === 1}
                            onClick={() => removeRow(index)}
                          />
                        </FormControl>
                      </SimpleGrid>

                      <HStack mt={2} justify="space-between">
                        <Text fontSize="sm" color="#6A5049">
                          {item ? `Unit price: ${formatCurrency(item.sellingPrice)}` : "Select an item"}
                        </Text>
                        <Text fontWeight={700}>Line total: {formatCurrency(lineTotal)}</Text>
                      </HStack>
                    </Box>
                  );
                })}
              </VStack>
            </Box>

            <Box
              p={3}
              borderRadius="12px"
              border="1px solid"
              borderColor="rgba(193, 14, 14, 0.2)"
              bg="linear-gradient(120deg, rgba(255, 246, 225, 0.8) 0%, rgba(255, 255, 255, 0.95) 100%)"
            >
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <Box>
                  <Text fontSize="sm" color="#6A5049">
                    Included Items Value
                  </Text>
                  <Text fontWeight={800}>{formatCurrency(includedValue)}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="#6A5049">
                    Combo Selling Price
                  </Text>
                  <Text fontWeight={800}>{formatCurrency(Number(sellingPrice) || 0)}</Text>
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
            {initialData ? "Save Combo" : "Create Combo"}
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
