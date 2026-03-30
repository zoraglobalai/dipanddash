import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .min(8, "Phone number must be at least 8 digits")
  .max(20, "Phone number must be at most 20 characters")
  .regex(/^[0-9+\-\s()]+$/, "Please enter a valid phone number format");

export const customerListSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(10)
  }),
  body: z.object({}).optional(),
  params: z.object({}).optional()
});

export const customerStatsSchema = z.object({
  query: z.object({}),
  body: z.object({}).optional(),
  params: z.object({}).optional()
});

export const customerSearchByPhoneSchema = z.object({
  query: z.object({
    phone: phoneSchema.optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(10)
  }),
  body: z.object({}).optional(),
  params: z.object({}).optional()
});

export const createCustomerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Customer name must be at least 2 characters").max(120),
    phone: phoneSchema,
    email: z.string().trim().email("Please enter a valid email address").optional().or(z.literal("")),
    notes: z.string().trim().max(600).optional(),
    sourceDeviceId: z.string().trim().max(80).optional()
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional()
});

export const updateCustomerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: phoneSchema.optional(),
    email: z.string().trim().email().optional().or(z.literal("")),
    notes: z.string().trim().max(600).optional(),
    isActive: z.boolean().optional()
  }),
  query: z.object({}).optional(),
  params: z.object({
    id: z.string().uuid("Invalid customer id")
  })
});

export const getCustomerSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid customer id")
  }),
  body: z.object({}).optional(),
  query: z.object({}).optional()
});
