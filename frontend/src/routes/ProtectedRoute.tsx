import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { APP_ROUTES } from "@/constants/routes";
import { FullPageLoader } from "@/components/feedback/FullPageLoader";

export const ProtectedRoute = () => {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return <FullPageLoader message="Restoring your session..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to={APP_ROUTES.LOGIN} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
};

