import { test, expect } from "@playwright/test";
import { seedProfile, seedProgram } from "./helpers";

test.describe("workout naming", () => {
  test("a rotation plan's tabs read 'Day N · <name>'", async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: /workout/i }).click();
    await page.locator(".plans-open").first().click();
    await page
      .locator(".plan-card")
      .filter({ has: page.locator(".pname", { hasText: /^Push \/ pull \/ legs$/ }) })
      .click();
    await page.getByRole("button", { name: /add 3 workouts/i }).click();

    const tabs = page.locator(".program-tab");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toContainText("Day 1");
    await expect(tabs.nth(0)).toContainText("Push");
    await expect(tabs.nth(1)).toContainText("Day 2");
    await expect(tabs.nth(1)).toContainText("Pull");
    await expect(tabs.nth(2)).toContainText("Day 3");
    await expect(tabs.nth(2)).toContainText("Legs");
  });

  test("the combined Russian plan's tabs read 'Week W · Session S · <lift>', continuously across all three blocks", async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: /workout/i }).click();
    await page.locator(".plans-open").first().click();
    await page
      .locator(".plan-card")
      .filter({ has: page.locator(".pname", { hasText: /Russian Squat, Bench & Deadlift/ }) })
      .click();
    await page.getByRole("button", { name: /add 54 workouts/i }).click();

    const tabs = page.locator(".program-tab");
    await expect(tabs).toHaveCount(54);
    // First session of the squat block.
    await expect(tabs.nth(0)).toContainText("Week 1");
    await expect(tabs.nth(0)).toContainText("Session 1");
    await expect(tabs.nth(0)).toContainText("Squat");
    // Last session of the squat block, right before the bench block starts —
    // this pair used to render as two identical "Session 18" tabs.
    await expect(tabs.nth(17)).toContainText("Week 6");
    await expect(tabs.nth(17)).toContainText("Session 3");
    await expect(tabs.nth(17)).toContainText("Squat");
    await expect(tabs.nth(18)).toContainText("Week 7");
    await expect(tabs.nth(18)).toContainText("Session 1");
    await expect(tabs.nth(18)).toContainText("Bench");
    // Last session overall, the deadlift block's final session.
    await expect(tabs.nth(53)).toContainText("Week 18");
    await expect(tabs.nth(53)).toContainText("Session 3");
    await expect(tabs.nth(53)).toContainText("Deadlift");
  });

  test("a hand-built workout with no plan behind it just reads 'Day N'", async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: /workout/i }).click();
    await page.locator(".program-add").click();

    await expect(page.locator(".program-tab").first()).toHaveText(/^Day 1\d*$/);
  });
});

test.describe("pinning an exercise", () => {
  test("floats it to the top of the workout, and back out again once unpinned", async ({ page }) => {
    await seedProfile(page);
    await seedProgram(page, ["Barbell_Bench_Press_-_Medium_Grip", "Barbell_Squat"]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: /workout/i }).click();

    const rows = page.locator(".workout-list > li");
    await expect(rows.first()).toContainText("Barbell Bench Press");

    await rows.nth(1).locator("button.pin").click();
    await expect(rows.first()).toContainText("Barbell Squat");
    // A pinned row's position is decided by the pin, not by hand — its
    // move buttons are disabled rather than left to make a confusing move.
    await expect(rows.first().locator(".wmove button").nth(1)).toBeDisabled();
    await expect(rows.first().locator(".wmove button").nth(2)).toBeDisabled();

    await rows.first().locator("button.pin").click();
    await expect(rows.first()).toContainText("Barbell Bench Press");
  });
});
