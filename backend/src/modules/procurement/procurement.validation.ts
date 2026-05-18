import { z } from "zod";

import { INGREDIENT_UNITS } from "../ingredients/ingredients.constants";
import {
  PRODUCT_TARGET_SECTIONS,
  PRODUCT_UNITS,
  PURCHASE_LINE_TYPES,
  PURCHASE_ORDER_TYPES,
  PURCHASE_SECTIONS
} from "./procurement.constants";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const STOCK_HEALTH_VALUES = ["LOW_STOCK", "HEALTHY"] as const;

const supplierBodySchema = z.object({
  name: z.string().trim().min(2, "Supplier name must be at least 2 characters").max(140),
  storeName: z.string().trim().min(2, "Store name must be at least 2 characters").max(160).optional(),
  phone: z.string().trim().min(7, "Phone number is too short").max(20),
  address: z.string().trim().max(500).optional(),
  section: z.enum(PURCHASE_SECTIONS).optional(),
  isActive: z.boolean().optional()
});

export const supplierListSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    section: z.enum(PURCHASE_SECTIONS).optional(),
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
  minStock: z.coerce.number().min(0, "Minimum stock cannot be negative").default(0),
  sellingPrice: z.coerce.number().min(0, "Selling price cannot be negative").default(0),
  targetSection: z.enum(PRODUCT_TARGET_SECTIONS).default("dip_and_dash"),
  dipAndDashAssignedStock: z.coerce.number().min(0, "Dip & Dash assigned stock cannot be negative").optional(),
  gamingAssignedStock: z.coerce.number().min(0, "Snooker assigned stock cannot be negative").optional(),
  defaultSupplierId: z.string().uuid("Invalid supplier id").optional().nullable(),
  isActive: z.boolean().optional()
});

export const productListSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    category: z.string().trim().optional(),
    supplierId: z.string().uuid("Invalid supplier id").optional(),
    targetSection: z.enum(PRODUCT_TARGET_SECTIONS).optional(),
    includeInactive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(10)
  })
});

export const productLedgerSchema = z.object({
  query: z.object({
    date: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    productId: z.string().uuid("Invalid product id").optional(),
    search: z.string().trim().optional(),
    targetSection: z.enum(PRODUCT_TARGET_SECTIONS).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(12)
  })
});

const productLedgerRecordParamsSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
  date: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format")
});

export const upsertProductLedgerRecordSchema = z.object({
  params: productLedgerRecordParamsSchema,
  body: z
    .object({
      productId: z.string().uuid("Invalid product id").optional(),
      date: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
      targetSection: z.enum(PRODUCT_TARGET_SECTIONS).optional(),
      stockHealth: z.enum(STOCK_HEALTH_VALUES).optional(),
      openingStock: z.coerce.number(),
      purchased: z.coerce.number().min(0, "Purchased cannot be negative"),
      consumption: z.coerce.number().min(0, "Consumption cannot be negative"),
      dipAndDashConsumption: z.coerce.number().min(0, "Dip consumption cannot be negative"),
      snookerConsumption: z.coerce.number().min(0, "Snooker consumption cannot be negative"),
      note: z.string().trim().max(255).optional()
    })
    .refine(
      (value) =>
        Math.abs(
          value.consumption - (value.dipAndDashConsumption + value.snookerConsumption)
        ) <= 0.001,
      "Consumption must equal Dip Used + Snooker Used"
    )
});

export const deleteProductLedgerRecordSchema = z.object({
  params: productLedgerRecordParamsSchema
});

export const removeProductLedgerRowSchema = z.object({
  params: productLedgerRecordParamsSchema
});

export const createProductSchema = z.object({
  body: productBodySchema
});

export const getProductSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid product id")
  })
});

