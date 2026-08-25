import { useCallback, useEffect, useState } from "react";
import { write as storageWrite, onWrite } from "../lib/storage";

const KEY = "guidetrain.pinnedExercises";

/**
 * Exercise ids the reader has pinned to the top of every workout they show
 * up in — global by design, not per-workout: the point is "always show my
 * main lift first," which only means something if it holds regardless of
 * which program it's read from. `WorkoutPanel.tsx` is the only reader; it
 * floats a pinned id to the top at render time without ever touching the
 * program's own stored `exerciseIds` order, so un-pinning something just
 * drops it back wherever it already was.
 *
 * In memory and localStorage only for now, like `useInjuries.ts` and the
 * rest of the app's per-device state — not yet wired into Supabase sync.
 */
function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function usePinnedExercises() {
  const [pinned, setPinned] = useState<string[]>(read);

  useEffect(() => onWrite((key) => {
    if (key === KEY) setPinned(read());
  }), []);

  const save = useCallback((next: string[]) => {
    setPinned(next);
    storageWrite(KEY, next);
  }, []);

  const toggle = useCallback(
    (exId: string) => {
      save(pinned.includes(exId) ? pinned.filter((x) => x !== exId) : [...pinned, exId]);
    },
    [pinned, save],
  );

  return { pinned, toggle };
}
