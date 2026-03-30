import { settingsRepository } from "@/db/repositories/settings.repository";

const ACCESS_TOKEN_KEY = "desktop_access_token";
const REFRESH_TOKEN_KEY = "desktop_refresh_token";

type DesktopTokens = {
  accessToken: string;
  refreshToken: string;
};

let accessTokenMemory: string | null = null;

export const desktopTokenService = {
  async setTokens(tokens: DesktopTokens) {
    accessTokenMemory = tokens.accessToken;
    await settingsRepository.set(ACCESS_TOKEN_KEY, tokens.accessToken);
    await settingsRepository.set(REFRESH_TOKEN_KEY, tokens.refreshToken);
  },

  async clearTokens() {
    accessTokenMemory = null;
    await settingsRepository.set(ACCESS_TOKEN_KEY, "");
    await settingsRepository.set(REFRESH_TOKEN_KEY, "");
  },

  async getAccessToken() {
    if (accessTokenMemory) {
      return accessTokenMemory;
    }
    const token = await settingsRepository.get(ACCESS_TOKEN_KEY);
    accessTokenMemory = token || null;
    return accessTokenMemory;
  },

  async getRefreshToken() {
    const token = await settingsRepository.get(REFRESH_TOKEN_KEY);
    return token || null;
  }
};

