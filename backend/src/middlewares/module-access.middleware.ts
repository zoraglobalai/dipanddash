import { NextFunction, Request, Response } from "express";

import { UserRole } from "../constants/roles";
import { AUTH_MESSAGES } from "../constants/auth";
import { AppError } from "../errors/app-error";

const hasAssignedModule = (req: Request, moduleKey: string) => {
  if (moduleKey === "dashboard") {
    return req.user?.isSuperAdmin === true;
  }

  const assignedModules = req.user?.assignedModules ?? [];

  if (req.user?.role === UserRole.ADMIN) {
    if (!assignedModules.length) {
      return true;
    }
    return assignedModules.includes(moduleKey);
  }

  if (moduleKey === "purchase" && req.user?.role === UserRole.SNOOKER_STAFF) {
    return false;
  }

  return assignedModules.includes(moduleKey);
};

const hasAnyAssignedModule = (req: Request, moduleKeys: string[]) => moduleKeys.some((moduleKey) => hasAssignedModule(req, moduleKey));

const hasScopedAdminModule = (req: Request, moduleKey: string) => {
  if (moduleKey === "dashboard") {
    return req.user?.isSuperAdmin === true;
  }

  if (req.user?.role !== UserRole.ADMIN) {
    return true;
  }

  const assignedModules = req.user?.assignedModules ?? [];
  if (!assignedModules.length) {
    return true;
  }

  return assignedModules.includes(moduleKey);
};

const hasScopedAdminAnyModule = (req: Request, moduleKeys: string[]) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return true;
  }

  const assignedModules = req.user?.assignedModules ?? [];
  if (!assignedModules.length) {
    return true;
  }

  return moduleKeys.some((moduleKey) => assignedModules.includes(moduleKey));
};

export const authorizeModuleAccess =
  (moduleKey: string) => (req: Request, _res: Response, next: NextFunction) => {
    if (hasAssignedModule(req, moduleKey)) {
      return next();
    }

    return next(new AppError(403, AUTH_MESSAGES.FORBIDDEN));
  };

export const authorizeAnyModuleAccess =
  (...moduleKeys: string[]) => (req: Request, _res: Response, next: NextFunction) => {
    if (hasAnyAssignedModule(req, moduleKeys)) {
      return next();
    }

    return next(new AppError(403, AUTH_MESSAGES.FORBIDDEN));
  };

export const authorizeScopedAdminModuleAccess =
  (moduleKey: string) => (req: Request, _res: Response, next: NextFunction) => {
    if (hasScopedAdminModule(req, moduleKey)) {
      return next();
    }

    return next(new AppError(403, AUTH_MESSAGES.FORBIDDEN));
  };

export const authorizeScopedAdminAnyModuleAccess =
  (...moduleKeys: string[]) => (req: Request, _res: Response, next: NextFunction) => {
    if (hasScopedAdminAnyModule(req, moduleKeys)) {
      return next();
    }

    return next(new AppError(403, AUTH_MESSAGES.FORBIDDEN));
  };
