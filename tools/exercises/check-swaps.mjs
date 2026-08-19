// Checks the exercise-swap rule against the shipped catalogue.
//
//   node tools/exercises/check-swaps.mjs
//
// Fails if any exercise is left without a replacement, if a suggested swap
// does not share the anchor's primary muscle, or if the suggestions are not
// stable across calls. Exits non-zero so it can gate a build the way
// check-pairs.mjs does.
import { swapsFor, ALL_EXERCISES } from "../../apps/web/src/anatomy/pairs.js";

let bad = 0;
const fail = (msg) => { console.log("  FAIL " + msg); bad++; };

const counts = [];
for (const a of ALL_EXERCISES) {
  const got = swapsFor(a, 4);
  counts.push(got.length);

  if (got.length === 0) fail(`${a.name} has no swap at all`);

  for (const b of got) {
    // The rule itself: a replacement has to train the same primary muscle.
    if (!b.primary.some((m) => a.primary.includes(m)))
      fail(`${a.name} + ${b.name} share no primary muscle`);
    if (b.id === a.id) fail(`${a.name} is offered as its own swap`);
  }

  if (new Set(got.map((x) => x.id)).size !== got.length) fail(`${a.name} got a duplicate swap`);

  // Stable: the same exercise must propose the same swaps every time.
  const again = swapsFor(a, 4);
  if (again.map((x) => x.id).join() !== got.map((x) => x.id).join())
    fail(`${a.name} suggestions are not stable between calls`);
}

const sorted = [...counts].sort((x, y) => x - y);
// How many legal swaps exist, not how many were asked for — the number that
// says whether the rule is affordable across the whole catalogue.
const legal = ALL_EXERCISES.map((a) => swapsFor(a, Infinity).length).sort((x, y) => x - y);
console.log(`${ALL_EXERCISES.length} exercises checked`);
console.log(`  legal swaps: min ${legal[0]}, median ${legal[legal.length >> 1]}, max ${legal.at(-1)}`);
console.log(`  suggestions shown: min ${sorted[0]}, median ${sorted[sorted.length >> 1]}`);

if (bad) {
  console.log(`\n${bad} problem(s)`);
  process.exit(1);
}
console.log("\nevery swap shares the anchor's primary muscle, stable, none left without one");
