import {
  Grid,
  HStack,
  Select,
  Text,
  VStack
} from "@chakra-ui/react";
import { Download, FileBarChart2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppSearchableSelect } from "@/components/ui/AppSearchableSelect";
import { DataTable } from "@/components/ui/DataTable";
import { StatCard } from "@/components/ui/StatCard";
import { reportsService } from "@/services/reports.service";
import type { GeneratedReportResponse, ReportCatalogItem, ReportRow } from "@/types/report";
import { extractErrorMessage } from "@/utils/api-error";
import { useAppToast } from "@/hooks/useAppToast";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

const toCsvValue = (value: string | number | null) => {
  const text = value === null || value === undefined ? "" : String(value);
  const escaped = text.replace(/"/g, "\"\"");
  return `"${escaped}"`;
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

const extractFileNameFromDisposition = (contentDisposition?: string | null) => {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }

  return null;
};

const getDefaultRange = () => {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 6);
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
};

export const ReportsPage = () => {
  const toast = useAppToast();
  const defaultRange = useMemo(() => getDefaultRange(), []);

  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [selectedReportKey, setSelectedReportKey] = useState("");
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [stockExportLoading, setStockExportLoading] = useState<"excel" | "pdf" | null>(null);
  const [reportData, setReportData] = useState<GeneratedReportResponse | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const hasAutoSelectedInitialReport = useRef(false);

  const selectedReport = useMemo(
    () => catalog.find((item) => item.key === selectedReportKey) ?? null,
    [catalog, selectedReportKey]
  );
  const isStockConsumptionReport = selectedReportKey === "stock_consumption_report";

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const response = await reportsService.getCatalog();
      const reports = response.data.reports;
      setCatalog(reports);
      setSelectedReportKey((current) => {
        if (!reports.length) {
          return "";
        }
        if (current && reports.some((report) => report.key === current)) {
          return current;
        }
        if (!current && !hasAutoSelectedInitialReport.current) {
          hasAutoSelectedInitialReport.current = true;
          return reports[0].key;
        }
        return current;
      });
    } catch (err) {
      toast.error(extractErrorMessage(err, "Unable to fetch reports catalog"));
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
      } catch (err) {
        toast.error(extractErrorMessage(err, "Unable to generate report"));
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

  const tableColumns = useMemo(() => {
    if (!reportData?.columns.length) {
      return [];
    }

    return reportData.columns.map((column) => ({
      key: column.key,
      header: column.label,
      render: (row: ReportRow) => (
        <Text>{formatCellValue(column.key, row[column.key] ?? null)}</Text>
      )
    }));
  }, [reportData?.columns]);

  const reportOptions = useMemo(
    () =>
      catalog.map((report) => ({
        label: report.title,
        value: report.key,
        searchText: `${report.title} ${report.key} ${report.category}`
      })),
    [catalog]
  );

  const handleGenerate = () => {
    setPage(1);
    void loadReport(1, limit, search);
  };

  const handleDownloadCsv = useCallback(async () => {
    if (!selectedReportKey) {
      toast.warning("Please select a report first.");
      return;
    }

    setExportLoading(true);
    try {
      let currentPage = 1;
      let totalPages = 1;
      let columns: GeneratedReportResponse["columns"] = [];
      const allRows: ReportRow[] = [];

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
        toast.warning("No rows available to export.");
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
      toast.success("Report exported successfully.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Unable to export report"));
    } finally {
      setExportLoading(false);
    }
  }, [dateFrom, dateTo, search, selectedReportKey, toast]);

  const handleStockExport = useCallback(
    async (format: "excel" | "pdf") => {
      if (!isStockConsumptionReport) {
        toast.warning("Stock consumption export is available only for Stock Consumption Report.");
        return;
      }

      setStockExportLoading(format);
      try {
        const response = await reportsService.exportStockConsumption({
          format,
          dateFrom,
          dateTo,
          search: search || undefined
        });

        const defaultMime = format === "excel" ? "text/csv;charset=utf-8;" : "application/pdf";
        const blob = new Blob([response.data], { type: response.headers["content-type"] ?? defaultMime });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        const fallbackName = `stock_consumption_${dateFrom}_${dateTo}.${format === "excel" ? "csv" : "pdf"}`;
        const extractedName = extractFileNameFromDisposition(response.headers["content-disposition"]);
        let downloadName = extractedName ?? fallbackName;
        if (format === "excel") {
          downloadName = downloadName.replace(/\.(xlsx?|csv)$/i, "") + ".csv";
        }
        anchor.download = downloadName;
        anchor.click();
        URL.revokeObjectURL(url);
        toast.success(`Stock consumption ${format === "excel" ? "CSV" : "PDF"} downloaded successfully.`);
      } catch (err) {
        toast.error(extractErrorMessage(err, `Unable to download ${format === "excel" ? "CSV" : "PDF"}`));
      } finally {
        setStockExportLoading(null);
      }
    },
    [dateFrom, dateTo, isStockConsumptionReport, search, toast]
  );

  if (loading) {
    return (
      <VStack align="stretch" spacing={6}>
        <PageHeader title="Reports" subtitle="Loading reports catalog..." />
      </VStack>
    );
  }

  return (
    <VStack align="stretch" spacing={6}>
      <PageHeader
        title="Reports"
        subtitle="Generate business reports with date range, searchable output and export-ready data."
        action={
          <HStack spacing={2}>
            {isStockConsumptionReport ? (
              <>
                <AppButton
                  variant="outline"
                  leftIcon={<Download size={16} />}
                  onClick={() => void handleStockExport("excel")}
                  isLoading={stockExportLoading === "excel"}
                >
                  Export CSV
                </AppButton>
                <AppButton
                  variant="outline"
                  leftIcon={<Download size={16} />}
                  onClick={() => void handleStockExport("pdf")}
                  isLoading={stockExportLoading === "pdf"}
                >
                  Download PDF
                </AppButton>
              </>
            ) : (
              <AppButton
                variant="outline"
                leftIcon={<Download size={16} />}
                onClick={() => void handleDownloadCsv()}
                isLoading={exportLoading}
              >
                Export CSV
              </AppButton>
            )}
            <AppButton
              leftIcon={<FileBarChart2 size={16} />}
              onClick={handleGenerate}
              isLoading={reportLoading}
            >
              Generate
            </AppButton>
          </HStack>
        }
      />

      <AppCard>
        <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(5, minmax(0, 1fr))" }} gap={4}>
          <AppSearchableSelect
            label="Report"
            value={selectedReportKey}
            options={reportOptions}
            onValueChange={(value) => {
              setSelectedReportKey(value);
              setHasGenerated(false);
              setReportData(null);
            }}
            placeholder="Select report"
          />
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
            <AppInput
              label="Search in report"
              placeholder="Search rows"
              value={search}
              onChange={(event) => {
                setSearch((event.target as HTMLInputElement).value);
                setPage(1);
              }}
            />
          <VStack align="stretch" spacing={1}>
            <Text fontWeight={600}>Rows per page</Text>
            <Select
              value={String(limit)}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </Select>
          </VStack>
        </Grid>
        {selectedReport ? (
          <Text mt={3} fontSize="sm" color="#705B52">
            {selectedReport.description}
          </Text>
        ) : null}
      </AppCard>

      {reportData?.stats?.length ? (
        <Grid templateColumns={{ base: "1fr", md: "repeat(3, minmax(0, 1fr))", xl: "repeat(6, minmax(0, 1fr))" }} gap={4}>
          {reportData.stats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={typeof stat.value === "number" ? stat.value.toLocaleString("en-IN") : stat.value}
              change={stat.hint}
            />
          ))}
        </Grid>
      ) : null}

      <AppCard
        title={reportData?.report.title ?? "Report Output"}
        subtitle={
          reportData
            ? `Date range: ${reportData.range.dateFrom} to ${reportData.range.dateTo}`
            : "Generate a report to view data table and insights."
        }
      >
        {reportData ? (
          <>
            <DataTable
              columns={tableColumns}
              rows={reportData.rows}
              emptyState={
                <EmptyState
                  title="No report records found"
                  description="Try adjusting report filters or date range."
                />
              }
            />
            <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
              <Text color="#705B52" fontSize="sm">
                Showing {reportData.rows.length} of {reportData.pagination.total} records
              </Text>
              <HStack>
                <AppButton
                  variant="outline"
                  size="sm"
                  isDisabled={reportData.pagination.page <= 1 || reportLoading}
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                >
                  Previous
                </AppButton>
                <Text fontWeight={700} fontSize="sm">
                  Page {reportData.pagination.page} of {reportData.pagination.totalPages}
                </Text>
                <AppButton
                  variant="outline"
                  size="sm"
                  isDisabled={reportData.pagination.page >= reportData.pagination.totalPages || reportLoading}
                  onClick={() =>
                    setPage((previous) => Math.min(reportData.pagination.totalPages, previous + 1))
                  }
                >
                  Next
                </AppButton>
              </HStack>
            </HStack>
          </>
        ) : (
          <EmptyState
            title="Generate a report"
            description="Select a report and date range, then click Generate."
          />
        )}
      </AppCard>
    </VStack>
  );
};
