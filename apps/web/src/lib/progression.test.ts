import { describe, expect, it } from "vitest";
import type { SetEntry } from "../state/useLog";
import {
  BAR_WEIGHT,
  LOAD_STEP,
  MAX_REPS_FOR_ESTIMATE,
  RESET_FRACTION,
  REST_EXTEND_SECONDS,
  SMALLEST_PLATE,
  TRAINING_MAX_FRACTION,
  bestEstimate,
  cycle,
  cyclesTo,
  estimateOneRepMax,
  goalPace,
  incrementFor,
  mainLiftWeek1,
  platesPerSide,
  resetTrainingMax,
  restSeconds,
  reviewCycle,
  roundLoad,
  trainingMax,
  warmupSets,
} from "./progression";

/**
 * The arithmetic that decides what somebody puts on a bar.
 *
 * These are the tests the codebase most needed and least had. Every number
 * below was worked by hand from the sources cited in progression.ts rather
 * than recorded from a passing run, which is the only way a test of a formula
 * is worth anything: a fixture captured from the implementation agrees with
 * whatever the implementation does, including its bugs.
 */

const set = (weight: number, reps: number, at = 0): SetEntry => ({
  uid: `${weight}x${reps}@${at}`,
  id: "Barbell_Squat",
  weight,
  reps,
  at,
});

describe("estimateOneRepMax", () => {
  it("returns a single as itself rather than running it through Epley", () => {
    // Epley at one rep gives w x (1 + 1/30) — a 100 kg single would be
    // reported as a 103.3 kg max, which is not an estimate of anything.
    expect(estimateOneRepMax(100, 1)).toBe(100);
  });

  it("applies Epley above one rep", () => {
    // 100 x (1 + 5/30) = 116.66...
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.667, 3);
    expect(estimateOneRepMax(60, 10)).toBeCloseTo(80, 10);
  });

  it("refuses rep counts the formula cannot speak to", () => {
    expect(estimateOneRepMax(100, MAX_REPS_FOR_ESTIMATE + 1)).toBeNull();
    expect(estimateOneRepMax(100, 0)).toBeNull();
    expect(estimateOneRepMax(NaN, 5)).toBeNull();
    expect(estimateOneRepMax(100, NaN)).toBeNull();
  });
});

describe("bestEstimate", () => {
  it("picks the highest estimate, not the heaviest bar", () => {
    // 100x5 estimates 116.7; 110x1 estimates 110. The lighter bar wins.
    const best = bestEstimate([set(110, 1), set(100, 5)]);
    expect(best?.set.weight).toBe(100);
    expect(best?.oneRM).toBeCloseTo(116.667, 3);
  });

  it("ignores sets it cannot estimate from, and returns null with none left", () => {
    expect(bestEstimate([set(50, 30)])).toBeNull();
    expect(bestEstimate([])).toBeNull();
  });
});

describe("rounding", () => {
  it("rounds loads to what a bar can hold, given the plates on hand", () => {
    expect(LOAD_STEP).toBe(SMALLEST_PLATE * 2);
    expect(roundLoad(101)).toBe(100);
    expect(roundLoad(101.5)).toBe(102.5);
    expect(roundLoad(0)).toBe(0);
  });

  it("keeps the training max on its own tidy step, not the bar's", () => {
    // 90% of 220.5 is 198.45. Tied to the plate rack this would land on
    // 198.75, which nobody would write down.
    expect(trainingMax(220.5)).toBe(197.5);
    expect(TRAINING_MAX_FRACTION).toBe(0.9);
    expect(trainingMax(100)).toBe(90);
  });
});

describe("cycle", () => {
  const weeks = cycle(100);

  it("uses Wendler's percentages off the training max", () => {
    expect(weeks.map((w) => w.label)).toEqual(["w1", "w2", "w3", "w4"]);
    expect(weeks[0].sets.map((s) => s.load)).toEqual([65, 75, 85]);
    expect(weeks[1].sets.map((s) => s.load)).toEqual([70, 80, 90]);
    expect(weeks[2].sets.map((s) => s.load)).toEqual([75, 85, 95]);
    expect(weeks[3].sets.map((s) => s.load)).toEqual([40, 50, 60]);
  });

  it("names the programme's rep scheme, with the last set as the AMRAP", () => {
    expect(weeks[0].sets.map((s) => s.reps)).toEqual([5, 5, 5]);
    expect(weeks[1].sets.map((s) => s.reps)).toEqual([3, 3, 3]);
    expect(weeks[2].sets.map((s) => s.reps)).toEqual([5, 3, 1]);
    expect(weeks.slice(0, 3).every((w) => w.sets[2].amrap)).toBe(true);
    // The deload proves nothing and asks for no AMRAP.
    expect(weeks[3].deload).toBe(true);
    expect(weeks[3].sets.some((s) => s.amrap)).toBe(false);
  });
});

