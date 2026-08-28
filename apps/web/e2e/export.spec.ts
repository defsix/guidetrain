import { test, expect } from "@playwright/test";
import { seedProfile, seedProgram, seedLog, seedInjury, seedCustomExercise, openProgress } from "./helpers";

test.describe("the AI-ready training export", () => {
  test("downloads a Markdown file covering profile, program, injuries and log", async ({
    page,
  }) => {
    await seedProfile(page, { equipment: ["barbell"] });
    await seedProgram(page, ["Barbell_Squat"], {
      Barbell_Squat: { sets: 1, reps: 5 },
    });
    await seedLog(page, [{ id: "Barbell_Squat", weight: 100, reps: 5 }]);
    await seedInjury(page, "knee", "avoid");
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });

    await openProgress(page);
    const panel = page.locator(".stats-panel");
    await expect(panel).toBeVisible();

    const exportSection = panel.locator(".stats-section").filter({ hasText: /export/i });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportSection.getByRole("button", { name: /export/i }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^guidetrain-training-\d{4}-\d{2}-\d{2}\.md$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf-8");

    expect(text).toContain("# GuideTrain training export");
    expect(text).toContain("Age group:");
    expect(text).toContain("Equipment available: barbell");
    expect(text).toContain("Barbell Squat");
    expect(text).toContain("100 kg × 5");
    expect(text).toContain("Avoid");
  });

  test("names a custom exercise by its real name in both the program and log sections", async ({
    page,
  }) => {
    await seedProfile(page);
    await seedCustomExercise(page, {
      id: "custom-e2e2",
      name: "Reverse Nordic Curl",
      equipment: "body only",
      primary: "quad",
    });
    await seedProgram(page, ["custom-e2e2"]);
    await seedLog(page, [{ id: "custom-e2e2", weight: 0, reps: 12 }]);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/explore$/, { timeout: 1500 });

    await openProgress(page);
    const panel = page.locator(".stats-panel");
    const exportSection = panel.locator(".stats-section").filter({ hasText: /export/i });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportSection.getByRole("button", { name: /export/i }).click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf-8");

    const occurrences = text.split("Reverse Nordic Curl").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2); // once in the program, once in the log
    expect(text).not.toContain("custom-e2e2");
  });
});
