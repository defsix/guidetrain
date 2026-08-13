/**
 * Training pairs — what to do in the rest between sets.
 *
 * A superset only works if the second exercise doesn't spend what the first one
 * needs. So a partner has to train a *non-competing region*, and the whole
 * question is what "non-competing" means when you look at real data.
 *
 * Region of the primary muscle alone is not enough. A lat pulldown is Back and
 * a biceps curl is Arms, so by that test they pair — and they both load the
 * biceps, which is why your arms give out on the second set of pulldowns. 13%
 * of ordered pairs in this catalogue differ that way.
 *
 * The rule here is stronger and simpler: take every muscle the exercise names,
 * primary *and* secondary, map each to its region, and require the two sets of
 * regions to be disjoint. Because a muscle belongs to exactly one region, that
 * subsumes "no shared muscle" — two exercises with no region in common cannot
 * have a muscle in common. One rule instead of two, and the stricter of them.
 *
 * It is affordable: every one of the 180 exercises keeps at least 4 partners,
 * and the median is 91. `node tools/exercises/check-pairs.mjs` re-measures that
 * against the shipped data and fails if any exercise is left with none.
 */
// The import attribute keeps this module loadable by plain Node as well as by
// Vite, so tools/exercises/check-pairs.mjs tests the code the app actually
// ships rather than a copy of the rule that could drift from it.
import exerciseData from './exercises.json' with { type: 'json' };
import defaultMap from './muscle-map.json' with { type: 'json' };

const REGION = Object.fromEntries(
  defaultMap.zones.filter((z) => z.key).map((z) => [z.key, z.region]),
);

// One entry per exercise: the same exercise is listed under every muscle it
// trains, and a partner suggested twice is a bug.
const ALL = (() => {
  const seen = new Map();
  for (const list of Object.values(exerciseData.muscles)) {
    for (const x of list) if (!seen.has(x.id)) seen.set(x.id, x);
  }
  return [...seen.values()];
})();

const REGIONS_OF = new Map(
  ALL.map((x) => [
    x.id,
    new Set([...x.primary, ...x.secondary].map((m) => REGION[m]).filter(Boolean)),
  ]),
);

function disjoint(a, b) {
  for (const r of a) if (b.has(r)) return false;
  return true;
}

/**
 * How good a partner this is, once it is known to be a legal one.
 *
 * Ranking matters more than it looks: with a median of 91 candidates, an
 * arbitrary pick would offer a barbell exercise to someone mid-set on a machine
 * across the room. In descending weight:
 *
 *   a demonstration     an exercise you can watch beats one you have to search
 *   no extra kit        body-only needs nothing; failing that, the same
 *                       equipment you are already standing at
 *   same difficulty     a beginner mid-set does not want an expert movement
 *
 * Ties break on id so the suggestion is stable — the same exercise proposes the
 * same partners every time it is opened, which is what makes it a plan rather
 * than a slot machine.
 */
function score(anchor, x) {
  let s = 0;
  if (x.videoId) s += 8;
  if (x.equipment === 'body only') s += 4;
  else if (x.equipment === anchor.equipment) s += 3;
  if (x.level === anchor.level) s += 1;
  return s;
}

/**
 * Up to `limit` exercises to superset with this one, best first.
 *
 * Partners are spread across different primary muscles where possible: three
 * legal partners that are all calf raises is a correct answer to the wrong
 * question, since the point of the rest period is to train something else.
 */
export function pairsFor(exercise, limit = 3) {
  if (!exercise) return [];
  const mine = REGIONS_OF.get(exercise.id);
  if (!mine) return [];

  const legal = ALL.filter(
    (x) => x.id !== exercise.id && disjoint(mine, REGIONS_OF.get(x.id)),
  ).sort((a, b) => score(exercise, b) - score(exercise, a) || a.id.localeCompare(b.id));

  const out = [];
  const taken = new Set();
  // First pass takes the best candidate for each primary muscle not yet used;
  // the second fills any remaining slots in rank order.
  for (const x of legal) {
    if (out.length >= limit) break;
    const key = x.primary[0] ?? '';
    if (taken.has(key)) continue;
    taken.add(key);
    out.push(x);
  }
  for (const x of legal) {
    if (out.length >= limit) break;
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

/** Every exercise, one entry each — exported for the checker. */
export const ALL_EXERCISES = ALL;
export const REGIONS_FOR = (id) => REGIONS_OF.get(id);
