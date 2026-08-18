import exercises from "../anatomy/exercises.json";
import type { Profile } from "../types";
import { estimateOneRepMax, roundLoad, LOAD_STEP } from "./progression";
import type { SetEntry } from "../state/useLog";

/**
 * Ready-made plans, and the weights to start them with.
 *
 * Two ways a weight gets onto the screen, and they are deliberately not the
 * same kind of thing:
 *
 *   from a lift you logged   a calculation — your own best set, run through
 *                            Epley, then backed off to a working weight
 *   from body weight         a *starting point to test*, not an estimate of
 *                            anything. Population averages, chosen light.
 *
 * The second is why there is no path from body weight to a one-rep max
 * anywhere in this file. An estimated max drives the 5/3/1 planner, and that
 * number has to come from a set that happened. Feeding it a demographic guess
 * would launder an average into a personal record — and the person with no
 * logged lifts is precisely the one least able to tell that the number is
 * wrong. So the no-history path outputs a first working set and says so.
 */

export type PlanExercise = { id: string; sets: number; reps: number };
export type PlanDay = { name: string; exercises: PlanExercise[] };
export type PlanTemplate = {
  id: string;
  days: PlanDay[];
  /** Sessions a week the plan assumes, for the summary line. */
  perWeek: number;
};

/**
 * A small, well-worn set of shapes rather than a large invented one. Each is a
 * real structure people actually train rather than anything designed here, and
 * each is built only from exercises this catalogue actually has — a plan
 * naming a lift the app cannot show you is worse than no plan.
 */
