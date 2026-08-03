import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke coverage over the real production bundle.
 *
 * The suite serves the built `dist/` through `vite preview` and answers
 * `/api/v1` from fixtures inside the browser, so it needs no backend and no
 * mutable shared state — the same run gives the same result anywhere.
 */
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  // Serial in CI so the shared preview server is not contended.
  ...(process.env["CI"] ? { workers: 1 } : {}),
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "desktop",
      testIgnore: /narrow-viewport\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // A narrow phone viewport, so the layout is proven at both ends.
      name: "mobile",
      testMatch: /narrow-viewport\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    command: `npm run build && npm run preview -- --port ${String(PORT)} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
