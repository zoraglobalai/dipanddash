const readEnv = (key: string, fallback: string) => {
  const value = import.meta.env[key as keyof ImportMetaEnv];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
};

const readBooleanEnv = (key: string, fallback: boolean) => {
  const value = import.meta.env[key as keyof ImportMetaEnv];
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
};

const productionApiBaseUrl = "https://dipanddash-yc72.vercel.app/api";

export const env = {
  apiBaseUrl: readEnv(
    "VITE_API_BASE_URL",
    import.meta.env.PROD ? productionApiBaseUrl : "http://localhost:5000/api"
  ),
  clientType: readEnv("VITE_CLIENT_TYPE", "desktop"),
  deviceId: readEnv("VITE_DEVICE_ID", `desktop-${Math.random().toString(36).slice(2, 10)}`),
  branchId: readEnv("VITE_BRANCH_ID", "main"),
  enableBackgroundPolling: readBooleanEnv("VITE_ENABLE_BACKGROUND_POLLING", false)
} as const;
