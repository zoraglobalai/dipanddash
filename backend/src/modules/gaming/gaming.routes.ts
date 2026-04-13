import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import {
  authorizeScopedAdminAnyModuleAccess,
  authorizeScopedAdminModuleAccess
} from "../../middlewares/module-access.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { GamingController } from "./gaming.controller";
import {
  gamingCheckoutSchema,
  gamingCreateSchema,
  gamingListSchema,
  gamingPaymentSchema,
  gamingStatsSchema,
  gamingUpdateSchema
} from "./gaming.validation";

const router = Router();
const gamingController = new GamingController();

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
  "/bookings",
  authorizeScopedAdminModuleAccess("gaming"),
  validateRequest(gamingListSchema),
  asyncHandler(gamingController.listBookings)
);
router.get(
  "/stats",
  authorizeScopedAdminAnyModuleAccess("gaming", "dashboard"),
  validateRequest(gamingStatsSchema),
  asyncHandler(gamingController.getStats)
);
router.get("/resources", authorizeScopedAdminModuleAccess("gaming"), asyncHandler(gamingController.getResources));
router.post(
  "/bookings",
  authorizeScopedAdminModuleAccess("gaming"),
  validateRequest(gamingCreateSchema),
  asyncHandler(gamingController.createBooking)
);
router.patch(
  "/bookings/:id",
  authorizeScopedAdminModuleAccess("gaming"),
  validateRequest(gamingUpdateSchema),
  asyncHandler(gamingController.updateBooking)
);
router.patch(
  "/bookings/:id/checkout",
  authorizeScopedAdminModuleAccess("gaming"),
  validateRequest(gamingCheckoutSchema),
  asyncHandler(gamingController.checkoutBooking)
);
router.patch(
  "/bookings/:id/payment-status",
  authorizeScopedAdminModuleAccess("gaming"),
  validateRequest(gamingPaymentSchema),
  asyncHandler(gamingController.updatePaymentStatus)
);

export const gamingRoutes = router;
