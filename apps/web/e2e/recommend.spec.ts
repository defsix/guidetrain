import { test, expect } from "@playwright/test";
import { seedProfile, seedKnownMax } from "./helpers";

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

  test("recommends a lift once it has a known max, with a real starting weight", async ({
    page,
  }) => {
    await seedProfile(page);
    await seedKnownMax(page, "Barbell_Squat", 150);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    const rec = page.locator(".explorer-recs li").filter({ hasText: "Barbell Squat" });
    await expect(rec).toBeVisible();
    // 150 / (1 + 5/30) = 128.57, x 0.9 = 115.71, rounded to the 2.5 step.
    await expect(rec).toContainText("115 kg");
  });

  test("adding a recommendation puts it in the workout and drops it from the list", async ({
    page,
  }) => {
    await seedProfile(page);
    await seedKnownMax(page, "Barbell_Squat", 150);
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
    await seedKnownMax(page, "Barbell_Squat", 150);
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
    await seedKnownMax(page, "Barbell_Squat", 150);
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
