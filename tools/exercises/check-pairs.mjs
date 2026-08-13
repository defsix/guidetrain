// Checks the training-pair rule against the shipped catalogue.
//
//   node tools/exercises/check-pairs.mjs
//
// Fails if any exercise is left without a partner, if a suggested partner
// shares a region (or, equivalently, a muscle) with its anchor, or if the
// suggestions are not stable across calls. Exits non-zero so it can gate a
// build the way check-locales.mjs does.
import { pairsFor, ALL_EXERCISES, REGIONS_FOR } from "../../apps/web/src/anatomy/pairs.js";

let bad = 0;
const fail = (msg) => { console.log("  FAIL " + msg); bad++; };

const counts = [];
for (const a of ALL_EXERCISES) {
  const got = pairsFor(a, 3);
  counts.push(got.length);

  if (got.length === 0) fail(`${a.name} has no partner at all`);

  for (const b of got) {
    // The rule itself.
    const shared = [...REGIONS_FOR(a.id)].filter((r) => REGIONS_FOR(b.id).has(r));
    if (shared.length) fail(`${a.name} + ${b.name} share ${shared.join(", ")}`);
    // Region disjointness should make muscle disjointness automatic; if that
    // ever stops holding, the region map has a muscle in two regions.
    const ma = new Set([...a.primary, ...a.secondary]);
    const both = [...b.primary, ...b.secondary].filter((m) => ma.has(m));
    if (both.length) fail(`${a.name} + ${b.name} share muscle ${both.join(", ")}`);
    if (b.id === a.id) fail(`${a.name} is paired with itself`);
  }

  if (new Set(got.map((x) => x.id)).size !== got.length) fail(`${a.name} got a duplicate partner`);

  // Stable: the same exercise must propose the same partners every time.
  const again = pairsFor(a, 3);
  if (again.map((x) => x.id).join() !== got.map((x) => x.id).join())
    fail(`${a.name} suggestions are not stable between calls`);
}

const withVideo = ALL_EXERCISES.filter((a) => pairsFor(a, 3).every((b) => b.videoId)).length;
const sorted = [...counts].sort((x, y) => x - y);
// How many legal partners exist, not how many were asked for. This is the
// number that says whether the rule is affordable; if it ever approaches zero
// the rule is too strict for the catalogue, and the shown-list size above says
// nothing about that.
const legal = ALL_EXERCISES.map((a) => pairsFor(a, Infinity).length).sort((x, y) => x - y);
console.log(`${ALL_EXERCISES.length} exercises checked`);
console.log(`  legal partners: min ${legal[0]}, median ${legal[legal.length >> 1]}, max ${legal.at(-1)}`);
console.log(`  suggestions shown: min ${sorted[0]}, median ${sorted[sorted.length >> 1]}`);
console.log(`  all three suggestions playable for ${withVideo}/${ALL_EXERCISES.length}`);

if (bad) {
  console.log(`\n${bad} problem(s)`);
  process.exit(1);
}
console.log("\nno shared regions, no shared muscles, stable, none left unpaired");
