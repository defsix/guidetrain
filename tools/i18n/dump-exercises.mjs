/** Print a slice of the English exercise text, for translating. */
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync('apps/web/src/anatomy/exercises.json', 'utf8'));
const ex = Object.values(d.muscles).flat();
const seen = new Set(); const uniq = [];
for (const x of ex) if (!seen.has(x.id)) { seen.add(x.id); uniq.push(x); }
uniq.sort((a, b) => a.id.localeCompare(b.id));
const from = Number(process.argv[2] ?? 0), to = Number(process.argv[3] ?? uniq.length);
if (process.argv[2] === '--ids') { console.log(uniq.map((x, i) => `${i} ${x.id}`).join('\n')); process.exit(0); }
const out = {};
for (const x of uniq.slice(from, to)) out[x.id] = { name: x.name, instructions: x.instructions };
console.log(JSON.stringify(out, null, 1));
console.error(`${from}..${Math.min(to, uniq.length)} of ${uniq.length}`);
