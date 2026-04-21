import { z } from "zod";

export const assetListSchema = z.object({
  query: z.object({
    search: z.string().trim().max(120).optional(),
    includeInactive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional()
});

export const createAssetSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Asset name must be at least 2 characters").max(120),
    quantity: z.coerce.number().min(0, "Quantity cannot be negative"),
    unit: z.string().trim().min(1, "Unit is required").max(32),
    isActive: z.boolean().optional().default(true)
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});

export const updateAssetSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid asset id")
  }),
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      quantity: z.coerce.number().min(0).optional(),
      unit: z.string().trim().min(1).max(32).optional(),
      isActive: z.boolean().optional()
    })
    .refine((value) => Object.keys(value).length > 0, "At least one field must be provided"),
  query: z.object({}).optional()
});

export const deleteAssetSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid asset id")
  }),
  body: z.object({}).optional(),
  query: z.object({}).optional()
});
