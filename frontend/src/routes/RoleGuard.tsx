import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { APP_ROUTES } from "@/constants/routes";
import { UserRole } from "@/types/role";

type RoleGuardProps = {
  allow: UserRole[];
};

export const RoleGuard = ({ allow }: RoleGuardProps) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to={APP_ROUTES.LOGIN} replace />;
  }

  if (!allow.includes(user.role)) {
    const fallback = user.role === UserRole.ADMIN ? APP_ROUTES.ADMIN_DASHBOARD : APP_ROUTES.LOGIN;
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
};
