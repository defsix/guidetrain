import { test, expect } from "@playwright/test";
import { seedProfile, seedProgram, seedLog } from "./helpers";

const planTarget = {
  sets: 3,
  reps: 5,
  source: "plan",
  steps: [
    { load: 100, reps: 5 },
    { load: 100, reps: 5 },
    { load: 100, reps: 5 },
  ],
};

test.describe("refreshing a plan-derived target", () => {
  test("shows a Refresh button with a standing explanation for a plan-sourced target", async ({ page }) => {
    await seedProfile(page);
    await seedProgram(page, ["Barbell_Squat"], { Barbell_Squat: planTarget });
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await page.getByRole("button", { name: /workout/i }).click();

    await expect(page.locator(".refresh-btn")).toBeVisible();
    await expect(page.locator(".refresh-hint")).toBeVisible();
  });

  test("updates the weight and says so when a heavier set has since been logged", async ({ page }) => {
    await seedProfile(page);
    await seedProgram(page, ["Barbell_Squat"], { Barbell_Squat: planTarget });
    // A logged set implying a working weight well above the frozen 100 kg.
    await seedLog(page, [{ id: "Barbell_Squat", weight: 140, reps: 5 }]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await page.getByRole("button", { name: /workout/i }).click();

    // The frozen weight from the target, unchanged until refresh is tapped.
    await expect(page.locator(".prescribed .steps span.now")).toContainText("100");

    await page.locator(".refresh-btn").click();

    await expect(page.locator(".refresh-result")).toBeVisible();
    await expect(page.locator(".refresh-result")).not.toContainText("Already up to date");
    // The steps row itself now reflects the new, heavier prescription.
    await expect(page.locator(".prescribed .steps span.now")).not.toContainText("100");
  });

  test("says nothing changed on a second tap once nothing new has been logged", async ({ page }) => {
    await seedProfile(page);
    await seedProgram(page, ["Barbell_Squat"], { Barbell_Squat: planTarget });
    await seedLog(page, [{ id: "Barbell_Squat", weight: 140, reps: 5 }]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await page.getByRole("button", { name: /workout/i }).click();

    // First tap moves the frozen weight to whatever the log now implies.
    await page.locator(".refresh-btn").click();
    await expect(page.locator(".refresh-result")).toContainText("Updated");

    // A second tap right after, with nothing new logged in between, has
    // nothing left to change — the same calculation as the one that just ran.
    await page.locator(".refresh-btn").click();
    await expect(page.locator(".refresh-result")).toContainText("Already up to date");
  });

  test("is not offered for a 5/3/1 cycle row, which already recalculates on its own", async ({ page }) => {
    await seedProfile(page);
    await seedProgram(page, ["Barbell_Squat"], {
      Barbell_Squat: { ...planTarget, source: "cycle" },
    });
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await page.getByRole("button", { name: /workout/i }).click();

    await expect(page.locator(".prescribed")).toBeVisible();
    await expect(page.locator(".refresh-btn")).toHaveCount(0);
  });
});
