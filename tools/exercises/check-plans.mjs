// Checks the ready-made plans against the shipped catalogue.
//
//   node tools/exercises/check-plans.mjs
//
// A plan naming an exercise the app does not have would render a blank row and
// prescribe a weight for nothing, so this fails the moment one drifts. Exits
// non-zero, like check-locales and check-pairs.
import { readFileSync } from "node:fs";

const data = JSON.parse(
  readFileSync(new URL("../../apps/web/src/anatomy/exercises.json", import.meta.url)),
);
const known = new Map();
for (const list of Object.values(data.muscles)) {
  for (const x of list) if (!known.has(x.id)) known.set(x.id, x);
}

const src = readFileSync(new URL("../../apps/web/src/lib/plans.ts", import.meta.url), "utf8");
const planIds = [...src.matchAll(/\{ id: "([^"]+)", sets: (\d+), reps: (\d+) \}/g)];
const fractionIds = [...src.matchAll(/^\s+"?([A-Za-z0-9_\-]+)"?: [\d.]+,$/gm)]
  .map((m) => m[1])
  .filter((id) => known.has(id) || /^[A-Z]/.test(id));

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

console.log(`${planIds.length} plan entries, ${new Set(planIds.map((m) => m[1])).size} distinct exercises`);
for (const [, id, sets, reps] of planIds) {
  if (!known.has(id)) fail(`plan names an exercise the catalogue does not have: ${id}`);
  if (+sets < 1 || +sets > 10) fail(`${id}: ${sets} sets is out of range`);
  if (+reps < 1 || +reps > 30) fail(`${id}: ${reps} reps is out of range`);
}
// Every exercise a plan prescribes needs a body-weight fraction, or someone
// with no logged lifts gets a blank where a starting weight should be.
const withFraction = new Set(fractionIds);
for (const [, id] of planIds) {
  if (!withFraction.has(id)) fail(`no starting-weight fraction for ${id}`);
}
for (const id of withFraction) {
  if (!known.has(id)) fail(`fraction for an unknown exercise: ${id}`);
}

if (bad) { console.log(`\n${bad} problem(s)`); process.exit(1); }
console.log("every plan exercise exists, is in range, and has a starting weight");

// The starting-weight floor is checked in the browser instead, by
// docs/screenshots-style verification against the lightest profile the
// onboarding can produce. It cannot be checked from here: plans.ts is
// TypeScript importing JSON and extensionless modules, so plain Node cannot
// load it, and re-implementing the rule in this file would let the two drift —
// which is the whole failure this checker exists to prevent.
