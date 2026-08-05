/**
 * Browser evidence for the portal's appearance.
 *
 * Every surface a customer can reach is opened at a desktop width and at a
 * phone width, in both the light and the dark appearance, and each one is
 * checked for the two properties the layout has to hold at every size:
 *
 * - the page never scrolls sideways;
 * - the screen's own regions are on it, so a layout that collapsed would fail
 *   here rather than in review.
 *
 * A screenshot is written beside each check into `test-results/appearance-
 * evidence/`, which is an ignored test-artifact directory: generating the
 * evidence therefore leaves the worktree clean, and no image is committed. The
 * images are review evidence, deliberately not assertions — nothing here
 * compares pixels, because a design that is allowed to change should not be
 * pinned by a test that breaks when it does.
 *
 * To regenerate them:
 *
 *     npm run e2e -- appearance-evidence
 *     docker compose run --rm e2e npx playwright test appearance-evidence
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { E2E_IDS, SEEDED_COMMANDS, mockCommands, mockHealth, mockTopology } from "./fixtures";

const EVIDENCE_DIR = "test-results/appearance-evidence";

const FACILITY_URL = `/facilities/${E2E_IDS.northGreenhouse}`;
const ZONE_URL = `${FACILITY_URL}/zones/${E2E_IDS.climateZone}`;
const ZONE_ACTIVITY = `/activity?site=${E2E_IDS.riversideSite}&facility=${E2E_IDS.northGreenhouse}&zone=${E2E_IDS.climateZone}`;

/** Every route the portal publishes, with the region that proves each rendered. */
const SCREENS = [
  { name: "dashboard", url: "/", region: "dashboard-page" },
  { name: "greenhouses", url: "/sites", region: "greenhouses-page" },
  { name: "facility", url: FACILITY_URL, region: "facility-page" },
  { name: "control-zone", url: ZONE_URL, region: "control-zone-page" },
  { name: "activity", url: ZONE_ACTIVITY, region: "activity-page" },
  { name: "not-found", url: "/no-such-address", region: "not-found-page" },
] as const;

const VIEWPORTS = [
  { name: "desktop", size: { width: 1440, height: 900 } },
  { name: "narrow", size: { width: 390, height: 844 } },
] as const;

/** How far the document can be scrolled horizontally, in pixels. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
}

/** Choose an appearance through the control a customer would use. */
async function chooseAppearance(page: Page, appearance: "Light" | "Dark") {
  await page
    .getByRole("group", { name: "Appearance" })
    .getByRole("button", { name: appearance })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-coreui-theme", appearance.toLowerCase());
}

for (const appearance of ["Light", "Dark"] as const) {
  test.describe(`${appearance.toLowerCase()} appearance`, () => {
    for (const viewport of VIEWPORTS) {
      test.describe(`at ${viewport.name} width`, () => {
        test.use({ viewport: viewport.size });

        const shot = (name: string) =>
          `${EVIDENCE_DIR}/${name}-${viewport.name}-${appearance.toLowerCase()}.png`;

        test(`renders every route without sideways scroll`, async ({ page }) => {
          await mockHealth(page);
          await mockTopology(page);
          await mockCommands(page, undefined, SEEDED_COMMANDS);

          await page.goto("/");
          await chooseAppearance(page, appearance);

          for (const screen of SCREENS) {
            await page.goto(screen.url);
            await expect(page.getByTestId(screen.region)).toBeVisible();
            await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

            expect(
              await horizontalOverflow(page),
              `${screen.name} scrolls sideways at ${viewport.name} width`,
            ).toBeLessThanOrEqual(1);

            await page.screenshot({ path: shot(screen.name), fullPage: true });
          }
        });

        test(`keeps the manual-command confirmation on the screen`, async ({ page }) => {
          await mockHealth(page);
          await mockTopology(page);
          await page.goto("/");
          await chooseAppearance(page, appearance);

          await page.goto(ZONE_URL);
          await page.getByTestId("actuator-cards").waitFor();
          await page
            .locator(`[data-point-id="${E2E_IDS.ventPoint}"]`)
            .getByTestId("actuator-on")
            .click();

          const dialog = page.getByTestId("command-confirmation");
          await expect(dialog).toBeVisible();
          expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

          const box = await dialog.locator(".modal-content").boundingBox();
          expect(box?.width ?? 0).toBeLessThanOrEqual(viewport.size.width);

          await page.screenshot({ path: shot("command-confirmation") });
        });

        test(`keeps the command-details dialog on the screen`, async ({ page }) => {
          await mockHealth(page);
          await mockTopology(page);
          await mockCommands(page, undefined, SEEDED_COMMANDS);

          await page.goto("/");
          await chooseAppearance(page, appearance);

          await page.goto(ZONE_ACTIVITY);
          await page.getByTestId("activity-list").getByRole("button").first().click();

          const dialog = page.getByTestId("command-details");
          await expect(dialog).toBeVisible();
          expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

          await page.screenshot({ path: shot("command-details") });
        });

        test(`keeps the shell usable while the cloud API is unavailable`, async ({ page }) => {
          // The topology is left unmocked as well, so this is the whole portal
          // with nothing behind it — the state the shell has to survive.
          await mockHealth(page, "unreachable");

          await page.goto("/");
          await chooseAppearance(page, appearance);

          await expect(page.getByTestId("api-status")).toHaveAttribute("data-state", "unavailable");
          // The shell is still the shell: its heading, its appearance control
          // and its navigation are all there — the navigation behind the toggle
          // at a phone width, beside the content at a desktop one.
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await expect(page.getByTestId("appearance")).toBeVisible();
          await expect(page.getByTestId("portal-sidebar")).toBeAttached();
          expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

          await page.screenshot({ path: shot("api-unavailable"), fullPage: true });
        });
      });
    }
  });
}
