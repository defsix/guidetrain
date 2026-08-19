import type { Page } from "@playwright/test";

const STORAGE_KEY = "guidetrain.profile";
const PROGRAMS_KEY = "guidetrain.programs";
const ACTIVE_PROGRAM_KEY = "guidetrain.programs.active";

/**
 * Seeds a profile into localStorage before the page's own scripts run, so a
 * test can start as a returning visitor without going through the onboarding
 * form first. Must be called before `page.goto()` — `addInitScript` only
 * affects navigations that happen after it's registered.
 */
export async function seedProfile(page: Page, overrides: Record<string, unknown> = {}) {
  const profile = {
    username: "tester",
    ageGroup: "18-29",
    bodyWeight: 80,
    ...overrides,
  };
  await page.addInitScript(
    ([key, json]) => localStorage.setItem(key, json),
    [STORAGE_KEY, JSON.stringify(profile)] as [string, string],
  );
}

/**
 * Seeds an active workout with one exercise, so a test can log a set without
 * first walking through the plan library or the muscle explorer to build one.
 * Must be called before `page.goto()`, same as `seedProfile`.
 */
export async function seedProgram(page: Page, exerciseIds: string[] = ["Barbell_Squat"]) {
  const program = { id: "test-program", name: "Test workout", exerciseIds, targets: {} };
  await page.addInitScript(
    ([programsKey, activeKey, programJson, id]) => {
      localStorage.setItem(programsKey, JSON.stringify([JSON.parse(programJson)]));
      localStorage.setItem(activeKey, id);
    },
    [PROGRAMS_KEY, ACTIVE_PROGRAM_KEY, JSON.stringify(program), program.id] as [
      string,
      string,
      string,
      string,
    ],
  );
}
