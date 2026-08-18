import { supabase } from "./supabase";
import { read, write } from "./storage";
import type { SetEntry } from "../state/useLog";
import type { Program } from "../state/usePrograms";
import type { TrainingMaxOverride } from "../state/useTrainingMax";
import type { Profile } from "../types";

export const LOG_KEY = "guidetrain.log";
export const PROGRAMS_KEY = "guidetrain.programs";
export const PROFILE_KEY = "guidetrain.profile";
export const TM_KEY = "guidetrain.tm";

/** The keys worth syncing. Skips and theme are properties of the day and the
 *  device respectively — see supabase/README.md. */
export const SYNCED_KEYS = [LOG_KEY, PROGRAMS_KEY, PROFILE_KEY, TM_KEY];

/**
 * Local and remote, reconciled.
 *
 * Two merge rules, and the difference between them is the whole design.
 *
 * The log is a **union**. Sets are appended and never edited, and each carries
 * an id the client generated, so the same set has the same identity wherever it
 * turns up. Two devices that both trained offline simply have more sets between
 * them than either had alone — there is no conflict to resolve, no clock to
 * trust, and nothing can be lost by merging in the wrong order.
 *
 * Everything else is **last write wins**, per row. Programmes and training
 * maxes are edited in place, so two versions of one row genuinely disagree and
 * something has to give. Newest wins, which is right for one person on a phone
 * and a laptop and would need rethinking before two people share an account.
 */

type Row = Record<string, unknown>;

async function requireUser(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ---------------------------------------------------------------- the log

function setsToRows(userId: string, sets: SetEntry[]): Row[] {
  return sets.map((s) => ({
    user_id: userId,
    client_uid: s.uid,
    exercise_id: s.id,
    weight: s.weight,
    reps: s.reps,
    performed_at: new Date(s.at).toISOString(),
  }));
}

function rowsToSets(rows: Row[]): SetEntry[] {
  return rows.map((r) => ({
    uid: String(r.client_uid),
    id: String(r.exercise_id),
    weight: Number(r.weight),
    reps: Number(r.reps),
    at: new Date(String(r.performed_at)).getTime(),
  }));
}

/** Union by uid. Order does not matter, which is the point. */
function unionSets(a: SetEntry[], b: SetEntry[]): SetEntry[] {
  const byUid = new Map<string, SetEntry>();
  for (const s of [...a, ...b]) byUid.set(s.uid, s);
  return [...byUid.values()].sort((x, y) => x.at - y.at);
}

// ---------------------------------------------------------------- programmes

function programsToRows(userId: string, programs: Program[]): Row[] {
  return programs.map((p, i) => ({
    user_id: userId,
    client_uid: p.id,
    name: p.name ?? "",
    name_key: p.nameKey ?? null,
    exercise_ids: p.exerciseIds ?? [],
    targets: p.targets ?? {},
    position: i,
    updated_at: new Date().toISOString(),
  }));
}

function rowsToPrograms(rows: Row[]): Program[] {
  return [...rows]
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((r) => ({
      id: String(r.client_uid),
      name: String(r.name ?? ""),
      ...(r.name_key ? { nameKey: String(r.name_key) } : {}),
      exerciseIds: (r.exercise_ids as string[]) ?? [],
      targets: (r.targets as Program["targets"]) ?? {},
    }));
}

// ---------------------------------------------------------------- training maxes

function tmToRows(userId: string, tms: Record<string, TrainingMaxOverride>): Row[] {
  return Object.entries(tms).map(([exerciseId, v]) => ({
    user_id: userId,
    exercise_id: exerciseId,
    tm: v.tm,
    derived_from: v.from,
    set_at: new Date(v.at).toISOString(),
  }));
}

function rowsToTm(rows: Row[]): Record<string, TrainingMaxOverride> {
  const out: Record<string, TrainingMaxOverride> = {};
  for (const r of rows) {
    out[String(r.exercise_id)] = {
      tm: Number(r.tm),
      from: Number(r.derived_from),
      at: new Date(String(r.set_at)).getTime(),
    };
  }
  return out;
}

// ---------------------------------------------------------------- profile

function profileToRow(userId: string, p: Profile): Row {
  return {
    id: userId,
    username: p.username ?? null,
    age_group: p.ageGroup ?? null,
    body_weight: p.bodyWeight ?? null,
    body_weight_unit: p.bodyWeightUnit ?? "kg",
    updated_at: new Date().toISOString(),
  };
}

function rowToProfile(r: Row): Profile | null {
  // `gender` dropped from the app in favour of one conservative default for
  // everyone (see plans.ts), but an account synced before that still has the
  // column set — reading it here would resurrect a field nothing writes or
  // shows any more, so it stays out of the returned Profile even where it
  // exists on the row.
  if (!r?.username && !r?.age_group) return null;
  return {
    username: String(r.username ?? ""),
    ageGroup: (r.age_group as Profile["ageGroup"]) ?? "30-44",
    ...(r.body_weight != null ? { bodyWeight: Number(r.body_weight) } : {}),
    bodyWeightUnit: (r.body_weight_unit as "kg" | "lb") ?? "kg",
  };
}

// ---------------------------------------------------------------- the two operations

export type SyncResult = { ok: boolean; error?: string; pulled: number; pushed: number };

/**
 * Sign-in: bring the two copies together, then leave both holding the result.
 *
 * Runs local-first — the merged state is written to localStorage *before* the
 * upload is attempted — so a sign-in on a flaky connection cannot leave the
 * device worse off than it started. If the push fails, nothing was lost; the
 * next change pushes again.
 */
export async function mergeOnSignIn(): Promise<SyncResult> {
  const userId = await requireUser();
  if (!supabase || !userId) return { ok: false, error: "not signed in", pulled: 0, pushed: 0 };

  try {
    const [setsRes, progRes, tmRes, profRes] = await Promise.all([
      supabase.from("sets").select("*"),
      supabase.from("programs").select("*"),
      supabase.from("training_maxes").select("*"),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    ]);
    const firstError = setsRes.error || progRes.error || tmRes.error || profRes.error;
    if (firstError) return { ok: false, error: firstError.message, pulled: 0, pushed: 0 };

    const remoteSets = rowsToSets((setsRes.data ?? []) as Row[]);
    const localSets = read<SetEntry[]>(LOG_KEY) ?? [];
    const mergedSets = unionSets(localSets, remoteSets);

    // Programmes and training maxes: whichever side has rows wins outright
    // rather than being interleaved. Merging two lists of programmes by id
    // would silently resurrect one deleted on the other device, and a workout
    // that comes back from the dead is worse than one that needs re-adding.
    const remotePrograms = rowsToPrograms((progRes.data ?? []) as Row[]);
    const localPrograms = read<Program[]>(PROGRAMS_KEY) ?? [];
    const mergedPrograms = remotePrograms.length ? remotePrograms : localPrograms;

    const remoteTm = rowsToTm((tmRes.data ?? []) as Row[]);
    const localTm = read<Record<string, TrainingMaxOverride>>(TM_KEY) ?? {};
    // Per lift, the more recent decision wins.
    const mergedTm = { ...localTm };
    for (const [id, v] of Object.entries(remoteTm)) {
      if (!mergedTm[id] || v.at > mergedTm[id].at) mergedTm[id] = v;
    }

    const remoteProfile = profRes.data ? rowToProfile(profRes.data as Row) : null;
    const localProfile = read<Profile>(PROFILE_KEY);
    const mergedProfile = remoteProfile ?? localProfile;

    // Local first: if the upload below fails, the device still ends up with
    // everything both sides knew.
    write(LOG_KEY, mergedSets);
    write(PROGRAMS_KEY, mergedPrograms);
    write(TM_KEY, mergedTm);
    if (mergedProfile) write(PROFILE_KEY, mergedProfile);

    const pushed = await pushAll();
    return {
      ok: pushed.ok,
      error: pushed.error,
      pulled: remoteSets.length,
      pushed: mergedSets.length,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), pulled: 0, pushed: 0 };
  }
}

