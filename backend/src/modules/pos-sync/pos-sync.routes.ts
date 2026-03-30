import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { PosSyncController } from "./pos-sync.controller";
import { syncBatchSchema, syncStatusSchema } from "./pos-sync.validation";

const router = Router();
const posSyncController = new PosSyncController();

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

router.post("/batch", validateRequest(syncBatchSchema), asyncHandler(posSyncController.syncBatch));
router.get("/status", validateRequest(syncStatusSchema), asyncHandler(posSyncController.getSyncStatus));

export const posSyncRoutes = router;

