import { describe, expect, it } from "vitest";
import type { Profile } from "../types";
import type { SetEntry } from "../state/useLog";
import { PLANS, prescribe, workingLoad } from "./plans";

const profile = (over: Partial<Profile> = {}): Profile =>
  ({
    username: "test",
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
    // 82 x 0.5 (squat) x 0.68 (conservative) x 1 (30-44) = 27.88, rounded to
    // a loadable 27.5.
    expect(p.load).toBe(27.5);
  });

  it("says nothing rather than inventing a weight with nothing to go on", () => {
    expect(prescribe("Barbell_Squat", 5, [], null).source).toBe("unknown");
    expect(prescribe("Barbell_Squat", 5, [], profile({ bodyWeight: undefined })).source)
      .toBe("unknown");
    // A profile still in pounds is left alone rather than silently converted.
    expect(prescribe("Barbell_Squat", 5, [], profile({ bodyWeightUnit: "lb" })).source)
      .toBe("unknown");
  });

  it("scales down for age, never up", () => {
    const base = prescribe("Barbell_Squat", 5, [], profile()).load;
    const older = prescribe("Barbell_Squat", 5, [], profile({ ageGroup: "60+" })).load;
    const teen = prescribe("Barbell_Squat", 5, [], profile({ ageGroup: "teen" })).load;
    expect(older).toBeLessThan(base);
    expect(teen).toBeLessThan(base);
  });

  it("applies the same conservative fraction to every profile", () => {
    // There is no field left to make this number differ by anything but age
    // and body weight — see the comment on CONSERVATIVE_FACTOR for why that
    // is deliberate rather than a gap.
    const a = prescribe("Barbell_Squat", 5, [], profile()).load;
    const b = prescribe("Barbell_Squat", 5, [], profile({ username: "someone else" })).load;
    expect(a).toBe(b);
  });

  it("never prescribes a barbell lift below an empty bar", () => {
    // The bug this exists to prevent: the floor once asked whether the id
    // began with "Barbell", which is false of Standing_Military_Press, and a
    // light profile was told to press 7.5 kg.
    const light = profile({ bodyWeight: 40, ageGroup: "teen" });
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
    // lift, age must not touch this number — a 60-year-old and a 25-year-old
    // at the same body weight do the same push-up against the same load,
    // because it is their own weight, not a population guess.
    const base = prescribe("Push-Up_Wide", 12, [], profile()).load;
    const older = prescribe("Push-Up_Wide", 12, [], profile({ ageGroup: "60+" })).load;
    expect(base).toBe(profile().bodyWeight);
    expect(older).toBe(base);
    expect(prescribe("Push-Up_Wide", 12, [], profile()).source).toBe("atBodyWeight");
  });

  describe("relatedLift", () => {
    const benchAnchor = "Barbell_Bench_Press_-_Medium_Grip";
    const knownMax = (max: number) => (id: string) => (id === benchAnchor ? max : null);

    it("nudges a close relative from a known max on the anchor lift", () => {
      const p = prescribe(
        "Barbell_Incline_Bench_Press_-_Medium_Grip",
        5,
        [],
        profile(),
        knownMax(100),
      );
      expect(p.source).toBe("relatedLift");
      expect(p.relatedTo).toBe(benchAnchor);
      // 100 x 0.8 (the incline/flat ratio) = 80, run through the same
      // workingLoad as any other estimated max: 80 / (1 + 5/30) = 68.57,
      // x 0.9 = 61.7, rounded to 62.5.
      expect(p.load).toBe(62.5);
    });

    it("never touches an exercise with no RELATED_TO entry", () => {
      // Barbell_Squat has no related-lift entry (see RELATED_TO's own
      // comment for why), so a knownMax lookup that would happily answer for
      // it must still be ignored — this path only ever fires for the small,
      // hand-picked list.
      const p = prescribe("Barbell_Squat", 5, [], profile(), () => 200);
      expect(p.source).toBe("bodyweight");
    });

    it("falls back to the body-weight guess when the anchor's max is unknown", () => {
      const p = prescribe(
        "Barbell_Incline_Bench_Press_-_Medium_Grip",
        5,
        [],
        profile(),
        () => null,
      );
      expect(p.source).toBe("bodyweight");
    });

    it("prefers this exercise's own log over a related lift's known max", () => {
      const own: SetEntry = {
        uid: "own", id: "Barbell_Incline_Bench_Press_-_Medium_Grip", weight: 60, reps: 5, at: 0,
      };
      const p = prescribe(
        "Barbell_Incline_Bench_Press_-_Medium_Grip",
        5,
        [own],
        profile(),
        knownMax(999),
      );
      expect(p.source).toBe("logged");
    });
  });
});

describe("PLANS", () => {
  it("prescribes a starting weight for every exercise it names", () => {
    for (const plan of PLANS) {
      for (const variant of plan.variants) {
        for (const day of variant.days) {
          for (const e of day.exercises) {
            // "bodyweight" for anything loaded with a fraction of body
            // weight, "atBodyWeight" for a push-up or pull-up whose load is
            // the whole of it — either is a real prescription, unlike
            // "unknown".
            expect(["bodyweight", "atBodyWeight"], e.id).toContain(
              prescribe(e.id, e.reps, [], profile()).source,
            );
          }
        }
      }
    }
  });

  it("keeps sets and reps in a sane range", () => {
    for (const plan of PLANS) {
      for (const variant of plan.variants) {
        for (const day of variant.days) {
          for (const e of day.exercises) {
            expect(e.sets, e.id).toBeGreaterThan(0);
            expect(e.sets, e.id).toBeLessThanOrEqual(10);
            expect(e.reps, e.id).toBeGreaterThan(0);
            expect(e.reps, e.id).toBeLessThanOrEqual(30);
          }
        }
      }
    }
  });

  it("gives every plan at least one variant, and only body part split more than one", () => {
    // The rest are rotations: running one more or less often is already free,
    // so a second variant there would be a relabelling with extra code behind
    // it, not a real choice.
    for (const plan of PLANS) {
      expect(plan.variants.length, plan.id).toBeGreaterThan(0);
      if (plan.id !== "bodypart") expect(plan.variants.length, plan.id).toBe(1);
    }
    expect(PLANS.find((p) => p.id === "bodypart")?.variants.length).toBe(2);
  });
});
