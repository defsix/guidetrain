import { test, expect } from "@playwright/test";
import { seedProfile, seedProgram } from "./helpers";

test.describe("the per-dumbbell weight clarification", () => {
  test("shows under the fields when logging a set for a dumbbell exercise", async ({ page }) => {
    await seedProfile(page);
    await seedProgram(page, ["Dumbbell_Bench_Press"]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await page.getByRole("button", { name: /workout/i }).click();

    const row = page.locator(".workout-list > li").first();
    await expect(row).toContainText("Dumbbell Bench Press");
    await expect(row.locator(".loading-note")).toContainText(
      "One dumbbell's weight — not the pair combined.",
    );
  });

  test("does not show it for a barbell exercise", async ({ page }) => {
    await seedProfile(page);
    await seedProgram(page, ["Barbell_Bench_Press_-_Medium_Grip"]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await page.getByRole("button", { name: /workout/i }).click();

    const row = page.locator(".workout-list > li").first();
    await expect(row.locator(".loading-note")).toHaveCount(0);
  });

  test("also shows above the how-to steps in the muscle picker", async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await page.locator(".muscle").filter({ hasText: "Pectoralis Major" }).click();
    const drillRow = page
      .locator(".drills li")
      .filter({ hasText: "Dumbbell Bench Press" })
      .first();
    await drillRow.locator(".drill-head").click();
    await expect(drillRow.locator(".loading-note")).toContainText(
      "One dumbbell's weight — not the pair combined.",
    );
  });
});
