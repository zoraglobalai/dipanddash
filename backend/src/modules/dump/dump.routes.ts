import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { DumpController } from "./dump.controller";
import { createDumpEntrySchema, dumpAdminRecordsSchema, dumpAdminStatsSchema } from "./dump.validation";

const router = Router();
const dumpController = new DumpController();

router.use(authenticate);

router.get(
  "/options",
  authorizeRoles(UserRole.ADMIN, UserRole.STAFF),
  asyncHandler(dumpController.getEntryOptions)
);

router.post(
  "/entries",
  authorizeRoles(UserRole.ADMIN, UserRole.STAFF),
  validateRequest(createDumpEntrySchema),
  asyncHandler(dumpController.createEntry)
);

router.get(
  "/admin/records",
  authorizeRoles(UserRole.ADMIN),
  validateRequest(dumpAdminRecordsSchema),
  asyncHandler(dumpController.listAdminRecords)
);

router.get(
  "/admin/stats",
  authorizeRoles(UserRole.ADMIN),
  validateRequest(dumpAdminStatsSchema),
  asyncHandler(dumpController.getAdminStats)
);

export const dumpRoutes = router;
