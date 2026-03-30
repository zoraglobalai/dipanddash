import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { OutletTransfersController } from "./outlet-transfers.controller";
import { createTransferSchema, transferListSchema, transferOptionsSchema } from "./outlet-transfers.validation";

const router = Router();
const outletTransfersController = new OutletTransfersController();

router.use(authenticate);
router.use(authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF, UserRole.SNOOKER_STAFF));

router.get("/options", validateRequest(transferOptionsSchema), asyncHandler(outletTransfersController.getOptions));
router.get("/records", validateRequest(transferListSchema), asyncHandler(outletTransfersController.listTransfers));
router.post("/", validateRequest(createTransferSchema), asyncHandler(outletTransfersController.createTransfer));

export const outletTransfersRoutes = router;
