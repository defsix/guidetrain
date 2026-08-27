import { test, expect } from "@playwright/test";
import { seedProfile } from "./helpers";

test.describe("adding a custom exercise from the muscle picker", () => {
  test("creates it under the muscle, remembers it, and it works like any other exercise", async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await page.locator(".muscle").filter({ hasText: "Pectoralis Major" }).click();
    const drills = page.locator(".drills li");
    const before = await drills.count();

    await page.locator(".add-exercise-open").click();
    const form = page.locator(".add-exercise-form");
    await expect(form).toBeVisible();
    await form.locator("input").fill("Landmine Squeeze Press");
    await form.locator(".eq-chip", { hasText: "dumbbell" }).click();
    await form.getByRole("button", { name: "Add" }).click();

    // Filed under this muscle, at the bottom of its list — not reordered in
    // among the catalogue's own entries above it.
    await expect(drills).toHaveCount(before + 1);
    const newRow = drills.last();
    await expect(newRow).toContainText("Landmine Squeeze Press");
    await expect(newRow).toContainText("dumbbell");

    // Remembered: still there after a reload, still at the bottom.
    await page.reload();
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await page.locator(".muscle").filter({ hasText: "Pectoralis Major" }).click();
    await expect(drills).toHaveCount(before + 1);
    await expect(drills.last()).toContainText("Landmine Squeeze Press");

    // Selectable like any other exercise: the same save toggle every
    // catalogue row has, adds it to the active workout.
    await drills.last().locator(".save").click();

    // The toolbar pill specifically — a plain /workout/i role query also
    // matches every drill row's "Add to workout — <name>" save button while
    // the muscle readout is still open.
    await page.locator(".workout-button").first().click();
    const row = page.locator(".workout-list > li").filter({ hasText: "Landmine Squeeze Press" });
    await expect(row).toBeVisible();
    await row.locator(".log-form input").first().fill("22");
    await row.locator(".log-form input").nth(1).fill("10");
    await row.getByRole("button", { name: /add set/i }).click();
    await page.locator(".workout-close").first().click();

    // Logged, tracked and named correctly in History — the same as a
    // built-in exercise, not falling back to a raw id.
    await page.getByRole("button", { name: /history/i }).click();
    const historyPanel = page.locator(".history-panel");
    await expect(historyPanel).toContainText("Landmine Squeeze Press");
    await expect(historyPanel).toContainText("22");
  });
});
