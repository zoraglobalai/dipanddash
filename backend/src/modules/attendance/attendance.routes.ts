import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { AttendanceController } from "./attendance.controller";
import {
  attendanceAdminQuerySchema,
  attendancePunchSchema,
  attendanceQuerySchema
} from "./attendance.validation";

const router = Router();
const attendanceController = new AttendanceController();

router.use(authenticate);

router.post("/punch-in", validateRequest(attendancePunchSchema), asyncHandler(attendanceController.punchIn));
router.post("/punch-out", validateRequest(attendancePunchSchema), asyncHandler(attendanceController.punchOut));
router.get("/my-records", validateRequest(attendanceQuerySchema), asyncHandler(attendanceController.getMyRecords));
router.get(
  "/admin-records",
  authorizeRoles(UserRole.ADMIN),
  validateRequest(attendanceAdminQuerySchema),
  asyncHandler(attendanceController.getAdminRecords)
);

export const attendanceRoutes = router;
