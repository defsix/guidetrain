import { useCallback, useState } from "react";

const STORAGE_KEY = "guidetrain.workout";

/**
 * The saved workout: a list of exercise ids, in the order they will be done.
 *
 * Ids only. The exercise text is 23,000 words per language and already in the
 * bundle, so storing a copy would be storing a stale copy — a saved workout
 * would keep whatever names and instructions were current when it was saved,
 * and would keep showing them in the language it was saved in. Looking each id
 * up at render time means a saved workout translates itself.
 *
 * There is no backend: the site is static on GitHub Pages, so this lives in
 * localStorage next to the profile. That means it is per-device and survives
 * nothing but this browser, which is the honest limit of a static app and the
 * thing accounts would change.
 */
function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Anything could be in storage — another tab, an older version, a person
    // with devtools open. Take only what this is supposed to be.
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // A full or disabled store shouldn't take the app down with it; the list
    // still works for this session, it just won't outlive it.
  }
}

export function useWorkout() {
  const [ids, setIds] = useState<string[]>(read);

  const save = useCallback((next: string[]) => {
    write(next);
    setIds(next);
  }, []);

  /** Add if absent, remove if present. One control, so one verb. */
  const toggle = useCallback(
    (id: string) =>
      setIds((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        write(next);
        return next;
      }),
    [],
  );

  const remove = useCallback(
    (id: string) =>
      setIds((prev) => {
        const next = prev.filter((x) => x !== id);
        write(next);
        return next;
      }),
    [],
  );

  /** Move one place up or down; a no-op at either end rather than a wrap. */
  const move = useCallback(
    (id: string, delta: number) =>
      setIds((prev) => {
        const from = prev.indexOf(id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= prev.length) return prev;
        const next = [...prev];
        next.splice(to, 0, next.splice(from, 1)[0]);
        write(next);
        return next;
      }),
    [],
  );

  const clear = useCallback(() => save([]), [save]);

  return { ids, toggle, remove, move, clear };
}
