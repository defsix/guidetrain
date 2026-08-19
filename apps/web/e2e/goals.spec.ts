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

  async function addGoal(
    page: import("@playwright/test").Page,
    exercise: string,
    weight: string,
    isoDate: string,
  ) {
    const form = page.locator(".stats-goal-form");
    const exerciseInput = form.locator(".stats-goal-exercise .autocomplete-input");
    await exerciseInput.fill(exercise);
    await page.locator(".autocomplete-option", { hasText: exercise }).first().click();
    await form.locator('input:not([type="date"]):not(.autocomplete-input)').fill(weight);
    await form.locator('input[type="date"]').fill(isoDate);
    await form.getByRole("button", { name: /add goal/i }).click();
  }

  test("sets a goal on the Stats page and shows its pace", async ({ page }) => {
    await page.getByRole("button", { name: /progress/i }).click();

    // Ten weeks out — 90% of 180 rounds to a training max of 162.5, which
    // from 147.5 is ceil(15 / 5) = 3 cycles, 12 weeks. Behind at 10 weeks.
    const inTenWeeks = new Date(Date.now() + 10 * 7 * 24 * 60 * 60 * 1000);
    await addGoal(page, "Barbell Squat", "180", inTenWeeks.toISOString().slice(0, 10));

    const goal = page.locator(".stats-goal");
    await expect(goal).toBeVisible();
    await expect(goal).toContainText("Barbell Squat");
    await expect(goal).toContainText("180 kg");
    await expect(goal).toContainText("3 cycles to go");
  });

  test("picking a match from the autocomplete dropdown fills the field", async ({ page }) => {
    await page.getByRole("button", { name: /progress/i }).click();
    const form = page.locator(".stats-goal-form");
    const exerciseInput = form.locator(".stats-goal-exercise .autocomplete-input");

    await exerciseInput.fill("Barbell Squ");
    const options = page.locator(".autocomplete-option");
    await expect(options).toContainText(["Barbell Squat"]);
    await options.filter({ hasText: "Barbell Squat" }).first().click();

    await expect(exerciseInput).toHaveValue("Barbell Squat");
    // Picking closes the dropdown rather than leaving it open over the rest
    // of the form.
    await expect(page.locator(".autocomplete-list")).toHaveCount(0);
  });

  test("removing a goal clears it from the list", async ({ page }) => {
    await page.getByRole("button", { name: /progress/i }).click();
    await addGoal(page, "Barbell Squat", "180", "2030-01-01");
    await expect(page.locator(".stats-goal")).toBeVisible();

    await page.getByRole("button", { name: /remove/i }).click();
    await expect(page.locator(".stats-goal")).toHaveCount(0);
    await expect(page.getByText(/no goals set yet/i)).toBeVisible();
  });

  test("the same exercise can carry more than one goal, each judged and removed on its own", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /progress/i }).click();
    await addGoal(page, "Barbell Squat", "180", "2030-01-01");
    await addGoal(page, "Barbell Squat", "200", "2031-06-01");

    const rows = page.locator(".stats-goal");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "180 kg" })).toBeVisible();
    await expect(rows.filter({ hasText: "200 kg" })).toBeVisible();

    await rows.filter({ hasText: "180 kg" }).getByRole("button", { name: /remove/i }).click();
    await expect(page.locator(".stats-goal")).toHaveCount(1);
    await expect(page.locator(".stats-goal")).toContainText("200 kg");
  });

  test("the same goal and pace show up in Plan → for that lift", async ({ page }) => {
    await page.getByRole("button", { name: /progress/i }).click();
    const inTenWeeks = new Date(Date.now() + 10 * 7 * 24 * 60 * 60 * 1000);
    await addGoal(page, "Barbell Squat", "180", inTenWeeks.toISOString().slice(0, 10));
    await page.locator(".stats-panel .workout-close").click();

    await page.getByRole("button", { name: /workout/i }).click();
    await page.getByRole("button", { name: /plan →/i }).click();

    const note = page.locator(".plan-panel .plan-note.flag").filter({ hasText: "180 kg" });
    await expect(note).toBeVisible();
    await expect(note).toContainText("3 cycles to go");
  });

  test("two goals on the same lift both show their own pace in Plan →", async ({ page }) => {
    await page.getByRole("button", { name: /progress/i }).click();
    const inTenWeeks = new Date(Date.now() + 10 * 7 * 24 * 60 * 60 * 1000);
    await addGoal(page, "Barbell Squat", "180", inTenWeeks.toISOString().slice(0, 10));
    await addGoal(page, "Barbell Squat", "200", "2031-06-01");
    await page.locator(".stats-panel .workout-close").click();

    await page.getByRole("button", { name: /workout/i }).click();
    await page.getByRole("button", { name: /plan →/i }).click();

    const notes = page.locator(".plan-panel .plan-note.flag");
    await expect(notes.filter({ hasText: "180 kg" })).toBeVisible();
    await expect(notes.filter({ hasText: "200 kg" })).toBeVisible();
  });

  test("a goal shows its pace on a ready-made plan's preview row", async ({ page }) => {
    await page.getByRole("button", { name: /progress/i }).click();
    const inTenWeeks = new Date(Date.now() + 10 * 7 * 24 * 60 * 60 * 1000);
    await addGoal(page, "Barbell Squat", "180", inTenWeeks.toISOString().slice(0, 10));
    await page.locator(".stats-panel .workout-close").click();

    await page.getByRole("button", { name: /workout/i }).click();
    await page.locator(".plans-open").first().click();
    await page.locator(".plan-card").filter({ has: page.locator(".pname", { hasText: /^Full body$/ }) }).click();

    const squatRow = page.locator(".plan-day li").filter({ hasText: "Barbell Squat" }).first();
    await expect(squatRow.locator(".dgoal")).toContainText("180 kg");
    await expect(squatRow.locator(".dgoal")).toContainText("3 cycles to go");
  });
});
