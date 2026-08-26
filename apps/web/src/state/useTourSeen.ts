import { useCallback, useEffect, useState } from "react";
import { write as storageWrite, onWrite } from "../lib/storage";

const KEY = "guidetrain.tourSeen";

/**
 * Whether this device has finished (or skipped) the first-run spotlight
 * tour — see Tour.tsx. Skipping counts the same as finishing: the point is
 * "don't show this automatically again," not "made it to the end," and the
 * `?` button in the header is always there for anyone who wants to see it
 * again regardless of which way they left it the first time.
 *
 * In memory and localStorage only for now, like `useInjuries.ts` and the
 * rest of the app's per-device state — not yet wired into Supabase sync.
 */
function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function useTourSeen() {
  const [seen, setSeen] = useState<boolean>(read);

  useEffect(() => onWrite((key) => {
    if (key === KEY) setSeen(read());
  }), []);

  const markSeen = useCallback(() => {
    setSeen(true);
    storageWrite(KEY, "1");
  }, []);

  return { seen, markSeen };
}
