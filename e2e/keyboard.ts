/**
 * Keyboard helpers for the dialog suites.
 *
 * A modal's tab ring is not a fixed number of presses. A scrollable dialog body
 * is itself a tab stop in browsers that let a keyboard user scroll a region —
 * which is a feature, not a defect — so how many presses reach a given button
 * depends on whether the content happens to overflow. These helpers assert the
 * properties that actually matter: every control is reachable, and focus never
 * leaves the dialog.
 */

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/** How far to look for a control before calling it unreachable. */
const MAX_PRESSES = 12;

/** Press Tab until `target` has focus, failing if it is never reached. */
export async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let press = 0; press < MAX_PRESSES; press += 1) {
    if (await target.evaluate((node) => node === document.activeElement)) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target, `not reachable by Tab within ${String(MAX_PRESSES)} presses`).toBeFocused();
}

/** Whether the focused element is the dialog itself or something inside it. */
export async function focusIsInside(page: Page, testId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const dialog = document.querySelector(`[data-testid="${id}"]`);
    const active = document.activeElement;
    return dialog !== null && active !== null && (dialog === active || dialog.contains(active));
  }, testId);
}
