type DesktopTokens = {
  accessToken: string;
  refreshToken: string;
};

let accessTokenMemory: string | null = null;
let refreshTokenMemory: string | null = null;

export const desktopTokenService = {
  async setTokens(tokens: DesktopTokens) {
    accessTokenMemory = tokens.accessToken;
    refreshTokenMemory = tokens.refreshToken;
  },

  async clearTokens() {
    accessTokenMemory = null;
    refreshTokenMemory = null;
  },

  async getAccessToken() {
    return accessTokenMemory;
  },

  async getRefreshToken() {
    return refreshTokenMemory;
  }
};
