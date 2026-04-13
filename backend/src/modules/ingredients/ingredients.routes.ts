import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { authorizeAnyModuleAccess, authorizeModuleAccess } from "../../middlewares/module-access.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { IngredientsController } from "./ingredients.controller";
import { ingredientBulkUpload } from "./ingredients-upload.middleware";
import {
  addIngredientStockSchema,
  adjustIngredientStockSchema,
  allocationStatsSchema,
  closingReportListSchema,
  closingStatusSchema,
  createIngredientCategorySchema,
  createIngredientSchema,
  deleteIngredientCategorySchema,
  deleteIngredientSchema,
  ingredientCategoryListSchema,
  ingredientListSchema,
  ingredientStockSchema,
  reopenClosingReportSchema,
  stockAuditSchema,
  submitClosingReportSchema,
  updatePosBillingControlSchema,
  updateIngredientCategorySchema,
  updateIngredientSchema
} from "./ingredients.validation";

const router = Router();
const ingredientsController = new IngredientsController();

router.use(authenticate);

router.get(
  "/pos-billing-control",
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.STAFF, UserRole.SNOOKER_STAFF),
  asyncHandler(ingredientsController.getPosBillingControl)
);
router.get(
  "/closing/status",
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.STAFF, UserRole.SNOOKER_STAFF),
  validateRequest(closingStatusSchema),
  asyncHandler(ingredientsController.getClosingStatus)
);
router.post(
  "/closing/reports",
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.STAFF, UserRole.SNOOKER_STAFF),
  validateRequest(submitClosingReportSchema),
  asyncHandler(ingredientsController.submitClosingReport)
);
router.get(
  "/closing/reports",
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.STAFF, UserRole.SNOOKER_STAFF),
  validateRequest(closingReportListSchema),
  asyncHandler(ingredientsController.listClosingReports)
);

router.use(authorizeRoles(UserRole.ADMIN));

router.patch(
  "/pos-billing-control",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(updatePosBillingControlSchema),
  asyncHandler(ingredientsController.updatePosBillingControl)
);
router.get(
  "/stock-audit",
  authorizeModuleAccess("stock-audit"),
  validateRequest(stockAuditSchema),
  asyncHandler(ingredientsController.getStockAudit)
);
router.post(
  "/closing/reports/:id/reopen",
  authorizeModuleAccess("stock-audit"),
  validateRequest(reopenClosingReportSchema),
  asyncHandler(ingredientsController.reopenClosingReport)
);
router.get(
  "/bulk/template",
  authorizeModuleAccess("ingredient-entry"),
  asyncHandler(ingredientsController.downloadBulkTemplate)
);
router.post(
  "/bulk/import",
  authorizeModuleAccess("ingredient-entry"),
  ingredientBulkUpload.single("file"),
  asyncHandler(ingredientsController.bulkImportIngredients)
);

router.get(
  "/categories",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(ingredientCategoryListSchema),
  asyncHandler(ingredientsController.listCategories)
);
router.post(
  "/categories",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(createIngredientCategorySchema),
  asyncHandler(ingredientsController.createCategory)
);
router.patch(
  "/categories/:id",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(updateIngredientCategorySchema),
  asyncHandler(ingredientsController.updateCategory)
);
router.delete(
  "/categories/:id",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(deleteIngredientCategorySchema),
  asyncHandler(ingredientsController.deleteCategory)
);

router.get(
  "/",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(ingredientListSchema),
  asyncHandler(ingredientsController.listIngredients)
);
router.post(
  "/",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(createIngredientSchema),
  asyncHandler(ingredientsController.createIngredient)
);
router.patch(
  "/:id",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(updateIngredientSchema),
  asyncHandler(ingredientsController.updateIngredient)
);
router.delete(
  "/:id",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(deleteIngredientSchema),
  asyncHandler(ingredientsController.deleteIngredient)
);

router.get(
  "/allocations/stats",
  authorizeAnyModuleAccess("ingredient-entry", "dashboard"),
  validateRequest(allocationStatsSchema),
  asyncHandler(ingredientsController.getAllocationStats)
);

router.get(
  "/:id/stock",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(ingredientStockSchema),
  asyncHandler(ingredientsController.getIngredientStock)
);
router.post(
  "/:id/stock/add",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(addIngredientStockSchema),
  asyncHandler(ingredientsController.addStock)
);
router.post(
  "/:id/stock/adjust",
  authorizeModuleAccess("ingredient-entry"),
  validateRequest(adjustIngredientStockSchema),
  asyncHandler(ingredientsController.adjustStock)
);

export const ingredientsRoutes = router;
