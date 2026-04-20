import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { authorizeModuleAccess } from "../../middlewares/module-access.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { itemBulkUpload } from "./items-bulk-upload.middleware";
import { ItemsController } from "./items.controller";
import { itemImageUpload } from "./items-upload.middleware";
import {
  addOnListSchema,
  comboListSchema,
  createAddOnSchema,
  createComboSchema,
  createItemCategorySchema,
  createItemSchema,
  createSauceSchema,
  deleteAddOnSchema,
  deleteComboSchema,
  deleteItemCategorySchema,
  deleteItemSchema,
  getSauceSchema,
  getAddOnSchema,
  getComboSchema,
  getItemSchema,
  itemCategoryListSchema,
  itemListSchema,
  makeSauceBatchSchema,
  sauceListSchema,
  updateAddOnSchema,
  updateComboSchema,
  updateItemCategorySchema,
  updateItemSchema,
  updateSauceSchema
} from "./items.validation";

const router = Router();
const itemsController = new ItemsController();

router.use(authenticate, authorizeRoles(UserRole.ADMIN), authorizeModuleAccess("items-entry"));

router.get("/meta/ingredients", asyncHandler(itemsController.getMetaIngredients));
router.get("/meta/categories", asyncHandler(itemsController.getMetaCategories));
router.get("/meta/units", asyncHandler(itemsController.getMetaUnits));
router.get("/meta/items", asyncHandler(itemsController.getMetaItems));
router.get("/meta/sauces", asyncHandler(itemsController.getMetaSauces));
router.post("/upload-image", itemImageUpload.single("image"), asyncHandler(itemsController.uploadImage));
router.get("/bulk/template", asyncHandler(itemsController.downloadItemBulkTemplate));
router.post("/bulk/import", itemBulkUpload.single("file"), asyncHandler(itemsController.bulkImportItems));

router.get("/categories", validateRequest(itemCategoryListSchema), asyncHandler(itemsController.listCategories));
router.post("/categories", validateRequest(createItemCategorySchema), asyncHandler(itemsController.createCategory));
router.patch(
  "/categories/:id",
  validateRequest(updateItemCategorySchema),
  asyncHandler(itemsController.updateCategory)
);
router.delete(
  "/categories/:id",
  validateRequest(deleteItemCategorySchema),
  asyncHandler(itemsController.deleteCategory)
);

router.get("/add-ons", validateRequest(addOnListSchema), asyncHandler(itemsController.listAddOns));
router.get("/add-ons/:id", validateRequest(getAddOnSchema), asyncHandler(itemsController.getAddOn));
router.post("/add-ons", validateRequest(createAddOnSchema), asyncHandler(itemsController.createAddOn));
router.patch("/add-ons/:id", validateRequest(updateAddOnSchema), asyncHandler(itemsController.updateAddOn));
router.delete("/add-ons/:id", validateRequest(deleteAddOnSchema), asyncHandler(itemsController.deleteAddOn));

router.get("/sauces", validateRequest(sauceListSchema), asyncHandler(itemsController.listSauces));
router.post("/sauces", validateRequest(createSauceSchema), asyncHandler(itemsController.createSauce));
router.post(
  "/sauces/:id/make-batch",
  validateRequest(makeSauceBatchSchema),
  asyncHandler(itemsController.makeSauceBatch)
);
router.get("/sauces/:id", validateRequest(getSauceSchema), asyncHandler(itemsController.getSauce));
router.patch("/sauces/:id", validateRequest(updateSauceSchema), asyncHandler(itemsController.updateSauce));
router.delete("/sauces/:id", validateRequest(getSauceSchema), asyncHandler(itemsController.deleteSauce));

router.get("/combos", validateRequest(comboListSchema), asyncHandler(itemsController.listCombos));
router.get("/combos/:id", validateRequest(getComboSchema), asyncHandler(itemsController.getCombo));
router.post("/combos", validateRequest(createComboSchema), asyncHandler(itemsController.createCombo));
router.patch("/combos/:id", validateRequest(updateComboSchema), asyncHandler(itemsController.updateCombo));
router.delete("/combos/:id", validateRequest(deleteComboSchema), asyncHandler(itemsController.deleteCombo));

router.get("/", validateRequest(itemListSchema), asyncHandler(itemsController.listItems));
router.get("/:id", validateRequest(getItemSchema), asyncHandler(itemsController.getItem));
router.post("/", validateRequest(createItemSchema), asyncHandler(itemsController.createItem));
router.patch("/:id", validateRequest(updateItemSchema), asyncHandler(itemsController.updateItem));
router.delete("/:id", validateRequest(deleteItemSchema), asyncHandler(itemsController.deleteItem));

export const itemsRoutes = router;
