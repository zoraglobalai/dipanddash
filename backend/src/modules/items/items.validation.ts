import { z } from "zod";

import { INGREDIENT_UNITS } from "../ingredients/ingredients.constants";

const unitSchema = z.enum(INGREDIENT_UNITS);

const paginationQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

const recipeIngredientSchema = z.object({
  ingredientId: z.string().uuid("Invalid ingredient id"),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  unit: unitSchema
});

const recipeSauceSchema = z.object({
  sauceId: z.string().uuid("Invalid sauce id"),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  unit: unitSchema
});

const comboItemSchema = z.object({
  itemId: z.string().uuid("Invalid item id"),
  quantity: z.coerce.number().positive("Quantity must be greater than zero")
});

export const itemCategoryListSchema = z.object({
  query: paginationQuerySchema.extend({
    includeInactive: z.coerce.boolean().optional()
  })
});

export const createItemCategorySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Category name must be at least 2 characters").max(120),
    description: z.string().trim().max(255).optional()
  })
});

export const updateItemCategorySchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid category id")
  }),
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(255).optional(),
      isActive: z.boolean().optional()
    })
    .refine((value) => Object.keys(value).length > 0, "At least one field must be provided")
});

export const deleteItemCategorySchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid category id")
  })
});

export const itemListSchema = z.object({
  query: paginationQuerySchema.extend({
    categoryId: z.string().uuid("Invalid category id").optional(),
    includeInactive: z.coerce.boolean().optional()
  })
});

export const getItemSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid item id")
  })
});

export const createItemSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2, "Item name must be at least 2 characters").max(160),
      categoryId: z.string().uuid("Invalid item category"),
      sellingPrice: z.coerce.number().min(0, "Selling price cannot be negative"),
      gstPercentage: z.coerce.number().min(0, "GST cannot be negative"),
      imageUrl: z.string().trim().max(1024).optional(),
      note: z.string().trim().max(500).optional(),
      ingredients: z.array(recipeIngredientSchema).default([]),
      sauces: z.array(recipeSauceSchema).default([])
    })
    .refine(
      (value) => (value.ingredients?.length ?? 0) + (value.sauces?.length ?? 0) > 0,
      "Please add at least one ingredient or sauce."
    )
});

export const updateItemSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid item id")
  }),
  body: z
    .object({
      name: z.string().trim().min(2).max(160).optional(),
      categoryId: z.string().uuid("Invalid item category").optional(),
      sellingPrice: z.coerce.number().min(0).optional(),
      gstPercentage: z.coerce.number().min(0).optional(),
      imageUrl: z.string().trim().max(1024).optional(),
      note: z.string().trim().max(500).optional(),
      isActive: z.boolean().optional(),
      ingredients: z.array(recipeIngredientSchema).optional(),
      sauces: z.array(recipeSauceSchema).optional()
    })
    .refine((value) => Object.keys(value).length > 0, "At least one field must be provided")
    .superRefine((value, context) => {
      const hasIngredients = value.ingredients !== undefined;
      const hasSauces = value.sauces !== undefined;
      if (!hasIngredients && !hasSauces) {
        return;
      }

      if ((value.ingredients?.length ?? 0) + (value.sauces?.length ?? 0) <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please add at least one ingredient or sauce."
        });
      }
    })
});

export const deleteItemSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid item id")
  })
});

export const addOnListSchema = z.object({
  query: paginationQuerySchema.extend({
    includeInactive: z.coerce.boolean().optional()
  })
});

export const getAddOnSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid add-on id")
  })
});

export const createAddOnSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Add-on name must be at least 2 characters").max(160),
    sellingPrice: z.coerce.number().min(0, "Selling price cannot be negative"),
    gstPercentage: z.coerce.number().min(0, "GST cannot be negative"),
    imageUrl: z.string().trim().max(1024).optional(),
    note: z.string().trim().max(500).optional(),
    ingredients: z.array(recipeIngredientSchema).min(1, "Please add at least one ingredient")
  })
});

export const updateAddOnSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid add-on id")
  }),
  body: z
    .object({
      name: z.string().trim().min(2).max(160).optional(),
      sellingPrice: z.coerce.number().min(0).optional(),
      gstPercentage: z.coerce.number().min(0).optional(),
      imageUrl: z.string().trim().max(1024).optional(),
      note: z.string().trim().max(500).optional(),
      isActive: z.boolean().optional(),
      ingredients: z.array(recipeIngredientSchema).min(1).optional()
    })
    .refine((value) => Object.keys(value).length > 0, "At least one field must be provided")
});

export const deleteAddOnSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid add-on id")
  })
});

export const comboListSchema = z.object({
  query: paginationQuerySchema.extend({
    includeInactive: z.coerce.boolean().optional()
  })
});

export const sauceListSchema = z.object({
  query: paginationQuerySchema.extend({
    includeInactive: z.coerce.boolean().optional()
  })
});

export const getSauceSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid sauce id")
  })
});

export const createSauceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Sauce name must be at least 2 characters").max(160),
    outputUnit: unitSchema,
    baseBatchQuantity: z.coerce.number().positive("Batch quantity must be greater than zero"),
    note: z.string().trim().max(500).optional(),
    ingredients: z.array(recipeIngredientSchema).min(1, "Please add at least one ingredient")
  })
});

export const updateSauceSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid sauce id")
  }),
  body: z
    .object({
      name: z.string().trim().min(2).max(160).optional(),
      baseBatchQuantity: z.coerce.number().positive().optional(),
      note: z.string().trim().max(500).optional(),
      isActive: z.boolean().optional(),
      ingredients: z.array(recipeIngredientSchema).min(1).optional()
    })
    .refine((value) => Object.keys(value).length > 0, "At least one field must be provided")
});

export const makeSauceBatchSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid sauce id")
  }),
  body: z.object({
    producedQuantity: z.coerce.number().positive("Produced quantity must be greater than zero"),
    note: z.string().trim().max(500).optional()
  })
});

export const getComboSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid combo id")
  })
});

export const createComboSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Combo name must be at least 2 characters").max(160),
    sellingPrice: z.coerce.number().min(0, "Selling price cannot be negative"),
    gstPercentage: z.coerce.number().min(0, "GST cannot be negative"),
    imageUrl: z.string().trim().max(1024).optional(),
    note: z.string().trim().max(500).optional(),
    items: z.array(comboItemSchema).min(1, "Please add at least one item")
  })
});

export const updateComboSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid combo id")
  }),
  body: z
    .object({
      name: z.string().trim().min(2).max(160).optional(),
      sellingPrice: z.coerce.number().min(0).optional(),
      gstPercentage: z.coerce.number().min(0).optional(),
      imageUrl: z.string().trim().max(1024).optional(),
      note: z.string().trim().max(500).optional(),
      isActive: z.boolean().optional(),
      items: z.array(comboItemSchema).min(1).optional()
    })
    .refine((value) => Object.keys(value).length > 0, "At least one field must be provided")
});

export const deleteComboSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid combo id")
  })
});
