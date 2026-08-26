import { test, expect } from "@playwright/test";
import { seedProfile, seedProfileForTour } from "./helpers";

test.describe("the spotlight tour", () => {
  test("starts automatically on a fresh profile, walks all six steps, and finishes", async ({ page }) => {
    await seedProfileForTour(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    const tooltip = page.locator(".tour-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Step 1 of 6");

    // Look, don't touch: the backdrop blocks a tap on something the tour
    // hasn't pointed at yet, rather than letting it fall through to the
    // real app underneath.
    await page.locator(".account-button", { hasText: /progress/i }).click({ force: true });
    await expect(page.locator(".stats-panel")).toHaveCount(0);

    await tooltip.getByRole("button", { name: "Next →" }).click();
    await expect(tooltip).toContainText("Step 2 of 6");
    // The tour added the demo exercise itself — no tap required to get here.
    await expect(page.locator(".anatomy-readout .save.on")).toBeVisible();

    await tooltip.getByRole("button", { name: "Next →" }).click();
    await expect(tooltip).toContainText("Step 3 of 6");
    await expect(page.locator(".workout-panel .workout-list")).toBeVisible();
    await expect(page.locator(".workout-list")).toContainText("Barbell Squat");

    await tooltip.getByRole("button", { name: "Next →" }).click();
    await expect(tooltip).toContainText("Step 4 of 6");
    await expect(page.locator(".workout-panel .log-form")).toBeVisible();

    await tooltip.getByRole("button", { name: "Next →" }).click();
    await expect(tooltip).toContainText("Step 5 of 6");
    await expect(page.locator(".workout-panel .plans-open")).toBeVisible();

    await tooltip.getByRole("button", { name: "Next →" }).click();
    await expect(tooltip).toContainText("Step 6 of 6");
    // The workout panel closes on the last step so the header's actually visible.
    await expect(page.locator(".workout-panel")).toHaveCount(0);
    await expect(page.locator(".help-button")).toBeVisible();

    await tooltip.getByRole("button", { name: "Got it" }).click();
    await expect(page.locator(".tour-tooltip")).toHaveCount(0);

    // Reloading doesn't bring it back — it's marked seen.
    await page.reload();
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.locator(".tour-tooltip")).toHaveCount(0);
  });

  test("skipping mid-tour closes it immediately and marks it seen", async ({ page }) => {
    await seedProfileForTour(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });

    const tooltip = page.locator(".tour-tooltip");
    await expect(tooltip).toBeVisible();
    await tooltip.getByRole("button", { name: "Skip" }).click();
    await expect(page.locator(".tour-tooltip")).toHaveCount(0);

    await page.reload();
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.locator(".tour-tooltip")).toHaveCount(0);
  });

  test("a normal seeded profile never sees the tour on its own", async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.locator(".tour-tooltip")).toHaveCount(0);
  });

  test("the ? button replays it on demand, from the start, even after it's been seen", async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator(".tour-tooltip")).toHaveCount(0);

    await page.locator(".help-button").click();
    const tooltip = page.locator(".tour-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Step 1 of 6");
  });
});
