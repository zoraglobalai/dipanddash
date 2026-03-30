import { z } from "zod";

import { DUMP_ENTRY_TYPES } from "./dump.constants";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const entryTypeSchema = z.enum(DUMP_ENTRY_TYPES);

export const createDumpEntrySchema = z.object({
  body: z.object({
    entryDate: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    entryType: entryTypeSchema,
    sourceId: z.string().uuid("Invalid source id"),
    quantity: z.coerce.number().positive("Quantity must be greater than zero"),
    quantityUnit: z.string().trim().min(1).max(24).optional(),
    note: z.string().trim().max(500, "Note is too long").optional()
  })
});

export const dumpAdminRecordsSchema = z.object({
  query: z.object({
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    entryType: entryTypeSchema.optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
  })
});

export const dumpAdminStatsSchema = z.object({
  query: z.object({
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    entryType: entryTypeSchema.optional(),
    search: z.string().trim().max(120).optional()
  })
});
