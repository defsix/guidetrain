/**
 * Catches a custom exercise name that's really the same exercise as one
 * already on the list — a different case, incidental punctuation or
 * whitespace, a typo, a dropped or added word — rather than only an exact
 * string match, which "Landmine press" vs "Landmine Press" would already
 * slip past.
 */

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/** Casing, punctuation and incidental whitespace shouldn't be what makes
 * two names "different" — strip them before comparing anything. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS, "") // diacritics, once decomposed above
    .replace(/[^\p{L}\p{N}\s]/gu, "") // punctuation
    .trim()
    .replace(/\s+/g, " ");
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    out.set(bg, (out.get(bg) ?? 0) + 1);
  }
  return out;
}

const countAll = (m: Map<string, number>) => [...m.values()].reduce((n, c) => n + c, 0);

/**
 * Dice's coefficient over character bigrams: 2 × shared / (|a| + |b|), 0..1.
 * A cheap, well-established way to score how similar two short strings are
 * without an O(n·m) edit-distance table — good enough at exercise-name
 * length, and it degrades gracefully (toward "not similar") for very short
 * names, where a false match would be most likely.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const ab = bigrams(a);
  const bb = bigrams(b);
  const totalA = countAll(ab);
  const totalB = countAll(bb);
  if (totalA === 0 || totalB === 0) return 0;
  let shared = 0;
  for (const [bg, count] of ab) {
    const other = bb.get(bg);
    if (other) shared += Math.min(count, other);
  }
  return (2 * shared) / (totalA + totalB);
}

/** Below this, two names are treated as genuinely different exercises —
 * "Squat" and "Front Squat" score well under it, while "Landmine Press"
 * and "Landmine Presses" score well over it. */
const SIMILARITY_THRESHOLD = 0.7;

/**
 * The closest existing name to `name` among `candidates`, if any is close
 * enough to count as the same exercise — normalized-exact or a bigram
 * similarity at or above the threshold. Returns the *original* candidate
 * string (not normalized), for showing back to the reader; null when
 * nothing is close enough.
 */
export function findDuplicateExerciseName(name: string, candidates: string[]): string | null {
  const target = normalize(name);
  if (!target) return null;
  let best: { name: string; score: number } | null = null;
  for (const candidate of candidates) {
    const norm = normalize(candidate);
    if (!norm) continue;
    const score = norm === target ? 1 : similarity(target, norm);
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { name: candidate, score };
    }
  }
  return best?.name ?? null;
}