describe("incrementFor and cyclesTo", () => {
  it("moves the legs twice as fast as the upper body", () => {
    expect(incrementFor(true)).toBe(5);
    expect(incrementFor(false)).toBe(2.5);
  });

  it("counts whole cycles, rounding up, and none when already there", () => {
    expect(cyclesTo(90, 100, 5)).toBe(2);
    expect(cyclesTo(90, 99, 5)).toBe(2); // 1.8 cycles is two cycles
    expect(cyclesTo(100, 100, 5)).toBe(0);
    expect(cyclesTo(100, 90, 5)).toBe(0);
  });
});

describe("platesPerSide", () => {
  it("halves the load and builds it from the rack", () => {
    expect(platesPerSide(100)).toEqual({ side: 40, plates: [25, 15] });
    expect(platesPerSide(60)).toEqual({ side: 20, plates: [20] });
    expect(platesPerSide(22.5)).toEqual({ side: 1.25, plates: [1.25] });
  });

  it("says nothing for a bar with nothing on it, or less than nothing", () => {
    expect(platesPerSide(BAR_WEIGHT)).toBeNull();
    expect(platesPerSide(17)).toBeNull();
    expect(platesPerSide(0)).toBeNull();
    expect(platesPerSide(NaN)).toBeNull();
  });

  it("refuses a weight the rack cannot make rather than approximating", () => {
    // This is the case an earlier version got wrong: rounding each subtraction
    // to two decimals rounded the miss away, and 100.001 came back loadable
    // with plates adding to 100.
    expect(platesPerSide(100.001)).toBeNull();
    expect(platesPerSide(100.01)).toBeNull();
    expect(platesPerSide(21)).toBeNull();
  });

  it("reproduces every reachable total exactly", () => {
    // No floating-point residue arises: every plate and every total the app
    // produces is a dyadic rational, so the subtraction is exact.
    for (let total = BAR_WEIGHT + LOAD_STEP; total <= 400; total += LOAD_STEP) {
      const r = platesPerSide(total);
      expect(r, `no plates for ${total}`).not.toBeNull();
      expect(BAR_WEIGHT + r!.plates.reduce((a, b) => a + b, 0) * 2).toBe(total);
    }
  });
});

describe("resetTrainingMax", () => {
  it("takes a tenth off and stays on the training-max step", () => {
    expect(RESET_FRACTION).toBe(0.9);
    expect(resetTrainingMax(200)).toBe(180);
    // 90% of 137.5 is 123.75, which rounds to the 2.5 step.
    expect(resetTrainingMax(137.5)).toBe(125);
  });
});

