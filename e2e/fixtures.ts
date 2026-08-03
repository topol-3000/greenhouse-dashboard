/**
 * Deterministic backend answers for the browser suite.
 *
 * The portal calls exactly one endpoint in this unit — the cloud API's
 * `/health` — so the fixtures are the three answers it can give. There is no
 * greenhouse, telemetry or command fixture here, because there is nothing in
 * the application that would render one.
 */

import type { Page } from "@playwright/test";

export type HealthMode = "available" | "degraded" | "unreachable";

export interface HealthController {
  /** Change what the backend answers for the next check. */
  setMode: (mode: HealthMode) => void;
  /** How many health checks the browser has made. */
  checks: () => number;
}

/**
 * Answer the portal's health checks without a backend.
 *
 * @param page The page under test.
 * @param initial The mode to start in.
 * @returns A handle for switching the answer mid-test.
 */
export async function mockHealth(page: Page, initial: HealthMode = "available") {
  let mode = initial;
  let checks = 0;

  await page.route("**/health", async (route) => {
    checks += 1;
    if (mode === "unreachable") {
      await route.abort("connectionrefused");
      return;
    }
    const body =
      mode === "available"
        ? { status: "ok", service: "greenhouse", database: "ok" }
        : { status: "unavailable", service: "greenhouse", database: "unavailable" };
    await route.fulfill({
      status: mode === "available" ? 200 : 503,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  const controller: HealthController = {
    setMode: (next) => {
      mode = next;
    },
    checks: () => checks,
  };
  return controller;
}
