import { test, expect } from "@playwright/test";
import { seedProfile } from "./helpers";

test.describe("the stretching library", () => {
  test.beforeEach(async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: /^Stretching$/i }).click();
  });

  test("lists stretches, filterable by muscle, with nothing to log", async ({ page }) => {
    const panel = page.locator(".stretching-panel");
    await expect(panel).toBeVisible();

    const rows = panel.locator(".stretch-row");
    const allCount = await rows.count();
    expect(allCount).toBeGreaterThan(20);

    // Never anything to add or log here — no weight/reps fields anywhere,
    // no "add to workout" affordance like the calisthenics library has.
    await expect(panel.locator("input")).toHaveCount(0);
    await expect(panel.locator(".save")).toHaveCount(0);

    await panel.locator(".chip").nth(1).click();
    const filtered = await rows.count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(allCount);
  });

  test("expanding a row shows its instructions", async ({ page }) => {
    const panel = page.locator(".stretching-panel");
    const firstItem = panel.locator(".stretch-list > li").first();

    await expect(firstItem.locator(".stretch-steps")).toHaveCount(0);
    await firstItem.locator(".stretch-name").click();
    await expect(firstItem.locator(".stretch-steps")).toBeVisible();
  });

  test("expanding a row offers a YouTube search link instead of an embed", async ({ page }) => {
    const panel = page.locator(".stretching-panel");
    const firstItem = panel.locator(".stretch-list > li").first();

    await firstItem.locator(".stretch-name").click();
    const link = firstItem.locator("a.watch");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /^https:\/\/www\.youtube\.com\/results/);
    await expect(link).toHaveAttribute("target", "_blank");
  });

  test("starting a hold counts down, and stopping it clears the timer", async ({ page }) => {
    const panel = page.locator(".stretching-panel");
    const firstItem = panel.locator(".stretch-list > li").first();

    await firstItem.locator("button.stretch-hold").click();
    await expect(firstItem.locator(".stretch-hold-time")).toBeVisible();

    const text = await firstItem.locator(".stretch-hold-time").textContent();
    const match = text?.match(/^(\d+):(\d{2})$/);
    expect(match).toBeTruthy();
    const seconds = Number(match![1]) * 60 + Number(match![2]);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(30);

    await firstItem.locator(".stretch-hold-stop").click();
    await expect(firstItem.locator(".stretch-hold-time")).toHaveCount(0);
    await expect(firstItem.locator("button.stretch-hold")).toBeVisible();
  });

  test("holding one stretch doesn't start a timer on another", async ({ page }) => {
    const panel = page.locator(".stretching-panel");
    const items = panel.locator(".stretch-list > li");

    await items.nth(0).locator("button.stretch-hold").click();
    await expect(items.nth(0).locator(".stretch-hold-time")).toBeVisible();
    await expect(items.nth(1).locator(".stretch-hold-time")).toHaveCount(0);
  });
});
