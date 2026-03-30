import { NextFunction, Request, Response } from "express";

import { AUTH_MESSAGES } from "../constants/auth";
import { UserRole } from "../constants/roles";
import { AppError } from "../errors/app-error";
import { UserService } from "../modules/users/user.service";
import { env } from "../config/env";
import { TokenService } from "../modules/auth/token.service";

const userService = new UserService();
const tokenService = new TokenService();

const extractAccessToken = (req: Request): string | null => {
  const cookieToken =
    req.cookies?.[env.ACCESS_COOKIE_NAME] ?? req.cookies?.[env.AUTH_COOKIE_NAME] ?? null;

  if (cookieToken) {
    return cookieToken;
  }

  const authorizationHeader = req.headers.authorization;
  if (!authorizationHeader) {
    return null;
  }

  const [type, token] = authorizationHeader.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractAccessToken(req);

  if (!token) {
    return next(new AppError(401, AUTH_MESSAGES.UNAUTHORIZED));
  }

  const payload = tokenService.verifyAccessToken(token);

  if (!payload || payload.tokenType !== "access") {
    return next(new AppError(401, AUTH_MESSAGES.UNAUTHORIZED));
  }

  let user: Awaited<ReturnType<UserService["findById"]>>;
  try {
    user = await userService.findById(payload.sub);
  } catch {
    return next(new AppError(401, AUTH_MESSAGES.UNAUTHORIZED));
  }
  if (!user.isActive) {
    return next(new AppError(403, "Your account is inactive. Please contact an administrator."));
  }

  req.user = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    assignedReports: user.assignedReports ?? [],
    assignedModules: user.assignedModules ?? []
  };

  return next();
};

export const authorizeRoles =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return next(new AppError(403, AUTH_MESSAGES.FORBIDDEN));
    }

    return next();
  };
