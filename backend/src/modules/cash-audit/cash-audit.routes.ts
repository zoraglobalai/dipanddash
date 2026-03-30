import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { CashAuditController } from "./cash-audit.controller";
import {
  cashAuditAdminListSchema,
  cashAuditAdminStatsSchema,
  cashAuditStaffExpectedSchema,
  cashAuditStaffLastSchema,
  createCashAuditEntrySchema
} from "./cash-audit.validation";

const router = Router();
const cashAuditController = new CashAuditController();

router.use(authenticate);

router.get(
  "/staff/last",
  authorizeRoles(UserRole.ADMIN, UserRole.STAFF, UserRole.SNOOKER_STAFF),
  validateRequest(cashAuditStaffLastSchema),
  asyncHandler(cashAuditController.getStaffLastAuditInfo)
);

router.get(
  "/staff/expected",
  authorizeRoles(UserRole.ADMIN, UserRole.STAFF, UserRole.SNOOKER_STAFF),
  validateRequest(cashAuditStaffExpectedSchema),
  asyncHandler(cashAuditController.getStaffExpectedBreakdown)
);

router.post(
  "/entries",
  authorizeRoles(UserRole.ADMIN, UserRole.STAFF, UserRole.SNOOKER_STAFF),
  validateRequest(createCashAuditEntrySchema),
  asyncHandler(cashAuditController.createEntry)
);

router.get(
  "/admin/records",
  authorizeRoles(UserRole.ADMIN),
  validateRequest(cashAuditAdminListSchema),
  asyncHandler(cashAuditController.listAdminRecords)
);

router.get(
  "/admin/stats",
  authorizeRoles(UserRole.ADMIN),
  validateRequest(cashAuditAdminStatsSchema),
  asyncHandler(cashAuditController.getAdminStats)
);

export const cashAuditRoutes = router;
