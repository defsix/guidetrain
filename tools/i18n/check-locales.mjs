/**
 * Check the locale files against English.
 *
 *     node tools/i18n/check-locales.mjs
 *
 * Three things go wrong when someone edits a translation, and none of them
 * announce themselves at runtime — the app just quietly falls back to English,
 * or renders the wrong grammar:
 *
 *   1. A key is missing, misspelled or left over from a since-renamed string.
 *   2. A "{name}" placeholder is dropped or renamed, so the value is never
 *      substituted and the user sees a literal brace.
 *   3. A plural form is missing. English needs two, so "one"/"other" looks
 *      complete — but Polish, Russian and Czech each need three, and the one
 *      they need most is the 5-and-up form that English does not have at all.
 *
 * Exits non-zero on any of them.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..',
                 'apps', 'web', 'src', 'i18n', 'locales');

const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const isPlural = (v) =>
  v && typeof v === 'object' && Object.keys(v).every((k) => PLURAL_CATEGORIES.has(k));

/** Leaf paths. A plural object counts as one leaf, not one per form. */
function leaves(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !isPlural(v)) leaves(v, path, out);
    else out.set(path, v);
  }
  return out;
}

const placeholders = (s) =>
  new Set(typeof s === 'string' ? [...s.matchAll(/{(\w+)}/g)].map((m) => m[1]) : []);

/** Every plural category this locale can actually produce for a whole number. */
function neededCategories(locale) {
  const rules = new Intl.PluralRules(locale);
  const cats = new Set();
  // Enough spread to hit every integer rule in the languages here: the Slavic
  // teens exception (11-14) and the x1/x2-x4 cases above twenty.
  for (const n of [0, 1, 2, 3, 4, 5, 10, 11, 12, 14, 15, 20, 21, 22, 25, 100, 101, 111]) {
    cats.add(rules.select(n));
  }
  return cats;
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const en = JSON.parse(readFileSync(join(DIR, 'en.json'), 'utf8'));
const enLeaves = leaves(en);

let problems = 0;
const fail = (file, msg) => { problems++; console.error(`  ${file}: ${msg}`); };

for (const file of files) {
  const code = file.replace(/\.json$/, '');
  const doc = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  const got = leaves(doc);
  const before = problems;

  for (const key of enLeaves.keys()) if (!got.has(key)) fail(file, `missing key "${key}"`);
  for (const key of got.keys()) if (!enLeaves.has(key)) fail(file, `unknown key "${key}"`);

  for (const [key, value] of got) {
    const want = enLeaves.get(key);
    if (want === undefined) continue;

    if (isPlural(want) || isPlural(value)) {
      if (!isPlural(value)) { fail(file, `"${key}" should be plural forms`); continue; }
      for (const cat of neededCategories(code)) {
        if (typeof value[cat] !== 'string') {
          fail(file, `"${key}" has no "${cat}" form (this locale needs it)`);
        }
      }
      // The English source carries the placeholders every form must keep.
      const wantPh = placeholders(isPlural(want) ? want.other : want);
      for (const [cat, form] of Object.entries(value)) {
        const gotPh = placeholders(form);
        if ([...wantPh].some((p) => !gotPh.has(p))) {
          fail(file, `"${key}.${cat}" drops a placeholder (expected ${[...wantPh].join(', ')})`);
        }
      }
      continue;
    }

    const wantPh = placeholders(want);
    const gotPh = placeholders(value);
    if (wantPh.size !== gotPh.size || [...wantPh].some((p) => !gotPh.has(p))) {
      fail(file, `"${key}" placeholders differ (expected ${[...wantPh].join(', ') || 'none'}, `
                 + `got ${[...gotPh].join(', ') || 'none'})`);
    }
  }

  if (problems === before) console.log(`  ok  ${file.padEnd(14)} ${got.size} keys`);
}

// --- exercise text -------------------------------------------------------
// Separate files, separate rules. These arrive one language at a time, so a
// language having no file is fine; a file that exists must be complete and
// must have the same number of steps per exercise, because a translation with
// fewer steps silently drops instructions from a numbered list.
const EX_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..',
                    'apps', 'web', 'src', 'i18n', 'exercises');
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..',
                 'apps', 'web', 'src', 'anatomy', 'exercises.json');

let exFiles = [];
try {
  exFiles = readdirSync(EX_DIR).filter((f) => f.endsWith('.json')).sort();
} catch {
  // No exercise translations yet.
}

if (exFiles.length) {
  const src = {};
  const doc = JSON.parse(readFileSync(SRC, 'utf8'));
  for (const list of Object.values(doc.muscles)) for (const x of list) src[x.id] = x;
  const total = Object.keys(src).length;

  console.log('');
  for (const file of exFiles) {
    const tr = JSON.parse(readFileSync(join(EX_DIR, file), 'utf8'));
    const before = problems;
    for (const id of Object.keys(src)) if (!tr[id]) fail(file, `missing exercise "${id}"`);
    for (const [id, t] of Object.entries(tr)) {
      const s = src[id];
      if (!s) { fail(file, `unknown exercise "${id}"`); continue; }
      if (!t.name?.trim()) fail(file, `"${id}" has no name`);
      const got = t.instructions?.length ?? 0;
      if (got !== s.instructions.length) {
        fail(file, `"${id}" has ${got} steps, English has ${s.instructions.length}`);
      }
    }
    if (problems === before) {
      console.log(`  ok  ${file.padEnd(14)} ${Object.keys(tr).length}/${total} exercises`);
    }
  }
}

console.log(problems
  ? `\n${problems} problem(s)`
  : `\n${files.length} locales, ${enLeaves.size} keys each — consistent`);
process.exit(problems ? 1 : 0);
