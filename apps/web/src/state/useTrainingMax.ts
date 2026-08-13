import { useCallback, useState } from "react";

const KEY = "guidetrain.tm";

/**
 * A training max you set deliberately, overriding the one derived from your log.
 *
 * Without this a reset could not exist. The panel works the training max out
 * from your best recorded set, which is the right default — it is a
 * calculation rather than a claim — but it means the number climbs back the
 * moment it is recomputed. Telling someone to drop 10% and then showing them
 * the old figure again would be worse than not offering the reset at all.
 *
 * So a reset writes the lower number here and it wins from then on, per
 * exercise, until cleared. It is stored with the estimate it replaced and the
 * day it happened, so the panel can say what was overridden rather than just
 * presenting a number with no history — a training max that silently differs
 * from your lifts is exactly the sort of thing that should explain itself.
 */
export type TrainingMaxOverride = {
  tm: number;
  /** What the log said at the time, for the "reset from" line. */
  from: number;
  at: number;
};

type Store = Record<string, TrainingMaxOverride>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [id, v] of Object.entries(parsed as Record<string, any>)) {
      const tm = Number(v?.tm);
      const from = Number(v?.from);
      const at = Number(v?.at);
      // Storage is not a trusted input, and this value goes on a bar. A
      // nonsensical training max would drive every percentage below it.
      if (Number.isFinite(tm) && tm > 0 && tm <= 1000 && Number.isFinite(at)) {
        out[id] = { tm, from: Number.isFinite(from) && from > 0 ? from : tm, at };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function useTrainingMax() {
  const [overrides, setOverrides] = useState<Store>(read);

  const write = useCallback((next: Store) => {
    setOverrides(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // A full or disabled store costs this decision, not the app.
    }
  }, []);

  const set = useCallback(
    (id: string, tm: number, from: number) => {
      write({ ...overrides, [id]: { tm, from, at: Date.now() } });
    },
    [overrides, write],
  );

  /** Back to the figure the log implies. */
  const clear = useCallback(
    (id: string) => {
      const next = { ...overrides };
      delete next[id];
      write(next);
    },
    [overrides, write],
  );

  return { overrides, set, clear };
}
