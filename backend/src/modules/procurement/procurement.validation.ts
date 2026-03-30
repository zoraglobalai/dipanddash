import { z } from "zod";

import { INGREDIENT_UNITS } from "../ingredients/ingredients.constants";
import { PRODUCT_UNITS, PURCHASE_LINE_TYPES, PURCHASE_ORDER_TYPES } from "./procurement.constants";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const supplierBodySchema = z.object({
  name: z.string().trim().min(2, "Supplier name must be at least 2 characters").max(140),
  storeName: z.string().trim().min(2, "Store name must be at least 2 characters").max(160).optional(),
  phone: z.string().trim().min(7, "Phone number is too short").max(20),
  address: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional()
});

export const supplierListSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    includeInactive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(10)
  })
});

export const createSupplierSchema = z.object({
  body: supplierBodySchema
});

export const updateSupplierSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid supplier id")
  }),
  body: supplierBodySchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required")
});

export const deleteSupplierSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid supplier id")
  })
});

const productBodySchema = z.object({
  name: z.string().trim().min(2, "Product name must be at least 2 characters").max(160),
  category: z.string().trim().min(2, "Category is required").max(80),
  sku: z.string().trim().max(40).optional(),
  packSize: z.string().trim().max(60).optional(),
  unit: z.enum(PRODUCT_UNITS),
  currentStock: z.coerce.number().min(0, "Current stock cannot be negative").default(0),
  minStock: z.coerce.number().min(0, "Minimum stock cannot be negative").default(0),
  purchaseUnitPrice: z.coerce.number().min(0, "Purchase price cannot be negative"),
  defaultSupplierId: z.string().uuid("Invalid supplier id").optional().nullable(),
  isActive: z.boolean().optional()
});

export const productListSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    category: z.string().trim().optional(),
    supplierId: z.string().uuid("Invalid supplier id").optional(),
    includeInactive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(10)
  })
});

export const createProductSchema = z.object({
  body: productBodySchema
});

export const updateProductSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid product id")
  }),
  body: productBodySchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required")
});

export const deleteProductSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid product id")
  })
});

const purchaseLineSchema = z
  .object({
    lineType: z.enum(PURCHASE_LINE_TYPES),
    ingredientId: z.string().uuid("Invalid ingredient id").optional(),
    productId: z.string().uuid("Invalid product id").optional(),
    quantity: z.coerce.number().positive("Quantity must be greater than zero"),
    quantityUnit: z.string().trim().optional(),
    unitPrice: z.coerce.number().min(0, "Unit price cannot be negative"),
    note: z.string().trim().max(255).optional()
  })
  .superRefine((value, ctx) => {
    if (value.lineType === "ingredient") {
      if (!value.ingredientId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ingredientId is required for ingredient line",
          path: ["ingredientId"]
        });
      }
      if (value.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "productId is not allowed for ingredient line",
          path: ["productId"]
        });
      }
      if (value.quantityUnit && !INGREDIENT_UNITS.includes(value.quantityUnit as any)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid unit for ingredient line",
          path: ["quantityUnit"]
        });
      }
    }

    if (value.lineType === "product") {
      if (!value.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "productId is required for product line",
          path: ["productId"]
        });
      }
      if (value.ingredientId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ingredientId is not allowed for product line",
          path: ["ingredientId"]
        });
      }
      if (value.quantityUnit && !PRODUCT_UNITS.includes(value.quantityUnit as any)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid unit for product line",
          path: ["quantityUnit"]
        });
      }
    }
  });

export const createPurchaseOrderSchema = z.object({
  body: z.object({
    supplierId: z.string().uuid("Invalid supplier id"),
    purchaseDate: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    note: z.string().trim().max(500).optional(),
    invoiceImageUrl: z.string().trim().max(600, "Invoice image URL is too long").optional(),
    lines: z.array(purchaseLineSchema).min(1, "At least one purchase line is required")
  })
});

export const updatePurchaseOrderSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid purchase order id")
  }),
  body: z.object({
    supplierId: z.string().uuid("Invalid supplier id"),
    purchaseDate: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    note: z.string().trim().max(500).optional(),
    invoiceImageUrl: z.string().trim().max(600, "Invoice image URL is too long").optional(),
    lines: z.array(purchaseLineSchema).min(1, "At least one purchase line is required")
  })
});

export const purchaseOrderListSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    supplierId: z.string().uuid("Invalid supplier id").optional(),
    purchaseType: z.enum(PURCHASE_ORDER_TYPES).optional(),
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(10)
  })
});

export const purchaseOrderByIdSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid purchase order id")
  })
});

export const procurementMetaSchema = z.object({
  query: z.object({
    date: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    ingredientCategoryId: z.string().uuid("Invalid category id").optional(),
    ingredientSearch: z.string().trim().optional(),
    productSearch: z.string().trim().optional()
  })
});

export const procurementStatsSchema = z.object({
  query: z.object({
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional()
  })
});

export const procurementUnitsSchema = z.object({
  query: z.object({}).optional()
});

export const procurementUnitsData = {
  ingredientUnits: INGREDIENT_UNITS,
  productUnits: PRODUCT_UNITS
};
