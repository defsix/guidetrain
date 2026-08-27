import { useCallback, useEffect, useState } from "react";
import { write as storageWrite, onWrite } from "../lib/storage";
import type { CatalogueEntry } from "../lib/exerciseCatalogue";

const KEY = "guidetrain.customexercises";

/**
 * An exercise the reader typed in themselves, from the bottom of a muscle's
 * exercise list in the picker — for a move the catalogue doesn't have.
 *
 * Filed under exactly one muscle, the one the reader had open when they
 * added it, the same way every catalogue exercise names one `primary`
 * muscle. No secondary muscles, no instructions, no video: there is no
 * source to pull any of that from, and a blank field reads honestly as
 * "not known" rather than inventing something. `equipment` is real,
 * though — asked for at creation so the exercise can still be logged with
 * weight, get a plate breakdown and a warm-up ramp, the same as a built-in
 * exercise with that equipment.
 *
 * In memory and localStorage only for now, like `useGoals.ts` and
 * `useInjuries.ts` — not yet wired into Supabase sync (see `sync.ts`'s
 * `SYNCED_KEYS`), the same "optional to defer" call already made for that
 * per-device state.
 */
export type CustomExercise = {
  id: string;
  name: string;
  equipment: string;
  primary: string;
  createdAt: number;
};

function read(): CustomExercise[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Storage is not a trusted input: another tab, an older build or
    // devtools can put anything here. Keep only entries that are entirely
    // well formed.
    return parsed.filter(
      (x: any): x is CustomExercise =>
        x &&
        typeof x.id === "string" &&
        typeof x.name === "string" &&
        x.name.trim().length > 0 &&
        typeof x.equipment === "string" &&
        typeof x.primary === "string" &&
        Number.isFinite(x.createdAt),
    );
  } catch {
    return [];
  }
}

function persist(value: CustomExercise[]) {
  storageWrite(KEY, value);
}

const CUSTOM_ID_PREFIX = "custom-";
const makeId = () => `${CUSTOM_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Whether an exercise id belongs to something the reader typed in, rather
 * than the catalogue — the one cheap way to tell them apart without also
 * threading the whole list through wherever the question comes up. */
export function isCustomExerciseId(id: string): boolean {
  return id.startsWith(CUSTOM_ID_PREFIX);
}

export function useCustomExercises() {
  const [customExercises, setCustomExercises] = useState<CustomExercise[]>(read);

  useEffect(() => onWrite((key) => {
    if (key === KEY) setCustomExercises(read());
  }), []);

  /** Filed under `primary`, at the bottom of that muscle's list from here on. */
  const add = useCallback((name: string, equipment: string, primary: string): CustomExercise | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const entry: CustomExercise = { id: makeId(), name: trimmed, equipment, primary, createdAt: Date.now() };
    setCustomExercises((prev) => {
      const next = [...prev, entry];
      persist(next);
      return next;
    });
    return entry;
  }, []);

  /**
   * A mistyped name or the wrong equipment, corrected in place — same
   * reasoning as `useLog.ts`'s `edit()` for a set: asking for a
   * delete-and-recreate would lose the exercise's place at the bottom of
   * its muscle's list. `primary` is deliberately not editable here: it was
   * implicit from the muscle open when the exercise was created, and
   * changing it is a "move to a different list" question this doesn't ask.
   */
  const edit = useCallback((id: string, name: string, equipment: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCustomExercises((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, name: trimmed, equipment } : x));
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setCustomExercises((prev) => {
      const next = prev.filter((x) => x.id !== id);
      persist(next);
      return next;
    });
  }, []);

  return { customExercises, add, edit, remove };
}

/** A custom exercise, reshaped to slot into the same catalogue lookups a
 * built-in exercise goes through — logging, history, exports, the goal
 * autocomplete. No `youtube` link and empty `instructions`/`secondary`: there
 * is nothing to show for either, so callers that guard on them (`x.youtube &&`,
 * `x.instructions.length > 0`) already skip them cleanly. */
export function toCatalogueEntry(x: CustomExercise): CatalogueEntry {
  return { id: x.id, name: x.name, equipment: x.equipment, instructions: [], primary: [x.primary], secondary: [] };
}
