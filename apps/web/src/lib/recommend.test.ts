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

let uid = 0;
const DAY = 24 * 60 * 60 * 1000;
/** A set on a given day (0 = first day), so sessionEstimates() sees distinct sessions. */
const setOn = (id: string, day: number, weight: number, reps: number): SetEntry => ({
  uid: `s${uid++}`,
  id,
  weight,
  reps,
  at: day * DAY,
});

describe("recommendExercises", () => {
  it("recommends nothing off an onboarding profile alone — body weight isn't a real basis", () => {
    expect(recommendExercises([], [], profile(), {}, {})).toEqual([]);
  });

  it("recommends nothing off a known max with no logged history — one number is not a trend", () => {
    // Used to qualify on its own; now a known max is only ever the load a
    // qualifying trend gets *reported* at, never the trend itself.
    expect(recommendExercises([], [], profile(), known("Barbell_Squat", 150), {})).toEqual([]);
  });

  it("recommends nothing off a single logged session — still one data point", () => {
    const sets = [setOn("Barbell_Deadlift", 0, 140, 5)];
    expect(recommendExercises([], sets, profile(), {}, {})).toEqual([]);
  });

  it("recommends nothing from a change too small to call steady and too large to call static", () => {
    // 100 x (1 + 5/30) = 116.67; 104 x (1 + 5/30) = 121.33. Change is
    // (121.33 - 116.67) / 116.67 = 4% — inside the gap between the 2.5%
    // static band and the 5% steady band.
    const sets = [setOn("Barbell_Squat", 0, 100, 5), setOn("Barbell_Squat", 7, 104, 5)];
    expect(recommendExercises([], sets, profile(), {}, {})).toEqual([]);
  });

  it("recommends a lift on a steady change from its first logged session to its latest", () => {
    // 100 x (1 + 5/30) = 116.67; 115 x (1 + 5/30) = 134.17. Change is
    // (134.17 - 116.67) / 116.67 = 15% — well past the 5% steady band.
    const sets = [setOn("Barbell_Squat", 0, 100, 5), setOn("Barbell_Squat", 14, 115, 5)];
    const recs = recommendExercises([], sets, profile(), {}, {});
    expect(recs.map((r) => r.id)).toContain("Barbell_Squat");
    // The reported load is still prescribe()'s own working load from the
    // best logged set (115 x 5) — the trend only decides whether to offer
    // it, not what it says. 115 x (1 + 5/30) = 134.17, inverted back to a
    // set of five (÷ 1.1667) is 115 again, backed off a tenth to 103.5,
    // rounded to the 2.5 step.
    const rec = recs.find((r) => r.id === "Barbell_Squat");
    expect(rec?.load).toBe(102.5);
  });

  it("recommends a lift on a static result — no real change across its logged history", () => {
    // 100 x (1 + 5/30) = 116.67; 101 x (1 + 5/30) = 117.83. Change is
    // (117.83 - 116.67) / 116.67 = 1% — inside the 2.5% static band.
    const sets = [setOn("Barbell_Deadlift", 0, 100, 5), setOn("Barbell_Deadlift", 21, 101, 5)];
    expect(recommendExercises([], sets, profile(), {}, {}).map((r) => r.id)).toContain(
      "Barbell_Deadlift",
    );
  });

  it("groups same-day sets into one session rather than one per set", () => {
    // Three sets on day 0, all at the same weight, then a real change on
    // day 7 — if same-day sets counted as separate sessions this would
    // still qualify off day 0 alone; the point is it needs day 7 to.
    const sameDay = [
      setOn("Barbell_Squat", 0, 100, 5),
      setOn("Barbell_Squat", 0, 90, 8),
      setOn("Barbell_Squat", 0, 95, 6),
    ];
    expect(recommendExercises([], sameDay, profile(), {}, {})).toEqual([]);

    const withChange = [...sameDay, setOn("Barbell_Squat", 7, 115, 5)];
    expect(recommendExercises([], withChange, profile(), {}, {}).map((r) => r.id)).toContain(
      "Barbell_Squat",
    );
  });

  it("recommends the related accessories off the anchor lift's own trend, not their own empty one", () => {
    // prescribe()'s RELATED_TO branch reads its anchor's *known max*
    // specifically (see plans.ts), so Incline and Close-Grip need Bench to
    // have one — logged sets alone would make Bench itself "logged" but
    // wouldn't feed them anything. The trend still has to come from Bench's
    // own logged history, which the two accessories have none of.
    const sets = [
      setOn("Barbell_Bench_Press_-_Medium_Grip", 0, 80, 5),
      setOn("Barbell_Bench_Press_-_Medium_Grip", 14, 92, 5),
    ];
    const ids = recommendExercises(
      [],
      sets,
      profile(),
      known("Barbell_Bench_Press_-_Medium_Grip", 100),
      {},
    ).map((r) => r.id);
    expect(ids).toContain("Barbell_Bench_Press_-_Medium_Grip");
    expect(ids).toContain("Barbell_Incline_Bench_Press_-_Medium_Grip");
    expect(ids).toContain("Close-Grip_Barbell_Bench_Press");
  });

  it("doesn't recommend the related accessories when the anchor has a known max but no logged trend", () => {
    const ids = recommendExercises(
      [],
      [],
      profile(),
      known("Barbell_Bench_Press_-_Medium_Grip", 100),
      {},
    ).map((r) => r.id);
    expect(ids).not.toContain("Barbell_Incline_Bench_Press_-_Medium_Grip");
    expect(ids).not.toContain("Close-Grip_Barbell_Bench_Press");
  });

  it("never recommends an exercise already in the saved workout", () => {
    const sets = [setOn("Barbell_Squat", 0, 100, 5), setOn("Barbell_Squat", 14, 115, 5)];
    const recs = recommendExercises(["Barbell_Squat"], sets, profile(), {}, {});
    expect(recs.map((r) => r.id)).not.toContain("Barbell_Squat");
  });

  it("never recommends an exercise under an 'avoid' injury on its primary muscle", () => {
    const sets = [setOn("Barbell_Squat", 0, 100, 5), setOn("Barbell_Squat", 14, 115, 5)];
    const recs = recommendExercises([], sets, profile(), {}, { quad: { mode: "avoid", setAt: 0 } });
    expect(recs.map((r) => r.id)).not.toContain("Barbell_Squat");
  });

  it("a 'warn' injury doesn't exclude — only 'avoid' does", () => {
    const sets = [setOn("Barbell_Squat", 0, 100, 5), setOn("Barbell_Squat", 14, 115, 5)];
    const recs = recommendExercises([], sets, profile(), {}, { quad: { mode: "warn", setAt: 0 } });
    expect(recs.map((r) => r.id)).toContain("Barbell_Squat");
  });

  it("caps the list at the given limit", () => {
    const sets = [
      setOn("Barbell_Squat", 0, 100, 5),
      setOn("Barbell_Squat", 14, 115, 5),
      setOn("Barbell_Bench_Press_-_Medium_Grip", 0, 80, 5),
      setOn("Barbell_Bench_Press_-_Medium_Grip", 14, 92, 5),
      setOn("Barbell_Deadlift", 0, 100, 5),
      setOn("Barbell_Deadlift", 21, 101, 5),
    ];
    const recs = recommendExercises([], sets, profile(), {}, {}, 2);
    expect(recs).toHaveLength(2);
  });
});
