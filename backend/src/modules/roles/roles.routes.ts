import { Router } from "express";

import { UserRole } from "../../constants/roles";
import { authenticate, authorizeRoles } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../middlewares/async-handler";
import { RolesController } from "./roles.controller";

const router = Router();
const rolesController = new RolesController();

router.get("/", authenticate, authorizeRoles(UserRole.ADMIN), asyncHandler(rolesController.list));

export const rolesRoutes = router;

