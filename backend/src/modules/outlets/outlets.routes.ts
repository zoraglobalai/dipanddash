import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { OutletsController } from "./outlets.controller";
import { createOutletSchema, outletListSchema, updateOutletSchema } from "./outlets.validation";

const router = Router();
const outletsController = new OutletsController();

router.use(authenticate);
router.use(authorizeRoles(UserRole.ADMIN));

router.get("/", validateRequest(outletListSchema), asyncHandler(outletsController.listOutlets));
router.post("/", validateRequest(createOutletSchema), asyncHandler(outletsController.createOutlet));
router.patch("/:id", validateRequest(updateOutletSchema), asyncHandler(outletsController.updateOutlet));

export const outletsRoutes = router;
