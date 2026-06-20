const productionApiBaseUrl = "https://dipanddash-yc72.vercel.app/api";

const envSchema = {
  apiBaseUrl:
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.PROD ? productionApiBaseUrl : "http://localhost:5000/api")
};

export const env = envSchema;

