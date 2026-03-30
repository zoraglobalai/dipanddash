import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().optional()
);

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return value;
}, z.boolean().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default("/api"),
  CLIENT_ORIGIN: optionalString,
  CLIENT_ORIGINS: optionalString,
  COOKIE_DOMAIN: optionalString,
  ACCESS_TOKEN_SECRET: z.string().min(16).optional(),
  JWT_ACCESS_SECRET: z.string().min(16).optional(),
  REFRESH_TOKEN_SECRET: z.string().min(16).optional(),
  ACCESS_TOKEN_EXPIRES_IN: optionalString,
  JWT_ACCESS_EXPIRES_IN: optionalString,
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("14d"),
  ACCESS_COOKIE_NAME: optionalString,
  AUTH_COOKIE_NAME: optionalString,
  REFRESH_COOKIE_NAME: z.string().default("DND_REFRESH_TOKEN"),
  COOKIE_SECURE: optionalBoolean,
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).optional(),
  DATABASE_URL: optionalString,
  DATABASE_HOST: optionalString,
  DATABASE_PORT: z.coerce.number().default(5432),
  DATABASE_USERNAME: optionalString,
  DATABASE_PASSWORD: optionalString,
  DATABASE_NAME: optionalString,
  SEED_ADMIN_USERNAME: z.string().min(3).optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_ADMIN_FULL_NAME: z.string().min(3).default("Admin User"),
  DATABASE_SSL: optionalBoolean,
  DATABASE_SSL_REJECT_UNAUTHORIZED: optionalBoolean,
  DB_SYNCHRONIZE: optionalBoolean,
  DB_LOGGING: optionalBoolean
}).superRefine((value, ctx) => {
  if (value.DATABASE_URL) {
    return;
  }

  if (!value.DATABASE_HOST) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_HOST"],
      message: "DATABASE_HOST is required when DATABASE_URL is not set"
    });
  }

  if (!value.DATABASE_USERNAME) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_USERNAME"],
      message: "DATABASE_USERNAME is required when DATABASE_URL is not set"
    });
  }

  if (!value.DATABASE_PASSWORD) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_PASSWORD"],
      message: "DATABASE_PASSWORD is required when DATABASE_URL is not set"
    });
  }

  if (!value.DATABASE_NAME) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_NAME"],
      message: "DATABASE_NAME is required when DATABASE_URL is not set"
    });
  }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(
    `Environment validation failed: ${JSON.stringify(parsedEnv.error.flatten().fieldErrors)}`
  );
}

const rawEnv = parsedEnv.data;
const isProduction = rawEnv.NODE_ENV === "production";
const hasDatabaseUrl = Boolean(rawEnv.DATABASE_URL);

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
const databaseSsl = rawEnv.DATABASE_SSL ?? (isProduction || hasDatabaseUrl);
const databaseSslRejectUnauthorized = rawEnv.DATABASE_SSL_REJECT_UNAUTHORIZED ?? false;
const dbSynchronize = rawEnv.DB_SYNCHRONIZE ?? !isProduction;
const dbLogging = rawEnv.DB_LOGGING ?? false;

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
  COOKIE_SAME_SITE: cookieSameSite,
  DATABASE_SSL: databaseSsl,
  DATABASE_SSL_REJECT_UNAUTHORIZED: databaseSslRejectUnauthorized,
  DB_SYNCHRONIZE: dbSynchronize,
  DB_LOGGING: dbLogging
};

export { isProduction };
