import { describe, expect, it } from "vitest";
import type { Profile } from "../types";
import type { SetEntry } from "../state/useLog";
import type { KnownMaxEntry } from "../state/useKnownMax";
import { recommendExercises } from "./recommend";

const profile = (over: Partial<Profile> = {}): Profile =>
  ({
    username: "test",
    ageGroup: "30-44",
    bodyWeight: 82,
    bodyWeightUnit: "kg",
    ...over,
  }) as Profile;

const known = (id: string, max: number): Record<string, KnownMaxEntry> => ({
  [id]: { max, from: null, at: 0 },
});

describe("recommendExercises", () => {
  it("recommends nothing off an onboarding profile alone — body weight isn't a real basis", () => {
    // No known max, no logged set: only prescribe()'s "bodyweight" fallback
    // is available, and that's available to every profile from onboarding —
    // exactly the case this function has to say nothing about.
    expect(recommendExercises([], [], profile(), {}, {})).toEqual([]);
  });

  it("recommends nothing for a profile with no body weight either", () => {
    expect(recommendExercises([], [], profile({ bodyWeight: undefined }), {}, {})).toEqual([]);
  });

  it("recommends a lift with a known max, at prescribe()'s own working load", () => {
    const recs = recommendExercises([], [], profile(), known("Barbell_Squat", 150), {});
    // 150 / (1 + 5/30) = 128.57, x 0.9 = 115.71, rounded to the 2.5 step.
    expect(recs).toContainEqual({ id: "Barbell_Squat", load: 115 });
  });

  it("recommends a lift from a logged set, not just a typed-in max", () => {
    const sets: SetEntry[] = [{ uid: "1", id: "Barbell_Deadlift", weight: 140, reps: 5, at: 0 }];
    const recs = recommendExercises([], sets, profile(), {}, {});
    expect(recs.map((r) => r.id)).toContain("Barbell_Deadlift");
  });

  it("recommends the related accessories a known bench max feeds, at the same fraction plans.ts applies", () => {
    const recs = recommendExercises(
      [],
      [],
      profile(),
      known("Barbell_Bench_Press_-_Medium_Grip", 100),
      {},
    );
    const ids = recs.map((r) => r.id);
    expect(ids).toContain("Barbell_Bench_Press_-_Medium_Grip");
    expect(ids).toContain("Barbell_Incline_Bench_Press_-_Medium_Grip");
    expect(ids).toContain("Close-Grip_Barbell_Bench_Press");
    // 100 x 0.8 (incline/close-grip fraction) = 80; workingLoad(80, 5) = 62.5.
    expect(recs.find((r) => r.id === "Barbell_Incline_Bench_Press_-_Medium_Grip")?.load).toBe(62.5);
  });

  it("never recommends an exercise already in the saved workout", () => {
    const recs = recommendExercises(
      ["Barbell_Squat"],
      [],
      profile(),
      known("Barbell_Squat", 150),
      {},
    );
    expect(recs.map((r) => r.id)).not.toContain("Barbell_Squat");
  });

  it("never recommends an exercise under an 'avoid' injury on its primary muscle", () => {
    const recs = recommendExercises(
      [],
      [],
      profile(),
      known("Barbell_Squat", 150),
      { quad: { mode: "avoid", setAt: 0 } },
    );
    expect(recs.map((r) => r.id)).not.toContain("Barbell_Squat");
  });

  it("a 'warn' injury doesn't exclude — only 'avoid' does", () => {
    const recs = recommendExercises(
      [],
      [],
      profile(),
      known("Barbell_Squat", 150),
      { quad: { mode: "warn", setAt: 0 } },
    );
    expect(recs.map((r) => r.id)).toContain("Barbell_Squat");
  });

  it("caps the list at the given limit", () => {
    const maxes: Record<string, KnownMaxEntry> = {
      ...known("Barbell_Squat", 150),
      ...known("Barbell_Bench_Press_-_Medium_Grip", 100),
      ...known("Barbell_Deadlift", 180),
    };
    const recs = recommendExercises([], [], profile(), maxes, {}, 2);
    expect(recs).toHaveLength(2);
  });
});
