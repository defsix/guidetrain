// Checks the ready-made plans against the shipped catalogue.
//
//   node --import tsx tools/exercises/check-plans.ts
//
// A plan naming an exercise the app does not have would render a blank row and
// prescribe a weight for nothing, so this fails the moment one drifts. Exits
// non-zero, like check-locales and check-pairs.
//
// This used to be a .mjs that scraped plans.ts with regexes and said the
// starting-weight floor "cannot be checked from here" — which was wrong. tsx
// is already in the tree, so the real module can simply be imported, and the
// floor is exactly the kind of rule worth a gate: getting it wrong prescribed
// a 7.5 kg overhead press, and it was a browser check that happened to catch
// it rather than anything that would catch it again.
import { readFileSync } from "node:fs";
import { PLANS, prescribe } from "../../apps/web/src/lib/plans.ts";
import type { Profile } from "../../apps/web/src/types.ts";

const data = JSON.parse(
  readFileSync(new URL("../../apps/web/src/anatomy/exercises.json", import.meta.url), "utf8"),
);
const known = new Map<string, { id: string; equipment?: string }>();
for (const list of Object.values(data.muscles) as { id: string; equipment?: string }[][]) {
  for (const x of list) if (!known.has(x.id)) known.set(x.id, x);
}

let bad = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  bad++;
};

const entries = PLANS.flatMap((p) => p.variants.flatMap((v) => v.days.flatMap((d) => d.exercises)));
console.log(
  `${entries.length} plan entries, ${new Set(entries.map((e) => e.id)).size} distinct exercises`,
);

for (const e of entries) {
  if (!known.has(e.id)) fail(`plan names an exercise the catalogue does not have: ${e.id}`);
  if (e.sets < 1 || e.sets > 10) fail(`${e.id}: ${e.sets} sets is out of range`);
  if (e.reps < 1 || e.reps > 30) fail(`${e.id}: ${e.reps} reps is out of range`);
}

/**
 * Every profile the onboarding can actually produce, so the floor is checked
 * at the corners rather than at one convenient middle. The lightest of these
 * is the one that broke: 40 kg × 0.25 × 0.68 × 0.7 is 4.76 kg, and a bar
 * weighs twenty. (0.68 was once a sex-conditional factor; every profile gets
 * it now — see CONSERVATIVE_FACTOR in plans.ts.)
 */
const AGES = ["teen", "18-29", "30-44", "45-59", "60+"];
const WEIGHTS = [40, 60, 82, 120];
const BAR = 20;

for (const ageGroup of AGES) {
  for (const bodyWeight of WEIGHTS) {
    const profile = {
      username: "check",
      ageGroup,
      bodyWeight,
      bodyWeightUnit: "kg",
    } as unknown as Profile;
    for (const e of entries) {
      const p = prescribe(e.id, e.reps, [], profile);
      // Nothing derived from a body weight may come out unusable: no blank
      // where a starting weight belongs, and no barbell under an empty bar.
      if (p.source === "unknown") {
        fail(`no starting weight for ${e.id} at ${bodyWeight}kg ${ageGroup}`);
      } else if (known.get(e.id)?.equipment === "barbell" && p.load < BAR) {
        fail(
          `${e.id} prescribes ${p.load}kg — below the empty ${BAR}kg bar ` +
            `(${bodyWeight}kg ${ageGroup})`,
        );
      } else if (p.load <= 0) {
        fail(`${e.id} prescribes ${p.load}kg at ${bodyWeight}kg ${ageGroup}`);
      }
    }
  }
}

// A profile with no body weight has nothing to work from, and must say so
// rather than invent a number — the one case where a blank is the right answer.
for (const e of entries) {
  const p = prescribe(e.id, e.reps, [], null);
  if (p.source !== "unknown") {
    fail(`${e.id} prescribed ${p.load}kg with no profile to work from`);
  }
}

if (bad) {
  console.log(`\n${bad} problem(s)`);
  process.exit(1);
}
console.log(
  `every plan exercise exists and is in range; ` +
    `${AGES.length * WEIGHTS.length} profiles all get a loadable starting weight`,
);
