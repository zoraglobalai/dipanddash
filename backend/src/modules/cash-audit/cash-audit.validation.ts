import { z } from "zod";

import { CASH_DENOMINATIONS } from "./cash-audit.constants";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const denominationKeySet = new Set(CASH_DENOMINATIONS.map((value) => String(value)));
const adminSectionEnum = z.enum(["dip_and_dash", "gaming"]);

const denominationCountsSchema = z
  .record(z.string(), z.coerce.number().int().min(0, "Count cannot be negative"))
  .superRefine((value, ctx) => {
    const invalidKeys = Object.keys(value).filter((key) => !denominationKeySet.has(key));
    if (invalidKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported denomination keys: ${invalidKeys.join(", ")}`,
        path: ["denominationCounts"]
      });
    }
  });

export const createCashAuditEntrySchema = z.object({
  body: z.object({
    auditDate: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    denominationCounts: denominationCountsSchema,
    staffCashTakenAmount: z.coerce.number().min(0, "Staff cash taken cannot be negative").default(0),
    note: z.string().trim().max(500, "Note is too long").optional(),
    adminPassword: z.string().min(1, "Admin password is required for confirmation").optional()
  })
});

export const cashAuditAdminListSchema = z.object({
  query: z.object({
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    section: adminSectionEnum.optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
  })
});

export const cashAuditAdminStatsSchema = z.object({
  query: z.object({
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    section: adminSectionEnum.optional()
  })
});

export const cashAuditStaffLastSchema = z.object({
  query: z.object({}).optional()
});

export const cashAuditStaffExpectedSchema = z.object({
  query: z.object({
    auditDate: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional()
  })
});
