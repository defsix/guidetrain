import { test, expect } from "@playwright/test";
import { seedProfile, seedKnownMax, seedLog } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;

// 100 x 5 then 115 x 5, two weeks apart: a 15% change in the estimated max
// (well past the 5% steady band — see recommend.ts's STEADY_FRACTION),
// giving a working load of 102.5 kg from the better (115 x 5) set.
const steadySquatSets = [
  { id: "Barbell_Squat", weight: 100, reps: 5, at: Date.now() - 14 * DAY },
  { id: "Barbell_Squat", weight: 115, reps: 5, at: Date.now() },
];

test.describe("exercise recommendations", () => {
  test("says nothing off an onboarding profile alone — the first-visit hint shows instead", async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await expect(page.locator(".explorer-recs")).toHaveCount(0);
    await expect(page.locator(".explorer-hint")).toBeVisible();
  });

  test("says nothing off a known max alone — one number is not a trend", async ({ page }) => {
    await seedProfile(page);
    await seedKnownMax(page, "Barbell_Squat", 150);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await expect(page.locator(".explorer-recs")).toHaveCount(0);
  });

  test("recommends a lift once its logged history shows a steady change, with a real starting weight", async ({
    page,
  }) => {
    await seedProfile(page);
    await seedLog(page, steadySquatSets);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    const rec = page.locator(".explorer-recs li").filter({ hasText: "Barbell Squat" });
    await expect(rec).toBeVisible();
    await expect(rec).toContainText("102.5 kg");
  });

  test("recommends a lift on a static result too — no real change across its logged history", async ({
    page,
  }) => {
    await seedProfile(page);
    // 100 x 5 then 101 x 5: a 1% change, inside the 2.5% static band.
    await seedLog(page, [
      { id: "Barbell_Deadlift", weight: 100, reps: 5, at: Date.now() - 21 * DAY },
      { id: "Barbell_Deadlift", weight: 101, reps: 5, at: Date.now() },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await expect(
      page.locator(".explorer-recs li").filter({ hasText: "Barbell Deadlift" }),
    ).toBeVisible();
  });

  test("adding a recommendation puts it in the workout and drops it from the list", async ({
    page,
  }) => {
    await seedProfile(page);
    await seedLog(page, steadySquatSets);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    const rec = page.locator(".explorer-recs li").filter({ hasText: "Barbell Squat" });
    await rec.getByRole("button", { name: /add/i }).click();

    await expect(page.locator(".anatomy-toolbar .wcount")).toHaveText("1");
    await expect(page.locator(".explorer-recs li").filter({ hasText: "Barbell Squat" })).toHaveCount(0);
  });

  test("dismissing the card hides it, and it stays hidden after a reload", async ({ page }) => {
    await seedProfile(page);
    await seedLog(page, steadySquatSets);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await expect(page.locator(".explorer-recs")).toBeVisible();
    await page.locator(".explorer-recs .workout-close").click();
    await expect(page.locator(".explorer-recs")).toHaveCount(0);

    await page.reload();
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.locator(".explorer-recs")).toHaveCount(0);
  });

  test("never recommends a lift under an 'avoid' injury", async ({ page }) => {
    await seedProfile(page);
    await seedLog(page, steadySquatSets);
    await page.addInitScript(() => {
      localStorage.setItem(
        "guidetrain.injuries",
        JSON.stringify({ quad: { mode: "avoid", setAt: Date.now() } }),
      );
    });
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await expect(page.locator(".explorer-recs li").filter({ hasText: "Barbell Squat" })).toHaveCount(0);
  });
});
