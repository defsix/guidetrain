import { useCallback, useEffect, useState } from "react";
import { write as storageWrite, onWrite } from "../lib/storage";

const KEY = "guidetrain.knownmax";

/**
 * A one-rep max you know and typed in, per exercise.
 *
 * Deliberately separate from `useTrainingMax`: that hook's number is a 5/3/1
 * *training* max, kept at 90% of a real one by design (`TRAINING_MAX_FRACTION`
 * in `lib/progression.ts`) — the two are related by a fixed ratio but are not
 * the same figure, and a lifter asked for "your max squat" means the real one.
 *
 * This is the one place in the app that takes a number on faith rather than
 * deriving it from a set that happened — see the stats panel it backs for why
 * that is the right call here and not in the 5/3/1 planner: a person often
 * knows their own max from outside this app entirely, and refusing to take
 * their word for it would make the field pointless. `at` and `from` exist so
 * the panel can still say plainly which figure is a claim and which is a
 * calculation, the same transparency `TrainingMaxOverride` already has.
 */
export type KnownMaxEntry = {
  max: number;
  /** What the log estimated at the time, if anything — for context, not proof. */
  from: number | null;
  at: number;
};

type Store = Record<string, KnownMaxEntry>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [id, v] of Object.entries(parsed as Record<string, any>)) {
      const max = Number(v?.max);
      const at = Number(v?.at);
      // Storage is not a trusted input, and this number can end up on a bar
      // by way of a related lift's starting weight — see plans.ts.
      if (Number.isFinite(max) && max > 0 && max <= 1000 && Number.isFinite(at)) {
        const from = Number(v?.from);
        out[id] = { max, from: Number.isFinite(from) && from > 0 ? from : null, at };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function useKnownMax() {
  const [overrides, setOverrides] = useState<Store>(read);

  // A write this hook did not make — sync pulling merged data down after
  // sign-in — has to be picked up too, or the panel keeps showing whatever was
  // on it before the merge until the next reload.
  useEffect(() => onWrite((key) => {
    if (key === KEY) setOverrides(read());
  }), []);

  // Routed through lib/storage rather than localStorage directly, so a sync
  // layer can hear about every write without this hook knowing one exists.
  const save = useCallback((next: Store) => {
    setOverrides(next);
    storageWrite(KEY, next);
  }, []);

  const set = useCallback(
    (id: string, max: number, from: number | null) => {
      save({ ...overrides, [id]: { max, from, at: Date.now() } });
    },
    [overrides, save],
  );

  /** Back to whatever the log implies, or nothing if it implies nothing. */
  const clear = useCallback(
    (id: string) => {
      const next = { ...overrides };
      delete next[id];
      save(next);
    },
    [overrides, save],
  );

  return { overrides, set, clear };
}
