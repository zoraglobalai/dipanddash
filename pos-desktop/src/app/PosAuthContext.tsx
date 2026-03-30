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

import { authService } from "@/services/auth.service";
import { setAccessTokenProvider, setRefreshHandler, setUnauthorizedHandler } from "@/lib/api-client";
import { desktopTokenService } from "@/services/desktop-token.service";
import type { StaffSession } from "@/types/pos";

type PosAuthContextValue = {
  session: StaffSession | null;
  isBootstrapping: boolean;
  isOfflineSession: boolean;
  login: (payload: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const PosAuthContext = createContext<PosAuthContextValue | undefined>(undefined);

export const PosAuthProvider = ({ children }: PropsWithChildren) => {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isOfflineSession, setIsOfflineSession] = useState(false);
  const sessionRef = useRef<StaffSession | null>(null);

  const applySession = useCallback((nextSession: StaffSession | null, offline = false) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    setIsOfflineSession(offline);
  }, []);

  const refreshSession = useCallback(async () => {
    const result = await authService.refresh();
    applySession(result.session, false);
  }, [applySession]);

  const clearAndSignOut = useCallback(async () => {
    applySession(null, false);
    await authService.clearPersistedSession();
  }, [applySession]);

  const login = useCallback(
    async (payload: { username: string; password: string }) => {
      const result = await authService.login(payload);
      applySession(result.session, false);
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      await authService.clearPersistedSession();
    } finally {
      applySession(null, false);
    }
  }, [applySession]);

  useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true);
      try {
        const result = await authService.resolveBootSession();
        applySession(result.session, Boolean(result.isOfflineSession));
      } catch {
        applySession(null, false);
      } finally {
        setIsBootstrapping(false);
      }
    };
    void bootstrap();
  }, [applySession]);

  useEffect(() => {
    setAccessTokenProvider(() => desktopTokenService.getAccessToken());

    setRefreshHandler(async () => {
      await refreshSession();
    });

    setUnauthorizedHandler(() => {
      void clearAndSignOut();
    });

    return () => {
      setAccessTokenProvider(null);
      setRefreshHandler(null);
      setUnauthorizedHandler(null);
    };
  }, [clearAndSignOut, refreshSession]);

  const value = useMemo<PosAuthContextValue>(
    () => ({
      session,
      isBootstrapping,
      isOfflineSession,
      login,
      logout
    }),
    [isBootstrapping, isOfflineSession, login, logout, session]
  );

  return <PosAuthContext.Provider value={value}>{children}</PosAuthContext.Provider>;
};

export const usePosAuth = () => {
  const context = useContext(PosAuthContext);
  if (!context) {
    throw new Error("usePosAuth must be used inside PosAuthProvider");
  }
  return context;
};
