import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // The flea-market backend (server/app.js, port 5000 by default) is only
  // ever run locally — it isn't deployed to production yet — so it needs its
  // own proxy target, separate from the rest of the app's /api/* traffic
  // (e.g. /api/crm), which still goes to production/staging as before.
  // Override with VITE_DEV_API_PROXY_TARGET if your local server runs elsewhere.
  const apiProxyTarget = env.VITE_DEV_API_PROXY_TARGET || "https://rewardplanners.com";

  return {
    base: "/crm/",

    plugins: [react(), tailwindcss()],

    server: {
      // Binds to 0.0.0.0 instead of just 127.0.0.1 so a tablet/POS device on
      // the same LAN can reach this dev server (see client/.env.example for
      // pointing VITE_DEV_API_PROXY_TARGET at the dev machine's LAN IP too).
      host: true,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          cookieDomainRewrite: "localhost",
        },
      },
    },

    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
