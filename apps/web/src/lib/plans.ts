import exercises from "../anatomy/exercises.json";
import type { Profile } from "../types";
import { estimateOneRepMax, roundLoad, LOAD_STEP } from "./progression";
import type { SetEntry } from "../state/useLog";

/**
 * Ready-made plans, and the weights to start them with.
 *
 * Three ways a weight gets onto the screen, and they are deliberately not the
 * same kind of thing:
 *
 *   from a lift you logged   a calculation — your own best set, run through
 *                            Epley, then backed off to a working weight
 *   from a related lift      the same calculation, run on a *known* max for a
 *                            close barbell relative (see RELATED_TO) rather
 *                            than this exact exercise — still a real max, just
 *                            not measured on this bar
 *   from body weight         a *starting point to test*, not an estimate of
 *                            anything. Population averages, chosen light.
 *
 * The third is why there is no path from body weight to a one-rep max
 * anywhere in this file. An estimated max drives the 5/3/1 planner, and that
 * number has to come from a set that happened (or a max someone who trains
 * that lift already knows — see `useKnownMax.ts`), never from a demographic
 * guess: laundering an average into a personal record is worst for exactly
 * the person with no logged lifts to check it against. So the no-history,
 * no-related-max path outputs a first working set and says so.
 */

export type PlanExercise = {
  id: string;
  sets: number;
  reps: number;
  /**
   * This row is a 5/3/1 main lift: its weight comes from this exercise's own
   * training-max cycle (`mainLiftWeek1` in progression.ts), the same one
   * `ProgressionPanel` already runs for it, not from `prescribe()`. `sets`
   * and `reps` here are a nominal week-1 shape (3 sets, 5 reps) used only
   * where there is no training max yet to build a real week from.
   */
  mainLift?: boolean;
};
export type PlanDay = { name: string; exercises: PlanExercise[] };
/** One frequency a plan can be run at — its own day list, not a relabelling. */
export type PlanVariant = {
  /** Sessions a week this variant assumes, for the summary line. */
  perWeek: number;
  days: PlanDay[];
};
export type PlanTemplate = {
  id: string;
  /**
   * Almost always one entry. A second only belongs here when fewer days
   * genuinely changes what gets trained — a rotation like full body or
   * push/pull/legs is already flexible for free, since running it more or
   * less often is just how frequently the same days get repeated, nothing a
   * second variant would add. Body part split is the exception: each day is
   * a muscle group with no rotation to slow down, so a shorter week has to
   * actually combine muscle groups rather than just visit them less often.
   */
  variants: PlanVariant[];
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
    variants: [
      {
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
    ],
  },
  {
    id: "upperlower",
    variants: [
      {
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
    ],
  },
  {
    id: "ppl",
    variants: [
      {
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
    ],
  },
  {
    // The other three all train each muscle two or three times a week. This
    // one trains it once, at higher volume per session — a different, equally
    // real way to run a week, not a worse version of the others.
    //
    // The one plan in this file where the number of days isn't negotiable for
    // free: every other shape is a rotation, and running one more or less
    // often just changes how frequently the same days repeat. Here each day
    // *is* a muscle group, so a shorter week has to actually combine two of
    // them rather than visit the full five less often — hence two variants
    // instead of one, the only plan that needs it.
    id: "bodypart",
    variants: [
      {
        // Shoulders and arms share a day rather than either of the other
        // three — legs is already the plan's biggest single session, and
        // splitting chest or back into a combined day leaves the other three
        // days lopsided. Volume is trimmed to fit one session rather than
        // just concatenated: four exercises, not six, dropping the two most
        // redundant with what shoulders and arms already get secondarily
        // from the chest and back days.
        perWeek: 4,
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
            name: "shouldersarms",
            exercises: [
              { id: "Standing_Military_Press", sets: 3, reps: 8 },
              { id: "Face_Pull", sets: 3, reps: 15 },
              { id: "Barbell_Curl", sets: 3, reps: 10 },
              { id: "Close-Grip_Barbell_Bench_Press", sets: 3, reps: 8 },
            ],
          },
        ],
      },
      {
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
    ],
  },
  {
    // The full-body shape again, this time built so that no barbell or rack is
    // ever required — a home gym with a pair of dumbbells and nothing else can
    // still run it. There is no dumbbell overhead press in this catalogue, so
    // day B leans on an upright row for the shoulders rather than pretending
    // one exists.
    id: "dumbbell",
    variants: [
      {
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
    ],
  },
  {
    // Two sessions, not three or five — the other shapes assume the frequency
    // is negotiable and the exercise list isn't; this is the reverse. Squats
    // only once here rather than the twice or three times the other full-body
    // shapes give it, so the hinge carries the legs on day B instead.
    id: "minimal",
    variants: [
      {
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
    ],
  },
  {
    // No equipment at all except something to hang from. The catalogue's
    // "body only" tag is exactly this category, and the app already knows what
    // to do with it — the workout logger asks for reps alone and records the
    // set at body weight, which is why this plan needs no entry in
    // BODY_FRACTION below: `prescribe` reads the tag itself.
    id: "noequip",
    variants: [
      {
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
    ],
  },
  {
    // Mark Rippetoe by way of Mehdi — squat every session, alternating bench
    // and press, deadlift kept to a single set because it is the one lift
    // that taxes recovery enough to make five pointless. Structurally the
    // same shape as "fullbody" above; the difference the name is actually
    // about is five sets of five rather than three, and a session-by-session
    // pace that plan doesn't claim. Checked against
    // https://stronglifts.com/stronglifts-5x5/workout-program/ rather than
    // recalled.
    id: "stronglifts",
    variants: [
      {
        perWeek: 3,
        days: [
          {
            name: "a",
            exercises: [
              { id: "Barbell_Squat", sets: 5, reps: 5 },
              { id: "Barbell_Bench_Press_-_Medium_Grip", sets: 5, reps: 5 },
              { id: "Bent_Over_Barbell_Row", sets: 5, reps: 5 },
            ],
          },
          {
            name: "b",
            exercises: [
              { id: "Barbell_Squat", sets: 5, reps: 5 },
              { id: "Standing_Military_Press", sets: 5, reps: 5 },
              { id: "Barbell_Deadlift", sets: 1, reps: 5 },
            ],
          },
        ],
      },
    ],
  },
  {
    // Cody LeFever's GZCLP. Four days, three tiers: T1 is the day's main
    // lift, heavy, 5x3 (the book's last set is AMRAP — this app's flat plans
    // have no per-set AMRAP flag, so the row shows a straight 5x3 and the
    // reader is free to push the last set, same simplification made for T3
    // below); T2 is a second compound at lower intensity, and it is the same
    // four lifts as T1 rotated one day later, at higher reps; T3 is a single
    // light accessory chasing volume rather than the bar weight. Checked
    // against https://www.boostcamp.app/coaches/cody-lefever/gzcl-program-gzclp
    // rather than recalled: T1 5x3, T2 3x10, T3 3x15, and the exact rotation
    // of which lift is T1/T2 on which day.
    id: "gzclp",
    variants: [
      {
        perWeek: 4,
        days: [
          {
            name: "squat",
            exercises: [
              { id: "Barbell_Squat", sets: 5, reps: 3 },
              { id: "Barbell_Bench_Press_-_Medium_Grip", sets: 3, reps: 10 },
              { id: "Wide-Grip_Lat_Pulldown", sets: 3, reps: 15 },
            ],
          },
          {
            name: "ohp",
            exercises: [
              { id: "Standing_Military_Press", sets: 5, reps: 3 },
              { id: "Barbell_Deadlift", sets: 3, reps: 10 },
              { id: "Bent_Over_Barbell_Row", sets: 3, reps: 15 },
            ],
          },
          {
            name: "bench",
            exercises: [
              { id: "Barbell_Bench_Press_-_Medium_Grip", sets: 5, reps: 3 },
              { id: "Barbell_Squat", sets: 3, reps: 10 },
              { id: "Wide-Grip_Lat_Pulldown", sets: 3, reps: 15 },
            ],
          },
          {
            name: "deadlift",
            exercises: [
              { id: "Barbell_Deadlift", sets: 5, reps: 3 },
              { id: "Standing_Military_Press", sets: 3, reps: 10 },
              { id: "Bent_Over_Barbell_Row", sets: 3, reps: 15 },
            ],
          },
        ],
      },
    ],
  },
  {
    // Jim Wendler's 5/3/1, as the four days it was written for rather than
    // the single-lift panel this app already had. Each day's main lift is
    // flagged `mainLift: true`, which tells PlanLibrary to build its weight
    // from that exercise's own training-max cycle (see `mainLiftWeek1` in
    // progression.ts) instead of a flat prescribed number — the same cycle
    // `ProgressionPanel` already runs for it, so a training max set from
    // either place is the one both use. `sets`/`reps` here are only the
    // nominal week-1 shape, used verbatim solely when there is no training
    // max yet to build a real week from.
    //
    // Assistance is Wendler's own stated categories for a beginner running
    // this — a push, a pull, and a single-leg-or-core movement each day,
    // whichever the main lift itself doesn't already cover — at 5x10, the
    // simplest of his supplemental options. Day order (press, deadlift,
    // bench, squat) and the categories themselves checked against
    // https://www.jimwendler.com/blogs/jimwendler-com/101065094-5-3-1-for-a-beginner
    // rather than recalled; the specific exercises within each category are
    // this app's own pick from its catalogue, not Wendler's.
    id: "531",
    variants: [
      {
        perWeek: 4,
        days: [
          {
            name: "ohp",
            exercises: [
              { id: "Standing_Military_Press", sets: 3, reps: 5, mainLift: true },
              { id: "Wide-Grip_Lat_Pulldown", sets: 5, reps: 10 },
              { id: "3_4_Sit-Up", sets: 5, reps: 10 },
            ],
          },
          {
            name: "deadlift",
            exercises: [
              { id: "Barbell_Deadlift", sets: 3, reps: 5, mainLift: true },
              { id: "Dumbbell_Bench_Press", sets: 5, reps: 10 },
              { id: "Single_Leg_Glute_Bridge", sets: 5, reps: 10 },
            ],
          },
          {
            name: "bench",
            exercises: [
              { id: "Barbell_Bench_Press_-_Medium_Grip", sets: 3, reps: 5, mainLift: true },
              { id: "Bent_Over_Barbell_Row", sets: 5, reps: 10 },
              { id: "3_4_Sit-Up", sets: 5, reps: 10 },
            ],
          },
          {
            name: "squat",
            exercises: [
              { id: "Barbell_Squat", sets: 3, reps: 5, mainLift: true },
              { id: "Dumbbell_Bench_Press", sets: 5, reps: 10 },
              { id: "Single_Leg_Glute_Bridge", sets: 5, reps: 10 },
            ],
          },
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
 * fraction of body weight scaled by age, it's loaded with body weight, full
 * stop. `prescribe` reads this set before it ever looks at the fraction
 * table.
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
 * A close barbell relative of one of the three lifts the stats panel tracks
 * (`Barbell_Squat`, `Barbell_Bench_Press_-_Medium_Grip`, `Barbell_Deadlift`),
 * worth nudging from a *known* max on that lift rather than only ever a
 * body-weight guess — see `prescribe`'s `knownMax` parameter below.
 *
 * Deliberately short. This is not "every exercise that shares a primary
 * muscle" — the catalogue carries no family/variant field to check that
 * against safely (a dumbbell press and a barbell press share `pec` and
 * nothing else useful; "100 kg bench doesn't mean it can be done with
 * dumbbells" is exactly the case this table exists to keep out). Each entry
 * here is barbell-to-barbell, same primary and secondary muscles as its
 * anchor, and the fraction is not a fresh guess: it is the ratio the
 * `BODY_FRACTION` table already encodes between the two lifts (0.32 / 0.4 =
 * 0.8 for both incline and close-grip against flat bench), made explicit and
 * reused rather than invented twice. Squat and deadlift have no entries: no
 * exercise in this catalogue is both barbell-equipped and a close enough
 * relative of either to extrapolate from with the same confidence — see
 * `RELATED_TO`'s own limits noted where `prescribe` reads it.
 */
const RELATED_TO: Record<string, { anchor: string; fraction: number }> = {
  "Barbell_Incline_Bench_Press_-_Medium_Grip": {
    anchor: "Barbell_Bench_Press_-_Medium_Grip",
    fraction: 0.8,
  },
  "Close-Grip_Barbell_Bench_Press": {
    anchor: "Barbell_Bench_Press_-_Medium_Grip",
    fraction: 0.8,
  },
};

/**
 * How much of that fraction to apply, from what the profile knows.
 *
 * A population average, and worth naming as such — strength declines with age
 * from roughly the mid-forties, which is true of the population and not of
 * any particular person, which is the whole reason the output is a starting
 * point rather than a prescription.
 */
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
 * Applied to every profile, not read from one.
 *
 * There used to be a sex field here, asked at onboarding for exactly this:
 * upper-body strength differs between sexes by more than lower-body does, so
 * the fraction was cut for "female" and "other" and left full for "male".
 * But nothing else in the app ever read that field, the cut only ever
 * applied to a number the app already calls a starting point rather than a
 * measurement, and "other" was already defined as taking the more
 * conservative of the two figures — of the two ways this guess can be wrong,
 * starting light is the recoverable one, for anybody. That reasoning does
 * not depend on which figure a person picked, so it no longer asks: every
 * profile gets the conservative fraction, and the first real set is what
 * actually finds the right number.
 */
const CONSERVATIVE_FACTOR = 0.68;

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
   * nothing here for age to scale.
   *
   * `knownMax` is a max on this exact lift that was typed in rather than
   * logged — see `useKnownMax.ts`. It outranks `relatedLift`, which is built
   * from a real max too, just not this exercise's own.
   */
  source: "logged" | "knownMax" | "relatedLift" | "bodyweight" | "atBodyWeight" | "unknown";
  /**
   * Set only when `source` is `relatedLift`: which lift the number actually
   * came from, so the panel can say so rather than presenting a Bench Press
   * number as if it were measured on Incline Bench.
   */
  relatedTo?: string;
};

/**
 * What to put on the bar for one exercise of one plan.
 *
 * `sets` is every set ever logged for this exercise; the best usable one wins,
 * exactly as the progression panel does it, so the two never disagree.
 *
 * `knownMax` answers "what's the best known max for exercise X", for any X —
 * not just the one being prescribed. It is a function rather than a number so
 * a caller with several exercises to prescribe (a whole plan, see
 * `PlanLibrary.tsx`) can pass one lookup covering all of them, built however
 * that caller likes: a real one-rep max someone typed into the stats panel
 * (`useKnownMax`), or the same log-derived estimate this function already
 * computes for `exerciseId` itself, just for a different id. Checked twice —
 * once for `exerciseId` itself, once for `RELATED_TO[exerciseId]`'s anchor if
 * it has one — so a known Squat max changes the Squat entries in every plan
 * that names it, not only a different exercise's. Optional, and simply never
 * called when omitted, so every existing caller and test keeps working
 * unchanged without passing it.
 */
export function prescribe(
  exerciseId: string,
  reps: number,
  logged: SetEntry[],
  profile: Profile | null,
  knownMax?: (id: string) => number | null,
): Prescription {
  let best: number | null = null;
  for (const s of logged) {
    const oneRM = estimateOneRepMax(s.weight, s.reps);
    if (oneRM !== null && (best === null || oneRM > best)) best = oneRM;
  }
  if (best !== null) return { load: workingLoad(best, reps), source: "logged" };

  // A known max on this exact lift, checked before RELATED_TO rather than
  // only ever informing a *different* exercise's prescription. Without this,
  // typing a Squat max into the stats page changed nothing about the Squat
  // entries in any plan until a real set was logged — the one lift the
  // number was actually about was the one place it had no effect.
  const ownMax = knownMax?.(exerciseId);
  if (ownMax) return { load: workingLoad(ownMax, reps), source: "knownMax" };

  const related = RELATED_TO[exerciseId];
  if (related) {
    const anchorMax = knownMax?.(related.anchor);
    if (anchorMax) {
      return {
        load: workingLoad(anchorMax * related.fraction, reps),
        source: "relatedLift",
        relatedTo: related.anchor,
      };
    }
  }

  const bw = profile?.bodyWeight;
  if (!bw || profile?.bodyWeightUnit === "lb") return { load: 0, source: "unknown" };

  if (BODYONLY.has(exerciseId)) return { load: bw, source: "atBodyWeight" };

  const fraction = BODY_FRACTION[exerciseId];
  if (!fraction) return { load: 0, source: "unknown" };
  const age = AGE_FACTOR[profile.ageGroup] ?? 1;
  const raw = bw * fraction * CONSERVATIVE_FACTOR * age;
  // Never below an empty bar, and never below one loadable step for anything
  // else — a plan asking for 6 kg on a barbell is a plan you cannot follow.
  const floor = BARBELL.has(exerciseId) ? BAR : LOAD_STEP;
  return { load: Math.max(floor, roundLoad(raw)), source: "bodyweight" };
}
