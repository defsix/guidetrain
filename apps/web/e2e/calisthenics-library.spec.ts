import { test, expect } from "@playwright/test";
import { seedProfile } from "./helpers";

test.describe("the calisthenics library", () => {
  test.beforeEach(async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: /^Calisthenics$/i }).click();
  });

  test("lists bodyweight exercises, filterable by muscle", async ({ page }) => {
    const panel = page.locator(".calisthenics-panel");
    await expect(panel).toBeVisible();

    const rows = panel.locator(".calisthenics-list > li");
    const allCount = await rows.count();
    expect(allCount).toBeGreaterThan(10);

    // Every row here is a real bodyweight exercise — none of them should be
    // a barbell/dumbbell/machine lift from the main catalogue.
    await expect(panel).not.toContainText("Barbell Squat");

    // The first chip is "All"; the second is a real muscle filter.
    await panel.locator(".chip").nth(1).click();
    const filtered = await rows.count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(allCount);
  });

  test("adding an exercise from the library puts it in the workout, reps only", async ({
    page,
  }) => {
    const panel = page.locator(".calisthenics-panel");
    const firstRow = panel.locator(".calisthenics-row").first();
    const name = (await firstRow.locator(".calisthenics-name").textContent())?.replace(/^[▸▾]\s*/, "").trim();

    await firstRow.locator(".save").click();
    await expect(firstRow.locator(".save")).toHaveClass(/on/);

    await panel.locator(".workout-close").click();
    await page.getByRole("button", { name: /^Workout/i }).click();

    const workoutRow = page.locator(".workout-list > li").first();
    await expect(workoutRow).toContainText(name!);
    // Reps-only: no weight input, just the reps field.
    await expect(workoutRow.locator(".log-form input")).toHaveCount(1);
  });

  test("removing it from the library takes it back out of the workout", async ({ page }) => {
    const panel = page.locator(".calisthenics-panel");
    const firstRow = panel.locator(".calisthenics-row").first();

    await firstRow.locator(".save").click();
    await expect(firstRow.locator(".save")).toHaveClass(/on/);

    await firstRow.locator(".save").click();
    await expect(firstRow.locator(".save")).not.toHaveClass(/on/);

    await panel.locator(".workout-close").click();
    await page.getByRole("button", { name: /^Workout/i }).click();
    await expect(page.locator(".workout-empty")).toBeVisible();
  });

  test("expanding a row shows its instructions", async ({ page }) => {
    const panel = page.locator(".calisthenics-panel");
    const firstItem = panel.locator(".calisthenics-list > li").first();

    await expect(firstItem.locator(".calisthenics-steps")).toHaveCount(0);
    await firstItem.locator(".calisthenics-name").click();
    await expect(firstItem.locator(".calisthenics-steps")).toBeVisible();
  });
});
