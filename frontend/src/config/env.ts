const envSchema = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
};

export const env = envSchema;

