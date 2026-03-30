import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { OffersController } from "./offers.controller";
import {
  createCouponSchema,
  deleteCouponSchema,
  getCouponSchema,
  getMetaItemsSchema,
  listCouponsSchema,
  listCouponUsagesSchema,
  updateCouponSchema,
  updateCouponStatusSchema
} from "./offers.validation";

const router = Router();
const offersController = new OffersController();

router.use(authenticate, authorizeRoles(UserRole.ADMIN));

router.get("/stats", asyncHandler(offersController.getStats));
router.get("/meta/item-categories", asyncHandler(offersController.getMetaItemCategories));
router.get("/meta/items", validateRequest(getMetaItemsSchema), asyncHandler(offersController.getMetaItems));

router.get("/coupons", validateRequest(listCouponsSchema), asyncHandler(offersController.listCoupons));
router.get("/coupons/:id", validateRequest(getCouponSchema), asyncHandler(offersController.getCoupon));
router.post("/coupons", validateRequest(createCouponSchema), asyncHandler(offersController.createCoupon));
router.patch("/coupons/:id", validateRequest(updateCouponSchema), asyncHandler(offersController.updateCoupon));
router.patch(
  "/coupons/:id/status",
  validateRequest(updateCouponStatusSchema),
  asyncHandler(offersController.updateCouponStatus)
);
router.delete(
  "/coupons/:id",
  validateRequest(deleteCouponSchema),
  asyncHandler(offersController.deleteCoupon)
);
router.get(
  "/coupons/:id/usages",
  validateRequest(listCouponUsagesSchema),
  asyncHandler(offersController.listCouponUsages)
);

export const offersRoutes = router;

