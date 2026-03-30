import { Navigate } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { APP_ROUTES } from "@/constants/routes";
import { UserRole } from "@/types/role";

export const IndexRedirect = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to={APP_ROUTES.LOGIN} replace />;
  }

  if (user.role !== UserRole.ADMIN) {
    return <Navigate to={APP_ROUTES.LOGIN} replace />;
  }

  return <Navigate to={APP_ROUTES.ADMIN_DASHBOARD} replace />;
};
