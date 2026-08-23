import { useCallback, useEffect, useRef, useState } from "react";
import { playAlert } from "../lib/alert";

const TICK_MS = 250;

/**
 * A single countdown for holding a stretch — `useRestTimer`'s own mechanism
 * (an end timestamp, not a decrementing counter, so a backgrounded tab
 * doesn't drift) stripped down to just that: no `exerciseId` ownership, no
 * "extend," nothing written to storage. A hold is a few seconds to a minute
 * and isn't training data; losing it on a reload costs nothing.
 */
export function useHoldTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [, forceTick] = useState(0);
  const alerted = useRef(false);

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => forceTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0;

  useEffect(() => {
    if (!endsAt) {
      alerted.current = false;
      return;
    }
    if (remaining === 0 && !alerted.current) {
      alerted.current = true;
      playAlert();
    }
  }, [endsAt, remaining]);

  const start = useCallback((seconds: number) => {
    if (seconds <= 0) return;
    alerted.current = false;
    setTotal(seconds);
    setEndsAt(Date.now() + seconds * 1000);
  }, []);

  const clear = useCallback(() => setEndsAt(null), []);

  return { remaining, total, running: endsAt !== null, start, clear };
}
