import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { authorizeModuleAccess } from "../../middlewares/module-access.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { AssetsController } from "./assets.controller";
import { assetListSchema, createAssetSchema, deleteAssetSchema, updateAssetSchema } from "./assets.validation";

const router = Router();
const assetsController = new AssetsController();

router.use(authenticate);
router.use(authorizeRoles(UserRole.ADMIN));
router.use(authorizeModuleAccess("assets-entry"));

router.get("/", validateRequest(assetListSchema), asyncHandler(assetsController.listAssets));
router.post("/", validateRequest(createAssetSchema), asyncHandler(assetsController.createAsset));
router.patch("/:id", validateRequest(updateAssetSchema), asyncHandler(assetsController.updateAsset));
router.delete("/:id", validateRequest(deleteAssetSchema), asyncHandler(assetsController.deleteAsset));

export const assetsRoutes = router;
