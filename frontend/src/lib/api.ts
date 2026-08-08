import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";
import {
  getAccessToken,
  getRefreshToken,
  updateTokens,
  clearSession,
  isAccessTokenExpired,
} from "./session";
import type { AuthSession } from "./session";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

const PUBLIC_PATHS = [
  "/auth/login/",
  "/auth/register/",
  "/auth/register/verify/",
  "/auth/refresh/",
];

function isPublicPath(url?: string) {
  const value = url ?? "";
  return PUBLIC_PATHS.some((p) => value.includes(p));
}

let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

function subscribeTokenRefresh(cb: (token: string | null) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string | null) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function clearAuthAndRedirect() {
  clearSession();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

/** Calls the refresh endpoint and rotates the stored tokens. Returns the
 * new access token, or null if the refresh itself failed. */
async function performRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await axios.post<AuthSession>(
      `${import.meta.env.VITE_API_URL}/auth/refresh/`,
      { refresh_token: refreshToken }
    );

    updateTokens({
      session_token: res.data.session_token,
      refresh_token: res.data.refresh_token,
      expires_at: res.data.expires_at,
      refresh_expires_at: res.data.refresh_expires_at,
    });

    return res.data.session_token;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request interceptor: attach the access token, proactively refreshing first
// if we already know it's expired — cheaper than waiting for a 401 round trip.
// ---------------------------------------------------------------------------
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (isPublicPath(config.url)) return config;

  let token = getAccessToken();

  if (token && isAccessTokenExpired()) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await performRefresh();
      isRefreshing = false;
      onRefreshed(newToken);
      if (!newToken) {
        clearAuthAndRedirect();
      }
      token = newToken;
    } else {
      token = await new Promise((resolve) => subscribeTokenRefresh(resolve));
    }
  }

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// ---------------------------------------------------------------------------
// Response interceptor: fallback for the case a token expires mid-flight
// (or the proactive check above raced with another tab).
// ---------------------------------------------------------------------------
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const status = error.response?.status;

    if (
      status !== 401 ||
      originalRequest._retry ||
      isPublicPath(originalRequest.url)
    ) {
      return Promise.reject(error);
    }

    if (!getRefreshToken()) {
      clearAuthAndRedirect();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((newToken) => {
          if (!newToken) {
            reject(error);
            return;
          }
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(api(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const newToken = await performRefresh();
    isRefreshing = false;
    onRefreshed(newToken);

    if (!newToken) {
      clearAuthAndRedirect();
      return Promise.reject(error);
    }

    originalRequest.headers = originalRequest.headers ?? {};
    originalRequest.headers.Authorization = `Bearer ${newToken}`;
    return api(originalRequest);
  }
);