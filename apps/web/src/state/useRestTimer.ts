import { useCallback, useEffect, useRef, useState } from "react";
import { playAlert } from "../lib/alert";

export type RestTimer = { exerciseId: string; endsAt: number; total: number };

const TICK_MS = 250;

/**
 * Rest between sets, timed but not tracked.
 *
 * In memory only, unlike every other piece of state in this app. A rest
 * period is a minute or two; losing it on a reload is a minor inconvenience,
 * not lost training data, and there is nothing here worth writing to
 * localStorage or syncing to an account.
 *
 * One timer for the whole workout, not one per exercise: logging a set always
 * means moving on to the next thing, and a countdown for a lift left three
 * exercises ago would be noise. Whichever exercise a set was most recently
 * logged for owns it, and starting a new one replaces whatever was running.
 *
 * Tracked as an end timestamp rather than a number counting down, because a
 * backgrounded mobile tab throttles setInterval — a ticking counter would
 * drift or stall while the screen is off, which is exactly when someone
 * checks it. `remaining` is recomputed from `Date.now()` against that fixed
 * timestamp on every tick, so it reads correctly the instant the tab wakes up
 * again regardless of how long it was actually asleep.
 */
export function useRestTimer() {
  const [timer, setTimer] = useState<RestTimer | null>(null);
  const [, forceTick] = useState(0);
  const alerted = useRef(false);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => forceTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [timer]);

  const remaining = timer ? Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000)) : 0;

  // Fires once per timer, on the tick that first reaches zero — not on every
  // render afterwards, and not again for the same timer once it has fired.
  useEffect(() => {
    if (!timer) {
      alerted.current = false;
      return;
    }
    if (remaining === 0 && !alerted.current) {
      alerted.current = true;
      playAlert();
    }
  }, [timer, remaining]);

  const start = useCallback((exerciseId: string, seconds: number) => {
    if (seconds <= 0) return;
    alerted.current = false;
    setTimer({ exerciseId, endsAt: Date.now() + seconds * 1000, total: seconds });
  }, []);

  const extend = useCallback((seconds: number) => {
    setTimer((prev) => (prev ? { ...prev, endsAt: prev.endsAt + seconds * 1000 } : prev));
  }, []);

  const clear = useCallback(() => setTimer(null), []);

  return {
    exerciseId: timer?.exerciseId ?? null,
    remaining,
    total: timer?.total ?? 0,
    start,
    extend,
    clear,
  };
}
