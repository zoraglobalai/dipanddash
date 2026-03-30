import axios, { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from "axios";

import { env } from "@/config/env";

type UnauthorizedHandler = (message?: string) => void;
type RefreshHandler = () => Promise<void>;
type AccessTokenProvider = () => Promise<string | null>;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let refreshHandler: RefreshHandler | null = null;
let refreshPromise: Promise<void> | null = null;
let accessTokenProvider: AccessTokenProvider | null = null;

const SKIP_AUTH_HANDLER_HEADER = "X-Skip-Auth-Handler";
const SKIP_AUTH_REFRESH_HEADER = "X-Skip-Auth-Refresh";

type RequestConfigWithRetry = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

const extractErrorMessage = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const axiosError = error as AxiosError<{ message?: string }>;
  return axiosError.response?.data?.message;
};

const readHeader = (config: InternalAxiosRequestConfig, key: string): string | null => {
  const headers = config.headers;
  if (!headers) {
    return null;
  }

  if (headers instanceof AxiosHeaders) {
    const value = headers.get(key);
    return value ? String(value) : null;
  }

  const rawHeaders = headers as Record<string, unknown>;
  const rawValue = rawHeaders[key] ?? rawHeaders[key.toLowerCase()] ?? rawHeaders[key.toUpperCase()];
  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  return String(rawValue);
};

const isTruthyHeader = (config: InternalAxiosRequestConfig, key: string): boolean => {
  const value = readHeader(config, key);
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const isRefreshBlockedEndpoint = (url?: string): boolean => {
  if (!url) {
    return false;
  }

  return /\/auth\/(login|logout|logout-all|refresh)(?:\?|$)/.test(url);
};

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  unauthorizedHandler = handler;
};

export const setRefreshHandler = (handler: RefreshHandler | null) => {
  refreshHandler = handler;
};

export const setAccessTokenProvider = (provider: AccessTokenProvider | null) => {
  accessTokenProvider = provider;
};

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 8000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    "x-client-type": env.clientType
  }
});

apiClient.interceptors.request.use(async (config) => {
  if (!accessTokenProvider) {
    return config;
  }

  const shouldSkipTokenAttach =
    isTruthyHeader(config, SKIP_AUTH_REFRESH_HEADER) ||
    isTruthyHeader(config, SKIP_AUTH_HANDLER_HEADER) ||
    isRefreshBlockedEndpoint(config.url);

  if (shouldSkipTokenAttach) {
    return config;
  }

  const token = await accessTokenProvider();
  if (!token) {
    return config;
  }

  if (config.headers instanceof AxiosHeaders) {
    config.headers.set("Authorization", `Bearer ${token}`);
    return config;
  }

  const normalizedHeaders = AxiosHeaders.from((config.headers ?? {}) as any);
  normalizedHeaders.set("Authorization", `Bearer ${token}`);
  config.headers = normalizedHeaders;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RequestConfigWithRetry | undefined;

    if (!originalRequest || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const shouldSkipAuthHandler = isTruthyHeader(originalRequest, SKIP_AUTH_HANDLER_HEADER);
    const shouldSkipRefresh = isTruthyHeader(originalRequest, SKIP_AUTH_REFRESH_HEADER);

    if (
      shouldSkipRefresh ||
      originalRequest._retry ||
      isRefreshBlockedEndpoint(originalRequest.url) ||
      !refreshHandler
    ) {
      if (!shouldSkipAuthHandler && unauthorizedHandler) {
        unauthorizedHandler(extractErrorMessage(error));
      }
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (!refreshPromise) {
      refreshPromise = refreshHandler()
        .catch((refreshError) => {
          if (unauthorizedHandler) {
            unauthorizedHandler(extractErrorMessage(refreshError));
          }
          throw refreshError;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    try {
      await refreshPromise;
      return apiClient(originalRequest);
    } catch {
      return Promise.reject(error);
    }
  }
);
