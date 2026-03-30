import { z } from "zod";

import { OUTLET_TRANSFER_LINE_TYPES } from "./outlet-transfer.constants";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const transferLineSchema = z.object({
  lineType: z.enum(OUTLET_TRANSFER_LINE_TYPES),
  sourceId: z.string().uuid("Invalid source id"),
  quantity: z.coerce.number().positive("Quantity must be greater than zero")
});

export const transferOptionsSchema = z.object({
  query: z.object({
    fromOutletId: z.string().uuid("Invalid from outlet id").optional()
  })
});

export const createTransferSchema = z.object({
  body: z.object({
    transferDate: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    fromOutletId: z.string().uuid("Invalid from outlet id"),
    toOutletId: z.string().uuid("Invalid to outlet id"),
    note: z.string().trim().max(500, "Note is too long").optional(),
    lines: z.array(transferLineSchema).min(1, "At least one transfer line is required")
  })
});

export const transferListSchema = z.object({
  query: z.object({
    search: z.string().trim().max(120).optional(),
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    outletId: z.string().uuid("Invalid outlet id").optional(),
    fromOutletId: z.string().uuid("Invalid from outlet id").optional(),
    toOutletId: z.string().uuid("Invalid to outlet id").optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
  })
});
