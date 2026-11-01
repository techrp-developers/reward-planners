import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Use the local Express server by default so CRM auth cookies are set on the
  // same browser origin during development. Override this to hit staging/live.
  // Override with VITE_DEV_API_PROXY_TARGET if your local server runs elsewhere.
  const apiProxyTarget = env.VITE_DEV_API_PROXY_TARGET || "http://localhost:5000";

  return {
    base: "/crm/",

    plugins: [react(), tailwindcss()],

    server: {
      // Binds to 0.0.0.0 instead of just 127.0.0.1 so a tablet/POS device on
      // the same LAN can reach this dev server (see client/.env.example for
      // pointing VITE_DEV_API_PROXY_TARGET at the dev machine's LAN IP too).
      host: true,
      proxy: {
        "/api/crm": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