export const PLANS: PlanTemplate[] = [
  {
    id: "fullbody",
    perWeek: 3,
    days: [
      {
        name: "a",
        exercises: [
          { id: "Barbell_Squat", sets: 3, reps: 5 },
          { id: "Barbell_Bench_Press_-_Medium_Grip", sets: 3, reps: 5 },
          { id: "Bent_Over_Barbell_Row", sets: 3, reps: 5 },
        ],
      },
      {
        name: "b",
        exercises: [
          { id: "Barbell_Squat", sets: 3, reps: 5 },
          { id: "Standing_Military_Press", sets: 3, reps: 5 },
          { id: "Barbell_Deadlift", sets: 1, reps: 5 },
        ],
      },
    ],
  },
  {
    id: "upperlower",
    perWeek: 4,
    days: [
      {
        name: "upper",
        exercises: [
          { id: "Barbell_Bench_Press_-_Medium_Grip", sets: 4, reps: 6 },
          { id: "Bent_Over_Barbell_Row", sets: 4, reps: 6 },
          { id: "Standing_Military_Press", sets: 3, reps: 8 },
          { id: "Wide-Grip_Lat_Pulldown", sets: 3, reps: 10 },
        ],
      },
      {
        name: "lower",
        exercises: [
          { id: "Barbell_Squat", sets: 4, reps: 6 },
          { id: "Romanian_Deadlift", sets: 3, reps: 8 },
          { id: "Leg_Press", sets: 3, reps: 10 },
          { id: "Calf_Press_On_The_Leg_Press_Machine", sets: 3, reps: 12 },
        ],
      },
    ],
  },
  {
    id: "ppl",
    perWeek: 3,
    days: [
      {
        name: "push",
        exercises: [
          { id: "Barbell_Bench_Press_-_Medium_Grip", sets: 4, reps: 6 },
          { id: "Standing_Military_Press", sets: 3, reps: 8 },
          { id: "Dumbbell_Bench_Press", sets: 3, reps: 10 },
        ],
      },
      {
        name: "pull",
        exercises: [
          { id: "Bent_Over_Barbell_Row", sets: 4, reps: 6 },
          { id: "Wide-Grip_Lat_Pulldown", sets: 3, reps: 10 },
          { id: "Barbell_Curl", sets: 3, reps: 10 },
        ],
      },
      {
        name: "legs",
        exercises: [
          { id: "Barbell_Squat", sets: 4, reps: 6 },
          { id: "Romanian_Deadlift", sets: 3, reps: 8 },
          { id: "Leg_Press", sets: 3, reps: 12 },
        ],
      },
    ],
  },
  {
    // The other three all train each muscle two or three times a week. This
    // one trains it once, at higher volume per session — a different, equally
    // real way to run a week, not a worse version of the others.
    id: "bodypart",
    perWeek: 5,
    days: [
      {
        name: "chest",
        exercises: [
          { id: "Barbell_Bench_Press_-_Medium_Grip", sets: 4, reps: 8 },
          { id: "Barbell_Incline_Bench_Press_-_Medium_Grip", sets: 3, reps: 10 },
          { id: "Dumbbell_Bench_Press", sets: 3, reps: 12 },
        ],
      },
      {
        name: "back",
        exercises: [
          { id: "Bent_Over_Barbell_Row", sets: 4, reps: 8 },
          { id: "Wide-Grip_Lat_Pulldown", sets: 3, reps: 10 },
          { id: "One-Arm_Dumbbell_Row", sets: 3, reps: 12 },
        ],
      },
      {
        name: "legs",
        exercises: [
          { id: "Barbell_Squat", sets: 4, reps: 8 },
          { id: "Leg_Press", sets: 3, reps: 10 },
          { id: "Seated_Leg_Curl", sets: 3, reps: 12 },
          { id: "Seated_Calf_Raise", sets: 3, reps: 15 },
        ],
      },
      {
        name: "shoulders",
        exercises: [
          { id: "Standing_Military_Press", sets: 4, reps: 8 },
          { id: "Upright_Barbell_Row", sets: 3, reps: 10 },
          // Light and high-rep on purpose — a rear-delt/rotator accessory,
          // not a lift anyone loads heavy.
          { id: "Face_Pull", sets: 3, reps: 15 },
        ],
      },
      {
        name: "arms",
        exercises: [
          { id: "Barbell_Curl", sets: 3, reps: 10 },
          { id: "Close-Grip_Barbell_Bench_Press", sets: 3, reps: 8 },
          { id: "Alternate_Hammer_Curl", sets: 3, reps: 12 },
        ],
      },
    ],
  },
  {
    // The full-body shape again, this time built so that no barbell or rack is
    // ever required — a home gym with a pair of dumbbells and nothing else can
    // still run it. There is no dumbbell overhead press in this catalogue, so
    // day B leans on an upright row for the shoulders rather than pretending
    // one exists.
    id: "dumbbell",
    perWeek: 3,
    days: [
      {
        name: "a",
        exercises: [
          { id: "Dumbbell_Squat", sets: 3, reps: 8 },
          { id: "Dumbbell_Bench_Press", sets: 3, reps: 10 },
          { id: "One-Arm_Dumbbell_Row", sets: 3, reps: 10 },
        ],
      },
      {
        name: "b",
        exercises: [
          { id: "Dumbbell_Squat", sets: 3, reps: 8 },
          { id: "Standing_Dumbbell_Upright_Row", sets: 3, reps: 10 },
          { id: "Stiff-Legged_Dumbbell_Deadlift", sets: 1, reps: 8 },
        ],
      },
    ],
  },
  {
    // Two sessions, not three or five — the other shapes assume the frequency
    // is negotiable and the exercise list isn't; this is the reverse. Squats
    // only once here rather than the twice or three times the other full-body
    // shapes give it, so the hinge carries the legs on day B instead.
    id: "minimal",
    perWeek: 2,
    days: [
      {
        name: "a",
        exercises: [
          { id: "Barbell_Squat", sets: 3, reps: 5 },
          { id: "Barbell_Bench_Press_-_Medium_Grip", sets: 3, reps: 5 },
          { id: "Bent_Over_Barbell_Row", sets: 3, reps: 5 },
        ],
      },
      {
        name: "b",
        exercises: [
          { id: "Barbell_Deadlift", sets: 1, reps: 5 },
          { id: "Standing_Military_Press", sets: 3, reps: 5 },
          { id: "Wide-Grip_Lat_Pulldown", sets: 3, reps: 8 },
        ],
      },
    ],
  },
  {
    // No equipment at all except something to hang from. The catalogue's
    // "body only" tag is exactly this category, and the app already knows what
    // to do with it — the workout logger asks for reps alone and records the
    // set at body weight, which is why this plan needs no entry in
    // BODY_FRACTION below: `prescribe` reads the tag itself.
    id: "noequip",
    perWeek: 3,
    days: [
      {
        name: "full",
        exercises: [
          { id: "Push-Up_Wide", sets: 3, reps: 12 },
          { id: "Pullups", sets: 3, reps: 6 },
          { id: "Bodyweight_Squat", sets: 3, reps: 15 },
          { id: "Single_Leg_Glute_Bridge", sets: 3, reps: 12 },
          { id: "3_4_Sit-Up", sets: 3, reps: 20 },
        ],
      },
    ],
  },
];