/** Everything the device holds, upward. Idempotent. */
export async function pushAll(): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUser();
  if (!supabase || !userId) return { ok: false, error: "not signed in" };

  const sets = read<SetEntry[]>(LOG_KEY) ?? [];
  const programs = read<Program[]>(PROGRAMS_KEY) ?? [];
  const tms = read<Record<string, TrainingMaxOverride>>(TM_KEY) ?? {};
  const profile = read<Profile>(PROFILE_KEY);

  try {
    if (sets.length) {
      // ignoreDuplicates: a set already up there is the same set. This is the
      // union rule expressed as one database call.
      const { error } = await supabase
        .from("sets")
        .upsert(setsToRows(userId, sets), {
          onConflict: "user_id,client_uid",
          ignoreDuplicates: true,
        });
      if (error) return { ok: false, error: error.message };
    }

    if (programs.length) {
      const { error } = await supabase
        .from("programs")
        .upsert(programsToRows(userId, programs), { onConflict: "user_id,client_uid" });
      if (error) return { ok: false, error: error.message };
      // A programme deleted here is deleted everywhere, which is what deleting
      // it meant. Without this the next sign-in would bring it back.
      const keep = programs.map((p) => p.id);
      const { error: delErr } = await supabase
        .from("programs")
        .delete()
        .eq("user_id", userId)
        .not("client_uid", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
      if (delErr) return { ok: false, error: delErr.message };
    }

    if (Object.keys(tms).length) {
      const { error } = await supabase
        .from("training_maxes")
        .upsert(tmToRows(userId, tms), { onConflict: "user_id,exercise_id" });
      if (error) return { ok: false, error: error.message };
    }

    if (profile) {
      const { error } = await supabase.from("profiles").upsert(profileToRow(userId, profile));
      if (error) return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
