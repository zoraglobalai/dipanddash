import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { AuthUser, LoginPayload } from "@/types/auth";
import { APP_ROUTES } from "@/constants/routes";
import { authService } from "@/services/auth.service";
import { setRefreshHandler, setUnauthorizedHandler } from "@/lib/api-client";
import { extractErrorMessage } from "@/utils/api-error";
import { useAppToast } from "@/hooks/useAppToast";

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: (options?: { skipToast?: boolean }) => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useAppToast();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const hasAnnouncedExpiry = useRef(false);
  const hasBootstrappedOnce = useRef(false);
  const bootstrappingRef = useRef(true);
  const userRef = useRef<AuthUser | null>(null);

  const clearAuthState = useCallback(() => {
    setUser(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const response = await authService.refresh();
    setUser(response.data.user);
    hasAnnouncedExpiry.current = false;
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      const response = await authService.me();
      if (response.data.user.role !== "admin") {
        await authService.logout();
        clearAuthState();
        return;
      }
      setUser(response.data.user);
      hasAnnouncedExpiry.current = false;
    } catch {
      clearAuthState();
    } finally {
      setIsBootstrapping(false);
      bootstrappingRef.current = false;
    }
  }, [clearAuthState]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const response = await authService.login(payload);
      if (response.data.user.role !== "admin") {
        await authService.logout();
        throw new Error("Staff login moved to POS Desktop. Please use the desktop app.");
      }
      setUser(response.data.user);
      hasAnnouncedExpiry.current = false;
      toast.success(response.message);
      navigate(APP_ROUTES.ADMIN_DASHBOARD, { replace: true });
    },
    [navigate, toast]
  );

  const logout = useCallback(
    async (options?: { skipToast?: boolean }) => {
      try {
        const response = await authService.logout();
        if (!options?.skipToast) {
          toast.success(response.message);
        }
      } catch (error) {
        if (!options?.skipToast) {
          toast.error(extractErrorMessage(error, "Unable to log out right now."));
        }
      } finally {
        clearAuthState();
        navigate(APP_ROUTES.LOGIN, { replace: true });
      }
    },
    [clearAuthState, navigate, toast]
  );

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const handleUnauthorized = useCallback(
    (message?: string) => {
      if (bootstrappingRef.current && !userRef.current) {
        return;
      }

      clearAuthState();
      if (!hasAnnouncedExpiry.current) {
        toast.warning(message ?? "Session expired. Please log in again.");
        hasAnnouncedExpiry.current = true;
      }
      if (location.pathname !== APP_ROUTES.LOGIN) {
        navigate(APP_ROUTES.LOGIN, { replace: true });
      }
    },
    [clearAuthState, location.pathname, navigate, toast]
  );

  useEffect(() => {
    setRefreshHandler(refreshSession);
    setUnauthorizedHandler(handleUnauthorized);

    return () => {
      setRefreshHandler(null);
      setUnauthorizedHandler(null);
    };
  }, [handleUnauthorized, refreshSession]);

  useEffect(() => {
    if (hasBootstrappedOnce.current) {
      return;
    }

    hasBootstrappedOnce.current = true;
    void restoreSession();
  }, [restoreSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isBootstrapping,
      login,
      logout,
      refreshSession
    }),
    [isBootstrapping, login, logout, refreshSession, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
