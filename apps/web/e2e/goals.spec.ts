import { test, expect } from "@playwright/test";
import { seedProfile, seedProgram, seedLog } from "./helpers";

test.describe("lift goals", () => {
  test.beforeEach(async ({ page }) => {
    await seedProfile(page);
    await seedProgram(page, ["Barbell_Squat"]);
    // 140 x 5 estimates a squat max of 163.33, giving a training max of
    // 147.5 — enough for a real pace verdict rather than "log a set first".
    await seedLog(page, [{ id: "Barbell_Squat", weight: 140, reps: 5 }]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("sets a goal on the Stats page and shows its pace", async ({ page }) => {
    await page.getByRole("button", { name: /progress/i }).click();

    const form = page.locator(".stats-goal-form");
    await form.locator(".stats-goal-exercise").fill("Barbell Squat");
    await form.locator('input:not([type="date"]):not(.stats-goal-exercise)').fill("180");
    // Ten weeks out — 90% of 180 rounds to a training max of 162.5, which
    // from 147.5 is ceil(15 / 5) = 3 cycles, 12 weeks. Behind at 10 weeks.
    const inTenWeeks = new Date(Date.now() + 10 * 7 * 24 * 60 * 60 * 1000);
    const iso = inTenWeeks.toISOString().slice(0, 10);
    await form.locator('input[type="date"]').fill(iso);
    await form.getByRole("button", { name: /add goal/i }).click();

    const goal = page.locator(".stats-goal");
    await expect(goal).toBeVisible();
    await expect(goal).toContainText("Barbell Squat");
    await expect(goal).toContainText("180 kg");
    await expect(goal).toContainText("3 cycles to go");
  });

  test("removing a goal clears it from the list", async ({ page }) => {
    await page.getByRole("button", { name: /progress/i }).click();
    const form = page.locator(".stats-goal-form");
    await form.locator(".stats-goal-exercise").fill("Barbell Squat");
    await form.locator('input:not([type="date"]):not(.stats-goal-exercise)').fill("180");
    await form.locator('input[type="date"]').fill("2030-01-01");
    await form.getByRole("button", { name: /add goal/i }).click();
    await expect(page.locator(".stats-goal")).toBeVisible();

    await page.getByRole("button", { name: /remove/i }).click();
    await expect(page.locator(".stats-goal")).toHaveCount(0);
    await expect(page.getByText(/no goals set yet/i)).toBeVisible();
  });

  test("the same goal and pace show up in Plan → for that lift", async ({ page }) => {
    await page.getByRole("button", { name: /progress/i }).click();
    const form = page.locator(".stats-goal-form");
    await form.locator(".stats-goal-exercise").fill("Barbell Squat");
    await form.locator('input:not([type="date"]):not(.stats-goal-exercise)').fill("180");
    const inTenWeeks = new Date(Date.now() + 10 * 7 * 24 * 60 * 60 * 1000);
    await form.locator('input[type="date"]').fill(inTenWeeks.toISOString().slice(0, 10));
    await form.getByRole("button", { name: /add goal/i }).click();
    await page.locator(".stats-panel .workout-close").click();

    await page.getByRole("button", { name: /workout/i }).click();
    await page.getByRole("button", { name: /plan →/i }).click();

    const note = page.locator(".plan-panel .plan-note.flag").filter({ hasText: "180 kg" });
    await expect(note).toBeVisible();
    await expect(note).toContainText("3 cycles to go");
  });

  test("a goal shows its pace on a ready-made plan's preview row", async ({ page }) => {
    await page.getByRole("button", { name: /progress/i }).click();
    const form = page.locator(".stats-goal-form");
    await form.locator(".stats-goal-exercise").fill("Barbell Squat");
    await form.locator('input:not([type="date"]):not(.stats-goal-exercise)').fill("180");
    const inTenWeeks = new Date(Date.now() + 10 * 7 * 24 * 60 * 60 * 1000);
    await form.locator('input[type="date"]').fill(inTenWeeks.toISOString().slice(0, 10));
    await form.getByRole("button", { name: /add goal/i }).click();
    await page.locator(".stats-panel .workout-close").click();

    await page.getByRole("button", { name: /workout/i }).click();
    await page.locator(".plans-open").first().click();
    await page.locator(".plan-card").filter({ has: page.locator(".pname", { hasText: /^Full body$/ }) }).click();

    const squatRow = page.locator(".plan-day li").filter({ hasText: "Barbell Squat" }).first();
    await expect(squatRow.locator(".dgoal")).toContainText("180 kg");
    await expect(squatRow.locator(".dgoal")).toContainText("3 cycles to go");
  });
});
