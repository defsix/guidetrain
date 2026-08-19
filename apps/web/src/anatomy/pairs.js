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
 *   a demonstration    an exercise you can watch beats one you have to search
 *   can do it next     body-only (needs nothing), the same equipment you are
 *                      already standing at, or equipment you said you have —
 *                      tied deliberately, see below
 *   same difficulty    a beginner mid-set does not want an expert movement
 *
 * The three "can do it next" cases used to be a strict order — body-only
 * above same-kit above equipment-owned — on the reasoning that needing
 * literally nothing beats needing to walk to your own gear. In practice that
 * meant `equipmentAvailable` never won a single suggestion across all 180
 * exercises: there are always at least three legal body-only candidates for
 * every exercise and region, so they filled every visible slot before an
 * owned-equipment bonus was ever consulted regardless of what was picked.
 * Tied now on purpose instead: once someone has said what they have, a
 * bodyweight move and a lift on their own gear are both real, equally valid
 * answers to "what's my rest-break partner", and ranking one above the other
 * was asserting a preference nobody asked for.
 *
 * Ties break on id so the suggestion is stable — the same exercise proposes the
 * same partners every time it is opened, which is what makes it a plan rather
 * than a slot machine.
 */
function score(anchor, x, equipmentAvailable) {
  let s = 0;
  if (x.videoId) s += 8;
  const canDoItNext =
    x.equipment === 'body only' ||
    (anchor && x.equipment === anchor.equipment) ||
    (equipmentAvailable && equipmentAvailable.has(x.equipment));
  if (canDoItNext) s += 4;
  if (anchor && x.level === anchor.level) s += 1;
  return s;
}

/**
 * Best partners for anything that occupies a set of regions.
 *
 * `anchor` is the exercise being paired with, when there is one — it only
 * sharpens the ranking (same kit, same difficulty), never the legality, so a
 * muscle with no exercise chosen yet gets the same rule applied to less
 * information rather than a different rule. `equipmentAvailable` sharpens it
 * the same way, from what the reader said they have rather than what they
 * are already standing at.
 */
function pick(regions, anchor, limit, excludeId, equipmentAvailable) {
  const legal = ALL.filter(
    (x) => x.id !== excludeId && disjoint(regions, REGIONS_OF.get(x.id)),
  ).sort(
    (a, b) =>
      score(anchor, b, equipmentAvailable) - score(anchor, a, equipmentAvailable) ||
      a.id.localeCompare(b.id),
  );

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

/**
 * Up to `limit` exercises to superset with this one, best first.
 *
 * Partners are spread across different primary muscles where possible: three
 * legal partners that are all calf raises is a correct answer to the wrong
 * question, since the point of the rest period is to train something else.
 *
 * @param {Set<string>|null} [equipmentAvailable]
 */
export function pairsFor(exercise, limit = 3, equipmentAvailable = null) {
  if (!exercise) return [];
  const mine = REGIONS_OF.get(exercise.id);
  return mine ? pick(mine, exercise, limit, exercise.id, equipmentAvailable) : [];
}

/**
 * Up to `limit` exercises to superset with a muscle, before any particular
 * exercise for it has been chosen.
 *
 * Deliberately weaker than the exercise-level answer, and it has to be: a
 * bench press loads the triceps and a chest fly barely does, so until you say
 * which one you are doing, the only honest claim is about the region the
 * muscle sits in. Opening an exercise replaces these with partners that know
 * about its secondary muscles too.
 *
 * @param {Set<string>|null} [equipmentAvailable]
 */
export function pairsForRegion(region, limit = 3, equipmentAvailable = null) {
  if (!region) return [];
  return pick(new Set([region]), null, limit, null, equipmentAvailable);
}

/**
 * How good a replacement this is, once it is known to be a legal one.
 *
 * Different equipment ranks first, deliberately above the video/kit/level
 * signals pairsFor's score weighs first — "the rack is busy" is the actual
 * reason a swap gets asked for, so an alternative that frees you from the
 * same equipment answers the real question; one that needs the identical
 * rack does not, even though it is a legal same-muscle match. Everything
 * after that mirrors score() above for the same reasons it does there.
 */
function swapScore(anchor, x, equipmentAvailable) {
  let s = 0;
  if (x.equipment !== anchor.equipment) s += 8;
  if (x.videoId) s += 4;
  const canDoItNext =
    x.equipment === 'body only' || (equipmentAvailable && equipmentAvailable.has(x.equipment));
  if (canDoItNext) s += 2;
  if (x.level === anchor.level) s += 1;
  return s;
}

/**
 * Up to `limit` exercises that train the same thing this one does — a
 * replacement, not a rest-break partner.
 *
 * The opposite legality test from pairsFor above: that function requires
 * disjoint regions, because a superset partner competing for the same
 * recovery defeats the point of it. A swap is the other question entirely —
 * the equipment is the problem, not the muscle — so it requires the *same*
 * primary muscle instead. Every exercise in this catalogue names exactly one
 * primary muscle (`check-pairs.mjs`'s own data checks this file against
 * confirm it), so "shares a primary muscle" and "has the same primary
 * muscle" are the same test here; written as an intersection anyway so nothing
 * downstream breaks if that ever stops being true.
 *
 * Ties break on id so the suggestions are stable, same as pairsFor.
 *
 * @param {Set<string>|null} [equipmentAvailable]
 */
export function swapsFor(exercise, limit = 4, equipmentAvailable = null) {
  if (!exercise) return [];
  const mine = new Set(exercise.primary);
  const legal = ALL.filter(
    (x) => x.id !== exercise.id && x.primary.some((m) => mine.has(m)),
  ).sort(
    (a, b) =>
      swapScore(exercise, b, equipmentAvailable) - swapScore(exercise, a, equipmentAvailable) ||
      a.id.localeCompare(b.id),
  );
  return legal.slice(0, limit);
}

/** Every exercise, one entry each — exported for the checker. */
export const ALL_EXERCISES = ALL;
export const REGIONS_FOR = (id) => REGIONS_OF.get(id);
