import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { SERVER_CONFIG } from "../config/serverConfig";

export const API_BASE_URL = SERVER_CONFIG.apiBaseUrl;

type RetryableConfig = InternalAxiosRequestConfig & { _sessionRetry?: boolean };

const readCookie = (name: string) =>
  document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (!["get", "head", "options"].includes((config.method || "get").toLowerCase())) {
    const csrfToken = readCookie("rp_csrf");
    if (csrfToken) config.headers["X-CSRF-Token"] = decodeURIComponent(csrfToken);
  }
  return config;
});

let refreshRequest: Promise<void> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined;
    const url = config?.url || "";
    const canRefresh = error.response?.status === 401 && config && !config._sessionRetry && !url.includes("/auth/login") && !url.includes("/auth/refresh");
    if (!canRefresh) return Promise.reject(error);

    config._sessionRetry = true;
    try {
      refreshRequest ||= axios.post(`${API_BASE_URL}/auth/refresh`, null, {
        withCredentials: true,
        headers: { "X-CSRF-Token": decodeURIComponent(readCookie("rp_csrf") || "") },
      }).then(() => undefined).finally(() => { refreshRequest = null; });
      await refreshRequest;
      return api(config);
    } catch (refreshError) {
      // `/auth/me` is also used to probe for an existing session when the app
      // starts. A signed-out user is expected there and must remain on public
      // pages such as Forgot Password instead of being forced back to Login.
      if (!url.includes("/auth/me")) {
        window.dispatchEvent(new Event("auth:session-expired"));
      }
      return Promise.reject(refreshError);
    }
  },
);
