import type { Injury } from "../state/useInjuries";

/**
 * Whether an exercise should be kept away from, per an injury marked on the
 * Stats page — "avoid" or "warn", or null if nothing marked applies.
 *
 * Primary muscle only, on purpose: a marked injury says this lift would
 * affect it, and "affect" means *trains* it, not merely gets touched in
 * passing the way a secondary muscle does. `exercise.primary` is a
 * single-entry array for every exercise in this catalogue (`pairs.js`
 * relies on the same fact for `swapsFor`), but this checks every entry
 * rather than assuming that stays true forever.
 */
export function injuryFor(
  exercise: { primary: string[] },
  injuries: Record<string, Injury>,
): { mode: "avoid" | "warn"; muscle: string } | null {
  for (const m of exercise.primary) {
    const hit = injuries[m];
    if (hit) return { mode: hit.mode, muscle: m };
  }
  return null;
}

/** True when this exercise is under a hard "avoid" injury — filter it out of a suggestion list. */
export function isAvoided(
  exercise: { primary: string[] },
  injuries: Record<string, Injury>,
): boolean {
  return injuryFor(exercise, injuries)?.mode === "avoid";
}
