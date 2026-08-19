import { test, expect } from "@playwright/test";
import { seedProfile, seedProgram } from "./helpers";

test.describe("swapping an exercise", () => {
  test.beforeEach(async ({ page }) => {
    await seedProfile(page);
    await seedProgram(page, ["Barbell_Squat", "Barbell_Bench_Press_-_Medium_Grip"]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: /workout/i }).click();
  });

  test("replaces the exercise in place, leaving the rest of the workout alone", async ({
    page,
  }) => {
    const rows = page.locator(".workout-list > li");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Barbell Squat");
    await expect(rows.nth(1)).toContainText("Barbell Bench Press");

    await rows.nth(0).getByRole("button", { name: /swap exercise/i }).click();

    const panel = page.locator(".swap-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading")).toContainText("Barbell Squat");

    const options = panel.locator(".swap-option");
    await expect(options.first()).toBeVisible();
    // Every offered replacement trains the same muscle as a squat, so none of
    // them can legally be the squat itself.
    const names = await options.allTextContents();
    for (const name of names) expect(name).not.toContain("Barbell Squat");

    const chosenName = (await options.first().locator(".swap-name").textContent())?.trim();
    await options.first().click();

    await expect(panel).toHaveCount(0);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(chosenName!);
    // The exercise that was not swapped is untouched.
    await expect(rows.nth(1)).toContainText("Barbell Bench Press");
  });

  test("keeps the sets-and-reps target, in the new exercise's slot", async ({ page }) => {
    const row = page.locator(".workout-list > li").first();
    await row.getByRole("button", { name: /\+ target/i }).click();
    await row.locator("input").nth(0).fill("3");
    await row.locator("input").nth(1).fill("5");
    await row.getByRole("button", { name: /^Set$/i }).click();
    await expect(row.getByRole("button", { name: /target: 3 sets of 5/i })).toBeVisible();

    await row.getByRole("button", { name: /swap exercise/i }).click();
    await page.locator(".swap-option").first().click();

    // Same slot, same target — carried over onto whatever filled it.
    const newRow = page.locator(".workout-list > li").first();
    await expect(newRow.getByRole("button", { name: /target: 3 sets of 5/i })).toBeVisible();
  });

  test("closing the panel without picking leaves the workout unchanged", async ({ page }) => {
    await page
      .locator(".workout-list > li")
      .first()
      .getByRole("button", { name: /swap exercise/i })
      .click();
    await expect(page.locator(".swap-panel")).toBeVisible();

    await page.locator(".swap-panel .workout-close").click();
    await expect(page.locator(".swap-panel")).toHaveCount(0);
    await expect(page.locator(".workout-list > li").first()).toContainText("Barbell Squat");
  });
});
