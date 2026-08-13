# Supabase

Roadmap 5: accounts, and the data behind them. Nothing here is wired into the
app yet — this is phase 1 of
[the plan](../README.md#the-intended-shape), which is the schema and its
policies, applied and proved before any code depends on it.

## Applying it

1. Create a project at [supabase.com](https://supabase.com). Take the project
   URL and the **publishable** key from Settings → API Keys.

   Supabase is midway through changing key formats: the current pair is
   `sb_publishable_…` and `sb_secret_…`, replacing the older `anon` and
   `service_role` JWTs, with legacy keys deprecated through 2026
   ([migration guide](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)).
   Either generation works here. The publishable key is the one that goes in
   the app; the secret key bypasses row-level security and must never reach a
   browser, a `VITE_` variable or a commit — both `lib/supabase.ts` and
   `check-rls.mjs` refuse to run if handed one.
2. Paste `migrations/0001_accounts.sql` into the SQL editor and run it. It is
   guarded throughout, so re-running is safe.
3. Prove the policies hold, against the real project:

   ```bash
   npm i -D @supabase/supabase-js -w apps/web
   SUPABASE_URL=https://xxx.supabase.co \
   SUPABASE_ANON_KEY=sb_publishable_... \
   node tools/supabase/check-rls.mjs
   ```

   It creates two throwaway accounts, has one write a set, and then tries every
   way the second can reach it: reading, planting a row under the first
   account's id, deleting, and asking while signed out. Turn off email
   confirmation while you run it, or sign-up returns no session and it stops
   and says so.

## Why the policies come before the tables

The anon key ships inside the JavaScript bundle. That is not a leak — it names
the project, not the person, and Supabase is built on it being public. It does
mean row-level security is the *entire* protection: a table that reaches
production with RLS off is readable by anyone who opens devtools.

Two details that are easy to get wrong and quiet when you do:

- **`with check` as well as `using`.** `using` governs which rows you can see
  and modify; `with check` governs what you may write. With only the first, a
  signed-in user can insert rows stamped with somebody else's `user_id`. They
  cannot read them back, but the owner would find training they never did.
  `check-rls.mjs` tests exactly this.
- **`auth.uid()` is null when signed out**, and `null = anything` is null
  rather than true, so the anon key matches no row. That is the behaviour to
  rely on rather than a separate "deny anonymous" policy.

## Shape notes

- **`sets` keeps the client's id** as `client_uid`, unique per user. Syncing the
  log is a set union rather than a merge — sets are appended and never edited —
  but that only holds while the same set has the same identity on every device.
  Uploading twice is then a no-op instead of a duplicate. If log entries ever
  become editable, this stops being free and the merge needs rethinking.
- **`programs.targets` is JSONB** on purpose. It is read whole and written
  whole, and its shape belongs to the app: per-set loads, rep counts, the AMRAP
  flag, which planner wrote it. Normalising it would buy a schema migration
  every time the planner learns something.
- **`body_weight_unit` is carried up** rather than assumed. A profile saved
  before the app went kilos-only may say `lb`, and dropping the column would
  reinterpret 225 lb as 225 kg.
- **`skips` and `theme` are not here.** Skipped sets are same-day only and
  expire by themselves; the theme is a property of the device. Syncing either
  would be work that makes the product slightly worse.
