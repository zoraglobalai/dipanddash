import { Navigate } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { APP_ROUTES } from "@/constants/routes";
import { getFirstAccessibleAdminRoute } from "@/utils/access";

export const IndexRedirect = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to={APP_ROUTES.LOGIN} replace />;
  }

  return <Navigate to={getFirstAccessibleAdminRoute(user)} replace />;
};
