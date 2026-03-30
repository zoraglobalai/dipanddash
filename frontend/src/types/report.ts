export type ReportCategory = "Sales" | "Operations" | "Inventory" | "Staff" | "Finance" | "Gaming";

export type ReportCatalogItem = {
  key: string;
  title: string;
  description: string;
  category: ReportCategory;
};

export type ReportCatalogResponse = {
  reports: ReportCatalogItem[];
};

export type ReportStat = {
  label: string;
  value: string | number;
  hint?: string;
};

export type ReportColumn = {
  key: string;
  label: string;
};

export type ReportRow = Record<string, string | number | null>;

export type ReportPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type GeneratedReportResponse = {
  report: ReportCatalogItem;
  range: {
    dateFrom: string;
    dateTo: string;
    generatedAt: string;
  };
  stats: ReportStat[];
  columns: ReportColumn[];
  rows: ReportRow[];
  pagination: ReportPagination;
};

