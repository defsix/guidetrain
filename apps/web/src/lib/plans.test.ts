import { describe, expect, it } from "vitest";
import type { Profile } from "../types";
import type { SetEntry } from "../state/useLog";
import { PLANS, prescribe, workingLoad } from "./plans";

const profile = (over: Partial<Profile> = {}): Profile =>
  ({
    username: "test",
    gender: "male",
    ageGroup: "30-44",
    bodyWeight: 82,
    bodyWeightUnit: "kg",
    ...over,
  }) as Profile;

const set = (weight: number, reps: number): SetEntry => ({
  uid: `${weight}x${reps}`,
  id: "Barbell_Squat",
  weight,
  reps,
  at: 0,
});

describe("workingLoad", () => {
  it("inverts Epley and backs off a tenth", () => {
    // 100 / (1 + 5/30) = 85.71, x 0.9 = 77.1, rounded to the 2.5 step.
    expect(workingLoad(100, 5)).toBe(77.5);
    // 100 / (1 + 10/30) = 75, x 0.9 = 67.5.
    expect(workingLoad(100, 10)).toBe(67.5);
  });
});

describe("prescribe", () => {
  it("prefers a logged lift, and says where the number came from", () => {
    const p = prescribe("Barbell_Squat", 5, [set(140, 5)], profile());
    expect(p.source).toBe("logged");
    // Epley: 140 x (1 + 5/30) = 163.33. Inverted back to a set of five that is
    // 140 again, backed off a tenth to 126, then rounded to a loadable 125 --
    // every prescription lands on a weight the bar can actually hold.
    expect(p.load).toBe(125);
  });

  it("falls back to body weight, and never dresses it up as a logged lift", () => {
    const p = prescribe("Barbell_Squat", 5, [], profile());
    expect(p.source).toBe("bodyweight");
    // 82 x 0.5 (squat) x 1 (male) x 1 (30-44) = 41, rounded to a loadable 40.
    expect(p.load).toBe(40);
  });

  it("says nothing rather than inventing a weight with nothing to go on", () => {
    expect(prescribe("Barbell_Squat", 5, [], null).source).toBe("unknown");
    expect(prescribe("Barbell_Squat", 5, [], profile({ bodyWeight: undefined })).source)
      .toBe("unknown");
    // A profile still in pounds is left alone rather than silently converted.
    expect(prescribe("Barbell_Squat", 5, [], profile({ bodyWeightUnit: "lb" })).source)
      .toBe("unknown");
  });

  it("scales down for age and sex, never up", () => {
    const base = prescribe("Barbell_Squat", 5, [], profile()).load;
    const older = prescribe("Barbell_Squat", 5, [], profile({ ageGroup: "60+" })).load;
    const female = prescribe("Barbell_Squat", 5, [], profile({ gender: "female" })).load;
    const teen = prescribe("Barbell_Squat", 5, [], profile({ ageGroup: "teen" })).load;
    expect(older).toBeLessThan(base);
    expect(female).toBeLessThan(base);
    expect(teen).toBeLessThan(base);
  });

  it("gives 'prefer not to say' the lower of the two figures, not a guess", () => {
    const other = prescribe("Barbell_Squat", 5, [], profile({ gender: "other" })).load;
    const female = prescribe("Barbell_Squat", 5, [], profile({ gender: "female" })).load;
    expect(other).toBe(female);
  });

  it("never prescribes a barbell lift below an empty bar", () => {
    // The bug this exists to prevent: the floor once asked whether the id
    // began with "Barbell", which is false of Standing_Military_Press, and a
    // light profile was told to press 7.5 kg.
    const light = profile({ bodyWeight: 40, gender: "female", ageGroup: "teen" });
    for (const id of ["Standing_Military_Press", "Bent_Over_Barbell_Row", "Barbell_Squat"]) {
      expect(prescribe(id, 5, [], light).load, id).toBeGreaterThanOrEqual(20);
    }
  });

  it("has no path at all from body weight to a one-rep max", () => {
    // The demographic path must produce a working set, never an estimated max
    // — that number drives the 5/3/1 planner and has to come from a set that
    // happened. A body-weight prescription is far below any plausible max.
    const p = prescribe("Barbell_Squat", 5, [], profile());
    expect(p.load).toBeLessThan(profile().bodyWeight!);
  });

  it("loads a bodyweight exercise at exactly body weight, not a fraction of it", () => {
    // Push-Up_Wide is "body only" equipment. Unlike a barbell or dumbbell
    // lift, sex and age must not touch this number — a 60-year-old and a
    // 25-year-old at the same body weight do the same push-up against the
    // same load, because it is their own weight, not a population guess.
    const base = prescribe("Push-Up_Wide", 12, [], profile()).load;
    const older = prescribe("Push-Up_Wide", 12, [], profile({ ageGroup: "60+" })).load;
    const female = prescribe("Push-Up_Wide", 12, [], profile({ gender: "female" })).load;
    expect(base).toBe(profile().bodyWeight);
    expect(older).toBe(base);
    expect(female).toBe(base);
    expect(prescribe("Push-Up_Wide", 12, [], profile()).source).toBe("atBodyWeight");
  });
});

describe("PLANS", () => {
  it("prescribes a starting weight for every exercise it names", () => {
    for (const plan of PLANS) {
      for (const day of plan.days) {
        for (const e of day.exercises) {
          // "bodyweight" for anything loaded with a fraction of body weight,
          // "atBodyWeight" for a push-up or pull-up whose load is the whole
          // of it — either is a real prescription, unlike "unknown".
          expect(["bodyweight", "atBodyWeight"], e.id).toContain(
            prescribe(e.id, e.reps, [], profile()).source,
          );
        }
      }
    }
  });

  it("keeps sets and reps in a sane range", () => {
    for (const plan of PLANS) {
      for (const day of plan.days) {
        for (const e of day.exercises) {
          expect(e.sets, e.id).toBeGreaterThan(0);
          expect(e.sets, e.id).toBeLessThanOrEqual(10);
          expect(e.reps, e.id).toBeGreaterThan(0);
          expect(e.reps, e.id).toBeLessThanOrEqual(30);
        }
      }
    }
  });
});
