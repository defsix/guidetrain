import { useCallback, useEffect, useState } from "react";

const KEY = "guidetrain.skips";

/**
 * Sets you decided not to do today.
 *
 * Deliberately not in the log, and this is the whole design of the file. The
 * log is the account of what was lifted; a skipped set was not lifted, and
 * writing it there — even as a zero — would put a thing that did not happen
 * into the one record that everything else trusts. An estimated max is a
 * function of that record.
 *
 * So a skip is what it actually is: a position. It moves the prescription on to
 * the next set so the right weight is offered, it lets an exercise be counted
 * as dealt with, and it claims nothing about your training. The pips show it
 * differently from a set you did, because those are different things.
 *
 * Kept for the current day only. A skip is a fact about this session and
 * nothing else, and yesterday's would silently offset today's prescription.
 */
export type Skips = Record<string, number>;

/** Today, as a local calendar day. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function read(): { date: string; skips: Skips } {
  const empty = { date: today(), skips: {} as Skips };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.date !== today()) return empty;
    const skips: Skips = {};
    for (const [id, n] of Object.entries(parsed.skips ?? {})) {
      const count = Math.round(Number(n));
      // Storage is not a trusted input, and a negative or absurd count here
      // would move the prescription pointer somewhere it cannot come back from.
      if (typeof id === "string" && count > 0 && count <= 100) skips[id] = count;
    }
    return { date: today(), skips };
  } catch {
    return empty;
  }
}

export function useSkips() {
  const [state, setState] = useState(read);

  // The day can turn over while the app is open — a late session crossing
  // midnight is exactly when someone is mid-workout — and stale skips would
  // then offset a fresh day's prescription.
  useEffect(() => {
    const tick = setInterval(() => {
      setState((prev) => (prev.date === today() ? prev : { date: today(), skips: {} }));
    }, 60_000);
    return () => clearInterval(tick);
  }, []);

  const write = useCallback((skips: Skips) => {
    const next = { date: today(), skips };
    setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // A full or disabled store costs the session, not the app.
    }
  }, []);

  /** Skip one set of an exercise. */
  const skip = useCallback(
    (id: string, n = 1) => write({ ...state.skips, [id]: (state.skips[id] ?? 0) + n }),
    [state.skips, write],
  );

  /** Take back every skip on an exercise — the undo for a mis-tap. */
  const unskip = useCallback(
    (id: string) => {
      const next = { ...state.skips };
      delete next[id];
      write(next);
    },
    [state.skips, write],
  );

  const clear = useCallback(() => write({}), [write]);

  return { skips: state.skips, skip, unskip, clear };
}
