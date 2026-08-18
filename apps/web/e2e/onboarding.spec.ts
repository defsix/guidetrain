import { test, expect } from "@playwright/test";

test.describe("a new visitor", () => {
  test("sees the full splash, then the form, and can reach the explorer", async ({ page }) => {
    await page.goto("/");

    // New visitor: no profile, no session — the full splash with its
    // loading bar, not the quick bar-less flash returning visitors get.
    const splashRow = page.locator(".splash-row");
    await expect(splashRow).toBeVisible();
    await expect(page.locator(".splash-bar")).toBeVisible();
    await expect(page.locator(".splash-quick")).toHaveCount(0);

    // Splash clears on its own (~1.4s: 0.9s hold + 0.5s fade) and the form
    // underneath becomes usable without anything else being clicked.
    await expect(page.locator(".splash")).toHaveCount(0, { timeout: 3000 });

    const [username, weight] = await page.locator("input").all();
    await username.fill("tester");
    await weight.fill("80");
    await page.getByText("18 - 29", { exact: true }).click();

    const continueButton = page.getByRole("button", { name: /continue/i });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect(page).toHaveURL(/#\/explore$/);
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("keeps Continue disabled until all three fields are answered", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".splash")).toHaveCount(0, { timeout: 3000 });

    const continueButton = page.getByRole("button", { name: /continue/i });
    await expect(continueButton).toBeDisabled();

    const [username] = await page.locator("input").all();
    await username.fill("tester");
    await expect(continueButton).toBeDisabled();
  });
});
