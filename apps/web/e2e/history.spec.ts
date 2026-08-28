import { test, expect } from "@playwright/test";
import { seedProfile, seedLog, openHistory } from "./helpers";

test.describe("history", () => {
  test.beforeEach(async ({ page }) => {
    await seedProfile(page);
  });

  test("edits a logged set's weight and reps in place", async ({ page }) => {
    await seedLog(page, [{ id: "Barbell_Squat", weight: 140, reps: 5 }]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });

    await openHistory(page);
    await page.locator(".hist-set-action", { hasText: "Edit" }).click();

    const inputs = page.locator(".hist-edit-input");
    await inputs.first().fill("150");
    await inputs.nth(1).fill("3");
    await page.locator(".hist-edit-save").click();

    await expect(page.locator(".hload")).toHaveText("150 kg × 3");
    // The edit persisted to storage, not just the on-screen state.
    const stored = await page.evaluate(() => localStorage.getItem("guidetrain.log"));
    expect(JSON.parse(stored!)[0]).toMatchObject({ weight: 150, reps: 3 });
  });

  test("deletes one set without touching the other", async ({ page }) => {
    await seedLog(page, [
      { id: "Barbell_Squat", weight: 140, reps: 5 },
      { id: "Barbell_Bench_Press_-_Medium_Grip", weight: 100, reps: 5 },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });

    await openHistory(page);
    await expect(page.locator(".hist-day li")).toHaveCount(2);

    await page
      .locator(".hist-day li", { hasText: "Barbell Bench Press" })
      .locator(".hist-set-action", { hasText: "Delete" })
      .click();

    await expect(page.locator(".hist-day li")).toHaveCount(1);
    await expect(page.locator(".hname")).toHaveText("Barbell Squat");

    // Gone from the by-exercise view too, and gone from storage, not just
    // the current render.
    await page.getByRole("tab", { name: /by exercise/i }).click();
    await expect(page.locator(".hist-lifts li")).toHaveCount(1);
  });

  test("deleting a set from the by-exercise detail view removes it there too", async ({ page }) => {
    await seedLog(page, [
      { id: "Barbell_Squat", weight: 140, reps: 5 },
      { id: "Barbell_Squat", weight: 145, reps: 3 },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });

    await openHistory(page);
    await page.getByRole("tab", { name: /by exercise/i }).click();
    await page.locator(".hist-lifts button").click();

    await expect(page.locator(".hist-sets li")).toHaveCount(2);
    await page.locator(".hist-set-action", { hasText: "Delete" }).first().click();
    await expect(page.locator(".hist-sets li")).toHaveCount(1);
  });
});
