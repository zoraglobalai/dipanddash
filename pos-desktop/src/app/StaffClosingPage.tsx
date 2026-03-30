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

import { usePos } from "@/app/PosContext";
import { PosDataTable, type PosTableColumn } from "@/components/common/PosDataTable";
import { closingService } from "@/services/closing.service";
import type { ClosingReportSummary } from "@/types/pos";
import { extractApiErrorMessage } from "@/utils/api-error";
import { formatQuantityWithUnit } from "@/utils/quantity";

export const StaffClosingPage = () => {
  const toast = useToast();
  const { closingStatus, refreshClosingStatus, isPunchedIn, refreshShiftStatus } = usePos();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [draftSearch, setDraftSearch] = useState("");
  const [draftPage, setDraftPage] = useState(1);
  const [draftLimit, setDraftLimit] = useState(8);
  const [historyRows, setHistoryRows] = useState<ClosingReportSummary[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(8);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  const pendingCloseDate = closingStatus?.pendingCloseDate ?? null;
  const canSubmit =
    Boolean(closingStatus?.pendingCloseDate) &&
    (closingStatus?.todayClosingCount ?? 0) < (closingStatus?.maxClosingsPerDay ?? 2);
  const canSubmitWithShift = canSubmit && isPunchedIn === false;

  useEffect(() => {
    if (!closingStatus?.draft.rows.length) {
      setDraftValues({});
      return;
    }
    setDraftValues(
      Object.fromEntries(closingStatus.draft.rows.map((row) => [row.ingredientId, ""]))
    );
  }, [closingStatus?.draft.rows]);

  useEffect(() => {
    setDraftPage(1);
  }, [draftSearch, draftLimit, closingStatus?.draft.rows]);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await closingService.listReports({
        page: historyPage,
        limit: historyLimit
      });
      setHistoryRows(response.reports);
      setHistoryTotalPages(response.pagination.totalPages);
    } catch (error) {
      toast({
        status: "error",
        title: "Unable to load closing history",
        description: extractApiErrorMessage(error, "Please try again.")
      });
    } finally {
      setIsLoading(false);
    }
  }, [historyLimit, historyPage, toast]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    void refreshShiftStatus();
  }, [refreshShiftStatus]);

  const filteredDraftRows = useMemo(() => {
    const rows = closingStatus?.draft.rows ?? [];
    const search = draftSearch.trim().toLowerCase();
    if (!search) {
      return rows;
    }
    return rows.filter((row) => row.ingredientName.toLowerCase().includes(search));
  }, [closingStatus?.draft.rows, draftSearch]);

  const draftTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredDraftRows.length / draftLimit)),
    [draftLimit, filteredDraftRows.length]
  );

  const pagedDraftRows = useMemo(() => {
    const offset = (draftPage - 1) * draftLimit;
    return filteredDraftRows.slice(offset, offset + draftLimit);
  }, [draftLimit, draftPage, filteredDraftRows]);

  const draftColumns = useMemo<PosTableColumn<(typeof pagedDraftRows)[number]>[]>(
    () => [
      {
        key: "ingredient",
        header: "Ingredient",
        render: (row) => (
          <Box>
            <Text fontWeight={700}>{row.ingredientName}</Text>
            <Text fontSize="xs" color="#6D584E">
              {row.categoryName}
            </Text>
          </Box>
        )
      },
      {
        key: "opening",
        header: "Opening Stock",
        render: (row) => formatQuantityWithUnit(row.allocatedQuantity, row.unit)
      },
      {
        key: "used",
        header: "Used",
        render: (row) => formatQuantityWithUnit(row.usedQuantity, row.unit)
      },
      {
        key: "closing",
        header: "Closing Stock",
        render: (row) => (
          <HStack spacing={2} minW="180px">
            <Input
              size="sm"
              type="number"
              min={0}
              value={draftValues[row.ingredientId] ?? ""}
              onChange={(event) =>
                setDraftValues((previous) => ({
                  ...previous,
                  [row.ingredientId]: event.target.value
                }))
              }
            />
            <Text fontSize="xs" color="#6D584E" whiteSpace="nowrap">
              {row.unit.toLowerCase()}
            </Text>
          </HStack>
        )
      }
    ],
    [draftValues]
  );

  const historyColumns = useMemo<PosTableColumn<ClosingReportSummary>[]>(
    () => [
      {
        key: "reportDate",
        header: "Submitted Date",
        render: (row) => row.reportDate
      },
      {
        key: "submittedAt",
        header: "Submitted Time",
        render: (row) => new Date(row.submittedAt).toLocaleTimeString("en-IN")
      },
      {
        key: "note",
        header: "Note",
        render: (row) => row.note?.trim() || "-"
      }
    ],
    []
  );

  const handleSubmit = async () => {
    if (isPunchedIn !== false) {
      toast({
        status: "warning",
        title: isPunchedIn === true ? "Punch out required" : "Attendance status unavailable",
        description:
          isPunchedIn === true
            ? "You must punch out from Attendance before submitting stock closing report."
            : "Unable to verify shift state. Please open Attendance and refresh before closing stock."
      });
      return;
    }

    if (!closingStatus?.pendingCloseDate || !closingStatus?.draft.rows.length) {
      toast({
        status: "warning",
        title: "No pending closing found"
      });
      return;
    }

    const invalidRows: string[] = [];
    const payloadRows = closingStatus.draft.rows.map((row) => {
      const rawValue = (draftValues[row.ingredientId] ?? "").trim();
      const reported = Number(rawValue);
      if (!rawValue.length || !Number.isFinite(reported) || reported < 0) {
        invalidRows.push(row.ingredientName);
      }
      return {
        ingredientId: row.ingredientId,
        reportedRemainingQuantity: Number.isFinite(reported) && reported >= 0 ? reported : 0
      };
    });

    if (invalidRows.length) {
      toast({
        status: "warning",
        title: "Enter closing stock for all ingredients",
        description: `Missing/invalid: ${invalidRows.slice(0, 3).join(", ")}${invalidRows.length > 3 ? "..." : ""}`
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await closingService.submitReport({
        reportDate: closingStatus.pendingCloseDate,
        note: note.trim() || undefined,
        rows: payloadRows
      });
      setNote("");
      await Promise.all([refreshClosingStatus(), loadHistory()]);
      toast({
        status: "success",
        title: "Closing report submitted successfully"
      });
    } catch (error) {
      toast({
        status: "error",
        title: "Unable to submit closing report",
        description: extractApiErrorMessage(error, "Please try again.")
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <VStack align="stretch" spacing={4}>
      <SimpleGrid columns={{ base: 1, xl: 4 }} spacing={3}>
        <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
          <Text color="#725D53" fontWeight={700} fontSize="sm">
            Pending Close Date
          </Text>
          <Text mt={1} fontWeight={900} fontSize="xl">
            {pendingCloseDate ?? "None"}
          </Text>
        </Box>
        <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
          <Text color="#725D53" fontWeight={700} fontSize="sm">
            Closings Today
          </Text>
          <Text mt={1} fontWeight={900} fontSize="xl">
            {closingStatus?.todayClosingCount ?? 0} / {closingStatus?.maxClosingsPerDay ?? 2}
          </Text>
        </Box>
        <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
          <Text color="#725D53" fontWeight={700} fontSize="sm">
            Order Access
          </Text>
          <Text mt={1} fontWeight={900} fontSize="xl" color={closingStatus?.canTakeOrders ? "green.600" : "red.600"}>
            {closingStatus?.canTakeOrders ? "Open" : "Locked"}
          </Text>
        </Box>
        <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
          <Text color="#725D53" fontWeight={700} fontSize="sm">
            Ingredients to Close
          </Text>
          <Text mt={1} fontWeight={900} fontSize="xl">
            {filteredDraftRows.length}
          </Text>
        </Box>
      </SimpleGrid>

      <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
        <HStack
          justify="space-between"
          mb={3}
          gap={3}
          align={{ base: "stretch", xl: "flex-end" }}
          flexDir={{ base: "column", xl: "row" }}
        >
          <VStack align="start" spacing={0}>
            <Text fontWeight={900}>Daily Closing Report</Text>
            <Text fontSize="sm" color="#6D584E">
              Staff enters physical closing stock manually for each ingredient.
            </Text>
          </VStack>
          <SimpleGrid
            columns={{ base: 1, md: 2, xl: 3 }}
            spacing={3}
            w={{ base: "full", xl: "auto" }}
          >
            <FormControl w={{ base: "full", xl: "220px" }}>
              <FormLabel fontSize="sm">Search Ingredient</FormLabel>
              <Input
                size="sm"
                placeholder="Type ingredient name"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
              />
            </FormControl>
            <FormControl w={{ base: "full", xl: "150px" }}>
              <FormLabel fontSize="sm">Rows per page</FormLabel>
              <Select
                size="sm"
                value={String(draftLimit)}
                onChange={(event) => {
                  setDraftLimit(Number(event.target.value) || 8);
                  setDraftPage(1);
                }}
              >
                <option value="5">5</option>
                <option value="8">8</option>
                <option value="12">12</option>
                <option value="20">20</option>
              </Select>
            </FormControl>
            <Button variant="outline" alignSelf="end" onClick={() => void refreshClosingStatus()}>
              Refresh Status
            </Button>
          </SimpleGrid>
        </HStack>

        {!closingStatus?.canTakeOrders && closingStatus?.reason ? (
          <Box mb={3} px={3} py={2.5} borderRadius="10px" bg="red.50" border="1px solid" borderColor="red.200">
            <Text color="red.700" fontWeight={700} fontSize="sm">
              {closingStatus.reason}
            </Text>
          </Box>
        ) : null}

        {isPunchedIn !== false ? (
          <Box mb={3} px={3} py={2.5} borderRadius="10px" bg="orange.50" border="1px solid" borderColor="orange.200">
            <Text color="orange.700" fontWeight={700} fontSize="sm">
              {isPunchedIn === true
                ? "Stock closing can be submitted only after punch out."
                : "Attendance status not verified. Refresh Attendance before submitting closing."}
            </Text>
          </Box>
        ) : null}

        <PosDataTable
          rows={pagedDraftRows}
          columns={draftColumns}
          getRowId={(row) => row.ingredientId}
          emptyMessage="No draft rows available for closing."
          maxColumns={6}
        />
        <HStack justify="space-between" mt={3} flexWrap="wrap" gap={2}>
          <Text fontSize="sm" color="#6D584E">
            Showing {pagedDraftRows.length} of {filteredDraftRows.length} ingredients
          </Text>
          <HStack>
            <Button
              size="sm"
              variant="outline"
              isDisabled={draftPage <= 1}
              onClick={() => setDraftPage((page) => page - 1)}
            >
              Previous
            </Button>
            <Text fontWeight={700} fontSize="sm">
              Page {draftPage} of {draftTotalPages}
            </Text>
            <Button
              size="sm"
              variant="outline"
              isDisabled={draftPage >= draftTotalPages}
              onClick={() => setDraftPage((page) => page + 1)}
            >
              Next
            </Button>
          </HStack>
        </HStack>

        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={3} mt={3}>
          <FormControl>
            <FormLabel fontWeight={700}>Closing Note (Optional)</FormLabel>
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add handover note for admin audit"
            />
          </FormControl>
          <VStack align={{ base: "stretch", lg: "flex-end" }} justify="end" spacing={2}>
            <Button
              size="md"
              h="46px"
              px={8}
              w={{ base: "full", lg: "auto" }}
              minW={{ base: "full", lg: "320px" }}
              maxW={{ base: "full", lg: "360px" }}
              alignSelf={{ base: "stretch", lg: "flex-end" }}
              color="white"
              bgGradient="linear(95deg, #8E0909 0%, #BE3329 46%, #D3A23D 100%)"
              _hover={{ bgGradient: "linear(95deg, #7A0707 0%, #A12822 46%, #BA8A34 100%)" }}
              isDisabled={!canSubmitWithShift}
              isLoading={isSubmitting}
              onClick={() => void handleSubmit()}
            >
              Submit Closing ({pendingCloseDate ?? "No pending date"})
            </Button>
            {!canSubmitWithShift ? (
              <Text fontSize="xs" color="#7A6258">
                {isPunchedIn === true
                  ? "Closing unavailable: please punch out first."
                  : isPunchedIn === null
                    ? "Closing unavailable: attendance status not verified."
                    : "Closing unavailable: either no pending close date or today limit reached."}
              </Text>
            ) : null}
          </VStack>
        </SimpleGrid>
      </Box>

        <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
        <HStack justify="space-between" mb={3} flexWrap="wrap" gap={3}>
          <Text fontWeight={900}>Closing History</Text>
          <FormControl w={{ base: "full", sm: "160px" }}>
            <FormLabel fontSize="sm">Rows per page</FormLabel>
            <Select
              size="sm"
              value={String(historyLimit)}
              onChange={(event) => {
                setHistoryLimit(Number(event.target.value) || 8);
                setHistoryPage(1);
              }}
            >
              <option value="5">5</option>
              <option value="8">8</option>
              <option value="12">12</option>
              <option value="20">20</option>
            </Select>
          </FormControl>
        </HStack>
        <PosDataTable
          rows={historyRows}
          columns={historyColumns}
          getRowId={(row) => row.id}
          loading={isLoading}
          loadingMessage="Loading..."
          emptyMessage="No closing reports available."
          maxColumns={6}
        />
        <HStack justify="flex-end" mt={3}>
          <Button
            size="sm"
            variant="outline"
            isDisabled={historyPage <= 1}
            onClick={() => setHistoryPage((page) => page - 1)}
          >
            Previous
          </Button>
          <Text fontWeight={700} fontSize="sm">
            Page {historyPage} of {historyTotalPages}
          </Text>
          <Button
            size="sm"
            variant="outline"
            isDisabled={historyPage >= historyTotalPages}
            onClick={() => setHistoryPage((page) => page + 1)}
          >
            Next
          </Button>
        </HStack>
      </Box>
    </VStack>
  );
};
