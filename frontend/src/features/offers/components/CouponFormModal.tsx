import {
  Box,
  Checkbox,
  Divider,
  FormControl,
  FormHelperText,
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
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import {
  AppSearchableSelect,
  type AppSearchableSelectOption
} from "@/components/ui/AppSearchableSelect";
import { useAppToast } from "@/hooks/useAppToast";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import type {
  CouponDetail,
  CouponDiscountType,
  OfferItemCategoryMeta,
  OfferItemMeta
} from "@/types/offer";
import {
  mapOfferItemCategoriesToOptions,
  mapOfferItemsToOptions
} from "@/utils/select-options";

type CouponFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  initialData?: CouponDetail | null;
  itemCategories: OfferItemCategoryMeta[];
  getItemsByCategory: (categoryId: string) => Promise<OfferItemMeta[]>;
  onSubmit: (payload: {
    couponCode: string;
    title?: string;
    description?: string;
    discountType: CouponDiscountType;
    discountValue?: number | null;
    minimumOrderAmount?: number | null;
    maximumDiscountAmount?: number | null;
    maxUses?: number | null;
    usagePerUserLimit?: number | null;
    firstTimeUserOnly?: boolean;
    isActive?: boolean;
    validFrom: string;
    validUntil: string;
    freeItemCategoryId?: string | null;
    freeItemId?: string | null;
    internalNote?: string;
  }) => Promise<void>;
};

const toDateTimeInput = (value: string | Date) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const addDays = (date: Date, days: number) => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
};

const parseOptionalNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const parseOptionalInt = (value: string): number | null => {
  const parsed = parseOptionalNumber(value);
  if (parsed === null) {
    return null;
  }
  if (!Number.isInteger(parsed)) {
    return Number.NaN;
  }
  return parsed;
};

