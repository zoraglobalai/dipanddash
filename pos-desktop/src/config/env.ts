const readEnv = (key: string, fallback: string) => {
  const value = import.meta.env[key as keyof ImportMetaEnv];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
};

export const env = {
  apiBaseUrl: readEnv("VITE_API_BASE_URL", "http://localhost:5000/api"),
  clientType: readEnv("VITE_CLIENT_TYPE", "desktop"),
  deviceId: readEnv("VITE_DEVICE_ID", `desktop-${Math.random().toString(36).slice(2, 10)}`),
  branchId: readEnv("VITE_BRANCH_ID", "main")
} as const;

