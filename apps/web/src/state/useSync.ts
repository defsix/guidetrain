import { useEffect, useRef, useState } from "react";
import { onWrite } from "../lib/storage";
import { mergeOnSignIn, pushAll, SYNCED_KEYS } from "../lib/sync";

export type SyncStatus = "idle" | "merging" | "syncing" | "synced" | "error" | "offline";

/**
 * Keeps an account and this device's storage in agreement, without the four
 * data hooks knowing an account exists.
 *
 * Two moments matter. Signing in runs the one-time merge — local and remote
 * reconciled, local written first so a flaky connection cannot leave the
 * device worse off. After that, every write to a synced key pushes, debounced
 * so a set logged and then immediately corrected sends one request instead of
 * two.
 *
 * Signing out does not undo the merge or touch local data — see the note on
 * `useAuth`. It only stops pushing.
 */
export function useSync(userId: string | null) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const mergedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setStatus("idle");
      return;
    }

    // The merge is per sign-in, not per render: a debounced push firing after
    // some unrelated state update must not re-run it.
    if (mergedFor.current !== userId) {
      mergedFor.current = userId;
      setStatus("merging");
      setError(null);
      mergeOnSignIn().then((r) => {
        if (r.ok) {
          setStatus("synced");
        } else {
          setStatus("error");
          setError(r.error ?? "sync failed");
        }
      });
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = onWrite((key) => {
      if (!SYNCED_KEYS.includes(key)) return;
      // Debounced rather than immediate: a set of five is five writes to the
      // log in quick succession, and the account does not need to hear about
      // each one separately.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setStatus("syncing");
        pushAll().then((r) => {
          setStatus(r.ok ? "synced" : "error");
          if (!r.ok) setError(r.error ?? "sync failed");
        });
      }, 1200);
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [userId]);

  return { status, error };
}
