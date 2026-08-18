-- Backs the stats panel: known one-rep maxes and a body-weight history.
--
-- Apply with the Supabase SQL editor, same as 0001. Safe to re-run. Optional
-- to defer, unlike 0003 -- these are new, additive writes (useKnownMax.ts,
-- useBodyWeightLog.ts) that only happen from the new stats panel, so nothing
-- existing breaks while this is unapplied; the panel's edits just fail to
-- sync until it is run.

-- ---------------------------------------------------------------- known maxes
-- One per lift, same shape as training_maxes, but a real one-rep max rather
-- than a 5/3/1 training max -- see useKnownMax.ts for why the two are kept
-- apart. derived_from is nullable: unlike a training-max reset, this number is
-- allowed to be a claim with no log behind it at all.
create table if not exists public.known_maxes (
  user_id      uuid not null references auth.users on delete cascade,
  exercise_id  text not null,
  max          numeric not null check (max > 0),
  derived_from numeric check (derived_from is null or derived_from > 0),
  set_at       timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- ---------------------------------------------------------------- body weight log
-- Append-only, same union-by-client-id shape as sets -- a weigh-in is recorded
-- once and never edited, so two devices logging offline just have more
-- entries between them, the same reasoning as the set log (see sync.ts).
-- profiles.body_weight stays the single current value everything else reads;
-- this exists only to draw the weight-over-time chart.
create table if not exists public.body_weight_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  client_uid   text not null,
  weight       numeric not null check (weight > 0),
  recorded_at  timestamptz not null,
  unique (user_id, client_uid)
);

create index if not exists body_weight_log_by_user
  on public.body_weight_log (user_id, recorded_at desc);

-- ================================================================
-- Row-level security. Nothing above is protected until this runs.
-- ================================================================

alter table public.known_maxes     enable row level security;
alter table public.body_weight_log enable row level security;

drop policy if exists own_known_maxes on public.known_maxes;
create policy own_known_maxes on public.known_maxes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists own_body_weight_log on public.body_weight_log;
create policy own_body_weight_log on public.body_weight_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