/** An Olympic bar. Nothing barbell can be prescribed below it. */
const BAR = 20;

/**
 * Which exercises are done with a barbell, read from the catalogue rather than
 * guessed from the id.
 *
 * This was `id.startsWith("Barbell")`, which is true of "Barbell_Squat" and
 * false of "Standing_Military_Press" and "Bent_Over_Barbell_Row" — both of
 * which are barbell lifts. A light profile was therefore prescribed a 7.5 kg
 * overhead press, which is not a weight that exists: the empty bar is 20 kg.
 * The equipment field was there the whole time.
 */
const BARBELL = new Set<string>();
for (const list of Object.values(exercises.muscles as Record<string, { id: string; equipment?: string }[]>)) {
  for (const x of list) if (x.equipment === "barbell") BARBELL.add(x.id);
}

/**
 * Exercises whose load is the person doing them, same source as `BARBELL`.
 *
 * These need no entry in `BODY_FRACTION` — a push-up isn't loaded with a
 * fraction of body weight scaled by age and sex, it's loaded with body
 * weight, full stop. `prescribe` reads this set before it ever looks at the
 * fraction table.
 */
const BODYONLY = new Set<string>();
for (const list of Object.values(exercises.muscles as Record<string, { id: string; equipment?: string }[]>)) {
  for (const x of list) if (x.equipment === "body only") BODYONLY.add(x.id);
}

/**
 * A first working weight as a fraction of body weight, per exercise.
 *
 * Conservative on purpose — these are meant to feel too easy on day one,
 * because the cost of being wrong is not symmetric. A set that turns out light
 * costs one set; a set that turns out heavy costs a back. The first session's
 * job is to find the real number, which the log then keeps, after which none of
 * this is used again for that lift.
 */
const BODY_FRACTION: Record<string, number> = {
  Barbell_Squat: 0.5,
  "Barbell_Bench_Press_-_Medium_Grip": 0.4,
  Barbell_Deadlift: 0.6,
  Standing_Military_Press: 0.25,
  Bent_Over_Barbell_Row: 0.35,
  Romanian_Deadlift: 0.45,
  "Wide-Grip_Lat_Pulldown": 0.4,
  Leg_Press: 0.8,
  Dumbbell_Bench_Press: 0.15,
  Barbell_Curl: 0.15,
  Calf_Press_On_The_Leg_Press_Machine: 1.2,

  // The body-part split. Each set against the nearest lift already above
  // rather than picked fresh — incline and close-grip run a shade under flat
  // bench, a one-arm row is braced and so moves more per hand than a press,
  // Face_Pull is a light high-rep accessory nobody loads heavy.
  "Barbell_Incline_Bench_Press_-_Medium_Grip": 0.32,
  "Close-Grip_Barbell_Bench_Press": 0.32,
  "One-Arm_Dumbbell_Row": 0.2,
  Seated_Leg_Curl: 0.3,
  // Calves are strong relative to bodyweight, same reasoning as the leg-press
  // calf variant above, just a smaller stack on most seated machines.
  Seated_Calf_Raise: 1.0,
  Upright_Barbell_Row: 0.22,
  Face_Pull: 0.08,
  Alternate_Hammer_Curl: 0.12,

  // The dumbbell-only full body plan. Each is a per-hand fraction — the
  // catalogue's own instructions confirm all three are done with one dumbbell
  // per hand, not a single dumbbell held in both — so the same "per hand"
  // reading the logger already gives Dumbbell_Bench_Press applies here too.
  // Lighter than their barbell analogues on purpose: a bar the same
  // percentage away from the body's centre of mass is easier to balance than
  // two independent dumbbells, and grip is the first thing to give out.
  Dumbbell_Squat: 0.2,
  Standing_Dumbbell_Upright_Row: 0.1,
  "Stiff-Legged_Dumbbell_Deadlift": 0.2,
};

