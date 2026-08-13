import { useCallback, useMemo, useRef, useState } from "react";

const KEY = "guidetrain.programs";
const ACTIVE_KEY = "guidetrain.programs.active";
const LEGACY_WORKOUT_KEY = "guidetrain.workout";

export type Program = {
  id: string;
  /**
   * What the reader called it, or "" if they never said.
   *
   * An empty name is displayed as "Workout 1", "Workout 2" — numbered by
   * position and translated at render. Storing that generated label instead
   * would freeze it into whichever language happened to be on when the program
   * was made, which is the same mistake as storing exercise names rather than
   * their ids.
   */
  name: string;
  /** Exercise ids, in the order they will be done. */
  exerciseIds: string[];
  /**
   * Optional target per exercise: three sets of five, and so on.
   *
   * A *target*, not a tally. Nothing here records what happened — the log does
   * that, and it is the only thing that does. A tick you tap yourself would be
   * a second account of the same session, free to disagree with the first, and
   * then one of the two is a lie. This is a line drawn on the log: sets counted
   * today against sets intended.
   */
  targets?: Record<string, { sets: number; reps: number }>;
};

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Storage is not a trusted input; keep only whole, positive, sane pairs. */
function cleanTargets(raw: unknown): Record<string, { sets: number; reps: number }> {
  const out: Record<string, { sets: number; reps: number }> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, any>)) {
    const sets = Math.round(Number(v?.sets));
    const reps = Math.round(Number(v?.reps));
    // Capped rather than merely positive: a target of 900 sets is a typo, and
    // it would render 900 pips.
    if (sets > 0 && sets <= 20 && reps > 0 && reps <= 100) out[id] = { sets, reps };
  }
  return out;
}

function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // A full or disabled store costs the session, not the app.
  }
}

/**
 * Named programs: several workouts rather than one list.
 *
 * The single saved list this replaces is migrated into the first program and
 * its old key removed, so nobody loses a workout they built. That migration
 * runs once, on first read, and is why the legacy key is deleted rather than
 * left to be found again next load.
 */
function read(): Program[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((p: any) => p && typeof p.id === "string" && Array.isArray(p.exerciseIds))
          .map((p: any) => ({
            id: p.id,
            name: typeof p.name === "string" ? p.name : "",
            exerciseIds: p.exerciseIds.filter((x: unknown) => typeof x === "string"),
            targets: cleanTargets(p.targets),
          }));
      }
    }
    // Nothing here yet: carry over the single list if there is one.
    const legacy = localStorage.getItem(LEGACY_WORKOUT_KEY);
    if (legacy) {
      const ids = JSON.parse(legacy);
      if (Array.isArray(ids) && ids.length) {
        const migrated = [
          { id: uid(), name: "", exerciseIds: ids.filter((x) => typeof x === "string") },
        ];
        persist(KEY, migrated);
        try { localStorage.removeItem(LEGACY_WORKOUT_KEY); } catch { /* nothing to do */ }
        return migrated;
      }
    }
  } catch {
    // fall through to an empty start
  }
  return [];
}

export function usePrograms() {
  const [programs, setPrograms] = useState<Program[]>(read);
  // Removing an exercise also clears its target, and the two are declared in
  // the other order; a ref keeps that from forcing either one to move.
  const setTargetRef = useRef<((id: string, t: null) => void) | null>(null);
  const [activeId, setActiveId] = useState<string | null>(() => {
    const saved = localStorage.getItem(ACTIVE_KEY);
    return saved || null;
  });

  const save = useCallback((next: Program[]) => {
    persist(KEY, next);
    setPrograms(next);
  }, []);

  // The active program, resolved rather than trusted: the stored id can point
  // at one that has since been deleted, in another tab or an earlier session.
  const active = useMemo(
    () => programs.find((p) => p.id === activeId) ?? programs[0] ?? null,
    [programs, activeId],
  );

  const select = useCallback((id: string) => {
    persist(ACTIVE_KEY, id);
    setActiveId(id);
  }, []);

  const create = useCallback(
    (name = "") => {
      // Guarded because passing this straight to onClick hands it a MouseEvent
      // as the name, which then reaches every `name.trim()` downstream. Cheap
      // to defend against, and it already happened once.
      const p: Program = {
        id: uid(),
        name: typeof name === "string" ? name : "",
        exerciseIds: [],
      };
      setPrograms((prev) => {
        const next = [...prev, p];
        persist(KEY, next);
        return next;
      });
      select(p.id);
      return p.id;
    },
    [select],
  );

  const rename = useCallback((id: string, name: string) => {
    const clean = typeof name === "string" ? name : "";
    setPrograms((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, name: clean } : p));
      persist(KEY, next);
      return next;
    });
  }, []);

  const removeProgram = useCallback((id: string) => {
    setPrograms((prev) => {
      const next = prev.filter((p) => p.id !== id);
      persist(KEY, next);
      return next;
    });
  }, []);

  /** Everything below edits the active program, creating one if none exists. */
  const editActive = useCallback(
    (fn: (ids: string[]) => string[]) => {
      setPrograms((prev) => {
        let list = prev;
        let id = activeId && prev.some((p) => p.id === activeId) ? activeId : prev[0]?.id;
        if (!id) {
          // Adding an exercise with no program open should make one rather than
          // silently do nothing — the + is the first thing anyone presses.
          id = uid();
          list = [...prev, { id, name: "", exerciseIds: [] }];
          persist(ACTIVE_KEY, id);
          setActiveId(id);
        }
        const next = list.map((p) =>
          p.id === id ? { ...p, exerciseIds: fn(p.exerciseIds) } : p,
        );
        persist(KEY, next);
        return next;
      });
    },
    [activeId],
  );

  const toggle = useCallback(
    (exId: string) =>
      editActive((ids) =>
        ids.includes(exId) ? ids.filter((x) => x !== exId) : [...ids, exId],
      ),
    [editActive],
  );

  const removeExercise = useCallback(
    (exId: string) => {
      editActive((ids) => ids.filter((x) => x !== exId));
      // Otherwise the target outlives the exercise and comes back with it.
      setTargetRef.current?.(exId, null);
    },
    [editActive],
  );

  const move = useCallback(
    (exId: string, delta: number) =>
      editActive((ids) => {
        const from = ids.indexOf(exId);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= ids.length) return ids;
        const next = [...ids];
        next.splice(to, 0, next.splice(from, 1)[0]);
        return next;
      }),
    [editActive],
  );

  const clear = useCallback(() => editActive(() => []), [editActive]);

  /** Set or clear one exercise's target in the active program. */
  const setTarget = useCallback(
    (exId: string, target: { sets: number; reps: number } | null) => {
      setPrograms((prev) => {
        const id = activeId && prev.some((p) => p.id === activeId) ? activeId : prev[0]?.id;
        if (!id) return prev;
        const next = prev.map((p) => {
          if (p.id !== id) return p;
          const targets = { ...(p.targets ?? {}) };
          if (target) targets[exId] = target;
          else delete targets[exId];
          return { ...p, targets };
        });
        persist(KEY, next);
        return next;
      });
    },
    [activeId],
  );

  setTargetRef.current = (id, t) => setTarget(id, t);

  return {
    programs,
    active,
    ids: active?.exerciseIds ?? [],
    select,
    create,
    rename,
    removeProgram,
    toggle,
    removeExercise,
    move,
    clear,
    setTarget,
    targets: active?.targets ?? {},
    save,
  };
}
