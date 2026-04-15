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
const authorizeIngredientModule = authorizeAnyModuleAccess("ingredient-entry", "additional-entry");

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
  authorizeIngredientModule,
  asyncHandler(ingredientsController.downloadBulkTemplate)
);
router.post(
  "/bulk/import",
  authorizeIngredientModule,
  ingredientBulkUpload.single("file"),
  asyncHandler(ingredientsController.bulkImportIngredients)
);

router.get(
  "/categories",
  authorizeIngredientModule,
  validateRequest(ingredientCategoryListSchema),
  asyncHandler(ingredientsController.listCategories)
);
router.post(
  "/categories",
  authorizeIngredientModule,
  validateRequest(createIngredientCategorySchema),
  asyncHandler(ingredientsController.createCategory)
);
router.patch(
  "/categories/:id",
  authorizeIngredientModule,
  validateRequest(updateIngredientCategorySchema),
  asyncHandler(ingredientsController.updateCategory)
);
router.delete(
  "/categories/:id",
  authorizeIngredientModule,
  validateRequest(deleteIngredientCategorySchema),
  asyncHandler(ingredientsController.deleteCategory)
);

router.get(
  "/",
  authorizeIngredientModule,
  validateRequest(ingredientListSchema),
  asyncHandler(ingredientsController.listIngredients)
);
router.post(
  "/",
  authorizeIngredientModule,
  validateRequest(createIngredientSchema),
  asyncHandler(ingredientsController.createIngredient)
);
router.patch(
  "/:id",
  authorizeIngredientModule,
  validateRequest(updateIngredientSchema),
  asyncHandler(ingredientsController.updateIngredient)
);
router.delete(
  "/:id",
  authorizeIngredientModule,
  validateRequest(deleteIngredientSchema),
  asyncHandler(ingredientsController.deleteIngredient)
);

router.get(
  "/allocations/stats",
  authorizeAnyModuleAccess("ingredient-entry", "additional-entry", "dashboard"),
  validateRequest(allocationStatsSchema),
  asyncHandler(ingredientsController.getAllocationStats)
);

router.get(
  "/:id/stock",
  authorizeIngredientModule,
  validateRequest(ingredientStockSchema),
  asyncHandler(ingredientsController.getIngredientStock)
);
router.post(
  "/:id/stock/add",
  authorizeIngredientModule,
  validateRequest(addIngredientStockSchema),
  asyncHandler(ingredientsController.addStock)
);
router.post(
  "/:id/stock/adjust",
  authorizeIngredientModule,
  validateRequest(adjustIngredientStockSchema),
  asyncHandler(ingredientsController.adjustStock)
);

export const ingredientsRoutes = router;
