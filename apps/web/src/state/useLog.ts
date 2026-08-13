import { useCallback, useMemo, useState } from "react";

const LOG_KEY = "guidetrain.log";
const LEGACY_UNIT_KEY = "guidetrain.unit";

/** Kilos, everywhere. One pound in kilos, for reading older entries. */
const LB_TO_KG = 0.45359237;

export type SetEntry = {
  /** Unique per set, so removing one can't take its twin with it. */
  uid: string;
  /** Exercise id, the same one the saved workout stores. */
  id: string;
  /** Kilos. Always kilos — see the note on reading below. */
  weight: number;
  reps: number;
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
 *
 * Weights were briefly recorded with a unit beside them. They are kilos now and
 * only kilos, which removes a whole dimension: nothing has to ask whether two
 * numbers are comparable before comparing them. An entry written in pounds is
 * converted once, on read, rather than left to be read as if 225 meant kilos —
 * that would be a wrong number on screen, which is the one thing worse than a
 * missing one.
 */
function readLog(): SetEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Storage is not a trusted input: another tab, an older build or devtools
    // can put anything here. Keep only entries that are entirely well formed.
    return parsed
      .filter(
        (x: any) =>
          x &&
          typeof x.uid === "string" &&
          typeof x.id === "string" &&
          Number.isFinite(x.weight) &&
          Number.isFinite(x.reps) &&
          Number.isFinite(x.at),
      )
      .map((x: any): SetEntry => ({
        uid: x.uid,
        id: x.id,
        // Rounded to a half kilo: 225 lb is 102.058 kg, and six decimal places
        // of a number nobody typed is false precision.
        weight: x.unit === "lb" ? Math.round(x.weight * LB_TO_KG * 2) / 2 : x.weight,
        reps: x.reps,
        at: x.at,
      }));
  } catch {
    return [];
  }
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
  const [entries, setEntries] = useState<SetEntry[]>(() => {
    const list = readLog();
    // A converted entry has to be written back, or it converts again next time.
    persist(LOG_KEY, list);
    try { localStorage.removeItem(LEGACY_UNIT_KEY); } catch { /* nothing to do */ }
    return list;
  });

  const add = useCallback((id: string, weight: number, reps: number) => {
    if (!Number.isFinite(weight) || !Number.isFinite(reps) || reps <= 0) return;
    setEntries((prev) => {
      const next = [
        ...prev,
        {
          uid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          id,
          weight,
          reps,
          at: Date.now(),
        },
      ];
      persist(LOG_KEY, next);
      return next;
    });
  }, []);

  const remove = useCallback((uid: string) => {
    setEntries((prev) => {
      const next = prev.filter((x) => x.uid !== uid);
      persist(LOG_KEY, next);
      return next;
    });
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
      if (!cur || e.weight > cur.weight || (e.weight === cur.weight && e.reps > cur.reps)) {
        out.set(e.id, e);
      }
    }
    return out;
  }, [entries]);

  return { entries, add, remove, today, best };
}
