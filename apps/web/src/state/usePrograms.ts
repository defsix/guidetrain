import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { write as storageWrite, onWrite } from "../lib/storage";

const KEY = "guidetrain.programs";
const ACTIVE_KEY = "guidetrain.programs.active";
const LEGACY_WORKOUT_KEY = "guidetrain.workout";

/**
 * One prescribed set: what to put on the bar, and for how many.
 *
 * `load` is absent for work whose load is the person doing it — a push-up has a
 * rep count to hit and nothing to load.
 */
export type TargetStep = { load?: number; reps: number; amrap?: boolean };

export type Target = {
  sets: number;
  reps: number;
  /**
   * What to lift, set by set, when something worked it out for you.
   *
   * This is what joins the two planners to the workout. A ready-made plan
   * prescribes a working weight and a 5/3/1 week prescribes three different
   * ones, and before this both numbers died on the screen that computed them:
   * you previewed "Barbell Squat 40 kg", pressed use, and got a row saying
   * "3 × 5" with the weight nowhere. The steps travel with the target, so the
   * logger can offer them back one set at a time.
   *
   * Still only a target. Nothing here records what happened; the log does that,
   * and prescribing 75 kg does not mean 75 kg was lifted.
   */
  steps?: TargetStep[];
  /** Which planner wrote the steps, so the workout can say where they came from. */
  source?: "plan" | "cycle";
};

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
  /**
   * A translation key, for workouts the app named rather than the reader —
   * the days of a ready-made plan. Rendered through `t` like any other string,
   * so "Upper" reads as "Oberkörper" in German. `name` still wins if it is set,
   * which is what renaming one does.
   *
   * Storing the *translated* label instead would freeze it into whichever
   * language happened to be on when the plan was applied, which is the same
   * mistake as storing exercise names rather than their ids.
   */
  nameKey?: string;
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
  targets?: Record<string, Target>;
};

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Prescribed sets out of storage, or nothing.
 *
 * Dropped whole rather than repaired, and dropped unless there is exactly one
 * step per set. A prescription that describes four of five sets is worse than
 * none: the logger walks it by position to decide what to offer next, so a
 * short list would quietly hand back the wrong weight for the last set, which
 * is precisely the mistake this feature exists to prevent. The target itself
 * survives — you keep 5 × 5, you just lose the weights.
 */
function cleanSteps(raw: unknown, sets: number): TargetStep[] | undefined {
  if (!Array.isArray(raw) || raw.length !== sets) return undefined;
  const out: TargetStep[] = [];
  for (const s of raw as any[]) {
    const reps = Math.round(Number(s?.reps));
    if (!(reps > 0 && reps <= 100)) return undefined;
    const load = Number(s?.load);
    const step: TargetStep = { reps };
    // A load is optional — bodyweight work has none — but a present one has to
    // be a weight, not a NaN that would render as "NaN kg" on the bar.
    if (Number.isFinite(load) && load > 0 && load <= 1000) step.load = load;
    if (s?.amrap) step.amrap = true;
    out.push(step);
  }
  return out;
}

/** Storage is not a trusted input; keep only whole, positive, sane pairs. */
function cleanTargets(raw: unknown): Record<string, Target> {
  const out: Record<string, Target> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, any>)) {
    const sets = Math.round(Number(v?.sets));
    const reps = Math.round(Number(v?.reps));
    // Capped rather than merely positive: a target of 900 sets is a typo, and
    // it would render 900 pips.
    if (sets > 0 && sets <= 20 && reps > 0 && reps <= 100) {
      const t: Target = { sets, reps };
      const steps = cleanSteps(v?.steps, sets);
      if (steps) {
        t.steps = steps;
        t.source = v?.source === "cycle" ? "cycle" : "plan";
      }
      out[id] = t;
    }
  }
  return out;
}

/**
 * A day of a ready-made plan as the library hands it over — the template plus
 * the weight that was on screen when the reader pressed use.
 *
 * The load is carried rather than recomputed here on purpose: recomputing it
 * would let the workout disagree with the preview it came from, which is a
 * small window (a set logged in between) but an unnecessary one, and the wrong
 * kind of surprise to spring on someone standing at a rack.
 */
export type AppliedDay = {
  name: string;
  exercises: { id: string; sets: number; reps: number; load?: number }[];
};

/**
 * A plan's row, turned into a target the workout can act on.
 *
 * The same weight for every set, because that is what these plans prescribe: a
 * straight-set plan asks for 3 × 5 at one load, unlike a 5/3/1 week whose three
 * sets differ. A row with no usable weight — nothing logged and no body weight
 * to work from — keeps its sets and reps and carries no steps, rather than
 * inventing a number to fill the field with.
 */
function fromPlan(e: AppliedDay["exercises"][number]): Target {
  const t: Target = { sets: e.sets, reps: e.reps };
  if (e.load && e.load > 0) {
    t.steps = Array.from({ length: e.sets }, () => ({ load: e.load, reps: e.reps }));
    t.source = "plan";
  }
  return t;
}

/**
 * Routed through `lib/storage` rather than `localStorage` directly, so a sync
 * layer can hear about every write without this hook knowing one exists — see
 * `lib/storage.ts` and `lib/sync.ts`. `ACTIVE_KEY` goes through the same path;
 * the sync layer simply never lists it, since which tab is open is a property
 * of the device.
 */
function persist(key: string, value: unknown) {
  storageWrite(key, value);
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
            nameKey: typeof p.nameKey === "string" ? p.nameKey : undefined,
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

  // A write this hook did not make — sync pulling merged data down after
  // sign-in — has to be picked up too, or the panel keeps showing whatever was
  // on it before the merge until the next reload.
  useEffect(() => onWrite((key) => {
    if (key === KEY) setPrograms(read());
    if (key === ACTIVE_KEY) setActiveId(localStorage.getItem(ACTIVE_KEY) || null);
  }), []);

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

  /**
   * Add whole workouts at once, from a ready-made plan.
   *
   * Built in one write rather than by calling create() and then toggling each
   * exercise: those are separate state updates, and a plan half-applied
   * because a render landed between them would be a workout missing exercises
   * with no sign anything went wrong.
   */
  const addWorkouts = useCallback(
    (days: AppliedDay[]) => {
      const made: Program[] = days.map((d) => ({
        id: uid(),
        name: "",
        nameKey: `plans.day.${d.name}`,
        exerciseIds: d.exercises.map((e) => e.id),
        targets: Object.fromEntries(d.exercises.map((e) => [e.id, fromPlan(e)])),
      }));
      if (!made.length) return;
      setPrograms((prev) => {
        const next = [...prev, ...made];
        persist(KEY, next);
        return next;
      });
      select(made[0].id);
    },
    [select],
  );

  /** Set or clear one exercise's target in the active program. */
  const setTarget = useCallback(
    (exId: string, target: Target | null) => {
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
    addWorkouts,
    setTarget,
    targets: active?.targets ?? {},
    save,
  };
}
