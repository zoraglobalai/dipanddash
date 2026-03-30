import { Response } from "express";

import { env } from "../../config/env";
import { durationToMs } from "./token.service";

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

const sharedCookieOptions = {
  httpOnly: true as const,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  domain: getCookieDomain()
};

const accessCookieMaxAge = durationToMs(env.ACCESS_TOKEN_EXPIRES_IN, 15 * 60 * 1000);
const refreshCookieMaxAge = durationToMs(env.REFRESH_TOKEN_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000);

export const setAccessTokenCookie = (res: Response, accessToken: string): void => {
  res.cookie(env.ACCESS_COOKIE_NAME, accessToken, {
    ...sharedCookieOptions,
    maxAge: accessCookieMaxAge,
    path: "/"
  });
};

export const setRefreshTokenCookie = (res: Response, refreshToken: string): void => {
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, {
    ...sharedCookieOptions,
    maxAge: refreshCookieMaxAge,
    path: `${env.API_PREFIX}/auth`
  });
};

export const setAuthCookies = (
  res: Response,
  params: { accessToken: string; refreshToken: string }
): void => {
  setAccessTokenCookie(res, params.accessToken);
  setRefreshTokenCookie(res, params.refreshToken);
};

export const clearAccessTokenCookie = (res: Response): void => {
  res.clearCookie(env.ACCESS_COOKIE_NAME, {
    ...sharedCookieOptions,
    path: "/"
  });
};

export const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie(env.REFRESH_COOKIE_NAME, {
    ...sharedCookieOptions,
    path: `${env.API_PREFIX}/auth`
  });
};

export const clearAuthCookies = (res: Response): void => {
  clearAccessTokenCookie(res);
  clearRefreshTokenCookie(res);
};
