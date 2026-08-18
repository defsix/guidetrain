import { test, expect } from "@playwright/test";
import { seedProfile } from "./helpers";

test("a returning visitor with a saved profile gets the quick splash and skips the form", async ({
  page,
}) => {
  await seedProfile(page);
  await page.goto("/");

  // Quick variant: no progress bar, since nothing is actually loading for
  // someone `useProfile` already recognised before first paint.
  const splash = page.locator(".splash-quick");
  await expect(splash).toBeVisible();
  await expect(page.locator(".splash-quick .splash-bar")).toHaveCount(0);

  // Redirect waits on the splash instead of racing ahead of it, but the
  // whole thing (0.25s hold + 0.25s fade) should still be well under the
  // full first-visit splash's ~1.4s.
  await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
  await expect(page.locator("canvas")).toBeVisible();

  // Never saw the onboarding form at all.
  await expect(page.locator("input")).toHaveCount(0);
});
