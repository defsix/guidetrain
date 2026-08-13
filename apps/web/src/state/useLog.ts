import { useCallback, useMemo, useState } from "react";

const LOG_KEY = "guidetrain.log";
const UNIT_KEY = "guidetrain.unit";

export type Unit = "kg" | "lb";

export type SetEntry = {
  /** Unique per set, so removing one can't take its twin with it. */
  uid: string;
  /** Exercise id, the same one the saved workout stores. */
  id: string;
  weight: number;
  reps: number;
  /** Stored per entry, not per user: changing the preference later must not
      silently reinterpret what was already written down. 60 recorded in kg
      stays 60 kg even if the app is switched to pounds tomorrow. */
  unit: Unit;
  /** Epoch ms. Kept as a number so sorting needs no parsing. */
  at: number;
};

/**
 * What was actually lifted.
 *
 * Append-mostly: a set is written once and usually never touched again, which
 * is what makes this the right shape for progression later — an estimated
 * one-rep max is a function of sets that were really performed, and a typed-in
 * "my max is 100" is a claim. Those should not end up in the same field.
 *
 * Like the saved workout this is localStorage, so it is per-device and per
 * browser. Nothing here needs a server; accounts would add sync and durability,
 * not capability.
 */
function readLog(): SetEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Storage is not a trusted input: another tab, an older build or devtools
    // can put anything here. Keep only entries that are entirely well formed.
    return parsed.filter(
      (x): x is SetEntry =>
        x &&
        typeof x.uid === "string" &&
        typeof x.id === "string" &&
        Number.isFinite(x.weight) &&
        Number.isFinite(x.reps) &&
        (x.unit === "kg" || x.unit === "lb") &&
        Number.isFinite(x.at),
    );
  } catch {
    return [];
  }
}

function readUnit(): Unit {
  const raw = localStorage.getItem(UNIT_KEY);
  return raw === "lb" ? "lb" : "kg";
}

function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // A full or disabled store costs the session, not the app.
  }
}

const sameDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString();

export function useLog() {
  const [entries, setEntries] = useState<SetEntry[]>(readLog);
  const [unit, setUnitState] = useState<Unit>(readUnit);

  const add = useCallback(
    (id: string, weight: number, reps: number) => {
      if (!Number.isFinite(weight) || !Number.isFinite(reps) || reps <= 0) return;
      setEntries((prev) => {
        const next = [
          ...prev,
          {
            uid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            id,
            weight,
            reps,
            unit,
            at: Date.now(),
          },
        ];
        persist(LOG_KEY, next);
        return next;
      });
    },
    [unit],
  );

  const remove = useCallback((uid: string) => {
    setEntries((prev) => {
      const next = prev.filter((x) => x.uid !== uid);
      persist(LOG_KEY, next);
      return next;
    });
  }, []);

  const setUnit = useCallback((next: Unit) => {
    persist(UNIT_KEY, next);
    setUnitState(next);
  }, []);

  /** Sets recorded today, by exercise — what the panel shows under each row. */
  const today = useMemo(() => {
    const now = Date.now();
    const out = new Map<string, SetEntry[]>();
    for (const e of entries) {
      if (!sameDay(e.at, now)) continue;
      const list = out.get(e.id);
      if (list) list.push(e);
      else out.set(e.id, [e]);
    }
    for (const list of out.values()) list.sort((a, b) => a.at - b.at);
    return out;
  }, [entries]);

  /**
   * The heaviest set ever recorded for each exercise, ties going to more reps.
   *
   * Deliberately a set that happened rather than an estimated one-rep max:
   * estimating is the progression feature's job and wants its formulas checked
   * against sources first. Showing a real set needs no formula to be right.
   */
  const best = useMemo(() => {
    const out = new Map<string, SetEntry>();
    for (const e of entries) {
      const cur = out.get(e.id);
      if (!cur) {
        out.set(e.id, e);
        continue;
      }
      // Only ever compared within one unit. 60 kg and 135 lb are the same lift
      // and 135 is the bigger number, so comparing across them would report the
      // wrong set as the best one; the first unit seen for an exercise wins,
      // and entries in the other are left out of the comparison rather than
      // silently converted.
      if (e.unit !== cur.unit) continue;
      if (e.weight > cur.weight || (e.weight === cur.weight && e.reps > cur.reps)) {
        out.set(e.id, e);
      }
    }
    return out;
  }, [entries]);

  return { entries, unit, setUnit, add, remove, today, best };
}
