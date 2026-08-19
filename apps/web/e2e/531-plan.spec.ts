import { test, expect } from "@playwright/test";
import { seedProfile, seedLog } from "./helpers";

test.describe("the 5/3/1 plan", () => {
  test.beforeEach(async ({ page }) => {
    await seedProfile(page);
    // 140 x 5 estimates a squat max of 163.33, giving a training max of
    // 147.5 — enough to build a real week 1 for that lift and nothing else.
    await seedLog(page, [{ id: "Barbell_Squat", weight: 140, reps: 5 }]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: /workout/i }).click();
    await page.locator(".plans-open").first().click();
    await page.locator(".plan-card").filter({ hasText: "5/3/1" }).click();
  });

  test("shows a real week 1 for a lift with a training max, and a pick-your-own for one without", async ({
    page,
  }) => {
    const squatDay = page.locator(".plan-day").filter({ has: page.getByRole("heading", { name: "Squat" }) });
    const squatRow = squatDay.locator("li").filter({ hasText: "Barbell Squat" });
    // 65/75/85% of 147.5, each rounded to the 2.5 kg step: 95, 110, 125.
    await expect(squatRow).toContainText("95 / 110 / 125");
    await expect(squatRow).toContainText("5/3/1, week 1");

    const ohpDay = page.locator(".plan-day").filter({ has: page.getByRole("heading", { name: "Overhead press" }) });
    const ohpRow = ohpDay.locator("li").filter({ hasText: "Standing Military Press" });
    await expect(ohpRow).toContainText("pick your own");
  });

  test("carries the cycle into the workout once applied", async ({ page }) => {
    await page.getByRole("button", { name: /add 4 workouts/i }).click();

    // addWorkouts() selects the first day (Overhead press) as active; the
    // squat day needs its own tab.
    await page.getByRole("tab", { name: "Squat" }).click();

    // Scoped to the squat row specifically — the assistance exercises in
    // the same day get their own flat, non-cycle prescribed block too.
    const squatRow = page.locator(".workout-list > li").filter({ hasText: "Barbell Squat" });
    const prescribed = squatRow.locator(".prescribed");
    await expect(prescribed).toBeVisible();
    await expect(prescribed).toContainText("95");
    await expect(prescribed).toContainText("110");
    await expect(prescribed).toContainText("125");
    // The AMRAP top set is marked with a "+".
    await expect(prescribed.locator("sup")).toHaveText("+");
    // The same label used everywhere a ProgressionPanel week is in use.
    await expect(prescribed.locator("em")).toHaveText("from your cycle");
  });
});