describe("reviewCycle", () => {
  const weeks = cycle(100); // top sets: 85, 90, 95

  it("marks a week hit when the top set reached its minimum", () => {
    const out = reviewCycle(weeks, [set(85, 5)]);
    const w1 = out.find((o) => o.label === "w1")!;
    expect(w1.required).toBe(5);
    expect(w1.achieved).toBe(5);
    expect(w1.missed).toBe(false);
  });

  it("marks a week missed when it fell short", () => {
    const out = reviewCycle(weeks, [set(90, 2)]);
    const w2 = out.find((o) => o.label === "w2")!;
    expect(w2.required).toBe(3);
    expect(w2.achieved).toBe(2);
    expect(w2.missed).toBe(true);
  });

  it("treats a week you have not reached as neither hit nor missed", () => {
    const out = reviewCycle(weeks, []);
    expect(out.every((o) => o.achieved === null)).toBe(true);
    expect(out.some((o) => o.missed)).toBe(false);
  });

  it("judges the most recent attempt, not the best one", () => {
    // Hit it last month, missed it today: the plan responds to today.
    const out = reviewCycle(weeks, [set(85, 8, 1), set(85, 3, 2)]);
    const w1 = out.find((o) => o.label === "w1")!;
    expect(w1.achieved).toBe(3);
    expect(w1.missed).toBe(true);
  });

  it("ignores work done before the training max was fixed", () => {
    // The circularity this exists to break: a 140 kg five estimates a 163 kg
    // max, which makes a 147.5 kg training max, whose week-three top set is
    // 140 kg — the seed set's own weight. Left unbounded it would mark week
    // three passed before the cycle had begun.
    const real = cycle(trainingMax(estimateOneRepMax(140, 5)!));
    expect(real[2].sets[2].load).toBe(140);
    const seed = set(140, 5, 100);
    expect(reviewCycle(real, [seed]).find((o) => o.label === "w3")!.achieved).toBe(5);
    expect(reviewCycle(real, [seed], 100).find((o) => o.label === "w3")!.achieved).toBeNull();
  });

  it("after a reset, only the rebuild counts", () => {
    const weeks100 = cycle(100);
    const beforeReset = set(85, 2, 10);
    const afterReset = set(85, 6, 30);
    const out = reviewCycle(weeks100, [beforeReset, afterReset], 20);
    const w1 = out.find((o) => o.label === "w1")!;
    expect(w1.achieved).toBe(6);
    expect(w1.missed).toBe(false);
  });

  it("never judges the deload, which asks nothing of you", () => {
    expect(reviewCycle(weeks, []).map((o) => o.label)).toEqual(["w1", "w2", "w3"]);
  });

  it("refuses to guess when two weeks share a top-set load", () => {
    // A 20 kg training max puts both 85% and 90% on 17.5 kg after rounding,
    // so one logged set belongs equally to both weeks. Telling somebody to
    // reset a lift they did not fail is the error worth avoiding.
    const low = cycle(20);
    expect(low[0].sets[2].load).toBe(low[1].sets[2].load);
    const out = reviewCycle(low, [set(17.5, 1)]);
    const clashing = out.filter((o) => o.load === 17.5);
    expect(clashing.length).toBe(2);
    expect(clashing.every((o) => o.ambiguous)).toBe(true);
    expect(clashing.every((o) => o.missed === false)).toBe(true);
  });
});

describe("restSeconds", () => {
  it("gives heavy, low-rep sets the longest rest", () => {
    expect(restSeconds(1)).toBe(180);
    expect(restSeconds(5)).toBe(180);
  });

  it("gives moderate rep ranges a middle rest", () => {
    expect(restSeconds(6)).toBe(90);
    expect(restSeconds(12)).toBe(90);
  });

  it("gives high-rep sets the shortest rest", () => {
    expect(restSeconds(13)).toBe(60);
    expect(restSeconds(20)).toBe(60);
  });

  it("only ever steps down as reps go up, never back up", () => {
    let previous = restSeconds(1);
    for (let reps = 2; reps <= 20; reps++) {
      const seconds = restSeconds(reps);
      expect(seconds).toBeLessThanOrEqual(previous);
      previous = seconds;
    }
  });
});

describe("REST_EXTEND_SECONDS", () => {
  it("is a small, positive nudge rather than a whole extra rest period", () => {
    expect(REST_EXTEND_SECONDS).toBeGreaterThan(0);
    expect(REST_EXTEND_SECONDS).toBeLessThan(restSeconds(20));
  });
});

describe("mainLiftWeek1", () => {
  it("returns null with nothing logged and no training max set by hand", () => {
    expect(mainLiftWeek1([])).toBeNull();
  });

  it("builds week 1 from the log, same as ProgressionPanel would show", () => {
    // 140 x 5 estimates 163.33, trainingMax rounds 90% of that to 147.5.
    // 65/75/85% of 147.5, each rounded to the 2.5 kg step: 95, 110, 125.
    const week1 = mainLiftWeek1([set(140, 5)]);
    expect(week1).toEqual([
      { load: 95, reps: 5 },
      { load: 110, reps: 5 },
      { load: 125, reps: 5, amrap: true },
    ]);
  });

  it("prefers a training max set by hand over the one the log implies", () => {
    // Same log as above (derived TM 147.5), but a hand-set 100 kg wins —
    // ProgressionPanel's own rule, applied here too.
    const week1 = mainLiftWeek1([set(140, 5)], 100);
    expect(week1).toEqual([
      { load: 65, reps: 5 },
      { load: 75, reps: 5 },
      { load: 85, reps: 5, amrap: true },
    ]);
  });

  it("still returns a week from a training max alone, with nothing logged", () => {
    expect(mainLiftWeek1([], 100)).not.toBeNull();
  });
});

