/** Change only this value to switch every frontend API between environments. */
export const ACTIVE_SERVER: "local" | "live" = "local";

const servers = {
  local: {
    apiBaseUrl: "http://localhost:5000",
  },
  live: {
    // Same-origin in production and proxied by Vite during local development.
    apiBaseUrl: "/api/crm",
  },
} as const;

export const SERVER_CONFIG = servers[ACTIVE_SERVER];
