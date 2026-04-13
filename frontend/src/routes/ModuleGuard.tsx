import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { APP_ROUTES } from "@/constants/routes";
import type { AdminModuleKey } from "@/constants/modules";
import { useAuth } from "@/context/AuthContext";
import { getFirstAccessibleAdminRoute, hasAnyAdminModuleAccess } from "@/utils/access";

type ModuleGuardProps = {
  allow: AdminModuleKey[];
  children: ReactNode;
};

export const ModuleGuard = ({ allow, children }: ModuleGuardProps) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to={APP_ROUTES.LOGIN} replace />;
  }

  if (!hasAnyAdminModuleAccess(user, allow)) {
    return <Navigate to={getFirstAccessibleAdminRoute(user)} replace />;
  }

  return <>{children}</>;
};
