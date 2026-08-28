import { test, expect } from "@playwright/test";
import { seedProfile, seedLog } from "./helpers";

test.describe("the account menu", () => {
  test.beforeEach(async ({ page }) => {
    await seedProfile(page);
  });

  test("opens from the logo and leads to Progress", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });

    await page.locator(".logo-link").click();
    await expect(page.locator(".account-menu")).toBeVisible();
    await expect(page.locator(".account-menu-item", { hasText: "Progress" })).toBeVisible();

    await page.locator(".account-menu-item", { hasText: "Progress" }).click();
    await expect(page.locator(".account-menu")).toHaveCount(0);
    await expect(page.locator(".stats-panel")).toBeVisible();
  });

  test("offers History only once something is logged", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });

    await page.locator(".logo-link").click();
    await expect(page.locator(".account-menu-item", { hasText: "History" })).toHaveCount(0);
  });

  test("leads to History once a set has been logged", async ({ page }) => {
    await seedLog(page, [{ id: "Barbell_Squat", weight: 100, reps: 5 }]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });

    await page.locator(".logo-link").click();
    await page.locator(".account-menu-item", { hasText: "History" }).click();
    await expect(page.locator(".account-menu")).toHaveCount(0);
    await expect(page.locator(".hist-day li")).toHaveCount(1);
  });

  test("closes on the scrim without opening anything", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });

    await page.locator(".logo-link").click();
    await expect(page.locator(".account-menu")).toBeVisible();
    await page.locator(".workout-scrim").click();
    await expect(page.locator(".account-menu")).toHaveCount(0);
    await expect(page.locator(".stats-panel")).toHaveCount(0);
  });
});
