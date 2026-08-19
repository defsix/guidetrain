import { useCallback, useEffect, useState } from "react";
import { write as storageWrite, onWrite } from "../lib/storage";

const KEY = "guidetrain.goals";

/**
 * A weight you want to lift, by a date — for any exercise, not just the
 * three tracked on the Stats page.
 *
 * `targetWeight` is a real max, the same thing the "Target" field in
 * ProgressionPanel already asks for; this just gives that number somewhere
 * to live and a deadline to be judged against, instead of resetting the
 * moment the panel closes. `goalPace` in progression.ts is what turns this
 * into a verdict, reusing the exact training-max cycle math ProgressionPanel
 * already runs rather than a second way of answering the same question.
 *
 * In memory and localStorage only for now, like the rest of the app's
 * per-device state — not yet wired into Supabase sync (see `sync.ts`'s
 * `SYNCED_KEYS`), the same "optional to defer" call made for the Stats page
 * data before this needed its own migration.
 */
export type Goal = {
  targetWeight: number;
  /** Epoch ms. */
  targetDate: number;
  /** When the goal was set, for display rather than any calculation. */
  setAt: number;
};

type Store = Record<string, Goal>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [id, v] of Object.entries(parsed as Record<string, any>)) {
      const targetWeight = Number(v?.targetWeight);
      const targetDate = Number(v?.targetDate);
      const setAt = Number(v?.setAt);
      // Storage is not a trusted input: a nonsensical target weight would
      // drive every percentage in the pace calculation built from it.
      if (
        Number.isFinite(targetWeight) &&
        targetWeight > 0 &&
        targetWeight <= 1000 &&
        Number.isFinite(targetDate) &&
        Number.isFinite(setAt)
      ) {
        out[id] = { targetWeight, targetDate, setAt };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function useGoals() {
  const [goals, setGoals] = useState<Store>(read);

  // A write this hook did not make — sync pulling merged data down after
  // sign-in — has to be picked up too, or the panel keeps showing whatever
  // was on it before the merge until the next reload.
  useEffect(() => onWrite((key) => {
    if (key === KEY) setGoals(read());
  }), []);

  const save = useCallback((next: Store) => {
    setGoals(next);
    storageWrite(KEY, next);
  }, []);

  const set = useCallback(
    (id: string, targetWeight: number, targetDate: number) => {
      save({ ...goals, [id]: { targetWeight, targetDate, setAt: Date.now() } });
    },
    [goals, save],
  );

  const clear = useCallback(
    (id: string) => {
      const next = { ...goals };
      delete next[id];
      save(next);
    },
    [goals, save],
  );

  return { goals, set, clear };
}
