/** Change only this value to switch every frontend API between environments. */
export const ACTIVE_SERVER: "local" | "live" = "live";

const servers = {
  local: {
    apiBaseUrl: "http://localhost:5000",
  },
  live: {
    apiBaseUrl: "https://rewardplanners.com/api/crm",
  },
} as const;

export const SERVER_CONFIG = servers[ACTIVE_SERVER];
