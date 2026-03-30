import { Router } from "express";

import { AuthController } from "./auth.controller";
import { authenticate } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { loginSchema } from "./auth.validation";
import { asyncHandler } from "../../middlewares/async-handler";
import { authRateLimiter } from "../../middlewares/rate-limiters";

const router = Router();
const authController = new AuthController();

router.post(
  "/login",
  authRateLimiter,
  validateRequest(loginSchema),
  asyncHandler(authController.login)
);
router.post("/refresh", asyncHandler(authController.refresh));
router.post("/logout", asyncHandler(authController.logout));
router.post("/logout-all", authenticate, asyncHandler(authController.logoutAll));
router.get("/me", authenticate, asyncHandler(authController.me));

export const authRoutes = router;
