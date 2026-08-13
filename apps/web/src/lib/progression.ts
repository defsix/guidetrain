import type { SetEntry } from "../state/useLog";

/**
 * Getting from the max you have to the max you want.
 *
 * Two separate pieces of established maths, kept separate because they answer
 * different questions and have different confidence:
 *
 *   estimating a one-rep max     from a set you actually performed
 *   planning the way to a target 5/3/1's percentages off a *training* max
 *
 * Sources checked rather than recalled:
 *   - Wendler 5/3/1 — training max 90% of the 1RM; week 1 65/75/85, week 2
 *     70/80/90, week 3 75/85/95, week 4 deload 40/50/60; +10 lb (5 kg) per
 *     cycle on squat and deadlift, +5 lb (2.5 kg) on bench and press.
 *     https://barbend.com/5-3-1-program/ and https://exrx.net/WeightTraining/Powerlifting/531
 *   - Epley, the estimator used here: 1RM = w × (1 + reps/30).
 *
 * Nothing in here decides anything on its own. It returns numbers with the
 * assumptions attached, and the panel is responsible for saying they are
 * estimates.
 */

/** Rep counts above this make an estimate unreliable, so it isn't offered. */
export const MAX_REPS_FOR_ESTIMATE = 12;

/**
 * Epley's estimate of a one-rep max from a set that was performed:
 * `1RM = w × (1 + reps/30)`.
 *
 * A single rep is returned as itself rather than run through the formula.
 * Epley at reps = 1 gives w × (1 + 1/30) — a 100 kg single would be reported
 * as a 103.3 kg max, which is not an estimate of anything: the set *is* a
 * one-rep max and needs no estimating. The formula is written for multi-rep
 * sets and this is the documented edge of it, caught by working the example
 * rather than trusting the shape of the equation.
 *
 * Only offered up to MAX_REPS_FOR_ESTIMATE. Epley and Brzycki agree closely
 * under ten reps and diverge above; past a dozen the formula is extrapolating
 * far beyond what the set demonstrated, and a confident wrong number is worse
 * than none.
 */
