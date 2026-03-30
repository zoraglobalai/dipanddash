import { z } from "zod";

import { INGREDIENT_UNITS } from "./ingredients.constants";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const isValidDateLike = (value: string) => {
  const trimmed = value.trim();
  if (datePattern.test(trimmed)) {
    return true;
  }

  const parsed = new Date(trimmed);
  return !Number.isNaN(parsed.getTime());
};
const dateLikeSchema = z
  .string()
  .trim()
  .refine((value) => isValidDateLike(value), "Date must be in YYYY-MM-DD format");
const unitSchema = z.enum(INGREDIENT_UNITS);

export const ingredientCategoryListSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    includeInactive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10)
  })
});

export const createIngredientCategorySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Category name must be at least 2 characters").max(80),
    description: z.string().trim().max(255).optional()
  })
});

export const updateIngredientCategorySchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid category id")
  }),
  body: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      description: z.string().trim().max(255).optional(),
      isActive: z.boolean().optional()
    })
    .refine((value) => Object.keys(value).length > 0, "At least one field must be provided")
});

export const deleteIngredientCategorySchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid category id")
  })
});

export const ingredientListSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    categoryId: z.string().uuid("Invalid category id").optional(),
    includeInactive: z.coerce.boolean().optional(),
    withMovementStats: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10)
  })
});

export const createIngredientSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Ingredient name must be at least 2 characters").max(120),
    categoryId: z.string().uuid("Invalid category id"),
    unit: unitSchema,
    perUnitPrice: z.coerce.number().min(0, "Per unit price cannot be negative").optional().default(0),
    minStock: z.coerce.number().min(0, "Minimum stock cannot be negative"),
    currentStock: z.coerce.number().min(0, "Current stock cannot be negative").optional().default(0)
  })
});

export const updateIngredientSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid ingredient id")
  }),
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      categoryId: z.string().uuid("Invalid category id").optional(),
      unit: unitSchema.optional(),
      perUnitPrice: z.coerce.number().min(0).optional(),
      minStock: z.coerce.number().min(0).optional(),
      currentStock: z.coerce.number().min(0).optional(),
      isActive: z.boolean().optional()
    })
    .refine((value) => Object.keys(value).length > 0, "At least one field must be provided")
});

export const deleteIngredientSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid ingredient id")
  })
});

export const ingredientStockSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid ingredient id")
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
  })
});

export const addIngredientStockSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid ingredient id")
  }),
  body: z.object({
    quantity: z.coerce.number().positive("Quantity must be greater than zero"),
    note: z.string().trim().max(255).optional()
  })
});

export const adjustIngredientStockSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid ingredient id")
  }),
  body: z.object({
    quantity: z.coerce
      .number()
      .refine((value) => value !== 0, "Adjustment quantity cannot be zero"),
    note: z.string().trim().max(255).optional()
  })
});

export const allocationListSchema = z.object({
  query: z.object({
    date: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    overall: z.coerce.boolean().optional(),
    search: z.string().trim().optional(),
    categoryId: z.string().uuid("Invalid category id").optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10)
  })
});

export const allocationStatsSchema = z.object({
  query: z.object({
    date: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    search: z.string().trim().optional(),
    categoryId: z.string().uuid("Invalid category id").optional()
  })
});

export const saveAllocationSchema = z.object({
  body: z.object({
    ingredientId: z.string().uuid("Invalid ingredient id"),
    date: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format"),
    allocatedQuantity: z.coerce.number().min(0, "Allocated quantity cannot be negative"),
    note: z.string().trim().max(255).optional()
  })
});

export const updateAllocationSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid allocation id")
  }),
  body: z
    .object({
      allocatedQuantity: z.coerce.number().min(0).optional(),
      usedQuantity: z.coerce.number().min(0).optional(),
      note: z.string().trim().max(255).optional()
    })
    .refine(
      (value) => value.allocatedQuantity !== undefined || value.usedQuantity !== undefined,
      "At least allocatedQuantity or usedQuantity must be provided"
    )
});

export const assignAllAllocationSchema = z.object({
  body: z.object({
    date: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format"),
    note: z.string().trim().max(255).optional()
  })
});

export const continueYesterdayAllocationSchema = z.object({
  body: z.object({
    date: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format"),
    note: z.string().trim().max(255).optional()
  })
});

export const updatePosBillingControlSchema = z.object({
  body: z
    .object({
      isBillingEnabled: z.boolean().optional(),
      enforceDailyAllocation: z.boolean().optional(),
      reason: z.string().trim().max(255).optional()
    })
    .refine(
      (value) =>
        value.isBillingEnabled !== undefined ||
        value.enforceDailyAllocation !== undefined ||
        value.reason !== undefined,
      "At least one field must be provided"
    )
});

export const closingStatusSchema = z.object({
  query: z.object({}).optional()
});

export const submitClosingReportSchema = z.object({
  body: z.object({
    reportDate: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    note: z.string().trim().max(600).optional(),
    rows: z
      .array(
        z.object({
          ingredientId: z.string().uuid("Invalid ingredient id"),
          reportedRemainingQuantity: z.coerce.number().min(0, "Reported remaining cannot be negative")
        })
      )
      .min(1, "At least one ingredient row is required")
  })
});

export const closingReportListSchema = z.object({
  query: z.object({
    date: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    staffId: z.string().uuid("Invalid staff id").optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10)
  })
});

export const stockAuditSchema = z.object({
  query: z.object({
    dateFrom: dateLikeSchema.optional(),
    dateTo: dateLikeSchema.optional(),
    date: dateLikeSchema.optional(),
    staffId: z.string().uuid("Invalid staff id").optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
});
