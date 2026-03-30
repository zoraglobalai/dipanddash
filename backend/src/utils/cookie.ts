import { Response } from "express";

import { env, isProduction } from "../config/env";

const getCookieDomain = (): string | undefined => {
  if (!env.COOKIE_DOMAIN) {
    return undefined;
  }

  const normalized = env.COOKIE_DOMAIN
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .split(":")[0]
    .trim();

  if (!normalized || normalized.toLowerCase() === "localhost") {
    return undefined;
  }

  const hasValidCharacters = /^[a-z0-9.-]+$/i.test(normalized);
  return hasValidCharacters && normalized.includes(".") ? normalized : undefined;
};

export const setAuthCookie = (res: Response, token: string): void => {
  const domain = getCookieDomain();
  res.cookie(env.AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    domain,
    maxAge: 24 * 60 * 60 * 1000,
    path: "/"
  });
};

export const clearAuthCookie = (res: Response): void => {
  const domain = getCookieDomain();
  res.clearCookie(env.AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    domain,
    path: "/"
  });
};
