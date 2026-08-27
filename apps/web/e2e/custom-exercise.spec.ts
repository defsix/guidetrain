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

  test("edits a mistyped name or the wrong equipment in place", async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await page.locator(".muscle").filter({ hasText: "Pectoralis Major" }).click();
    const drills = page.locator(".drills li");
    const before = await drills.count();
    await page.locator(".add-exercise-open").click();
    const createForm = page.locator(".add-exercise-form");
    await createForm.locator("input").fill("Landmien Press");
    await createForm.locator(".eq-chip", { hasText: "dumbbell" }).click();
    await createForm.getByRole("button", { name: "Add" }).click();
    await expect(drills).toHaveCount(before + 1);

    const row = drills.last();
    await row.locator(".drill-head").click();
    await row.getByRole("button", { name: "Edit" }).click();

    const editForm = row.locator(".add-exercise-form");
    await expect(editForm).toBeVisible();
    await expect(editForm.locator("input")).toHaveValue("Landmien Press");
    await editForm.locator("input").fill("Landmine Press");
    await editForm.locator(".eq-chip", { hasText: "barbell" }).click();
    await editForm.getByRole("button", { name: "Save" }).click();

    await expect(editForm).toHaveCount(0);
    await expect(row).toContainText("Landmine Press");
    await expect(row).not.toContainText("Landmien Press");
    await expect(row).toContainText("barbell");

    // Corrected in place, not as a second entry.
    await expect(drills).toHaveCount(before + 1);
    await expect(page.locator(".drills li").filter({ hasText: "Landmien Press" })).toHaveCount(0);
  });

  test("deletes a custom exercise", async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await page.locator(".muscle").filter({ hasText: "Pectoralis Major" }).click();
    const drills = page.locator(".drills li");
    const before = await drills.count();

    await page.locator(".add-exercise-open").click();
    const form = page.locator(".add-exercise-form");
    await form.locator("input").fill("Cable Squeeze Fly");
    await form.getByRole("button", { name: "Add" }).click();
    await expect(drills).toHaveCount(before + 1);

    const row = drills.last();
    await row.locator(".drill-head").click();
    await row.getByRole("button", { name: "Delete" }).click();

    await expect(drills).toHaveCount(before);
    await expect(page.locator(".drills li").filter({ hasText: "Cable Squeeze Fly" })).toHaveCount(0);

    // Gone for good, not just for this render.
    await page.reload();
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await page.locator(".muscle").filter({ hasText: "Pectoralis Major" }).click();
    await expect(drills).toHaveCount(before);
  });
});

test.describe("duplicate-name detection", () => {
  test("blocks a near-duplicate of an existing custom exercise, case and spacing aside", async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await page.locator(".muscle").filter({ hasText: "Pectoralis Major" }).click();
    const drills = page.locator(".drills li");

    await page.locator(".add-exercise-open").click();
    const firstForm = page.locator(".add-exercise-form");
    await firstForm.locator("input").fill("Landmine Press");
    await firstForm.getByRole("button", { name: "Add" }).click();
    const before = await drills.count();

    await page.locator(".add-exercise-open").click();
    const secondForm = page.locator(".add-exercise-form");
    await secondForm.locator("input").fill("  landmine   press  ");
    await secondForm.getByRole("button", { name: "Add" }).click();

    await expect(secondForm.locator(".add-exercise-error")).toContainText("Landmine Press");
    // Blocked, not silently created as a second row.
    await expect(drills).toHaveCount(before);
  });

  test("blocks a near-duplicate (typo) of a built-in catalogue exercise", async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await page.locator(".muscle").filter({ hasText: "Pectoralis Major" }).click();
    const drills = page.locator(".drills li");
    const before = await drills.count();

    await page.locator(".add-exercise-open").click();
    const form = page.locator(".add-exercise-form");
    await form.locator("input").fill("Push Up Wide");
    await form.getByRole("button", { name: "Add" }).click();

    await expect(form.locator(".add-exercise-error")).toContainText("Push-Up Wide");
    await expect(drills).toHaveCount(before);
  });

  test("does not flag an exercise against its own current name while editing", async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await page.locator(".muscle").filter({ hasText: "Pectoralis Major" }).click();
    const drills = page.locator(".drills li");

    await page.locator(".add-exercise-open").click();
    const createForm = page.locator(".add-exercise-form");
    await createForm.locator("input").fill("Landmine Press");
    await createForm.getByRole("button", { name: "Add" }).click();

    const row = drills.last();
    await row.locator(".drill-head").click();
    await row.getByRole("button", { name: "Edit" }).click();
    const editForm = row.locator(".add-exercise-form");
    // Same name, only the equipment changes — must not flag itself.
    await editForm.locator(".eq-chip", { hasText: "barbell" }).click();
    await editForm.getByRole("button", { name: "Save" }).click();

    await expect(editForm).toHaveCount(0);
    await expect(row).toContainText("Landmine Press");
    await expect(row).toContainText("barbell");
  });
});
