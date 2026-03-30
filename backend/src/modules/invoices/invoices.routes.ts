import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { InvoicesController } from "./invoices.controller";
import {
  cancelInvoiceSchema,
  createInvoiceFromSyncSchema,
  invoiceIdSchema,
  invoiceListSchema,
  invoiceStatsSchema,
  refundInvoiceSchema,
  updateKitchenStatusSchema
} from "./invoices.validation";

const router = Router();
const invoicesController = new InvoicesController();

router.use(authenticate);

router.get("/stats", validateRequest(invoiceStatsSchema), asyncHandler(invoicesController.getStats));
router.get("/", validateRequest(invoiceListSchema), asyncHandler(invoicesController.list));
router.get("/:id", validateRequest(invoiceIdSchema), asyncHandler(invoicesController.getById));

router.post(
  "/sync-upsert",
  authorizeRoles(
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.STAFF,
    UserRole.SNOOKER_STAFF
  ),
  validateRequest(createInvoiceFromSyncSchema),
  asyncHandler(invoicesController.createFromSync)
);

router.post(
  "/:id/cancel",
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateRequest(cancelInvoiceSchema),
  asyncHandler(invoicesController.cancel)
);

router.post(
  "/:id/refund",
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateRequest(refundInvoiceSchema),
  asyncHandler(invoicesController.refund)
);

router.post(
  "/:id/kitchen-status",
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateRequest(updateKitchenStatusSchema),
  asyncHandler(invoicesController.updateKitchenStatus)
);

export const invoicesRoutes = router;
