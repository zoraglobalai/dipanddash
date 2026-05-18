import { Router } from "express";

import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeAnyModuleAccess } from "../../middlewares/module-access.middleware";
import { purchaseBulkUpload } from "../procurement/procurement-bulk-upload.middleware";
import { ProductConsumptionController } from "./product-consumption.controller";

const router = Router();
const controller = new ProductConsumptionController();
const authorizeSnookerProducts = authorizeAnyModuleAccess("gaming", "purchase", "stock-audit");

router.use(authenticate);

router.get("/", authorizeSnookerProducts, asyncHandler(controller.list));
router.post("/", authorizeSnookerProducts, asyncHandler(controller.create));
router.get("/bulk/template", authorizeSnookerProducts, asyncHandler(controller.downloadTemplate));
router.post("/bulk/import", authorizeSnookerProducts, purchaseBulkUpload.single("file"), asyncHandler(controller.importFile));
router.get("/bulk/history", authorizeSnookerProducts, asyncHandler(controller.listHistory));
router.delete("/bulk/history/:id", authorizeSnookerProducts, asyncHandler(controller.deleteHistory));

export const productConsumptionRoutes = router;