export function estimateOneRepMax(weight: number, reps: number): number | null {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null;
  if (reps < 1 || reps > MAX_REPS_FOR_ESTIMATE) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** The heaviest usable set: the one whose estimated max is highest. */
export function bestEstimate(sets: SetEntry[]): { set: SetEntry; oneRM: number } | null {
  let best: { set: SetEntry; oneRM: number } | null = null;
  for (const s of sets) {
    const oneRM = estimateOneRepMax(s.weight, s.reps);
    if (oneRM === null) continue;
    if (!best || oneRM > best.oneRM) best = { set: s, oneRM };
  }
  return best;
}

/**
 * The smallest plate the gym has, per side, in kilos.
 *
 * The loadable step is *twice* this, because plates go on in pairs: 1.25 kg
 * plates move a barbell 2.5 kg at a time. Getting it wrong is the difference
 * between a plan you follow and a plan you round in your head every set — and
 * at 2.5 kg plates it was worse than untidy, because a 5 kg bar step is larger
 * than one cycle's increase at the top percentages, so consecutive cycles came
 * out identical and the plan appeared to stall.
 */
export const SMALLEST_PLATE = 1.25;

/** What the bar can actually change by: a plate on each side. */
export const LOAD_STEP = SMALLEST_PLATE * 2;

/**
 * What the training max is rounded to — deliberately not the bar's step.
 *
 * It is a number to calculate from rather than a weight to load, so it wants a
 * tidy quantum of its own that does not follow the plate rack. Tying it to the
 * smallest plate would put training maxes on 1.25 kg boundaries, giving figures
 * like 198.75 that nobody would write down.
 */
const TRAINING_MAX_STEP = 2.5;

/** Round to something you can actually load. */
export function roundLoad(value: number): number {
  return Math.round(value / LOAD_STEP) * LOAD_STEP;
}

/** An Olympic bar, in kilos. What a barbell weighs before anything goes on it. */
export const BAR_WEIGHT = 20;

/**
 * The plates a kilo gym stocks, heaviest first.
 *
 * 1.25 is the smallest, which is where SMALLEST_PLATE above comes from; the
 * rest are the standard rack. Ordered for the greedy walk in platesPerSide,
 * which is correct here because every plate divides all the larger ones — the
 * case where greedy change-making goes wrong cannot arise on this set.
 */
const PLATES = [25, 20, 15, 10, 5, 2.5, SMALLEST_PLATE];

/**
 * What to hang on each end of the bar to reach `total`.
 *
 * Returns the weight a side and the plates to get there, or null when the
 * question does not apply — a total at or below the bar has nothing to load,
 * and one that cannot be made from the rack is worth saying nothing about
 * rather than approximating, since a number you cannot load is not help.
 *
 * Both sides, always. Plates go on in pairs and a barbell loaded on one end is
 * a hospital visit, so the figure quoted is per side and the caller says so.
 */
export function platesPerSide(
  total: number,
  bar = BAR_WEIGHT,
): { side: number; plates: number[] } | null {
  const side = (total - bar) / 2;
  if (!Number.isFinite(side) || side <= 0) return null;
  const plates: number[] = [];
  let left = side;
  for (const p of PLATES) {
    // Rounded at each step because 47.5 - 25 - 20 lands on 2.4999999999999996
    // in binary floating point, and a residue that small would then fail the
    // exactness test below and throw away a perfectly loadable bar.
    while (Math.round((left - p) * 100) / 100 >= 0) {
      plates.push(p);
      left = Math.round((left - p) * 100) / 100;
    }
  }
  return left === 0 ? { side, plates } : null;
}

/** 5/3/1 works off a training max deliberately set below the real one. */
export const TRAINING_MAX_FRACTION = 0.9;

/**
 * The training max is a number to calculate from, not a weight to load, so it
 * is rounded to its own tidy step rather than to the bar's. Forcing it onto a
 * loadable boundary would drag every percentage below it with the same error.
 * Only the working sets are rounded to what a bar can hold, and they are the
 * only numbers anyone loads.
 */
export function trainingMax(oneRM: number): number {
  return Math.round((oneRM * TRAINING_MAX_FRACTION) / TRAINING_MAX_STEP) * TRAINING_MAX_STEP;
}

export type PlannedSet = { percent: number; reps: number; amrap: boolean; load: number };
export type PlannedWeek = { label: string; sets: PlannedSet[]; deload: boolean };

const CYCLE: { key: string; deload: boolean; sets: [number, number, boolean][] }[] = [
  { key: "w1", deload: false, sets: [[65, 5, false], [75, 5, false], [85, 5, true]] },
  { key: "w2", deload: false, sets: [[70, 3, false], [80, 3, false], [90, 3, true]] },
  { key: "w3", deload: false, sets: [[75, 5, false], [85, 3, false], [95, 1, true]] },
  { key: "w4", deload: true, sets: [[40, 5, false], [50, 5, false], [60, 5, false]] },
];

/** The four weeks of one cycle, as loads you can put on a bar. */
export function cycle(tm: number): PlannedWeek[] {
  return CYCLE.map((w) => ({
    label: w.key,
    deload: w.deload,
    sets: w.sets.map(([percent, reps, amrap]) => ({
      percent,
      reps,
      amrap,
      load: roundLoad((tm * percent) / 100),
    })),
  }));
}

/**
 * How much the training max goes up after each four-week cycle.
 *
 * These are Wendler's numbers, applied to the training max rather than to a
 * loaded bar, so they are not rounded to anything. Rounding the upper-body one
 * up would double its rate and stall people early, which is the failure the
 * whole method is arranged to avoid.
 *
 * Wendler's split is by lift: squat and deadlift move twice as fast as bench
 * and press. Rather than hard-coding four exercise names, this asks whether the
 * movement loads the legs at all — which is what separates those two groups,
 * and which the exercise data already knows. A deadlift names the erectors
 * first and the legs second, so looking at both is what puts it on the right
 * side.
 */
export function incrementFor(usesLegs: boolean): number {
  return usesLegs ? 5 : 2.5;
}

/** Whole cycles needed to lift the training max from here to there. */
export function cyclesTo(currentTM: number, targetTM: number, increment: number): number {
  if (targetTM <= currentTM) return 0;
  return Math.ceil((targetTM - currentTM) / increment);
}
