import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../middlewares/async-handler";
import { DashboardController } from "./dashboard.controller";

const router = Router();
const dashboardController = new DashboardController();

router.use(authenticate);

router.get("/admin", authorizeRoles(UserRole.ADMIN), asyncHandler(dashboardController.getAdminDashboard));
router.get("/sales-stats", authorizeRoles(UserRole.ADMIN), asyncHandler(dashboardController.getSalesStats));
router.get("/staff", asyncHandler(dashboardController.getStaffDashboard));

export const dashboardRoutes = router;
