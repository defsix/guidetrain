import type { SetEntry } from "../state/useLog";
import type { KnownMaxEntry } from "../state/useKnownMax";
import type { Injury } from "../state/useInjuries";
import type { Profile } from "../types";
import { prescribe } from "./plans";
import { isAvoided } from "./injuries";
import { BY_ID } from "./exerciseCatalogue";

/**
 * The only exercises this app can put a real number behind without a log of
 * their own: the three lifts tracked on the Progress page, and the two
 * accessories `plans.ts`'s `RELATED_TO` derives from them (Incline and
 * Close-Grip Bench). Anything else would mean guessing at a number nobody
 * asked this function to guess at.
 */
const CANDIDATES = [
  "Barbell_Squat",
  "Barbell_Bench_Press_-_Medium_Grip",
  "Barbell_Deadlift",
  "Barbell_Incline_Bench_Press_-_Medium_Grip",
  "Close-Grip_Barbell_Bench_Press",
];

/** `prescribe()`'s sources that come from a real max — not the population-average body-weight fallback. */
const REAL_SOURCES = new Set(["logged", "knownMax", "relatedLift"]);

export type Recommendation = { id: string; load: number };

/**
 * A short list of exercises not already in a saved workout, each with a
 * real starting weight.
 *
 * Deliberately restricted to `prescribe()`'s "logged" / "knownMax" /
 * "relatedLift" sources — its "bodyweight" fallback is available to every
 * profile from onboarding alone, and showing a recommendation off nothing
 * but a body weight typed in during onboarding would be a suggestion this
 * app has no real basis for yet. Nothing here is invented: every number
 * `prescribe()` returns is either logged, typed in on the Progress page, or
 * the same related-lift fraction already applied to Incline and Close-Grip
 * Bench everywhere else in the app.
 */
export function recommendExercises(
  savedIds: string[],
  allSets: SetEntry[],
  profile: Profile | null,
  knownMaxes: Record<string, KnownMaxEntry>,
  injuries: Record<string, Injury>,
  limit = 3,
): Recommendation[] {
  const saved = new Set(savedIds);
  const knownMax = (id: string) => knownMaxes[id]?.max ?? null;
  const out: Recommendation[] = [];

  for (const id of CANDIDATES) {
    if (saved.has(id) || out.length >= limit) continue;
    const raw = BY_ID.get(id);
    if (!raw || isAvoided(raw, injuries)) continue;

    const logged = allSets.filter((s) => s.id === id);
    const p = prescribe(id, 5, logged, profile, knownMax);
    if (!REAL_SOURCES.has(p.source)) continue;

    out.push({ id, load: p.load });
  }
  return out;
}
