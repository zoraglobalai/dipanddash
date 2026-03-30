import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { CustomersController } from "./customers.controller";
import {
  createCustomerSchema,
  customerListSchema,
  customerStatsSchema,
  customerSearchByPhoneSchema,
  getCustomerSchema,
  updateCustomerSchema
} from "./customers.validation";

const router = Router();
const customersController = new CustomersController();

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
  "/stats",
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateRequest(customerStatsSchema),
  asyncHandler(customersController.stats)
);
router.get("/", validateRequest(customerListSchema), asyncHandler(customersController.list));
router.get(
  "/search",
  validateRequest(customerSearchByPhoneSchema),
  asyncHandler(customersController.searchByPhone)
);
router.get("/:id", validateRequest(getCustomerSchema), asyncHandler(customersController.getById));
router.post("/", validateRequest(createCustomerSchema), asyncHandler(customersController.create));
router.patch("/:id", validateRequest(updateCustomerSchema), asyncHandler(customersController.update));

export const customersRoutes = router;
