import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
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

router.get("/bookings", validateRequest(gamingListSchema), asyncHandler(gamingController.listBookings));
router.get("/stats", validateRequest(gamingStatsSchema), asyncHandler(gamingController.getStats));
router.get("/resources", asyncHandler(gamingController.getResources));
router.post("/bookings", validateRequest(gamingCreateSchema), asyncHandler(gamingController.createBooking));
router.patch("/bookings/:id", validateRequest(gamingUpdateSchema), asyncHandler(gamingController.updateBooking));
router.patch(
  "/bookings/:id/checkout",
  validateRequest(gamingCheckoutSchema),
  asyncHandler(gamingController.checkoutBooking)
);
router.patch(
  "/bookings/:id/payment-status",
  validateRequest(gamingPaymentSchema),
  asyncHandler(gamingController.updatePaymentStatus)
);

export const gamingRoutes = router;
