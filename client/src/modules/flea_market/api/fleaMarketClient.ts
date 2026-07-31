import axios, { AxiosError } from "axios";

/**
 * Thrown centrally by the response interceptor whenever the backend reports
 * { error: "SESSION_EXPIRED", reauthRequired: true } on a 401. Callers should
 * catch this specifically to drop the UI back into CustomerVerify's reverify
 * mode, instead of showing a generic error.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super("Flea market session expired");
    this.name = "SessionExpiredError";
  }
}

let currentSessionToken: string | null = null;
let currentLocationId: number | null = null;

export function setFleaMarketSessionToken(token: string | null): void {
  currentSessionToken = token;
}

export function setFleaMarketLocationId(locationId: number | null): void {
  currentLocationId = locationId;
}

export const fleaMarketClient = axios.create({
  baseURL: "/api/flea-market",
});

// Injects the session/location context on every call instead of every call
// site threading it through manually.
fleaMarketClient.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};

  if (currentSessionToken) {
    config.headers["X-Session-Token"] = currentSessionToken;
  }
  if (currentLocationId !== null) {
    config.headers["X-Location-Id"] = String(currentLocationId);
  }

  return config;
});

fleaMarketClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      error instanceof AxiosError &&
      error.response?.status === 401 &&
      error.response.data?.reauthRequired
    ) {
      return Promise.reject(new SessionExpiredError());
    }

    return Promise.reject(error);
  },
);

// One-shot reachability check so a misconfigured proxy/CORS setup surfaces as
// a clear console error during dev instead of a cryptic failure on the first
// real API call. Never blocks app startup - failures are logged, not thrown.
export async function pingFleaMarketHealth(): Promise<void> {
  try {
    await fleaMarketClient.get("/health");
  } catch (error) {
    console.error(
      "[flea-market] Backend health check failed - is the server running and is VITE_DEV_API_PROXY_TARGET correct?",
      error,
    );
  }
}
