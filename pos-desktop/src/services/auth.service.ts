import { apiClient } from "@/lib/api-client";
import { desktopTokenService } from "@/services/desktop-token.service";
import type { StaffSession } from "@/types/pos";

type LoginPayload = {
  username: string;
  password: string;
};

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

type UserResponse = {
  user: {
    id: string;
    username: string;
    fullName: string;
    role: string;
    assignedReports?: string[];
    assignedModules?: string[];
  };
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
};

const allowedDesktopRoles = new Set(["staff", "snooker_staff", "admin"]);

let sessionMemory: StaffSession | null = null;

const isAllowedDesktopSession = (session: StaffSession) => {
  if (!allowedDesktopRoles.has(session.role)) {
    return false;
  }

  // Scoped admin accounts are intended for admin frontend only.
  if (session.role === "admin" && session.assignedModules.length > 0) {
    return false;
  }

  return true;
};

const toSession = (user: UserResponse["user"]): StaffSession => ({
  userId: user.id,
  username: user.username,
  fullName: user.fullName,
  role: user.role,
  assignedReports: user.assignedReports ?? [],
  assignedModules: user.assignedModules ?? []
});

const persistSession = async (session: StaffSession) => {
  sessionMemory = session;
};

const clearPersistedSession = async () => {
  sessionMemory = null;
  await desktopTokenService.clearTokens();
};

const readPersistedSession = async (): Promise<StaffSession | null> => sessionMemory;

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T | null> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = window.setTimeout(() => resolve(null), ms);
      })
    ]);
  } finally {
    if (timer) {
      window.clearTimeout(timer);
    }
  }
};

export const authService = {
  async login(payload: LoginPayload) {
    const response = await apiClient.post<ApiSuccess<UserResponse>>("/auth/login", payload, {
      headers: {
        "X-Skip-Auth-Handler": "true",
        "X-Skip-Auth-Refresh": "true"
      }
    });

    const session = toSession(response.data.data.user);
    if (!isAllowedDesktopSession(session)) {
      await this.logout();
      throw new Error("This account is not allowed in staff desktop POS.");
    }

    await persistSession(session);
    if (response.data.data.tokens?.accessToken && response.data.data.tokens?.refreshToken) {
      await desktopTokenService.setTokens({
        accessToken: response.data.data.tokens.accessToken,
        refreshToken: response.data.data.tokens.refreshToken
      });
    }
    return {
      session
    };
  },

  async me() {
    const response = await apiClient.get<ApiSuccess<UserResponse>>("/auth/me");
    const session = toSession(response.data.data.user);
    if (!isAllowedDesktopSession(session)) {
      await this.logout();
      throw new Error("This account is not allowed in staff desktop POS.");
    }
    await persistSession(session);
    if (response.data.data.tokens?.accessToken && response.data.data.tokens?.refreshToken) {
      await desktopTokenService.setTokens({
        accessToken: response.data.data.tokens.accessToken,
        refreshToken: response.data.data.tokens.refreshToken
      });
    }
    return {
      session
    };
  },

  async refresh() {
    const refreshToken = await desktopTokenService.getRefreshToken();
    const response = await apiClient.post<ApiSuccess<UserResponse>>(
      "/auth/refresh",
      refreshToken ? { refreshToken } : {},
      {
        headers: {
          "X-Skip-Auth-Refresh": "true",
          "X-Skip-Auth-Handler": "true"
        }
      }
    );
    const session = toSession(response.data.data.user);
    if (response.data.data.tokens?.accessToken && response.data.data.tokens?.refreshToken) {
      await desktopTokenService.setTokens({
        accessToken: response.data.data.tokens.accessToken,
        refreshToken: response.data.data.tokens.refreshToken
      });
    }
    await persistSession(session);
    return {
      session
    };
  },

  async logout() {
    const refreshToken = await desktopTokenService.getRefreshToken();
    await apiClient.post(
      "/auth/logout",
      refreshToken ? { refreshToken } : {},
      {
        headers: {
          "X-Skip-Auth-Handler": "true",
          "X-Skip-Auth-Refresh": "true"
        }
      }
    );
    await clearPersistedSession();
  },

  async getPersistedSession() {
    return readPersistedSession();
  },

  async clearPersistedSession() {
    await clearPersistedSession();
  },

  async resolveBootSession() {
    try {
      const result = await withTimeout(this.me(), 5000);
      if (!result) {
        return { session: null, isOfflineSession: false as const };
      }

      return {
        session: result.session,
        isOfflineSession: false as const
      };
    } catch {
      const persisted = await withTimeout(readPersistedSession(), 500);
      return { session: persisted, isOfflineSession: false as const };
    }
  }
};