describe("goalPace", () => {
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  it("returns noBasis with nothing logged and no training max set by hand", () => {
    expect(goalPace([], undefined, 150, Date.now() + WEEK, 5).status).toBe("noBasis");
  });

  it("says the goal is already reached when the current training max already covers it", () => {
    // 140 x 5 derives a training max of 147.5; a target of 100 needs a
    // training max of only 90 (90% of 100, rounded to the 2.5 kg step).
    const p = goalPace([set(140, 5)], undefined, 100, Date.now() + WEEK, 5);
    expect(p.status).toBe("reached");
  });

  it("says onPace when the deadline leaves enough cycles", () => {
    // 90% of 120 is 108, rounded to 107.5; from a training max of 100 that
    // is ceil(7.5 / 5) = 2 cycles, 8 weeks. Ten weeks is enough.
    const now = Date.now();
    const p = goalPace([], 100, 120, now + 10 * WEEK, 5, now);
    expect(p).toEqual({ status: "onPace", cyclesNeeded: 2, weeksNeeded: 8, weeksAvailable: 10 });
  });

  it("says behind when the deadline doesn't leave enough cycles", () => {
    // Same 2 cycles / 8 weeks as above, but only 4 weeks on the clock.
    const now = Date.now();
    const p = goalPace([], 100, 120, now + 4 * WEEK, 5, now);
    expect(p).toEqual({ status: "behind", cyclesNeeded: 2, weeksNeeded: 8, weeksAvailable: 4 });
  });

  it("prefers a training max set by hand over the one the log implies", () => {
    // 140 x 5 alone derives a training max of 147.5, which would already
    // reach a 120 kg target (needs only 107.5) — the hand-set 80 below must
    // still be what the pace is judged from.
    const now = Date.now();
    const p = goalPace([set(140, 5)], 80, 120, now + 100 * WEEK, 5, now);
    expect(p.status).not.toBe("reached");
  });
});

describe("warmupSets", () => {
  it("ramps up in three tiers for a normal working weight", () => {
    // 40% x 5, 60% x 5, 80% x 3 of 100 — all already on the 2.5 kg step, so
    // nothing here is rounded away.
    expect(warmupSets(100)).toEqual([
      { load: 40, reps: 5 },
      { load: 60, reps: 5 },
      { load: 80, reps: 3 },
    ]);
  });

  it("drops a tier that would ask for less than the bar", () => {
    // 40% of 40 is 16, rounded to 15 — below the 20 kg bar, so there is
    // nothing to load and the tier is dropped rather than shown as 15.
    // 60% rounds to 25, 80% to 32.5, both above the bar.
    expect(warmupSets(40)).toEqual([
      { load: 25, reps: 5 },
      { load: 32.5, reps: 3 },
    ]);
  });

  it("returns nothing once the working weight is already close to the bar", () => {
    // Every tier of 22.5 (9, 13.5, 18) rounds to at or below the 20 kg bar,
    // so there is no ramp worth showing — you are already on it.
    expect(warmupSets(22.5)).toEqual([]);
  });

  it("collapses two tiers that round to the same loadable weight", () => {
    // A custom low bar to isolate the collapsing itself: 40% of 10 is 4,
    // 60% is 6 — both round to the same 5 kg step, so the second is dropped
    // rather than repeating a tier back-to-back. 80% rounds to 7.5.
    expect(warmupSets(10, 0)).toEqual([
      { load: 5, reps: 5 },
      { load: 7.5, reps: 3 },
    ]);
  });

  it("never asks for a warm-up at or above the working weight itself", () => {
    // 80% of 5 is 4, which rounds up to 5 — equal to the target itself at
    // this step size, so it is dropped rather than shown as a "warm-up"
    // identical to the work set. 60% collapses into 40%'s 2.5 first.
    expect(warmupSets(5, 0)).toEqual([{ load: 2.5, reps: 5 }]);
  });
});