export const productStockHistorySchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid product id")
  }),
  query: z.object({
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    purchasePage: z.coerce.number().int().min(1).default(1),
    purchaseLimit: z.coerce.number().int().min(1).max(200).default(10),
    consumptionPage: z.coerce.number().int().min(1).default(1),
    consumptionLimit: z.coerce.number().int().min(1).max(200).default(10)
  })
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
    productName: z.string().trim().min(2, "Product name must be at least 2 characters").max(160).optional(),
    productPackSize: z.string().trim().max(60).optional(),
    productCategory: z.string().trim().max(80).optional(),
    productUnit: z.enum(PRODUCT_UNITS).optional(),
    quantity: z.coerce.number().positive("Quantity must be greater than zero"),
    quantityUnit: z.string().trim().optional(),
    unitPrice: z.coerce.number().min(0, "Unit price cannot be negative"),
    gstPercentage: z.coerce.number().min(0, "GST percentage cannot be negative").optional(),
    gstValue: z.coerce.number().min(0, "GST value cannot be negative").optional().default(0),
    sourceAmount: z.coerce.number().min(0, "Amount cannot be negative").optional(),
    sourceGrandTotal: z.coerce.number().min(0, "Grand total cannot be negative").optional(),
    sourceRowNumber: z.coerce.number().int().min(1, "Source row number must be positive").optional(),
    expiryDate: z.string().regex(datePattern, "Expiry date must be in YYYY-MM-DD format").optional(),
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
      if (value.expiryDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "expiryDate is not allowed for ingredient line",
          path: ["expiryDate"]
        });
      }
    }

    if (value.lineType === "product") {
      if (!value.productId && !value.productName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "productId or productName is required for product line",
          path: ["productName"]
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
  body: z
    .object({
      supplierId: z.string().uuid("Invalid supplier id").optional(),
      supplierName: z.string().trim().min(2, "Vendor name must be at least 2 characters").max(140).optional(),
      supplierPhone: z.string().trim().max(20).optional(),
      purchaseDate: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
      purchaseSection: z.enum(PURCHASE_SECTIONS).default("dip_and_dash"),
      note: z.string().trim().max(500).optional(),
      vendorInvoiceNumber: z.string().trim().max(80).optional(),
      projectName: z.string().trim().max(120).optional(),
      purchaseMonth: z.string().trim().max(40).optional(),
      receivedDate: z.string().regex(datePattern, "Received date must be in YYYY-MM-DD format").optional(),
      invoiceImageUrl: z.string().trim().max(600, "Invoice image URL is too long").optional(),
      lines: z.array(purchaseLineSchema).min(1, "At least one purchase line is required")
    })
    .superRefine((value, ctx) => {
      if (!value.supplierId && !value.supplierName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "supplierId or supplierName is required",
          path: ["supplierName"]
        });
      }
    })
});

export const updatePurchaseOrderSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid purchase order id")
  }),
  body: z.object({
    supplierId: z.string().uuid("Invalid supplier id"),
    purchaseDate: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    purchaseSection: z.enum(PURCHASE_SECTIONS).default("dip_and_dash"),
    note: z.string().trim().max(500).optional(),
    vendorInvoiceNumber: z.string().trim().max(80).optional(),
    projectName: z.string().trim().max(120).optional(),
    purchaseMonth: z.string().trim().max(40).optional(),
    receivedDate: z.string().regex(datePattern, "Received date must be in YYYY-MM-DD format").optional(),
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
    purchaseSection: z.enum(PURCHASE_SECTIONS).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(10)
  })
});

export const purchaseBulkImportHistorySchema = z.object({
  query: z.object({
    purchaseSection: z.enum(PURCHASE_SECTIONS).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
});

export const deletePurchaseBulkImportSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid purchase bulk import id")
  })
});

export const purchaseOrderByIdSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid purchase order id")
  })
});

export const deletePurchaseOrderSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid purchase order id")
  })
});

export const procurementMetaSchema = z.object({
  query: z.object({
    date: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    ingredientCategoryId: z.string().uuid("Invalid category id").optional(),
    ingredientSearch: z.string().trim().optional(),
    productSearch: z.string().trim().optional(),
    purchaseSection: z.enum(PURCHASE_SECTIONS).optional()
  })
});

export const procurementStatsSchema = z.object({
  query: z.object({
    dateFrom: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    dateTo: z.string().regex(datePattern, "Date must be in YYYY-MM-DD format").optional(),
    purchaseSection: z.enum(PURCHASE_SECTIONS).optional()
  })
});

export const procurementUnitsSchema = z.object({
  query: z.object({}).optional()
});

export const procurementUnitsData = {
  ingredientUnits: INGREDIENT_UNITS,
  productUnits: PRODUCT_UNITS
};
