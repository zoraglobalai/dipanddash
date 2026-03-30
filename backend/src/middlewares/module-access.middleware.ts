import { NextFunction, Request, Response } from "express";

import { UserRole } from "../constants/roles";
import { AUTH_MESSAGES } from "../constants/auth";
import { AppError } from "../errors/app-error";

const hasAssignedModule = (req: Request, moduleKey: string) => {
  if (req.user?.role === UserRole.ADMIN) {
    return true;
  }

  return (req.user?.assignedModules ?? []).includes(moduleKey);
};

export const authorizeModuleAccess =
  (moduleKey: string) => (req: Request, _res: Response, next: NextFunction) => {
    if (hasAssignedModule(req, moduleKey)) {
      return next();
    }

    return next(new AppError(403, AUTH_MESSAGES.FORBIDDEN));
  };
