import { test, expect, type Locator, type Page } from "@playwright/test";
import { seedProfile } from "./helpers";

// A narrow, real-device-like width — the default Desktop Chrome viewport
// this suite otherwise runs at never triggers the bottom-sheet/canvas-
// toolbar layout these tests are specifically about.
test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

async function swipeDown(locator: Locator, distance: number) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("locator has no bounding box");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await locator.dispatchEvent("touchstart", {
    touches: [{ identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y }],
    changedTouches: [{ identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y }],
  });
  await locator.dispatchEvent("touchmove", {
    touches: [{ identifier: 1, clientX: x, clientY: y + distance / 2, pageX: x, pageY: y + distance / 2 }],
    changedTouches: [{ identifier: 1, clientX: x, clientY: y + distance / 2, pageX: x, pageY: y + distance / 2 }],
  });
  await locator.dispatchEvent("touchend", {
    touches: [],
    changedTouches: [{ identifier: 1, clientX: x, clientY: y + distance, pageX: x, pageY: y + distance }],
  });
}

test.describe("the canvas toolbar at a real phone width", () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("Workout, Calisthenics, Stretching and Muscle Groups all stay on one line", async ({ page }) => {
    const toolbar = page.locator(".anatomy-toolbar");
    const toolbarBox = await toolbar.boundingBox();
    // A single line of these pills is comfortably under 50px tall; a wrap
    // to two lines — the actual bug reported — roughly doubles that.
    expect(toolbarBox!.height).toBeLessThan(50);
  });

  test("the docked Muscle Groups panel never overlaps the toolbar above it", async ({ page }) => {
    // Opens already showing this panel (its default state), which is
    // exactly the scenario the overlap was reported in.
    const toolbar = page.locator(".anatomy-toolbar");
    const toolbarBox = await toolbar.boundingBox();
    const regions = page.locator("#anatomy-regions");
    await expect(regions).toBeVisible();
    const regionsBox = await regions.boundingBox();
    expect(regionsBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y + toolbarBox!.height);
  });
});

test.describe("swipe down to dismiss", () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("a real downward swipe on a panel's header closes it", async ({ page }) => {
    await page.getByRole("button", { name: /^Workout/i }).click();
    const header = page.locator(".workout-panel .workout-head");
    await expect(header).toBeVisible();
    await expect(header.locator(".sheet-handle")).toBeVisible();

    await swipeDown(header, 100);
    await expect(page.locator(".workout-panel")).toHaveCount(0);
  });

  test("a short drag under the threshold leaves the panel open", async ({ page }) => {
    await page.getByRole("button", { name: /^Workout/i }).click();
    const header = page.locator(".workout-panel .workout-head");

    await swipeDown(header, 20);
    await expect(page.locator(".workout-panel")).toBeVisible();
  });

  test("swiping the muscle readout sheet's header deselects the muscle", async ({ page }) => {
    // Same reliable way injuries.spec.ts reaches the readout — picking on
    // the 3D model itself isn't something a coordinate click lands on
    // headlessly, but the docked Muscle Groups list names each one directly.
    await page.locator(".muscle").filter({ hasText: "Quadriceps" }).click();
    await expect(page.locator(".anatomy-readout")).toBeVisible();

    const header = page.locator(".anatomy-readout .head");
    await expect(header.locator(".sheet-handle")).toBeVisible();
    await swipeDown(header, 100);
    await expect(page.locator(".anatomy-readout")).toHaveCount(0);
  });
});
