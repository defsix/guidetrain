import { test, expect } from "@playwright/test";
import { seedProfile, seedProgram } from "./helpers";

test.describe("the warm-up ramp", () => {
  test.beforeEach(async ({ page }) => {
    await seedProfile(page);
    await seedProgram(page, ["Barbell_Squat"]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: /workout/i }).click();
  });

  test("shows a ramp to a typed working weight before the first set", async ({ page }) => {
    await page.locator(".log-form input").nth(0).fill("100");

    const warmup = page.locator(".warmup");
    await expect(warmup).toBeVisible();
    const pills = warmup.locator(".steps > span");
    // 40% x 5, 60% x 5, 80% x 3 of 100 kg.
    await expect(pills).toHaveText(["40 kg × 5", "60 kg × 5", "80 kg × 3"]);
  });

  test("disappears once the first set is logged", async ({ page }) => {
    const form = page.locator(".log-form");
    await form.locator("input").nth(0).fill("100");
    await form.locator("input").nth(1).fill("5");
    await expect(page.locator(".warmup")).toBeVisible();

    await form.getByRole("button", { name: "Add set" }).click();
    await expect(page.locator(".warmup")).toHaveCount(0);
  });

  test("shows nothing for a working weight already close to the bar", async ({ page }) => {
    await page.locator(".log-form input").nth(0).fill("22.5");
    // Give the field's onChange a moment to settle rather than asserting
    // absence immediately, which would pass trivially before any render.
    await expect(page.locator(".log-form input").nth(0)).toHaveValue("22.5");
    await expect(page.locator(".warmup")).toHaveCount(0);
  });
});
