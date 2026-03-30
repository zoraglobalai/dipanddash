export type PosReportCatalogItem = {
  key: string;
  title: string;
  description: string;
  category: string;
};

export type PosReportStat = {
  label: string;
  value: string | number;
  hint?: string;
};

export type PosReportColumn = {
  key: string;
  label: string;
};

export type PosReportRow = Record<string, string | number | null>;

export type PosReportPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PosGeneratedReport = {
  report: PosReportCatalogItem;
  range: {
    dateFrom: string;
    dateTo: string;
    generatedAt: string;
  };
  stats: PosReportStat[];
  columns: PosReportColumn[];
  rows: PosReportRow[];
  pagination: PosReportPagination;
};

