import {
  Box,
  Button,
  Grid,
  HStack,
  Input,
  Select,
  Text,
  VStack,
  useToast
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PosDataTable, type PosTableColumn } from "@/components/common/PosDataTable";
import { reportsService } from "@/services/reports.service";
import type { PosGeneratedReport, PosReportCatalogItem, PosReportRow } from "@/types/report";
import { extractApiErrorMessage } from "@/utils/api-error";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

const toCsvValue = (value: string | number | null) => {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
};

const looksCurrencyKey = (key: string) =>
  /(amount|sales|total|tax|discount|valuation|price|revenue|cost|cash|outflow|spend)/i.test(key);

const formatCellValue = (key: string, value: string | number | null) => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (typeof value === "number") {
    if (looksCurrencyKey(key)) {
      return currencyFormatter.format(value);
    }
    return Number.isInteger(value) ? value.toString() : value.toLocaleString("en-IN");
  }
  return value;
};

const getDefaultRange = () => {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 6);
  return {
    from: fromDate.toISOString().slice(0, 10),
    to
  };
};

export const StaffReportsPage = () => {
  const toast = useToast();
  const defaultRange = useMemo(() => getDefaultRange(), []);

  const [catalog, setCatalog] = useState<PosReportCatalogItem[]>([]);
  const [selectedReportKey, setSelectedReportKey] = useState("");
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [reportData, setReportData] = useState<PosGeneratedReport | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const response = await reportsService.getCatalog();
      const reports = response.data.reports;
      setCatalog(reports);
      if (reports.length && !selectedReportKey) {
        setSelectedReportKey(reports[0].key);
      }
    } catch (error) {
      toast({
        status: "error",
        title: extractApiErrorMessage(error, "Unable to load reports catalog.")
      });
    } finally {
      setLoading(false);
    }
  }, [selectedReportKey, toast]);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  const loadReport = useCallback(
    async (nextPage = page, nextLimit = limit, nextSearch = search) => {
      if (!selectedReportKey) {
        return;
      }

      setReportLoading(true);
      try {
        const response = await reportsService.generate({
          reportKey: selectedReportKey,
          dateFrom,
          dateTo,
          search: nextSearch || undefined,
          page: nextPage,
          limit: nextLimit
        });
        setReportData(response.data);
        setHasGenerated(true);
      } catch (error) {
        toast({
          status: "error",
          title: extractApiErrorMessage(error, "Unable to generate report.")
        });
      } finally {
        setReportLoading(false);
      }
    },
    [dateFrom, dateTo, limit, page, search, selectedReportKey, toast]
  );

  useEffect(() => {
    if (!hasGenerated) {
      return;
    }
    void loadReport(page, limit, search);
  }, [hasGenerated, limit, loadReport, page, search]);

  const selectedReport = useMemo(
    () => catalog.find((item) => item.key === selectedReportKey) ?? null,
    [catalog, selectedReportKey]
  );

  const tableColumns = useMemo<PosTableColumn<PosReportRow>[]>(() => {
    if (!reportData?.columns.length) {
      return [];
    }

    return reportData.columns.map((column) => ({
      key: column.key,
      header: column.label,
      render: (row) => <Text>{formatCellValue(column.key, row[column.key] ?? null)}</Text>
    }));
  }, [reportData?.columns]);

  const handleGenerate = () => {
    setPage(1);
    void loadReport(1, limit, search);
  };

  const handleExport = useCallback(async () => {
    if (!selectedReportKey) {
      toast({ status: "warning", title: "Select a report first." });
      return;
    }

    setExportLoading(true);
    try {
      let currentPage = 1;
      let totalPages = 1;
      let columns: PosGeneratedReport["columns"] = [];
      const allRows: PosReportRow[] = [];

      do {
        const response = await reportsService.generate({
          reportKey: selectedReportKey,
          dateFrom,
          dateTo,
          search: search || undefined,
          page: currentPage,
          limit: 500
        });
        columns = response.data.columns;
        allRows.push(...response.data.rows);
        totalPages = response.data.pagination.totalPages;
        currentPage += 1;
      } while (currentPage <= totalPages);

      if (!columns.length) {
        toast({ status: "warning", title: "No rows available to export." });
        return;
      }

      const csvHeader = columns.map((column) => toCsvValue(column.label)).join(",");
      const csvRows = allRows.map((row) =>
        columns.map((column) => toCsvValue(row[column.key] ?? null)).join(",")
      );
      const csv = [csvHeader, ...csvRows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${selectedReportKey}_${dateFrom}_${dateTo}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast({ status: "success", title: "Report exported successfully." });
    } catch (error) {
      toast({
        status: "error",
        title: extractApiErrorMessage(error, "Unable to export report.")
      });
    } finally {
      setExportLoading(false);
    }
  }, [dateFrom, dateTo, search, selectedReportKey, toast]);

  if (loading) {
    return <Text color="#705B52">Loading reports catalog...</Text>;
  }

  return (
    <VStack align="stretch" spacing={4}>
      <Box border="1px solid rgba(132, 79, 52, 0.18)" borderRadius="12px" p={4} bg="white">
        <Grid templateColumns={{ base: "1fr", lg: "repeat(6, minmax(0, 1fr))" }} gap={3}>
          <Box gridColumn={{ base: "span 1", lg: "span 2" }}>
            <Text fontSize="sm" fontWeight={700} mb={1}>
              Report
            </Text>
            <Select
              value={selectedReportKey}
              onChange={(event) => {
                setSelectedReportKey(event.target.value);
                setHasGenerated(false);
                setReportData(null);
              }}
              bg="white"
            >
              {catalog.map((report) => (
                <option key={report.key} value={report.key}>
                  {report.title}
                </option>
              ))}
            </Select>
          </Box>
          <Box>
            <Text fontSize="sm" fontWeight={700} mb={1}>
              Date From
            </Text>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} bg="white" />
          </Box>
          <Box>
            <Text fontSize="sm" fontWeight={700} mb={1}>
              Date To
            </Text>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} bg="white" />
          </Box>
          <Box>
            <Text fontSize="sm" fontWeight={700} mb={1}>
              Rows
            </Text>
            <Select
              value={String(limit)}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
              bg="white"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </Select>
          </Box>
          <Box>
            <Text fontSize="sm" fontWeight={700} mb={1}>
              Search
            </Text>
            <Input
              placeholder="Search rows"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              bg="white"
            />
          </Box>
        </Grid>
        {selectedReport ? (
          <Text mt={2} fontSize="sm" color="#705B52">
            {selectedReport.description}
          </Text>
        ) : null}
        <HStack justify="flex-end" mt={3} spacing={2}>
          <Button variant="outline" onClick={() => void handleExport()} isLoading={exportLoading}>
            {exportLoading ? "Exporting..." : "Export CSV"}
          </Button>
          <Button onClick={handleGenerate} isLoading={reportLoading}>
            {reportLoading ? "Generating..." : "Generate"}
          </Button>
        </HStack>
      </Box>

      {reportData?.stats?.length ? (
        <Grid templateColumns={{ base: "1fr", md: "repeat(3, minmax(0, 1fr))", xl: "repeat(6, minmax(0, 1fr))" }} gap={3}>
          {reportData.stats.map((stat) => (
            <Box key={stat.label} border="1px solid rgba(132, 79, 52, 0.16)" borderRadius="12px" p={3} bg="white">
              <Text fontSize="xs" color="#705B52" fontWeight={700}>
                {stat.label}
              </Text>
              <Text mt={1} fontWeight={800} fontSize="xl" color="#2A1A14">
                {typeof stat.value === "number" ? stat.value.toLocaleString("en-IN") : stat.value}
              </Text>
              {stat.hint ? (
                <Text mt={1} fontSize="xs" color="#7A6258">
                  {stat.hint}
                </Text>
              ) : null}
            </Box>
          ))}
        </Grid>
      ) : null}

      {reportData ? (
        <>
          <PosDataTable
            rows={reportData.rows}
            columns={tableColumns}
            getRowId={(row, index) => `${index}-${String(row[reportData.columns[0]?.key] ?? "row")}`}
            emptyMessage="No rows found for selected filters."
            loading={reportLoading}
            maxColumns={6}
          />
          <HStack justify="space-between">
            <Text fontSize="sm" color="#705B52">
              Showing {reportData.rows.length} of {reportData.pagination.total} records
            </Text>
            <HStack spacing={2}>
              <Button
                variant="outline"
                onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                isDisabled={reportData.pagination.page <= 1}
              >
                Previous
              </Button>
              <Text fontSize="sm" fontWeight={700}>
                Page {reportData.pagination.page} of {reportData.pagination.totalPages}
              </Text>
              <Button
                variant="outline"
                onClick={() =>
                  setPage((previous) => Math.min(reportData.pagination.totalPages, previous + 1))
                }
                isDisabled={reportData.pagination.page >= reportData.pagination.totalPages}
              >
                Next
              </Button>
            </HStack>
          </HStack>
        </>
      ) : (
        <Box border="1px dashed rgba(132, 79, 52, 0.3)" borderRadius="12px" p={6} bg="white">
          <Text color="#705B52">Generate a report to view records.</Text>
        </Box>
      )}
    </VStack>
  );
};