/**
 * How much of that fraction to apply, from what the profile knows.
 *
 * Population averages, and worth naming as such. Upper-body strength differs
 * between sexes by more than lower-body does, and strength declines with age
 * from roughly the mid-forties. Both are true of populations and neither is
 * true of any particular person, which is the whole reason the output is a
 * starting point rather than a prescription.
 *
 * "Other / prefer not to say" takes the lower figure. There is no basis for
 * picking a number for someone who declined to be sorted, and of the two
 * available errors, starting light is the recoverable one.
 */
const SEX_FACTOR: Record<string, number> = { male: 1, female: 0.68, other: 0.68 };

const AGE_FACTOR: Record<string, number> = {
  // Under 18s get the most conservative figure in the table. Loading a
  // still-growing skeleton from a population average is the least defensible
  // thing this function could do, so it does the least of it.
  teen: 0.7,
  "18-29": 1,
  "30-44": 1,
  "45-59": 0.9,
  "60+": 0.78,
};

/**
 * The working weight for a set of `reps`, from an estimated one-rep max.
 *
 * Epley inverted — the weight that would make `reps` a maximal set — then
 * backed off a tenth, because a plan asks for sets you finish, not sets that
 * end you. At a 100 kg max that is 77.5 kg for a set of five and 67.5 for a set
 * of ten.
 */
export function workingLoad(oneRM: number, reps: number): number {
  return roundLoad((oneRM / (1 + reps / 30)) * 0.9);
}

export type Prescription = {
  load: number;
  /**
   * Where the number came from, which the panel must say out loud.
   *
   * `atBodyWeight` is not a fifth kind of estimate alongside `bodyweight` — it
   * is not an estimate at all. A push-up is loaded with exactly the body
   * weight on the profile, not a demographic-adjusted share of it, so there is
   * nothing here for sex or age to scale.
   */
  source: "logged" | "bodyweight" | "atBodyWeight" | "unknown";
};

/**
 * What to put on the bar for one exercise of one plan.
 *
 * `sets` is every set ever logged for this exercise; the best usable one wins,
 * exactly as the progression panel does it, so the two never disagree.
 */
export function prescribe(
  exerciseId: string,
  reps: number,
  logged: SetEntry[],
  profile: Profile | null,
): Prescription {
  let best: number | null = null;
  for (const s of logged) {
    const oneRM = estimateOneRepMax(s.weight, s.reps);
    if (oneRM !== null && (best === null || oneRM > best)) best = oneRM;
  }
  if (best !== null) return { load: workingLoad(best, reps), source: "logged" };

  const bw = profile?.bodyWeight;
  if (!bw || profile?.bodyWeightUnit === "lb") return { load: 0, source: "unknown" };

  if (BODYONLY.has(exerciseId)) return { load: bw, source: "atBodyWeight" };

  const fraction = BODY_FRACTION[exerciseId];
  if (!fraction) return { load: 0, source: "unknown" };
  const sex = SEX_FACTOR[profile.gender] ?? SEX_FACTOR.other;
  const age = AGE_FACTOR[profile.ageGroup] ?? 1;
  const raw = bw * fraction * sex * age;
  // Never below an empty bar, and never below one loadable step for anything
  // else — a plan asking for 6 kg on a barbell is a plan you cannot follow.
  const floor = BARBELL.has(exerciseId) ? BAR : LOAD_STEP;
  return { load: Math.max(floor, roundLoad(raw)), source: "bodyweight" };
}
