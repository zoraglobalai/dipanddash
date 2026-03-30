import {
  Badge,
  FormControl,
  FormLabel,
  HStack,
  Select,
  SimpleGrid,
  Switch,
  Text,
  VStack
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { DataTable } from "@/components/ui/DataTable";
import { useAppToast } from "@/hooks/useAppToast";
import { ingredientsService } from "@/services/ingredients.service";
import type { StockAuditData } from "@/types/ingredient";
import { extractErrorMessage } from "@/utils/api-error";
import { formatQuantity, formatQuantityWithUnit } from "@/utils/quantity";

const normalizeDateInputValue = (value: string) => {
  if (!value) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const PaginationControls = ({
  page,
  totalPages,
  total,
  showing,
  onPageChange
}: {
  page: number;
  totalPages: number;
  total: number;
  showing: number;
  onPageChange: (next: number) => void;
}) => (
  <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
    <Text color="#705B52" fontSize="sm">
      Showing {showing} of {total} records
    </Text>
    <HStack>
      <AppButton variant="outline" isDisabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </AppButton>
      <Text fontWeight={700}>
        Page {page} of {totalPages}
      </Text>
      <AppButton variant="outline" isDisabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </AppButton>
    </HStack>
  </HStack>
);

export const StockAuditPage = () => {
  const toast = useAppToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isRangeInitialized, setIsRangeInitialized] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [staffId, setStaffId] = useState("");
  const [mismatchOnly, setMismatchOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StockAuditData | null>(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const normalizedDateFrom = normalizeDateInputValue(dateFrom);
      const normalizedDateTo = normalizeDateInputValue(dateTo);
      const response = await ingredientsService.getStockAudit({
        dateFrom: normalizedDateFrom || undefined,
        dateTo: normalizedDateTo || undefined,
        page,
        limit,
        staffId: staffId || undefined
      });
      setData(response.data);
      if (!isRangeInitialized) {
        setDateFrom(normalizeDateInputValue(response.data.dateFrom));
        setDateTo(normalizeDateInputValue(response.data.dateTo));
        setIsRangeInitialized(true);
      }
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch stock audit data."));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, isRangeInitialized, limit, page, staffId, toast]);

  useEffect(() => {
    void fetchAudit();
  }, [fetchAudit]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, limit, staffId]);

  const staffOptions = useMemo(() => {
    if (!data?.reports.length) {
      return [];
    }
    const map = new Map<string, string>();
    data.reports.forEach((report) => {
      if (!map.has(report.staffId)) {
        map.set(report.staffId, report.staffName);
      }
    });
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [data?.reports]);

  const reportColumns = useMemo(
    () => [
      { key: "staffName", header: "Staff" },
      { key: "reportDate", header: "Business Date" },
      { key: "closingSlot", header: "Slot" },
      {
        key: "totalIngredients",
        header: "Ingredients",
        render: (row: StockAuditData["reports"][number]) => row.totalIngredients
      },
      {
        key: "mismatchRows",
        header: "Mismatch Rows",
        render: (row: StockAuditData["reports"][number]) => row.mismatchRows ?? 0
      },
      {
        key: "submittedAt",
        header: "Submitted At",
        render: (row: StockAuditData["reports"][number]) => new Date(row.submittedAt).toLocaleString("en-IN")
      }
    ],
    []
  );

  const itemRows = useMemo(() => {
    if (!data) {
      return [];
    }
    if (!mismatchOnly) {
      return data.items.rows;
    }
    return data.items.rows.filter((row) => row.isMismatch);
  }, [data, mismatchOnly]);

  const itemTableRows = useMemo(
    () =>
      itemRows.map((row, index) => ({
        ...row,
        id: `${row.reportId}-${row.ingredientId}-${index}`
      })),
    [itemRows]
  );

  const itemColumns = useMemo(
    () => [
      {
        key: "ingredientName",
        header: "Ingredient",
        render: (row: StockAuditData["items"]["rows"][number]) => (
          <VStack align="start" spacing={0}>
            <Text fontWeight={700}>{row.ingredientName}</Text>
            <Text fontSize="xs" color="#6D584E">
              {row.staffName} | {new Date(row.submittedAt).toLocaleString("en-IN")}
            </Text>
          </VStack>
        )
      },
      {
        key: "openingStockQuantity",
        header: "Opening Stock",
        render: (row: StockAuditData["items"]["rows"][number]) =>
          formatQuantityWithUnit(row.openingStockQuantity ?? row.allocatedQuantity, row.unit)
      },
      {
        key: "purchaseStockQuantity",
        header: "Purchase Stock",
        render: (row: StockAuditData["items"]["rows"][number]) =>
          formatQuantityWithUnit(row.purchaseStockQuantity ?? 0, row.unit)
      },
      {
        key: "transferredInQuantity",
        header: "Transferred In",
        render: (row: StockAuditData["items"]["rows"][number]) =>
          formatQuantityWithUnit(row.transferredInQuantity ?? 0, row.unit)
      },
      {
        key: "transferredOutQuantity",
        header: "Transferred Out",
        render: (row: StockAuditData["items"]["rows"][number]) =>
          formatQuantityWithUnit(row.transferredOutQuantity ?? 0, row.unit)
      },
      {
        key: "consumptionQuantity",
        header: "Consumption",
        render: (row: StockAuditData["items"]["rows"][number]) =>
          formatQuantityWithUnit(row.consumptionQuantity ?? row.usedQuantity, row.unit)
      },
      {
        key: "dumpQuantity",
        header: "Dump",
        render: (row: StockAuditData["items"]["rows"][number]) =>
          formatQuantityWithUnit(row.dumpQuantity ?? 0, row.unit)
      },
      {
        key: "expectedStockQuantity",
        header: "Expected Stock",
        render: (row: StockAuditData["items"]["rows"][number]) =>
          formatQuantityWithUnit(row.expectedStockQuantity ?? row.expectedRemainingQuantity, row.unit)
      },
      {
        key: "enteredStockQuantity",
        header: "Entered Stock",
        render: (row: StockAuditData["items"]["rows"][number]) =>
          formatQuantityWithUnit(row.enteredStockQuantity ?? row.reportedRemainingQuantity, row.unit)
      },
      {
        key: "varianceQuantity",
        header: "Variance",
        render: (row: StockAuditData["items"]["rows"][number]) => (
          <Text color={row.isMismatch ? "red.600" : "green.700"}>
            {formatQuantityWithUnit(row.varianceQuantity, row.unit)}
          </Text>
        )
      }
    ],
    []
  );

  const totalReports = data?.stats.totalReports ?? 0;
  const staffSubmitted = data?.stats.staffSubmitted ?? 0;
  const totalIngredients = data?.stats.totalIngredients ?? 0;
  const mismatchedIngredients = data?.stats.mismatchedIngredients ?? 0;
  const matchedIngredients = data?.stats.matchedIngredients ?? 0;
  const totalUnallocatedStock = data?.stats.totalUnallocatedStock ?? 0;
  const ingredientsWithUnallocated = data?.stats.ingredientsWithUnallocated ?? 0;
  const isPosBillingEnabled = data?.posBillingControl.isBillingEnabled ?? false;
  const mismatchRate = totalIngredients > 0 ? (mismatchedIngredients / totalIngredients) * 100 : 0;
  const matchRate = totalIngredients > 0 ? (matchedIngredients / totalIngredients) * 100 : 0;

  return (
    <VStack align="stretch" spacing={6}>
      <PageHeader
        title="Stock Audit"
        subtitle="Audit staff closing entries across a date range with clear stock variance visibility."
      />

      <AppCard>
        <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={4}>
          <AppInput
            label="Date From"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom((event.target as HTMLInputElement).value)}
          />
          <AppInput
            label="Date To"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo((event.target as HTMLInputElement).value)}
          />
          <FormControl>
            <FormLabel>Staff</FormLabel>
            <Select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
              <option value="">All Staff</option>
              {staffOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>Records per page</FormLabel>
            <Select
              value={String(limit)}
              onChange={(event) => {
                setLimit(Number(event.target.value) || 20);
                setPage(1);
              }}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </Select>
          </FormControl>
          <FormControl display="flex" alignItems="center" gap={3} pt={8}>
            <Switch isChecked={mismatchOnly} onChange={(event) => setMismatchOnly(event.target.checked)} />
            <Text fontWeight={600}>Mismatch only</Text>
          </FormControl>
        </SimpleGrid>
      </AppCard>

      <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={4}>
        <AppCard>
          <Text color="#725D53" fontSize="sm">
            Reports
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900}>
            {totalReports}
          </Text>
        </AppCard>
        <AppCard>
          <Text color="#725D53" fontSize="sm">
            Staff Submitted
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900}>
            {staffSubmitted}
          </Text>
        </AppCard>
        <AppCard>
          <Text color="#725D53" fontSize="sm">
            Ingredient Rows Audited
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900}>
            {totalIngredients}
          </Text>
          <Text mt={1} fontSize="xs" color="#6D584E">
            Matched rows: {matchedIngredients}
          </Text>
        </AppCard>
        <AppCard>
          <Text color="#725D53" fontSize="sm">
            Unallocated Stock In Hand
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900}>
            {formatQuantity(totalUnallocatedStock)}
          </Text>
          <Text mt={1} fontSize="xs" color="#6D584E">
            Ingredients with stock: {ingredientsWithUnallocated}
          </Text>
        </AppCard>
        <AppCard>
          <Text color="#725D53" fontSize="sm">
            Mismatch Rows
          </Text>
          <Text mt={1} fontSize="2xl" fontWeight={900}>
            {mismatchedIngredients}
          </Text>
        </AppCard>
      </SimpleGrid>

      <AppCard>
        <HStack justify="space-between" flexWrap="wrap" gap={3}>
          <VStack align="start" spacing={0}>
            <Text fontWeight={800}>Audit Health</Text>
            <Text fontSize="sm" color="#6D584E">
              Match rate: {`${formatQuantity(matchRate)}%`} | Mismatch rate: {`${formatQuantity(mismatchRate)}%`}
            </Text>
          </VStack>
          <HStack spacing={2}>
            <Badge colorScheme={isPosBillingEnabled ? "green" : "red"} borderRadius="full" px={3} py={1}>
              POS {isPosBillingEnabled ? "Enabled" : "Paused"}
            </Badge>
            <Badge colorScheme="red" borderRadius="full" px={3} py={1}>
              Mismatch {mismatchedIngredients}
            </Badge>
            <Badge colorScheme="green" borderRadius="full" px={3} py={1}>
              Matched {matchedIngredients}
            </Badge>
          </HStack>
        </HStack>
      </AppCard>

      <AppCard title="Closing Reports">
        {loading ? (
          <SkeletonTable />
        ) : (
          <DataTable
            columns={reportColumns}
            rows={data?.reports ?? []}
            emptyState={<EmptyState title="No closing reports" description="No report submitted for selected range." />}
          />
        )}
      </AppCard>

      <AppCard title="Ingredient-Level Audit">
        {loading ? (
          <SkeletonTable />
        ) : (
          <>
            <DataTable
              columns={itemColumns}
              rows={itemTableRows}
              emptyState={
                <EmptyState
                  title="No audit rows"
                  description="No ingredient rows found for selected range and filters."
                />
              }
            />
            <PaginationControls
              page={data?.items.pagination.page ?? 1}
              totalPages={data?.items.pagination.totalPages ?? 1}
              total={data?.items.pagination.total ?? 0}
              showing={itemTableRows.length}
              onPageChange={setPage}
            />
          </>
        )}
      </AppCard>
    </VStack>
  );
};
