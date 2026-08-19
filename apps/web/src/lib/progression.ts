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
 *
 * The subtraction is exact and needs no rounding, which is worth stating
 * because it looks like it should. Every plate above is a dyadic rational —
 * 1.25 is 1.01 in binary, 2.5 is 10.1, the rest are integers — and so is every
 * total the app produces, roundLoad having put it on a 2.5 boundary. Sums and
 * differences of dyadic rationals at these magnitudes are represented exactly
 * in binary floating point, so `left` either reaches zero or genuinely misses.
 *
 * An earlier version rounded each step to two decimals against a residue that
 * does not occur, and that guard was not merely idle: it rounded a real miss
 * away too, so a typed 100.001 kg came back as loadable with plates adding to
 * 100. Checked over every reachable total — the rounding changed no answer —
 * and the exactness verified rather than assumed.
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
    while (left - p >= 0) {
      plates.push(p);
      left -= p;
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

export type CycleStep = { load: number; reps: number; amrap?: true };

/**
 * Week 1 of this lift's own 5/3/1 cycle, for a ready-made plan that wants to
 * hand a main lift straight to the same system `ProgressionPanel` already
 * runs for it — rather than a flat weight, which would misrepresent three
 * sets that are deliberately not the same load.
 *
 * `overrideTM` takes a training max set by hand, the same one
 * `ProgressionPanel` prefers over the derived one and for the same reason: it
 * only exists because someone chose to state it. Left undefined, this asks
 * only what the log already implies.
 *
 * Returns null exactly when `ProgressionPanel` would show its "log a set
 * first" message instead of a table — no logged set and no training max is
 * nothing to build a week out of, and inventing one from a body-weight guess
 * would be exactly the kind of estimate-dressed-as-a-max the rest of this
 * file refuses to produce.
 */
export function mainLiftWeek1(sets: SetEntry[], overrideTM?: number): CycleStep[] | null {
  const best = bestEstimate(sets);
  const derivedTM = best ? trainingMax(best.oneRM) : 0;
  const tm = overrideTM ?? derivedTM;
  if (tm <= 0) return null;
  return cycle(tm)[0].sets.map((s) => ({
    load: s.load,
    reps: s.reps,
    ...(s.amrap ? { amrap: true as const } : {}),
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

/**
 * The reps the top set of each week has to reach.
 *
 * These are the numbers the programme is named after: five in week one, three
 * in week two, one in week three, each on the last and heaviest set. The "+"
 * means go past them; the number itself is the floor, and falling under it is
 * the signal that the training max has drifted above what you can actually
 * lift. Week four is a deload and has nothing to prove.
 */
const TOP_SET_MINIMUM: Record<string, number> = { w1: 5, w2: 3, w3: 1 };

/**
 * How far the training max drops when a lift stalls.
 *
 * Ten percent off *the training max*, not off the estimate it came from, and
 * only for the lift that stalled — the other lifts are progressing fine and
 * have no reason to move. Wendler's "two steps forward, one step back": the
 * programme is arranged so you almost never miss, and the response to missing
 * is to back up and rebuild rather than to try again heavier.
 *
 * Sources checked rather than recalled:
 *   - https://www.norma-athletics.at/guides/wendler-531/ — "a common reset is
 *     to reduce only the affected lift's TM by about 10 percent and build
 *     forward again"; "if you barely hit minimums across more than one cycle,
 *     reset the lift".
 *   - https://www.marathon-crossfit.com/blog/how-to-reset-jim-wendler-531-when-you-stall
 *   - https://exrx.net/WeightTraining/Powerlifting/531
 */
export const RESET_FRACTION = 0.9;

/** The training max to rebuild from after a stall. */
export function resetTrainingMax(tm: number): number {
  return Math.round((tm * RESET_FRACTION) / TRAINING_MAX_STEP) * TRAINING_MAX_STEP;
}

export type WeekOutcome = {
  label: string;
  /** The load of the top set, which is how logged sets are matched to a week. */
  load: number;
  required: number;
  /** Reps on the most recent set at that load, or null if there is none yet. */
  achieved: number | null;
  /** True only when a set happened and fell short, so `achieved` is a number. */
  missed: boolean;
  /**
   * Another week of this cycle calls for the same top-set load, so a logged set
   * cannot be attributed to one of them. No claim is made either way.
   */
  ambiguous: boolean;
};

/**
 * How the cycle actually went, read off the log.
 *
 * Sets are matched to weeks by the weight on the bar, because that is all the
 * log records — it stores what was lifted, not which row of which plan it was
 * meant to satisfy. The most recent set at a week's top-set load is taken as
 * the attempt at it.
 *
 * `since` is what keeps that from being circular, and it is not optional in
 * spirit. The cycle is *derived from* your best set, and 95% of a training max
 * that is 90% of an estimate lands back near the weight the estimate came from
 * — a 140 kg five estimates a 163 kg max, a 147.5 kg training max, and a week
 * three top set of 140 kg. Without a cutoff the seed set marks week three as
 * passed before the cycle has begun. So only work done after the training max
 * was fixed counts as an attempt at it, which after a reset means only the
 * rebuild counts. That is the same rule stated twice.
 *
 * The matching can also collide. At low training maxes the top sets of two
 * weeks round to the same loadable weight (a 20 kg TM puts both 85% and 90% at
 * 17.5 kg), and then a single logged set belongs equally to both. Rather than
 * pick one and possibly tell someone to reset a lift they did not fail, those
 * weeks come back flagged and the caller must not read a verdict into them.
 */
export function reviewCycle(
  weeks: PlannedWeek[],
  sets: SetEntry[],
  since = -Infinity,
): WeekOutcome[] {
  const tops = weeks
    .filter((w) => !w.deload)
    .map((w) => ({ label: w.label, load: w.sets[w.sets.length - 1].load }));

  const seen = new Map<number, number>();
  for (const t of tops) seen.set(t.load, (seen.get(t.load) ?? 0) + 1);

  return tops.map(({ label, load }) => {
    const required = TOP_SET_MINIMUM[label] ?? 1;
    const ambiguous = (seen.get(load) ?? 0) > 1;
    let latest: SetEntry | null = null;
    for (const s of sets) {
      if (s.weight !== load || s.at <= since) continue;
      if (!latest || s.at > latest.at) latest = s;
    }
    const achieved = latest ? latest.reps : null;
    return {
      label,
      load,
      required,
      achieved,
      // Only a set that happened and fell short is a miss. A week you have not
      // reached yet is not a failure, and neither is an ambiguous match.
      missed: achieved !== null && achieved < required && !ambiguous,
      ambiguous,
    };
  });
}

/** Whole cycles needed to lift the training max from here to there. */
export function cyclesTo(currentTM: number, targetTM: number, increment: number): number {
  if (targetTM <= currentTM) return 0;
  return Math.ceil((targetTM - currentTM) / increment);
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
/** Weeks per 5/3/1 cycle — the same four-week block `cycle()` describes. */
const WEEKS_PER_CYCLE = 4;

export type GoalPace =
  | { status: "noBasis" }
  | { status: "reached" }
  | { status: "onPace" | "behind"; cyclesNeeded: number; weeksNeeded: number; weeksAvailable: number };

/**
 * Whether a goal — a weight, by a date — is realistic at this lift's own
 * pace, judged the same way `ProgressionPanel`'s "Target" field already
 * answers "how long would this take": run the target through `trainingMax`
 * exactly like a typed-in target does, and count cycles with `cyclesTo`. This
 * adds nothing new to that math — only a deadline to compare the answer
 * against, which the panel's own target field never had one of.
 *
 * `overrideTM` takes a hand-set training max over the derived one, same rule
 * and same reason as everywhere else it appears: it only exists because
 * someone chose to state it. `"noBasis"` is `mainLiftWeek1`'s null case
 * again — no logged set and no override is nothing to judge a pace against,
 * and a body-weight guess has no business standing in for one here either.
 */
export function goalPace(
  sets: SetEntry[],
  overrideTM: number | undefined,
  targetWeight: number,
  targetDate: number,
  increment: number,
  now = Date.now(),
): GoalPace {
  const best = bestEstimate(sets);
  const derivedTM = best ? trainingMax(best.oneRM) : 0;
  const tm = overrideTM ?? derivedTM;
  if (tm <= 0) return { status: "noBasis" };

  const targetTM = trainingMax(targetWeight);
  if (targetTM <= tm) return { status: "reached" };

  const cyclesNeeded = cyclesTo(tm, targetTM, increment);
  const weeksNeeded = cyclesNeeded * WEEKS_PER_CYCLE;
  const weeksAvailable = Math.floor((targetDate - now) / MS_PER_WEEK);
  return {
    status: weeksNeeded <= weeksAvailable ? "onPace" : "behind",
    cyclesNeeded,
    weeksNeeded,
    weeksAvailable,
  };
}

/**
 * How long to rest before the next set, guessed from how many reps the one
 * just finished asked for.
 *
 * A rule of thumb, not a formula with a source to cite the way Epley is
 * above: heavier, lower-rep work taxes the nervous system harder and
 * benefits from recovering longer; light, high-rep work needs less. Offered
 * as a starting suggestion rather than a measurement — the timer can be
 * extended because this will be wrong for some lifts and some people.
 */
export function restSeconds(reps: number): number {
  if (reps <= 5) return 180;
  if (reps <= 12) return 90;
  return 60;
}

/** How much a rest timer is extended by, per tap. */
export const REST_EXTEND_SECONDS = 15;

/**
 * Sets to work up through before the first working set: lighter, with more
 * reps early, taper to fewer as the weight climbs.
 *
 * A ramp, not a measurement — a widely used rule of thumb rather than a
 * formula with a derivation like Epley above, offered as a starting point
 * rather than a prescription. 40% × 5, 60% × 5, 80% × 3 of the working
 * weight, checked against https://www.hevyapp.com/warm-up-sets/ rather than
 * recalled.
 *
 * Only the tiers that add something are returned. A step below the bar has
 * nothing to load, so it is dropped rather than shown as a number nobody
 * could rack; a step that rounds up to the working weight itself — which
 * LOAD_STEP's 2.5 kg granularity can do at light weights — is dropped too,
 * since a "warm-up" identical to the work set is not one; and two tiers that
 * round to the same loadable number collapse into one rather than repeating
 * it back-to-back.
 */
export function warmupSets(
  target: number,
  bar = BAR_WEIGHT,
): { load: number; reps: number }[] {
  const tiers: [number, number][] = [
    [0.4, 5],
    [0.6, 5],
    [0.8, 3],
  ];
  const out: { load: number; reps: number }[] = [];
  for (const [fraction, reps] of tiers) {
    const load = roundLoad(target * fraction);
    if (load < bar || load >= target) continue;
    if (out.length && out[out.length - 1].load === load) continue;
    out.push({ load, reps });
  }
  return out;
}