export const CouponFormModal = ({
  isOpen,
  onClose,
  loading,
  initialData,
  itemCategories,
  getItemsByCategory,
  onSubmit
}: CouponFormModalProps) => {
  const toast = useAppToast();
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);

  const [couponCode, setCouponCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<CouponDiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [minimumOrderAmount, setMinimumOrderAmount] = useState("");
  const [maximumDiscountAmount, setMaximumDiscountAmount] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [usagePerUserLimit, setUsagePerUserLimit] = useState("");
  const [firstTimeUserOnly, setFirstTimeUserOnly] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [freeItemCategoryId, setFreeItemCategoryId] = useState("");
  const [freeItemId, setFreeItemId] = useState("");
  const [freeItemOptions, setFreeItemOptions] = useState<OfferItemMeta[]>([]);
  const [freeItemLoading, setFreeItemLoading] = useState(false);
  const [internalNote, setInternalNote] = useState("");

  const categoryOptions = useMemo<AppSearchableSelectOption[]>(
    () => mapOfferItemCategoriesToOptions(itemCategories),
    [itemCategories]
  );

  const freeItemSelectOptions = useMemo<AppSearchableSelectOption[]>(
    () => mapOfferItemsToOptions(freeItemOptions),
    [freeItemOptions]
  );

  const loadFreeItems = useCallback(
    async (categoryId: string) => {
      if (!categoryId) {
        setFreeItemOptions([]);
        return;
      }
      setFreeItemLoading(true);
      try {
        const items = await getItemsByCategory(categoryId);
        setFreeItemOptions(items);
      } catch {
        setFreeItemOptions([]);
      } finally {
        setFreeItemLoading(false);
      }
    },
    [getItemsByCategory]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!initialData) {
      const now = new Date();
      setCouponCode("");
      setTitle("");
      setDescription("");
      setDiscountType("percentage");
      setDiscountValue("");
      setMinimumOrderAmount("");
      setMaximumDiscountAmount("");
      setMaxUses("");
      setUsagePerUserLimit("");
      setFirstTimeUserOnly(false);
      setIsActive(true);
      setValidFrom(toDateTimeInput(now));
      setValidUntil(toDateTimeInput(addDays(now, 7)));
      setFreeItemCategoryId("");
      setFreeItemId("");
      setFreeItemOptions([]);
      setInternalNote("");
      return;
    }

    setCouponCode(initialData.couponCode);
    setTitle(initialData.title ?? "");
    setDescription(initialData.description ?? "");
    setDiscountType(initialData.discountType);
    setDiscountValue(initialData.discountValue === null ? "" : String(initialData.discountValue));
    setMinimumOrderAmount(
      initialData.minimumOrderAmount === null ? "" : String(initialData.minimumOrderAmount)
    );
    setMaximumDiscountAmount(
      initialData.maximumDiscountAmount === null ? "" : String(initialData.maximumDiscountAmount)
    );
    setMaxUses(initialData.maxUses === null ? "" : String(initialData.maxUses));
    setUsagePerUserLimit(
      initialData.usagePerUserLimit === null ? "" : String(initialData.usagePerUserLimit)
    );
    setFirstTimeUserOnly(initialData.firstTimeUserOnly);
    setIsActive(initialData.isActive);
    setValidFrom(toDateTimeInput(initialData.validFrom));
    setValidUntil(toDateTimeInput(initialData.validUntil));
    setFreeItemCategoryId(initialData.freeItemCategoryId ?? "");
    setFreeItemId(initialData.freeItemId ?? "");
    setInternalNote(initialData.internalNote ?? "");
  }, [initialData, isOpen]);

  useEffect(() => {
    if (!isOpen || discountType !== "free_item" || !freeItemCategoryId) {
      return;
    }
    void loadFreeItems(freeItemCategoryId);
  }, [discountType, freeItemCategoryId, isOpen, loadFreeItems]);

  const handleCouponCodeChange = (value: string) => {
    setCouponCode(value.toUpperCase().replace(/\s+/g, ""));
  };

  const handleDiscountTypeChange = (value: CouponDiscountType) => {
    setDiscountType(value);
    if (value !== "free_item") {
      setFreeItemCategoryId("");
      setFreeItemId("");
      setFreeItemOptions([]);
    }
  };

  const handleCategoryChange = async (categoryId: string) => {
    setFreeItemCategoryId(categoryId);
    setFreeItemId("");
    await loadFreeItems(categoryId);
  };

  const handleSave = async () => {
    if (!couponCode.trim()) {
      toast.warning("Please enter a coupon code");
      return;
    }
    if (!validFrom || !validUntil) {
      toast.warning("Please select valid from and valid until");
      return;
    }

    const validFromDate = new Date(validFrom);
    const validUntilDate = new Date(validUntil);
    if (validUntilDate <= validFromDate) {
      toast.warning("Valid until date must be after valid from date");
      return;
    }

    const parsedDiscountValue = parseOptionalNumber(discountValue);
    const parsedMinOrder = parseOptionalNumber(minimumOrderAmount);
    const parsedMaxDiscount = parseOptionalNumber(maximumDiscountAmount);
    const parsedMaxUses = parseOptionalInt(maxUses);
    const parsedUsagePerUserLimit = parseOptionalInt(usagePerUserLimit);

    if (Number.isNaN(parsedMinOrder) || Number.isNaN(parsedMaxDiscount)) {
      toast.warning("Please enter valid amount values");
      return;
    }
    if (Number.isNaN(parsedMaxUses) || Number.isNaN(parsedUsagePerUserLimit)) {
      toast.warning("Use whole numbers for usage limits");
      return;
    }
    if (parsedMaxUses !== null && parsedMaxUses <= 0) {
      toast.warning("Max uses should be greater than zero");
      return;
    }
    if (parsedUsagePerUserLimit !== null && parsedUsagePerUserLimit <= 0) {
      toast.warning("Usage per user limit should be greater than zero");
      return;
    }

    if (discountType === "percentage" || discountType === "fixed_amount") {
      if (parsedDiscountValue === null || Number.isNaN(parsedDiscountValue) || parsedDiscountValue <= 0) {
        toast.warning("Please enter a valid discount value");
        return;
      }
      if (discountType === "percentage" && parsedDiscountValue > 100) {
        toast.warning("Percentage discount cannot exceed 100");
        return;
      }
    }

    if (discountType === "free_item") {
      if (!freeItemCategoryId || !freeItemId) {
        toast.warning("Please select a category and free item");
        return;
      }
    }

    await onSubmit({
      couponCode: couponCode.trim(),
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      discountType,
      discountValue: discountType === "free_item" ? null : parsedDiscountValue,
      minimumOrderAmount: parsedMinOrder,
      maximumDiscountAmount:
        discountType === "percentage" || discountType === "fixed_amount" ? parsedMaxDiscount : null,
      maxUses: parsedMaxUses,
      usagePerUserLimit: parsedUsagePerUserLimit,
      firstTimeUserOnly,
      isActive,
      validFrom: validFromDate.toISOString(),
      validUntil: validUntilDate.toISOString(),
      freeItemCategoryId: discountType === "free_item" ? freeItemCategoryId : null,
      freeItemId: discountType === "free_item" ? freeItemId : null,
      internalNote: internalNote.trim() || undefined
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        isCentered
        size="5xl"
        scrollBehavior="inside"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
      <ModalOverlay />
      <ModalContent borderRadius="16px">
        <ModalHeader>{initialData ? "Edit Coupon" : "Create Coupon"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={5} align="stretch">
            <Box>
              <Text fontWeight={800} mb={3}>
                Basic Information
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <AppInput
                  label="Coupon Code"
                  placeholder="WELCOME10"
                  value={couponCode}
                  onChange={(event) => handleCouponCodeChange((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                />
                <AppInput
                  label="Title (Optional)"
                  placeholder="Welcome 10%"
                  value={title}
                  onChange={(event) => setTitle((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                />
              </SimpleGrid>
              <FormControl mt={4}>
                <FormLabel>Description (Optional)</FormLabel>
                <Textarea
                  placeholder="Short description for admin clarity"
                  value={description}
                  onChange={(event) => setDescription((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                />
              </FormControl>
            </Box>

            <Divider />

            <Box>
              <Text fontWeight={800} mb={3}>
                Discount / Reward Setup
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl>
                  <FormLabel>Discount Type</FormLabel>
                  <Select
                    value={discountType}
                    onChange={(event) => handleDiscountTypeChange((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value as CouponDiscountType)}
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed_amount">Fixed Amount</option>
                    <option value="free_item">Free Item</option>
                  </Select>
                </FormControl>

                {discountType === "percentage" || discountType === "fixed_amount" ? (
                  <AppInput
                    label={discountType === "percentage" ? "Discount Percentage" : "Discount Amount"}
                    type="number"
                    min={0}
                    step="0.01"
                    value={discountValue}
                    onChange={(event) => setDiscountValue((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                  />
                ) : null}

                {discountType === "free_item" ? (
                  <>
                    <AppSearchableSelect
                      label="Free Item Category"
                      placeholder="Select category"
                      searchPlaceholder="Search category"
                      options={categoryOptions}
                      value={freeItemCategoryId}
                      onValueChange={(value) => void handleCategoryChange(value)}
                    />
                    <AppSearchableSelect
                      label="Free Item"
                      placeholder={freeItemLoading ? "Loading items..." : "Select free item"}
                      searchPlaceholder="Search item"
                      emptyText="No items found in this category"
                      options={freeItemSelectOptions}
                      value={freeItemId}
                      onValueChange={(value) => setFreeItemId(value)}
                      isDisabled={!freeItemCategoryId || freeItemLoading}
                    />
                  </>
                ) : null}
              </SimpleGrid>
            </Box>

            <Divider />

            <Box>
              <Text fontWeight={800} mb={3}>
                Conditions
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl>
                  <AppInput
                    label="Minimum Order Amount (Optional)"
                    type="number"
                    min={0}
                    step="0.01"
                    value={minimumOrderAmount}
                    onChange={(event) => setMinimumOrderAmount((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                  />
                  <FormHelperText>
                    Set this if coupon should work only above a certain order value.
                  </FormHelperText>
                </FormControl>
                {discountType !== "free_item" ? (
                  <FormControl>
                    <AppInput
                      label="Maximum Discount Amount (Optional)"
                      type="number"
                      min={0}
                      step="0.01"
                      value={maximumDiscountAmount}
                      onChange={(event) => setMaximumDiscountAmount((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                    />
                    <FormHelperText>
                      Mainly useful for percentage coupons to cap discount value.
                    </FormHelperText>
                  </FormControl>
                ) : (
                  <Box />
                )}
                <FormControl>
                  <AppInput
                    label="Max Uses (Optional)"
                    type="number"
                    min={1}
                    step={1}
                    value={maxUses}
                    onChange={(event) => setMaxUses((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                  />
                  <FormHelperText>Leave empty for unlimited usage.</FormHelperText>
                </FormControl>
                <FormControl>
                  <AppInput
                    label="Usage Per User Limit (Optional)"
                    type="number"
                    min={1}
                    step={1}
                    value={usagePerUserLimit}
                    onChange={(event) => setUsagePerUserLimit((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                  />
                  <FormHelperText>Leave empty if no per-user cap is required.</FormHelperText>
                </FormControl>
              </SimpleGrid>
              <HStack mt={4} spacing={6} flexWrap="wrap">
                <Checkbox
                  isChecked={firstTimeUserOnly}
                  onChange={(event) => setFirstTimeUserOnly(event.target.checked)}
                >
                  First-time user only
                </Checkbox>
                <HStack spacing={3}>
                  <Switch colorScheme="brand" isChecked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                  <Text fontWeight={600}>{isActive ? "Coupon Enabled" : "Coupon Disabled"}</Text>
                </HStack>
              </HStack>
            </Box>

            <Divider />

            <Box>
              <Text fontWeight={800} mb={3}>
                Validity
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <AppInput
                  label="Valid From"
                  type="datetime-local"
                  value={validFrom}
                  onChange={(event) => setValidFrom((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                />
                <AppInput
                  label="Valid Until"
                  type="datetime-local"
                  value={validUntil}
                  onChange={(event) => setValidUntil((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
                />
              </SimpleGrid>
            </Box>

            <Divider />

            <FormControl>
              <FormLabel>Internal Note (Optional)</FormLabel>
              <Textarea
                placeholder="Internal remarks for the admin team"
                value={internalNote}
                onChange={(event) => setInternalNote((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)}
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <AppButton variant="outline" onClick={requestClose}>
            Cancel
          </AppButton>
          <AppButton onClick={() => void handleSave()} isLoading={loading}>
            {initialData ? "Save Coupon" : "Create Coupon"}
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
