import type { SetEntry } from "../state/useLog";
import type { KnownMaxEntry } from "../state/useKnownMax";
import type { Injury } from "../state/useInjuries";
import type { Profile } from "../types";
import { prescribe } from "./plans";
import { bestEstimate } from "./progression";
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

/**
 * Below this, first-session-to-latest reads as no real change — the same
 * 2.5 kg step (`LOAD_STEP`) this app already rounds every prescribed weight
 * to, so a change smaller than that wouldn't even show up as a different
 * number anywhere else in the app.
 */
const STATIC_FRACTION = 0.025;

/**
 * Above this, first-session-to-latest reads as a real, confident trend
 * rather than the noise of estimating a max from whatever reps happened to
 * get logged. Twice the static band, on the same reasoning `goalPace`
 * already leans on elsewhere: a number worth acting on has to clear a
 * margin, not just cross zero.
 */
const STEADY_FRACTION = 0.05;

/**
 * One estimated max per session (calendar day), earliest first — logging
 * three sets in one workout is one data point about that lift, not three.
 */
function sessionEstimates(sets: SetEntry[]): number[] {
  const byDay = new Map<string, SetEntry[]>();
  for (const s of sets) {
    const day = new Date(s.at).toISOString().slice(0, 10);
    const list = byDay.get(day);
    if (list) list.push(s);
    else byDay.set(day, [s]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, daySets]) => bestEstimate(daySets))
    .filter((b): b is { set: SetEntry; oneRM: number } => b !== null)
    .map((b) => b.oneRM);
}

/**
 * Whether a lift's logged history shows something worth acting on — a real
 * change from the first session to the most recent one, or a genuine
 * plateau — rather than just existing.
 *
 * Neither can be read off a single entry, logged or typed in: a known max
 * on the Progress page is taken on faith once (see `useKnownMax.ts`), and
 * one number, whichever kind, is not a trend. This is deliberately stricter
 * than `recommendExercises()` used to be — a fresh known max used to be
 * enough on its own — because "steady progress" and "no improvement" are
 * both claims about a pattern over time, and this app doesn't make claims
 * about patterns it hasn't actually seen.
 */
function hasTrend(sets: SetEntry[]): boolean {
  const estimates = sessionEstimates(sets);
  if (estimates.length < 2) return false;
  const first = estimates[0];
  const latest = estimates[estimates.length - 1];
  const change = Math.abs(latest - first) / first;
  return change <= STATIC_FRACTION || change >= STEADY_FRACTION;
}

export type Recommendation = { id: string; load: number };

/**
 * A short list of exercises not already in a saved workout, each with a
 * real starting weight — and each only offered once its anchor lift's own
 * logged history shows a real trend, steady or stalled. See `hasTrend()`.
 *
 * Deliberately restricted to `prescribe()`'s "logged" / "knownMax" /
 * "relatedLift" sources — its "bodyweight" fallback is available to every
 * profile from onboarding alone and would make this card appear off
 * nothing but a typed-in body weight, a suggestion this app has no real
 * basis for. That restricts the candidate pool to the three lifts the
 * Progress page already tracks plus the two accessories `plans.ts`'s
 * `RELATED_TO` already derives from them. Nothing here is invented: every
 * number is either logged, typed in on the Progress page, or the same
 * related-lift fraction already applied everywhere else in the app.
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
  const setsById = new Map<string, SetEntry[]>();
  for (const s of allSets) {
    const list = setsById.get(s.id);
    if (list) list.push(s);
    else setsById.set(s.id, [s]);
  }

  const out: Recommendation[] = [];
  for (const id of CANDIDATES) {
    if (saved.has(id) || out.length >= limit) continue;
    const raw = BY_ID.get(id);
    if (!raw || isAvoided(raw, injuries)) continue;

    const logged = setsById.get(id) ?? [];
    const p = prescribe(id, 5, logged, profile, knownMax);
    if (!REAL_SOURCES.has(p.source)) continue;

    // The trend has to come from wherever the number actually came from —
    // Incline and Close-Grip Bench are recommended off a Bench Press trend,
    // not their own history, since they have none yet.
    const anchorId = p.source === "relatedLift" ? p.relatedTo! : id;
    const anchorSets = anchorId === id ? logged : (setsById.get(anchorId) ?? []);
    if (!hasTrend(anchorSets)) continue;

    out.push({ id, load: p.load });
  }
  return out;
}
