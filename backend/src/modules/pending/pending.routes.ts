import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { authorizeScopedAdminAnyModuleAccess } from "../../middlewares/module-access.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { PendingController } from "./pending.controller";
import {
  collectPendingAmountSchema,
  pendingCustomerDetailsSchema,
  pendingCustomersListSchema
} from "./pending.validation";

const router = Router();
const pendingController = new PendingController();

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

router.get(
  "/customers",
  authorizeScopedAdminAnyModuleAccess("pending", "orders", "invoices", "gaming"),
  validateRequest(pendingCustomersListSchema),
  asyncHandler(pendingController.listCustomers)
);

router.get(
  "/customer-details",
  authorizeScopedAdminAnyModuleAccess("pending", "orders", "invoices", "gaming"),
  validateRequest(pendingCustomerDetailsSchema),
  asyncHandler(pendingController.getCustomerDetails)
);

router.post(
  "/collect",
  authorizeScopedAdminAnyModuleAccess("pending", "orders", "invoices", "gaming"),
  validateRequest(collectPendingAmountSchema),
  asyncHandler(pendingController.collectPendingAmount)
);

export const pendingRoutes = router;

