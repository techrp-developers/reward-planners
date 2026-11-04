import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit/component tests only; the app build stays in vite.config.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
