import { useCallback, useEffect, useState } from "react";
import { write as storageWrite, onWrite } from "../lib/storage";

const KEY = "guidetrain.bodyweight-log";

export type WeighIn = {
  uid: string;
  weight: number;
  at: number;
};

/**
 * A history of body weight, for the stats panel's chart.
 *
 * `Profile.bodyWeight` stays the single current value everything else reads —
 * `plans.ts`, sync, the onboarding form. This is purely additive: every time
 * the stats panel saves a new body weight it writes there as it always has
 * *and* appends an entry here, the same append-only shape as `useLog`'s set
 * history and for the same reason — a weigh-in is recorded once and never
 * edited, so nothing here needs a conflict rule.
 *
 * Starts empty for everyone, including a long-time user with a `bodyWeight`
 * already on their profile — there is no way to back-date a history that was
 * never recorded, and the chart says so rather than inventing a flat line
 * from today's number.
 */
function readLog(): WeighIn[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x: any): x is WeighIn =>
        x && typeof x.uid === "string" && Number.isFinite(x.weight) && Number.isFinite(x.at),
    );
  } catch {
    return [];
  }
}

function persist(value: WeighIn[]) {
  storageWrite(KEY, value);
}

export function useBodyWeightLog() {
  const [entries, setEntries] = useState<WeighIn[]>(readLog);

  useEffect(() => onWrite((key) => {
    if (key === KEY) setEntries(readLog());
  }), []);

  const add = useCallback((weight: number) => {
    if (!Number.isFinite(weight) || weight <= 0) return;
    setEntries((prev) => {
      const next = [
        ...prev,
        {
          uid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          weight,
          at: Date.now(),
        },
      ];
      persist(next);
      return next;
    });
  }, []);

  return { entries, add };
}
