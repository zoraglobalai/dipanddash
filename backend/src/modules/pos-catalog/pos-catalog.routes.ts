import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { PosCatalogController } from "./pos-catalog.controller";
import { posCatalogSnapshotSchema } from "./pos-catalog.validation";

const router = Router();
const posCatalogController = new PosCatalogController();

router.use(
  authenticate,
  authorizeRoles(
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.STAFF,
    UserRole.SNOOKER_STAFF
  )
);

router.get(
  "/snapshot",
  validateRequest(posCatalogSnapshotSchema),
  asyncHandler(posCatalogController.getSnapshot)
);

export const posCatalogRoutes = router;

