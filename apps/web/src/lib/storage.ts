/**
 * One place that writes to localStorage, so one place can notice.
 *
 * The four hooks each had their own `persist` and wrote directly. That was fine
 * while the device was the only copy; it stops being fine the moment a change
 * also has to reach an account. Rather than teach every hook about syncing —
 * which would put network concerns inside state that must keep working with no
 * network — writes go through here and anything interested subscribes.
 *
 * The hooks therefore do not know an account exists. They save, exactly as
 * before, and the sync layer hears about it.
 */

const listeners = new Set<(key: string) => void>();

/** Save, then tell anyone listening which key changed. */
export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // A full or disabled store costs the save, not the session. Deliberately
    // silent: there is nothing useful to say mid-set, and the alternative is
    // an alert between somebody and a loaded bar.
    return;
  }
  for (const fn of listeners) fn(key);
}

export function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
  for (const fn of listeners) fn(key);
}

/** Read and parse, or null. Storage is never a trusted input. */
export function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Called after every write, with the key. Returns an unsubscribe. */
export function onWrite(fn: (key: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Every key this app has ever written to localStorage, kept in one place so
 * "delete my data" can be exhaustive rather than a list someone has to
 * remember to keep in sync with every new hook. Includes the two legacy keys
 * (`guidetrain.unit`, `guidetrain.workout`) each hook already migrates away
 * from on its own first read — harmless to remove twice, and a genuine gap
 * here if a device's migration hasn't run yet.
 */
export const ALL_KEYS = [
  "guidetrain.profile",
  "guidetrain.log",
  "guidetrain.programs",
  "guidetrain.programs.active",
  "guidetrain.tm",
  "guidetrain.knownmax",
  "guidetrain.bodyweight-log",
  "guidetrain.goals",
  "guidetrain.injuries",
  "guidetrain.skips",
  "guidetrain.theme",
  "guidetrain.explorerVisits",
  "guidetrain.recsDismissed",
  "guidetrain.unit",
  "guidetrain.workout",
];

/**
 * Wipes every key this app owns, notifying listeners for each one so the
 * whole app's state resets live rather than needing a reload to catch up.
 *
 * Safe to call while signed in: `pushAll` in `sync.ts` skips every table
 * whose local data is empty rather than upserting an empty set over what's
 * there, so this clears the device without touching the account's own copy
 * — sign out and back in, or just reload, and `mergeOnSignIn` pulls it back.
 * Signed out, or for an account being deleted, there is nothing left to pull
 * it back from, which is the whole point.
 */
export function clearAll() {
  for (const key of ALL_KEYS) remove(key);
}
