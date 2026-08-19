import { test, expect } from "@playwright/test";
import { seedProfile } from "./helpers";

test.describe("the progress panel", () => {
  test.beforeEach(async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("shows the seeded body weight and lets a lift max be set by hand", async ({ page }) => {
    await page.getByRole("button", { name: /progress/i }).click();

    const panel = page.locator(".stats-panel");
    await expect(panel).toBeVisible();
    // seedProfile's default bodyWeight is 80.
    await expect(panel.getByText("80 kg", { exact: true })).toBeVisible();

    const squatSection = panel.locator(".stats-section").filter({ hasText: "Squat" });
    await expect(squatSection.locator(".stats-current")).toHaveText("not set");

    await squatSection.locator("input").fill("140");
    await squatSection.locator(".stats-save").click();

    await expect(squatSection.locator(".stats-current")).toHaveText("140 kg");
    // Nothing logged for this lift, so the note explains it's a claim, not a
    // calculation, and offers no "revert" — there's nothing to revert to.
    await expect(squatSection.getByText(/nothing logged for this lift yet/i)).toBeVisible();
    await expect(squatSection.locator(".tm-clear")).toHaveCount(0);
  });

  test("a known max nudges a related lift's starting weight in the plan preview", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /progress/i }).click();
    const benchSection = page
      .locator(".stats-panel .stats-section")
      .filter({ hasText: "Bench" });
    await benchSection.locator("input").fill("100");
    await benchSection.locator(".stats-save").click();
    await page.locator(".stats-panel .workout-close").click();

    await page.getByRole("button", { name: /workout/i }).click();
    await page.locator(".plans-open").first().click();
    // "Body part split" is the plan containing Incline Bench Press, a
    // RELATED_TO entry anchored on the flat Bench Press just set above.
    await page.getByRole("button", { name: /body part split/i }).click();

    const inclineRow = page
      .locator(".plans-panel li")
      .filter({ hasText: "Incline Bench Press" });
    await expect(inclineRow).toBeVisible();
    // 100 (known bench max) x 0.8 (RELATED_TO's fraction) = 80, through the
    // same workingLoad as any other prescription for a set of 10: 80 /
    // (1 + 10/30) x 0.9 = 54, rounded to 55.
    await expect(inclineRow.getByText("55")).toBeVisible();
    await expect(inclineRow.getByText(/from barbell bench press/i)).toBeVisible();

    // The flat Bench Press row itself — not just the related lift — now
    // uses the known max too: 100 / (1 + 8/30) x 0.9 = 71.05, rounded to 70,
    // labelled "your set max" rather than "starting point".
    const benchRow = page
      .locator(".plans-panel li")
      .filter({ hasText: "Barbell Bench Press" });
    await expect(benchRow.getByText("70")).toBeVisible();
    await expect(benchRow.getByText(/your set max/i)).toBeVisible();
  });
});
