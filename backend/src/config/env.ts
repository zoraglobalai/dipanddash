import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default("/api"),
  CLIENT_ORIGIN: z.string().optional(),
  CLIENT_ORIGINS: z.string().optional(),
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  ACCESS_TOKEN_SECRET: z.string().min(16).optional(),
  JWT_ACCESS_SECRET: z.string().min(16).optional(),
  REFRESH_TOKEN_SECRET: z.string().min(16).optional(),
  ACCESS_TOKEN_EXPIRES_IN: z.string().optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().optional(),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("14d"),
  ACCESS_COOKIE_NAME: z.string().optional(),
  AUTH_COOKIE_NAME: z.string().optional(),
  REFRESH_COOKIE_NAME: z.string().default("DND_REFRESH_TOKEN"),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }
      return value === "true";
    }),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).optional(),
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z.coerce.number().default(5432),
  DATABASE_USERNAME: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string(),
  SEED_ADMIN_USERNAME: z.string().min(3).optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_ADMIN_FULL_NAME: z.string().min(3).default("Admin User"),
  DATABASE_SSL: z
    .string()
    .optional()
    .transform((value) => value === "true")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(
    `Environment validation failed: ${JSON.stringify(parsedEnv.error.flatten().fieldErrors)}`
  );
}

const rawEnv = parsedEnv.data;
const isProduction = rawEnv.NODE_ENV === "production";

const parseOrigins = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const defaultDevOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5175",
  "http://127.0.0.1:5175",
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost"
];

const configuredOrigins = [
  ...parseOrigins(rawEnv.CLIENT_ORIGINS),
  ...(rawEnv.CLIENT_ORIGIN ? [rawEnv.CLIENT_ORIGIN.trim()] : []),
  ...(isProduction ? [] : defaultDevOrigins)
];

const clientOrigins = Array.from(new Set(configuredOrigins));

if (clientOrigins.length === 0) {
  throw new Error("Environment validation failed: at least one CLIENT_ORIGIN/CLIENT_ORIGINS value is required");
}

const accessTokenSecret = rawEnv.ACCESS_TOKEN_SECRET ?? rawEnv.JWT_ACCESS_SECRET;
if (!accessTokenSecret) {
  throw new Error("Environment validation failed: ACCESS_TOKEN_SECRET is required");
}
const refreshTokenSecret = rawEnv.REFRESH_TOKEN_SECRET ?? accessTokenSecret;
const accessTokenExpiresIn =
  rawEnv.ACCESS_TOKEN_EXPIRES_IN ?? rawEnv.JWT_ACCESS_EXPIRES_IN ?? "15m";
const accessCookieName = rawEnv.ACCESS_COOKIE_NAME ?? rawEnv.AUTH_COOKIE_NAME ?? "DND_ACCESS_TOKEN";
const cookieSecure = rawEnv.COOKIE_SECURE ?? isProduction;
const cookieSameSite = rawEnv.COOKIE_SAME_SITE ?? (cookieSecure ? "none" : "lax");

if (cookieSameSite === "none" && !cookieSecure) {
  throw new Error("Environment validation failed: COOKIE_SAME_SITE=none requires COOKIE_SECURE=true");
}

export const env = {
  ...rawEnv,
  CLIENT_ORIGIN: clientOrigins[0],
  CLIENT_ORIGINS: clientOrigins,
  ACCESS_TOKEN_SECRET: accessTokenSecret,
  REFRESH_TOKEN_SECRET: refreshTokenSecret,
  ACCESS_TOKEN_EXPIRES_IN: accessTokenExpiresIn,
  JWT_ACCESS_SECRET: accessTokenSecret,
  JWT_ACCESS_EXPIRES_IN: accessTokenExpiresIn,
  ACCESS_COOKIE_NAME: accessCookieName,
  AUTH_COOKIE_NAME: accessCookieName,
  COOKIE_SECURE: cookieSecure,
  COOKIE_SAME_SITE: cookieSameSite
};

export { isProduction };
