import type { Page } from "@playwright/test";

const STORAGE_KEY = "guidetrain.profile";

/**
 * Seeds a profile into localStorage before the page's own scripts run, so a
 * test can start as a returning visitor without going through the onboarding
 * form first. Must be called before `page.goto()` — `addInitScript` only
 * affects navigations that happen after it's registered.
 */
export async function seedProfile(page: Page, overrides: Record<string, unknown> = {}) {
  const profile = {
    username: "tester",
    ageGroup: "18-29",
    bodyWeight: 80,
    ...overrides,
  };
  await page.addInitScript(
    ([key, json]) => localStorage.setItem(key, json),
    [STORAGE_KEY, JSON.stringify(profile)] as [string, string],
  );
}
