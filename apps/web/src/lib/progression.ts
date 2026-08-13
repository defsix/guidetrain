import type { SetEntry, Unit } from "../state/useLog";

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
 *     70/80/90, week 3 75/85/95, week 4 deload 40/50/60; +10 lb per cycle on
 *     squat and deadlift, +5 lb on bench and press.
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
    if (!best) {
      best = { set: s, oneRM };
      continue;
    }
    // Never across units: 60 kg and 135 lb are the same lift and 135 is the
    // bigger number. The first unit seen wins and the rest sit it out.
    if (s.unit !== best.set.unit) continue;
    if (oneRM > best.oneRM) best = { set: s, oneRM };
  }
  return best;
}

/**
 * The smallest plate the gym is assumed to have, per side.
 *
 * The loadable step is *twice* this, because plates go on in pairs: with 2.5 kg
 * as the smallest plate, a barbell moves 5 kg at a time and 87.5 kg is not a
 * weight you can build. Getting this wrong is the difference between a plan you
 * follow and a plan you round in your head every set.
 */
export const SMALLEST_PLATE = { kg: 2.5, lb: 5 } as const;

/** What the bar can actually change by: a plate on each side. */
export function loadStep(unit: Unit): number {
  return SMALLEST_PLATE[unit] * 2;
}

/** Round to something you can actually load. */
export function roundLoad(value: number, unit: Unit): number {
  const step = loadStep(unit);
  return Math.round(value / step) * step;
}

/** 5/3/1 works off a training max deliberately set below the real one. */
export const TRAINING_MAX_FRACTION = 0.9;

/**
 * The training max is a number to calculate from, not a weight to load, so it
 * is *not* rounded to the bar's step. Forcing it to a loadable 5 kg would drag
 * every percentage below it with the same error, and would make the 2.5 kg
 * upper-body increment impossible to apply at all — two cycles would look
 * identical. Only the working sets get rounded, and they are the only numbers
 * anyone puts on a bar.
 */
export function trainingMax(oneRM: number, unit: Unit): number {
  const step = SMALLEST_PLATE[unit];
  return Math.round((oneRM * TRAINING_MAX_FRACTION) / step) * step;
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
export function cycle(tm: number, unit: Unit): PlannedWeek[] {
  return CYCLE.map((w) => ({
    label: w.key,
    deload: w.deload,
    sets: w.sets.map(([percent, reps, amrap]) => ({
      percent,
      reps,
      amrap,
      load: roundLoad((tm * percent) / 100, unit),
    })),
  }));
}

/**
 * How much the training max goes up after each four-week cycle.
 *
 * These are Wendler's numbers and they are deliberately not rounded to the
 * bar's 5 kg step. The training max is arithmetic; rounding the increment would
 * double the upper-body rate and stall people early, which is the failure the
 * whole method is arranged to avoid.
 *
 * Wendler's split is by lift: squat and deadlift move twice as fast as bench
 * and press. Rather than hard-coding four exercise names, this asks whether the
 * movement loads the legs at all — which is what separates those two groups,
 * and which the exercise data already knows. A deadlift names the erectors
 * first and the legs second, so looking at both is what puts it on the right
 * side.
 */
export function incrementFor(usesLegs: boolean, unit: Unit): number {
  if (unit === "lb") return usesLegs ? 10 : 5;
  return usesLegs ? 5 : 2.5;
}

/** Whole cycles needed to lift the training max from here to there. */
export function cyclesTo(currentTM: number, targetTM: number, increment: number): number {
  if (targetTM <= currentTM) return 0;
  return Math.ceil((targetTM - currentTM) / increment);
}
