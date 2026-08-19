import { useCallback, useEffect, useState } from "react";
import { write as storageWrite, onWrite } from "../lib/storage";

const KEY = "guidetrain.injuries";

export type InjuryMode = "avoid" | "warn";

/**
 * A muscle marked injured, by its zone id (see muscle-map.json) — not by
 * exercise, since the point is to catch every lift that trains it, known or
 * not.
 *
 * `mode` is set per injury rather than once for the whole feature: "avoid"
 * keeps anything whose primary muscle is this one out of Train This, the
 * rest-break partner list and the swap list; "warn" leaves those lists alone
 * but flags the entries, for an injury real enough to note but not bad
 * enough to plan around. `lib/injuries.ts`'s `injuryFor()` is what turns this
 * into either verdict, checked against an exercise's primary muscle only —
 * see that file for why.
 *
 * In memory and localStorage only for now, like `useGoals.ts` and the rest
 * of the app's per-device state — not yet wired into Supabase sync.
 */
export type Injury = {
  mode: InjuryMode;
  /** When the injury was marked, for display rather than any calculation. */
  setAt: number;
};

type Store = Record<string, Injury>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [id, v] of Object.entries(parsed as Record<string, any>)) {
      const mode = v?.mode;
      const setAt = Number(v?.setAt);
      if ((mode === "avoid" || mode === "warn") && Number.isFinite(setAt)) {
        out[id] = { mode, setAt };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function useInjuries() {
  const [injuries, setInjuries] = useState<Store>(read);

  useEffect(() => onWrite((key) => {
    if (key === KEY) setInjuries(read());
  }), []);

  const save = useCallback((next: Store) => {
    setInjuries(next);
    storageWrite(KEY, next);
  }, []);

  const set = useCallback(
    (muscleId: string, mode: InjuryMode) => {
      save({ ...injuries, [muscleId]: { mode, setAt: Date.now() } });
    },
    [injuries, save],
  );

  const clear = useCallback(
    (muscleId: string) => {
      const next = { ...injuries };
      delete next[muscleId];
      save(next);
    },
    [injuries, save],
  );

  return { injuries, set, clear };
}
