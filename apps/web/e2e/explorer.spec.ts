import { test, expect } from "@playwright/test";
import { seedProfile } from "./helpers";

test.describe("the explorer", () => {
  test.beforeEach(async ({ page }) => {
    await seedProfile(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("opens the plan library from Workout → Browse Plans and shows plan cards", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /workout/i }).click();
    await page.locator(".plans-open").first().click();

    const plansPanel = page.locator(".plans-panel");
    await expect(plansPanel).toBeVisible();
    await expect(plansPanel.locator(".plan-card").first()).toBeVisible();
  });

  test("toggles an equipment chip and it stays selected on reopen", async ({ page }) => {
    await page.getByRole("button", { name: /equipment/i }).click();

    const barbellChip = page.getByRole("button", { name: "barbell", exact: true });
    await expect(barbellChip).toBeVisible();
    await expect(barbellChip).not.toHaveClass(/chip-selected/);

    await barbellChip.click();
    await expect(barbellChip).toHaveClass(/chip-selected/);

    // Close and reopen: the choice is profile state, not panel-local state.
    await page.locator(".workout-close").click();
    await page.getByRole("button", { name: /equipment/i }).click();
    await expect(page.getByRole("button", { name: "barbell", exact: true })).toHaveClass(
      /chip-selected/,
    );
  });
});
