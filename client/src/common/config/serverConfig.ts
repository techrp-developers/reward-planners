/** Change only this value to switch every frontend API between environments. */
export const ACTIVE_SERVER: "local" | "live" = "local";

const servers = {
  local: {
    // Same-origin via the Vite dev proxy so auth cookies survive refreshes.
    apiBaseUrl: "/api/crm",
  },
  live: {
    // Same-origin in production and proxied by Vite during local development.
    apiBaseUrl: "/api/crm",
  },
} as const;

export const SERVER_CONFIG = servers[ACTIVE_SERVER];
