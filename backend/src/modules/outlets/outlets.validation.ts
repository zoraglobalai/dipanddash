import { z } from "zod";

const outletBodySchema = z.object({
  outletName: z.string().trim().min(2, "Outlet name must be at least 2 characters").max(160),
  location: z.string().trim().min(2, "Location is required").max(240),
  managerName: z.string().trim().min(2, "Manager name must be at least 2 characters").max(140),
  managerPhone: z.string().trim().min(7, "Manager phone is too short").max(20),
  isActive: z.boolean().optional()
});

export const outletListSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    includeInactive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
  })
});

export const createOutletSchema = z.object({
  body: outletBodySchema
});

export const updateOutletSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid outlet id")
  }),
  body: outletBodySchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required")
});
