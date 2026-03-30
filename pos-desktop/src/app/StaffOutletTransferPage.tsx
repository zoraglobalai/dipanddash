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

import { outletTransferService } from "@/services/outlet-transfer.service";
import type {
  OutletTransferLineType,
  OutletTransferOptionRow,
  OutletTransferOptions,
  OutletTransferRecord
} from "@/types/pos";
import { extractApiErrorMessage } from "@/utils/api-error";

type PendingTransferLine = {
  id: string;
  lineType: OutletTransferLineType;
  sourceId: string;
  sourceName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineValue: number;
};

const getTodayDate = () => new Date().toISOString().slice(0, 10);
const formatQuantity = (value: number) => Number(value.toFixed(3));
const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);

const typeLabel: Record<OutletTransferLineType, string> = {
  ingredient: "Ingredient",
  product: "Product",
  item: "Item"
};

export const StaffOutletTransferPage = () => {
  const toast = useToast();

  const [transferDate, setTransferDate] = useState(getTodayDate());
  const [fromOutletId, setFromOutletId] = useState("");
  const [toOutletId, setToOutletId] = useState("");
  const [lineType, setLineType] = useState<OutletTransferLineType>("ingredient");
  const [sourceId, setSourceId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [options, setOptions] = useState<OutletTransferOptions | null>(null);
  const [pendingLines, setPendingLines] = useState<PendingTransferLine[]>([]);
  const [records, setRecords] = useState<OutletTransferRecord[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recordPage, setRecordPage] = useState(1);
  const [recordTotalPages, setRecordTotalPages] = useState(1);
  const [recordOutletId, setRecordOutletId] = useState("");

  const loadOptions = useCallback(
    async (targetFromOutletId?: string) => {
      setLoadingOptions(true);
      try {
        const response = await outletTransferService.getOptions(targetFromOutletId);
        setOptions(response);
      } catch (error) {
        toast({
          status: "error",
          title: "Unable to load outlet transfer options",
          description: extractApiErrorMessage(error, "Please try again.")
        });
      } finally {
        setLoadingOptions(false);
      }
    },
    [toast]
  );

  const loadRecords = useCallback(
    async (page = 1, outletId?: string) => {
      setLoadingRecords(true);
      try {
        const response = await outletTransferService.getRecords({
          outletId: outletId || undefined,
          page,
          limit: 10
        });
        setRecords(response.records);
        setRecordPage(response.pagination.page);
        setRecordTotalPages(response.pagination.totalPages);
      } catch (error) {
        toast({
          status: "error",
          title: "Unable to load transfer records",
          description: extractApiErrorMessage(error, "Please try again.")
        });
      } finally {
        setLoadingRecords(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (!fromOutletId) {
      return;
    }
    setSourceId("");
    void loadOptions(fromOutletId);
  }, [fromOutletId, loadOptions]);

  useEffect(() => {
    if (!options?.outlets.length) {
      return;
    }
    if (!fromOutletId) {
      setFromOutletId(options.outlets[0].id);
    }
    if (!recordOutletId) {
      setRecordOutletId(options.outlets[0].id);
    }
  }, [fromOutletId, options, recordOutletId]);

  useEffect(() => {
    void loadRecords(1, recordOutletId || undefined);
  }, [loadRecords, recordOutletId]);

  const fromOutlet = useMemo(() => options?.outlets.find((row) => row.id === fromOutletId) ?? null, [options, fromOutletId]);
  const toOutlet = useMemo(() => options?.outlets.find((row) => row.id === toOutletId) ?? null, [options, toOutletId]);

  const sourceOptions = useMemo(() => {
    if (!options) {
      return [] as OutletTransferOptionRow[];
    }
    if (lineType === "ingredient") {
      return options.ingredients;
    }
    if (lineType === "product") {
      return options.products;
    }
    return options.items;
  }, [lineType, options]);

  const selectedSource = useMemo(
    () => sourceOptions.find((row) => row.id === sourceId) ?? null,
    [sourceId, sourceOptions]
  );

  const queuedQuantityForSelected = useMemo(
    () =>
      pendingLines
        .filter((row) => row.lineType === lineType && row.sourceId === sourceId)
        .reduce((sum, row) => sum + row.quantity, 0),
    [lineType, pendingLines, sourceId]
  );

  const availableForSelected = useMemo(() => {
    if (!selectedSource) {
      return 0;
    }
    return formatQuantity(Math.max(0, selectedSource.availableStock - queuedQuantityForSelected));
  }, [queuedQuantityForSelected, selectedSource]);

  const totalLineValue = useMemo(
    () => Number(pendingLines.reduce((sum, row) => sum + row.lineValue, 0).toFixed(2)),
    [pendingLines]
  );

  const addLine = () => {
    if (!fromOutletId || !toOutletId) {
      toast({
        status: "warning",
        title: "Select both from and to outlets"
      });
      return;
    }
    if (fromOutletId === toOutletId) {
      toast({
        status: "warning",
        title: "From and To outlets must be different"
      });
      return;
    }
    if (!selectedSource) {
      toast({
        status: "warning",
        title: "Select item to transfer"
      });
      return;
    }

    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast({
        status: "warning",
        title: "Quantity must be greater than zero"
      });
      return;
    }
    if (lineType === "item" && !Number.isInteger(parsedQuantity)) {
      toast({
        status: "warning",
        title: "Item transfer quantity must be whole number"
      });
      return;
    }

    const safeQuantity = formatQuantity(parsedQuantity);
    if (lineType !== "item" && safeQuantity > availableForSelected) {
      toast({
        status: "warning",
        title: `Available stock only ${availableForSelected} ${selectedSource.unit}`
      });
      return;
    }

    const existing = pendingLines.find((row) => row.lineType === lineType && row.sourceId === selectedSource.id);
    if (existing) {
      const nextQuantity = formatQuantity(existing.quantity + safeQuantity);
      if (lineType !== "item" && nextQuantity > selectedSource.availableStock) {
        toast({
          status: "warning",
          title: `Total exceeds available stock (${formatQuantity(selectedSource.availableStock)} ${selectedSource.unit})`
        });
        return;
      }

      setPendingLines((current) =>
        current.map((row) =>
          row.id === existing.id
            ? {
                ...row,
                quantity: nextQuantity,
                lineValue: Number((nextQuantity * row.unitPrice).toFixed(2))
              }
            : row
        )
      );
    } else {
      const line: PendingTransferLine = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        lineType,
        sourceId: selectedSource.id,
        sourceName: selectedSource.name,
        quantity: safeQuantity,
        unit: selectedSource.unit,
        unitPrice: selectedSource.unitPrice,
        lineValue: Number((safeQuantity * selectedSource.unitPrice).toFixed(2))
      };
      setPendingLines((current) => [...current, line]);
    }

    setSourceId("");
    setQuantity("");
  };

  const removeLine = (lineId: string) => {
    setPendingLines((current) => current.filter((row) => row.id !== lineId));
  };

  const submitTransfer = async () => {
    if (!fromOutletId || !toOutletId) {
      toast({
        status: "warning",
        title: "Select both outlets"
      });
      return;
    }
    if (fromOutletId === toOutletId) {
      toast({
        status: "warning",
        title: "From and To outlets must be different"
      });
      return;
    }
    if (!pendingLines.length) {
      toast({
        status: "warning",
        title: "Add at least one transfer line"
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await outletTransferService.createTransfer({
        transferDate: transferDate || undefined,
        fromOutletId,
        toOutletId,
        note: note.trim() || undefined,
        lines: pendingLines.map((row) => ({
          lineType: row.lineType,
          sourceId: row.sourceId,
          quantity: row.quantity
        }))
      });
      setPendingLines([]);
      setNote("");
      setSourceId("");
      setQuantity("");
      toast({
        status: "success",
        title: response.message
      });
      await Promise.all([loadOptions(fromOutletId), loadRecords(1, recordOutletId || undefined)]);
    } catch (error) {
      toast({
        status: "error",
        title: "Unable to submit transfer",
        description: extractApiErrorMessage(error, "Please try again.")
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
        <Text fontWeight={900} mb={1}>
          Outlet Transfer
        </Text>
        <Text color="#6D584E" fontSize="sm" mb={4}>
          Move ingredient, product, or item stock between outlets. Source stock is reduced and destination stock is increased.
        </Text>

        <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={3}>
          <FormControl>
            <FormLabel fontWeight={700}>Transfer Date</FormLabel>
            <Input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} />
          </FormControl>
          <FormControl>
            <FormLabel fontWeight={700}>From Outlet</FormLabel>
            <Select value={fromOutletId} onChange={(event) => setFromOutletId(event.target.value)} isDisabled={loadingOptions}>
              <option value="">Select outlet</option>
              {options?.outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.outletCode} - {outlet.outletName}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel fontWeight={700}>To Outlet</FormLabel>
            <Select value={toOutletId} onChange={(event) => setToOutletId(event.target.value)} isDisabled={loadingOptions}>
              <option value="">Select outlet</option>
              {options?.outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.outletCode} - {outlet.outletName}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel fontWeight={700}>Type</FormLabel>
            <Select
              value={lineType}
              onChange={(event) => {
                setLineType(event.target.value as OutletTransferLineType);
                setSourceId("");
                setQuantity("");
              }}
            >
              <option value="ingredient">Ingredient</option>
              <option value="product">Product</option>
              <option value="item">Item</option>
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel fontWeight={700}>Select {typeLabel[lineType]}</FormLabel>
            <Select value={sourceId} onChange={(event) => setSourceId(event.target.value)} isDisabled={loadingOptions || !fromOutletId}>
              <option value="">Select</option>
              {sourceOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
          </FormControl>
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mt={3}>
          <FormControl>
            <FormLabel fontWeight={700}>Quantity</FormLabel>
            <Input
              type="number"
              min={0}
              step={lineType === "item" ? 1 : 0.001}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </FormControl>
          <Box />
        </SimpleGrid>

        {selectedSource ? (
          <Box mt={2} px={3} py={2} borderRadius="10px" border="1px solid rgba(132, 79, 52, 0.2)" bg="#FFF9EE">
            <Text fontSize="sm" fontWeight={700} color="#5C4037">
              {lineType === "item"
                ? "Item transfer validates ingredient stock automatically."
                : `Available: ${availableForSelected} ${selectedSource.unit}`}
              {fromOutlet ? ` | From: ${fromOutlet.outletCode}` : ""}
              {toOutlet ? ` | To: ${toOutlet.outletCode}` : ""}
            </Text>
          </Box>
        ) : null}

        <FormControl mt={3}>
          <FormLabel fontWeight={700}>Transfer Note (Optional)</FormLabel>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Transfer reason / remarks"
            rows={3}
          />
        </FormControl>

        <HStack mt={4} spacing={3} flexWrap="wrap">
          <Button
            color="white"
            bgGradient="linear(95deg, #8E0909 0%, #BE3329 46%, #D3A23D 100%)"
            _hover={{ bgGradient: "linear(95deg, #7A0707 0%, #A12822 46%, #BA8A34 100%)" }}
            onClick={addLine}
          >
            Add Line
          </Button>
          <Button color="white" bg="#177245" _hover={{ bg: "#125A37" }} isLoading={submitting} onClick={() => void submitTransfer()}>
            Submit Transfer ({pendingLines.length})
          </Button>
          <Button variant="outline" onClick={() => void loadOptions(fromOutletId || undefined)} isLoading={loadingOptions}>
            Refresh Stock
          </Button>
        </HStack>

        <Box mt={4} p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="12px" bg="#FFF9EE">
          <HStack justify="space-between" flexWrap="wrap" gap={2}>
            <Text fontWeight={800}>Transfer Lines ({pendingLines.length})</Text>
            <Text fontWeight={900} color="#A32626">
              Estimated Value: {formatCurrency(totalLineValue)}
            </Text>
          </HStack>

          {pendingLines.length ? (
            <VStack align="stretch" spacing={2} mt={3}>
              {pendingLines.map((line) => (
                <HStack
                  key={line.id}
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
                      {typeLabel[line.lineType]} | {line.sourceName}
                    </Text>
                    <Text fontSize="sm" color="#705B52">
                      Qty {line.quantity} {line.unit}
                    </Text>
                    <Text fontSize="sm" color="#A32626" fontWeight={700}>
                      Value {formatCurrency(line.lineValue)}
                    </Text>
                  </Box>
                  <Button size="sm" variant="outline" onClick={() => removeLine(line.id)}>
                    Remove
                  </Button>
                </HStack>
              ))}
            </VStack>
          ) : (
            <Text mt={3} color="#705B52" fontSize="sm">
              Add lines and submit transfer.
            </Text>
          )}
        </Box>
      </Box>

      <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
        <HStack justify="space-between" flexWrap="wrap" gap={3}>
          <Text fontWeight={900}>Recent Transfers</Text>
        </HStack>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mt={3}>
          <FormControl>
            <FormLabel fontWeight={700}>Records Outlet</FormLabel>
            <Select value={recordOutletId} onChange={(event) => setRecordOutletId(event.target.value)}>
              {options?.outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.outletCode} - {outlet.outletName}
                </option>
              ))}
            </Select>
          </FormControl>
          <HStack align="end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadRecords(recordPage, recordOutletId || undefined)}
              isLoading={loadingRecords}
            >
              Refresh
            </Button>
          </HStack>
        </SimpleGrid>

        {records.length ? (
          <VStack mt={3} align="stretch" spacing={2}>
            {records.map((record) => (
              <Box key={record.id} p={3} border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="12px" bg="#FFF9EE">
                <Text fontWeight={900}>
                  {record.transferNumber} | {record.fromOutletName} {"->"} {record.toOutletName}
                </Text>
                <Text fontSize="sm" color="#705B52">
                  {record.transferDate} | Lines {record.lineCount} | Value {formatCurrency(record.totalValue)}
                </Text>
                <Text fontSize="sm" color="#705B52">
                  By {record.createdByUserName}
                </Text>
              </Box>
            ))}
          </VStack>
        ) : (
          <Text mt={3} color="#705B52" fontSize="sm">
            {loadingRecords ? "Loading transfer records..." : "No transfers yet."}
          </Text>
        )}

        <HStack justify="space-between" mt={4}>
          <Button
            variant="outline"
            size="sm"
            isDisabled={recordPage <= 1}
            onClick={() => void loadRecords(Math.max(1, recordPage - 1))}
          >
            Previous
          </Button>
          <Text fontWeight={700}>
            Page {recordPage} of {recordTotalPages}
          </Text>
          <Button
            variant="outline"
            size="sm"
            isDisabled={recordPage >= recordTotalPages}
            onClick={() => void loadRecords(Math.min(recordTotalPages, recordPage + 1))}
          >
            Next
          </Button>
        </HStack>
      </Box>
    </VStack>
  );
};
