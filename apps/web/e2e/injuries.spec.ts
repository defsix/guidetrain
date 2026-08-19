import { test, expect } from "@playwright/test";
import { seedProfile, seedProgram, seedInjury } from "./helpers";

test.describe("injury marking", () => {
  test("marks a muscle avoided from the Injuries section of Progress and it persists on reopen", async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await page.getByRole("button", { name: /progress/i }).click();
    const row = page.locator(".injury-row").filter({ hasText: "Quadriceps" });
    const avoidChip = row.getByRole("button", { name: "Avoid", exact: true });
    await expect(avoidChip).not.toHaveClass(/chip-selected/);

    await avoidChip.click();
    await expect(avoidChip).toHaveClass(/chip-selected/);

    await page.locator(".stats-panel .workout-close").click();
    await page.getByRole("button", { name: /progress/i }).click();
    await expect(
      page.locator(".injury-row").filter({ hasText: "Quadriceps" }).getByRole("button", {
        name: "Avoid",
        exact: true,
      }),
    ).toHaveClass(/chip-selected/);
  });

  test("an avoided muscle disables Train This and shows why", async ({ page }) => {
    await seedProfile(page);
    await seedInjury(page, "quad", "avoid");
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await page.locator(".muscle").filter({ hasText: "Quadriceps" }).click();

    const readout = page.locator(".anatomy-readout");
    await expect(readout.locator(".minjury")).toContainText("Avoid");
    await expect(readout.locator(".minjury")).toContainText("Quadriceps");
    await expect(readout.locator(".train-btn")).toBeDisabled();
  });

  test("an avoided muscle empties the swap list for an exercise that trains it", async ({
    page,
  }) => {
    await seedProfile(page);
    await seedProgram(page, ["Barbell_Squat"]);
    await seedInjury(page, "quad", "avoid");
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await page.getByRole("button", { name: /workout/i }).click();
    await page.getByRole("button", { name: /swap/i }).click();

    await expect(page.locator(".swap-panel")).toBeVisible();
    await expect(page.locator(".swap-panel .workout-empty")).toBeVisible();
    await expect(page.locator(".swap-option")).toHaveCount(0);
  });

  test("a marked injury flags a ready-made plan's preview row", async ({ page }) => {
    await seedProfile(page);
    await seedInjury(page, "quad", "warn");
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();

    await page.getByRole("button", { name: /workout/i }).click();
    await page.locator(".plans-open").first().click();
    await page
      .locator(".plan-card")
      .filter({ has: page.locator(".pname", { hasText: /^Full body$/ }) })
      .click();

    const squatRow = page.locator(".plan-day li").filter({ hasText: "Barbell Squat" }).first();
    await expect(squatRow.locator(".dinjury")).toContainText("Caution");
    await expect(squatRow.locator(".dinjury")).toContainText("Quadriceps");
  });
});
