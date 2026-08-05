/**
 * Translated exercise names and instructions.
 *
 * These live apart from the interface strings for two reasons. They are far
 * bigger — one language is ~23,000 words against ~600 for the whole UI — so
 * they must not sit in the chunk that every visitor waits on. And they arrive
 * one language at a time, so the app has to run correctly while most of them
 * do not exist yet.
 *
 * Both fall out of the same rule: a missing file, a missing exercise, or a
 * missing field falls back to the English text in exercises.json. Nothing here
 * can render a blank or a raw key.
 */
import type { LocaleCode } from './index';

export type ExerciseText = Record<string, { name?: string; instructions?: string[] }>;

/** Shape of the entries in exercises.json that this can localise. */
type Exercise = { id: string; name: string; instructions: string[] };

// A locale with no file simply has no entry here; the glob is the registry.
const FILES = import.meta.glob(['./exercises/*.json']);

export function hasExerciseText(code: LocaleCode): boolean {
  return code !== 'en' && `./exercises/${code}.json` in FILES;
}

export async function loadExerciseText(code: LocaleCode): Promise<ExerciseText> {
  const load = FILES[`./exercises/${code}.json`];
  if (code === 'en' || !load) return {};
  try {
    return ((await load()) as { default: ExerciseText }).default;
  } catch {
    // A failed chunk means English exercise text, not a broken exercise list.
    return {};
  }
}

/**
 * Overlay a translation on one exercise.
 *
 * Returns the original object when there is nothing to apply, so React sees a
 * stable reference and the model isn't repainted for a no-op.
 */
export function localize<T extends Exercise>(x: T, text: ExerciseText): T {
  const tr = text[x.id];
  if (!tr) return x;
  const name = tr.name || x.name;
  // A partially translated entry keeps the English steps rather than showing a
  // half-list: the steps are numbered and order matters.
  const instructions =
    tr.instructions?.length === x.instructions.length ? tr.instructions : x.instructions;
  if (name === x.name && instructions === x.instructions) return x;
  return { ...x, name, instructions };
}
