import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { StaffController } from "./staff.controller";
import {
  createStaffSchema,
  resetStaffPasswordSchema,
  staffListQuerySchema,
  updateStaffSchema,
  updateStaffStatusSchema
} from "./staff.validation";

const router = Router();
const staffController = new StaffController();

router.use(authenticate, authorizeRoles(UserRole.ADMIN));

router.get("/", validateRequest(staffListQuerySchema), asyncHandler(staffController.list));
router.post("/", validateRequest(createStaffSchema), asyncHandler(staffController.create));
router.patch("/:id", validateRequest(updateStaffSchema), asyncHandler(staffController.update));
router.patch(
  "/:id/status",
  validateRequest(updateStaffStatusSchema),
  asyncHandler(staffController.updateStatus)
);
router.patch(
  "/:id/reset-password",
  validateRequest(resetStaffPasswordSchema),
  asyncHandler(staffController.resetPassword)
);

export const staffRoutes = router;
