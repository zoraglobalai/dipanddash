import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { authenticate, authorizeRoles, authorizeSuperAdminOnly } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../middlewares/async-handler";
import { authorizeAnyModuleAccess, authorizeModuleAccess } from "../../middlewares/module-access.middleware";
import { DashboardController } from "./dashboard.controller";

const router = Router();
const dashboardController = new DashboardController();

router.use(authenticate);

router.get(
  "/admin",
  authorizeRoles(UserRole.ADMIN),
  authorizeSuperAdminOnly,
  authorizeModuleAccess("dashboard"),
  asyncHandler(dashboardController.getAdminDashboard)
);
router.get(
  "/sales-stats",
  authorizeRoles(UserRole.ADMIN),
  authorizeAnyModuleAccess("sales-statics", "dashboard"),
  asyncHandler(dashboardController.getSalesStats)
);
router.get("/staff", asyncHandler(dashboardController.getStaffDashboard));

export const dashboardRoutes = router;
