// Proves the row-level security policies actually hold, against a real project.
//
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_ANON_KEY=sb_publishable_... \
//   node tools/supabase/check-rls.mjs
//
// Not part of `npm run check`: it needs network and a live project, and it
// creates two throwaway accounts. Run it once after applying the migration,
// and again whenever a policy changes.
//
// A policy nobody has attacked is a policy nobody has checked. This signs in as
// one account, writes a row, then signs in as a second and tries every way of
// reaching the first account's data that the anon key allows.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY.");
  process.exit(2);
}
// A secret key bypasses RLS entirely, so running this with one would report
// success no matter how broken the policies are. Both key formats are checked:
// the current `sb_secret_` prefix and the legacy service_role JWT.
if (KEY.startsWith("sb_secret_") || (!KEY.startsWith("sb_publishable_") && /service_role/.test(KEY))) {
  console.error("That is a secret key. Use the publishable (or anon) key.");
  process.exit(2);
}

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const pass = (m) => console.log("  ok   " + m);

const stamp = Date.now();
// example.com is rejected outright -- Supabase validates against the RFC 2606
// reserved domains as an obvious-fake-address check, independent of whatever
// the dashboard's email confirmation setting is. mailinator.com is a real,
// long-standing public inbox domain that passes that check; nothing needs to
// actually arrive there since these accounts are thrown away immediately
// after the test.
const users = [
  { email: `rls-a-${stamp}@mailinator.com`, password: `pw-a-${stamp}!A1` },
  { email: `rls-b-${stamp}@mailinator.com`, password: `pw-b-${stamp}!B2` },
];

async function signUp(u) {
  const c = createClient(URL, KEY);
  const { data, error } = await c.auth.signUp({ email: u.email, password: u.password });
  if (error) throw new Error(`sign-up failed for ${u.email}: ${error.message}`);
  if (!data.session) {
    throw new Error(
      "Sign-up returned no session — email confirmation is on. Turn it off for " +
        "this project while testing, or supply two pre-confirmed accounts.",
    );
  }
  return c;
}

const a = await signUp(users[0]);
const b = await signUp(users[1]);
const aId = (await a.auth.getUser()).data.user.id;
const bId = (await b.auth.getUser()).data.user.id;
console.log(`two accounts: ${aId.slice(0, 8)}… and ${bId.slice(0, 8)}…\n`);

// --- the trigger gave each account a profile ---------------------------
{
  const { data } = await a.from("profiles").select("id");
  if (data?.length === 1 && data[0].id === aId) pass("sign-up created exactly one profile");
  else fail(`expected one own profile, got ${JSON.stringify(data)}`);
}

// --- A writes something worth stealing ---------------------------------
{
  const { error } = await a.from("sets").insert({
    user_id: aId, client_uid: `probe-${stamp}`, exercise_id: "Barbell_Squat",
    weight: 140, reps: 5, performed_at: new Date().toISOString(),
  });
  if (error) fail(`A could not write its own set: ${error.message}`);
  else pass("A can write its own set");
}

// --- B must not be able to read it -------------------------------------
for (const table of ["sets", "profiles", "programs", "training_maxes"]) {
  const { data, error } = await b.from(table).select("*");
  if (error) { fail(`B got an error reading ${table}: ${error.message}`); continue; }
  const foreign = (data ?? []).filter((r) => (r.user_id ?? r.id) === aId);
  if (foreign.length === 0) pass(`B sees none of A's ${table}`);
  else fail(`B READ ${foreign.length} of A's ${table} rows`);
}

// --- B must not be able to write rows owned by A -----------------------
// The `with check` clause is what stops this. With `using` alone it succeeds.
{
  const { error } = await b.from("sets").insert({
    user_id: aId, client_uid: `planted-${stamp}`, exercise_id: "Barbell_Squat",
    weight: 999, reps: 1, performed_at: new Date().toISOString(),
  });
  if (error) pass("B cannot plant a set in A's log");
  else fail("B PLANTED a set owned by A — the policy is missing `with check`");
}

// --- B must not be able to delete A's data ------------------------------
{
  const { data } = await b.from("sets").delete().eq("user_id", aId).select();
  if ((data ?? []).length === 0) pass("B cannot delete A's sets");
  else fail(`B DELETED ${data.length} of A's sets`);
}

// --- a signed-out client must see nothing -------------------------------
{
  const anon = createClient(URL, KEY);
  const { data, error } = await anon.from("sets").select("*");
  if (error) pass(`signed out: blocked (${error.message})`);
  else if ((data ?? []).length === 0) pass("signed out: sees no sets");
  else fail(`signed out: READ ${data.length} sets`);
}

console.log();
if (bad) { console.log(`${bad} problem(s) — do not ship this schema`); process.exit(1); }
console.log("row-level security holds: each account sees and writes only its own rows");
