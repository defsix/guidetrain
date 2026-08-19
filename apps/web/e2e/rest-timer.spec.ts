import { test, expect, type Page } from "@playwright/test";
import { seedProfile, seedProgram } from "./helpers";

test.describe("the rest timer", () => {
  test.beforeEach(async ({ page }) => {
    await seedProfile(page);
    await seedProgram(page, ["Barbell_Squat"]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: /workout/i }).click();
  });

  async function logSet(page: Page, weight: string, reps: string) {
    const form = page.locator(".log-form");
    await form.locator("input").nth(0).fill(weight);
    await form.locator("input").nth(1).fill(reps);
    await form.getByRole("button", { name: "Add set" }).click();
  }

  /**
   * The seconds left, read off the on-screen "m:ss". Never asserted against
   * an exact value — the check itself takes real time to run, so the number
   * on screen is always a little behind whatever `restSeconds` returned.
   * What's worth asserting is which *tier* it landed in and how it moves.
   */
  async function readRestSeconds(page: Page): Promise<number> {
    await expect(page.locator(".rest-timer .rest-time")).toBeVisible();
    const text = await page.locator(".rest-timer .rest-time").textContent();
    const match = text?.match(/^(\d+):(\d{2})$/);
    if (!match) throw new Error(`unexpected rest timer text: ${text}`);
    return Number(match[1]) * 60 + Number(match[2]);
  }

  test("starts counting down after a set is logged, tiered by rep count", async ({ page }) => {
    await logSet(page, "100", "5");
    // Five reps is the heaviest tier: 180 seconds.
    const remaining = await readRestSeconds(page);
    expect(remaining).toBeGreaterThan(150);
    expect(remaining).toBeLessThanOrEqual(180);
  });

  test("a lighter, higher-rep set gets a shorter rest", async ({ page }) => {
    await logSet(page, "20", "20");
    // Twenty reps is the lightest tier: 60 seconds.
    const remaining = await readRestSeconds(page);
    expect(remaining).toBeGreaterThan(30);
    expect(remaining).toBeLessThanOrEqual(60);
  });

  test("skipping the rest clears the timer", async ({ page }) => {
    await logSet(page, "100", "5");
    await expect(page.locator(".rest-timer")).toBeVisible();

    await page.locator(".rest-skip").click();
    await expect(page.locator(".rest-timer")).toHaveCount(0);
  });

  test("extending adds time rather than restarting the countdown", async ({ page }) => {
    await logSet(page, "20", "20");
    const before = await readRestSeconds(page);

    await page.locator(".rest-extend").click();
    const after = await readRestSeconds(page);

    // +15 seconds on top of whatever was left, not a fresh 60 — a little
    // slack either way for the real time the check itself takes to run.
    expect(after - before).toBeGreaterThanOrEqual(10);
    expect(after - before).toBeLessThanOrEqual(17);
  });

  test("logging another set restarts the countdown at its own tier", async ({ page }) => {
    await logSet(page, "100", "5");
    const heavy = await readRestSeconds(page);
    expect(heavy).toBeGreaterThan(150);

    await logSet(page, "20", "20");
    // A fresh, lighter set replaces whatever was left of the last timer
    // rather than adding to it — there is only ever one rest running.
    const light = await readRestSeconds(page);
    expect(light).toBeGreaterThan(30);
    expect(light).toBeLessThanOrEqual(60);
  });

  test("the form stays usable while the timer counts down", async ({ page }) => {
    await logSet(page, "100", "5");
    await expect(page.locator(".rest-timer")).toBeVisible();

    // Nothing about a running timer blocks logging straight through it.
    await logSet(page, "100", "5");
    await expect(page.locator(".sets li")).toHaveCount(2);
  });
});
