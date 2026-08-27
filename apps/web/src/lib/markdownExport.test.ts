import { describe, expect, it } from "vitest";
import type { SetEntry } from "../state/useLog";
import type { Program } from "../state/usePrograms";
import { buildTrainingExport } from "./markdownExport";

/** A minimal stand-in for the real i18n `t`, good enough to check structure
 * and interpolation without loading the whole locale file. */
const t = (key: string, vars?: Record<string, string | number>, fallback?: string): string => {
  if (key.startsWith("equipment.")) return key.slice("equipment.".length);
  if (key === "injuryPanel.avoid") return "Avoid";
  if (key === "injuryPanel.warn") return "Warn";
  if (key.startsWith("muscles.")) return fallback ?? key;
  if (key === "program.day") return `Day ${vars?.n}`;
  if (key === "program.week") return `Week ${vars?.week} · Session ${vars?.session}`;
  if (key === "stats.goals.noBasis") return "no basis yet";
  if (key === "stats.goals.reached") return "reached";
  if (key === "stats.goals.onPace") return `on pace, ${vars?.count} cycles`;
  if (key === "stats.goals.behind") return `behind, ${vars?.count} cycles`;
  if (key === "stats.goals.pastDeadline") return "past deadline";
  return fallback ?? key;
};

const localizeExercise = <T extends { id: string; name: string; instructions: string[] }>(x: T): T => x;

const set = (over: Partial<SetEntry>): SetEntry => ({
  uid: "u",
  id: "Barbell_Squat",
  weight: 100,
  reps: 5,
  at: Date.UTC(2026, 0, 15),
  ...over,
});

describe("buildTrainingExport", () => {
  it("says plainly when there is no profile, program, injury or log data", () => {
    const md = buildTrainingExport({
      profile: null, allSets: [], knownMaxes: {}, trainingMaxes: {}, goals: {}, injuries: {},
      programs: [], customExercises: [], t, localizeExercise,
    });
    expect(md).toContain("No profile set up yet.");
    expect(md).toContain("No workout set up yet.");
    expect(md).toContain("None marked.");
    expect(md).toContain("No sets logged, maxes set or goals in place yet.");
  });

  it("reports the profile's body weight and equipment", () => {
    const md = buildTrainingExport({
      profile: { username: "x", ageGroup: "30-44", bodyWeight: 82, equipment: ["barbell", "dumbbell"] },
      allSets: [], knownMaxes: {}, trainingMaxes: {}, goals: {}, injuries: {}, programs: [],
      customExercises: [], t, localizeExercise,
    });
    expect(md).toContain("Age group: 30-44");
    expect(md).toContain("Body weight: 82 kg");
    expect(md).toContain("Equipment available: barbell, dumbbell");
  });

  it("lists a program's exercises with their prescribed steps", () => {
    const program: Program = {
      id: "p1",
      name: "Push",
      exerciseIds: ["Barbell_Bench_Press_-_Medium_Grip"],
      targets: {
        "Barbell_Bench_Press_-_Medium_Grip": {
          sets: 2,
          reps: 5,
          steps: [
            { load: 80, reps: 5 },
            { load: 85, reps: 5, amrap: true },
          ],
        },
      },
    } as Program;
    const md = buildTrainingExport({
      profile: null, allSets: [], knownMaxes: {}, trainingMaxes: {}, goals: {}, injuries: {},
      programs: [program], customExercises: [], t, localizeExercise,
    });
    expect(md).toContain("### Push");
    expect(md).toContain("5 @ 80 kg, 5+ @ 85 kg");
  });

  it("groups the log by exercise, most recently trained first, with every set", () => {
    const md = buildTrainingExport({
      profile: null,
      allSets: [
        set({ id: "Barbell_Squat", at: Date.UTC(2026, 0, 1), weight: 100 }),
        set({ id: "Barbell_Squat", at: Date.UTC(2026, 0, 15), weight: 105 }),
        set({ id: "Barbell_Deadlift", at: Date.UTC(2026, 0, 20), weight: 140 }),
      ],
      knownMaxes: {}, trainingMaxes: {}, goals: {}, injuries: {}, programs: [],
      customExercises: [], t, localizeExercise,
    });
    const deadliftIdx = md.indexOf("Barbell Deadlift");
    const squatIdx = md.indexOf("Barbell Squat");
    expect(deadliftIdx).toBeGreaterThan(-1);
    expect(deadliftIdx).toBeLessThan(squatIdx);
    expect(md).toContain("2 sets logged, 2026-01-01 to 2026-01-15");
    expect(md).toContain("2026-01-01: 100 kg × 5");
    expect(md).toContain("2026-01-15: 105 kg × 5");
  });

  it("shows a typed-in known max over an estimate from the log", () => {
    const md = buildTrainingExport({
      profile: null,
      allSets: [set({ weight: 100, reps: 5 })],
      knownMaxes: { Barbell_Squat: { max: 150, from: null, at: 0 } },
      trainingMaxes: {}, goals: {}, injuries: {}, programs: [],
      customExercises: [], t, localizeExercise,
    });
    expect(md).toContain("Known max, typed in: 150 kg");
  });

  it("reports a marked injury with its mode and date", () => {
    const md = buildTrainingExport({
      profile: null, allSets: [], knownMaxes: {}, trainingMaxes: {}, goals: {},
      injuries: { knee: { mode: "avoid", setAt: Date.UTC(2026, 0, 1) } },
      programs: [], customExercises: [], t, localizeExercise,
    });
    expect(md).toContain("- knee: Avoid (marked 2026-01-01)");
  });

  it("includes a custom exercise's own log the same as a catalogue one", () => {
    const md = buildTrainingExport({
      profile: null,
      allSets: [set({ id: "custom-abc123", weight: 40, reps: 12 })],
      knownMaxes: {}, trainingMaxes: {}, goals: {}, injuries: {}, programs: [],
      customExercises: [
        { id: "custom-abc123", name: "Reverse Nordic Curl", equipment: "body only", primary: "quad", createdAt: 0 },
      ],
      t, localizeExercise,
    });
    expect(md).toContain("### Reverse Nordic Curl (body only)");
    expect(md).toContain("40 kg × 12");
  });
});
