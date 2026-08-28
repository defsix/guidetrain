import type { Page } from "@playwright/test";

const STORAGE_KEY = "guidetrain.profile";
const PROGRAMS_KEY = "guidetrain.programs";
const ACTIVE_PROGRAM_KEY = "guidetrain.programs.active";
const LOG_KEY = "guidetrain.log";
const INJURIES_KEY = "guidetrain.injuries";
const KNOWN_MAX_KEY = "guidetrain.knownmax";
const TOUR_SEEN_KEY = "guidetrain.tourSeen";
const CUSTOM_EXERCISES_KEY = "guidetrain.customexercises";

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
    ([key, json, tourKey]) => {
      localStorage.setItem(key, json);
      // Every spec but the tour's own (see seedProfileForTour below) is
      // testing something other than the first-run tour, and its full-screen
      // backdrop would otherwise block every one of them the moment the page
      // loads a fresh, seeded profile.
      localStorage.setItem(tourKey, "1");
    },
    [STORAGE_KEY, JSON.stringify(profile), TOUR_SEEN_KEY] as [string, string, string],
  );
}

/**
 * `seedProfile`, minus the tour-already-seen flag it otherwise always sets —
 * the one case that wants the spotlight tour to actually auto-start.
 */
export async function seedProfileForTour(page: Page, overrides: Record<string, unknown> = {}) {
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
export async function seedProgram(
  page: Page,
  exerciseIds: string[] = ["Barbell_Squat"],
  targets: Record<string, unknown> = {},
) {
  const program = { id: "test-program", name: "Test workout", exerciseIds, targets };
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

/**
 * Seeds logged sets directly, so a test can reach a state that depends on
 * training-max history (a 5/3/1 cycle, a progression estimate) without
 * logging them through the UI first. Must be called before `page.goto()`,
 * same as `seedProfile`.
 */
export async function seedLog(
  page: Page,
  sets: { id: string; weight: number; reps: number; at?: number }[],
) {
  const entries = sets.map((s, i) => ({
    uid: `seed-${i}`,
    at: Date.now(),
    ...s,
  }));
  await page.addInitScript(
    ([key, json]) => localStorage.setItem(key, json),
    [LOG_KEY, JSON.stringify(entries)] as [string, string],
  );
}

/**
 * Seeds a muscle marked injured, by its zone id (see muscle-map.json) —
 * "quad", "pec" and so on. Must be called before `page.goto()`, same as the
 * other seed helpers.
 */
export async function seedInjury(page: Page, muscleId: string, mode: "avoid" | "warn") {
  const injuries = { [muscleId]: { mode, setAt: Date.now() } };
  await page.addInitScript(
    ([key, json]) => localStorage.setItem(key, json),
    [INJURIES_KEY, JSON.stringify(injuries)] as [string, string],
  );
}

/**
 * Seeds a known max for an exercise, the same way typing one into the
 * Progress page would. Must be called before `page.goto()`, same as the
 * other seed helpers.
 */
export async function seedKnownMax(page: Page, exerciseId: string, max: number) {
  const maxes = { [exerciseId]: { max, from: null, at: Date.now() } };
  await page.addInitScript(
    ([key, json]) => localStorage.setItem(key, json),
    [KNOWN_MAX_KEY, JSON.stringify(maxes)] as [string, string],
  );
}

/**
 * Seeds one exercise the reader typed in themselves — see
 * useCustomExercises.ts. Must be called before `page.goto()`, same as the
 * other seed helpers.
 */
export async function seedCustomExercise(
  page: Page,
  exercise: { id: string; name: string; equipment: string; primary: string },
) {
  const entries = [{ ...exercise, createdAt: Date.now() }];
  await page.addInitScript(
    ([key, json]) => localStorage.setItem(key, json),
    [CUSTOM_EXERCISES_KEY, JSON.stringify(entries)] as [string, string],
  );
}

/**
 * History and Progress both live behind the account menu now — opened from
 * the logo — rather than as their own header pills. Every spec that needs
 * either panel opens it the same way, so this is the one place that knows
 * how.
 */
export async function openAccountMenuItem(page: Page, name: RegExp | string) {
  await page.locator(".logo-link").click();
  await page.locator(".account-menu-item", { hasText: name }).click();
}

export async function openHistory(page: Page) {
  await openAccountMenuItem(page, /history/i);
}

export async function openProgress(page: Page) {
  await openAccountMenuItem(page, /^progress$/i);
}
