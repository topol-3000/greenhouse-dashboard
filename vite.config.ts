import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * The dev and preview servers proxy the backend surface the portal uses, so the
 * browser only ever issues same-origin requests — exactly as the Nginx runtime
 * container does in production. The backend host lives here and in the
 * container's runtime configuration, never in application JavaScript.
 *
 * `/health` is proxied as well as `/api/v1`: the backend publishes it
 * unversioned, and it is how the portal reports cloud API availability. It is
 * matched exactly so it cannot swallow the container's own `/healthz`.
 */
const apiUpstream = process.env.GREENHOUSE_API_UPSTREAM ?? "http://127.0.0.1:8000";

const proxy = {
  "/api/v1": {
    target: apiUpstream,
    changeOrigin: true,
  },
  "^/health$": {
    target: apiUpstream,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    proxy,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/app/main.tsx"],
    },
  },
});
