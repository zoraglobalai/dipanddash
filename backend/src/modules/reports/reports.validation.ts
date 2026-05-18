import { z } from "zod";

import { REPORT_BUSINESS_SCOPES, REPORT_KEYS } from "./reports.constants";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const reportsCatalogSchema = z.object({
  query: z.object({}).optional()
});

export const generateReportSchema = z.object({
  query: z.object({
    reportKey: z.enum(REPORT_KEYS),
    businessScope: z.enum(REPORT_BUSINESS_SCOPES).optional(),
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    search: z.string().trim().max(120).optional(),
    outletId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(50)
  })
});

export const exportStockConsumptionSchema = z.object({
  query: z.object({
    format: z.enum(["excel", "pdf"]).default("excel"),
    businessScope: z.enum(REPORT_BUSINESS_SCOPES).optional(),
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    search: z.string().trim().max(120).optional(),
    outletId: z.string().uuid().optional()
  })
});

export const stockConsumptionHtmlPreviewSchema = z.object({
  query: z.object({
    businessScope: z.enum(REPORT_BUSINESS_SCOPES).optional(),
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    search: z.string().trim().max(120).optional(),
    outletId: z.string().uuid().optional()
  })
});
