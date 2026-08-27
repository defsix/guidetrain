import { test, expect } from "@playwright/test";
import { seedProfile, seedLog } from "./helpers";

test.describe("the CSV export in History", () => {
  test("downloads a CSV of the logged sets", async ({ page }) => {
    await seedProfile(page);
    await seedLog(page, [{ id: "Barbell_Squat", weight: 100, reps: 5 }]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });

    await page.getByRole("button", { name: /history/i }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".history-export").click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^guidetrain-history-\d{4}-\d{2}-\d{2}\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf-8");

    expect(text).toContain("Date,Time,Exercise,Weight (kg),Reps");
    expect(text).toContain("Barbell Squat");
    expect(text).toContain("100");
  });
});
