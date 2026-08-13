-- GuideTrain, roadmap 5: accounts and the data behind them.
--
-- Apply with the Supabase SQL editor, or `supabase db push` if you have the
-- CLI linked. Safe to re-run: every statement is guarded.
--
-- Read the row-level security section at the bottom before the tables. The
-- anon key ships inside the JavaScript bundle and is meant to -- it names the
-- project, not the person -- so these policies are the entire protection. A
-- table that reaches production without them is readable by anyone who opens
-- devtools.

-- ---------------------------------------------------------------- profiles
-- One row per account. The primary key IS the auth user, so there is no way to
-- have two profiles for one login, and deleting the login deletes the profile.
create table if not exists public.profiles (
  id             uuid primary key references auth.users on delete cascade,
  username       text,
  gender         text check (gender in ('male', 'female', 'other')),
  age_group      text check (age_group in ('teen', '18-29', '30-44', '45-59', '60+')),
  body_weight    numeric,
  -- Carried up from local storage rather than assumed. A profile saved before
  -- the app went kilos-only may say 'lb', and dropping this column would
  -- silently reinterpret 225 lb as 225 kg -- a wrong number on screen, which
  -- is the one thing worse than a missing one.
  body_weight_unit text not null default 'kg' check (body_weight_unit in ('kg', 'lb')),
  active_program uuid,
  updated_at     timestamptz not null default now()
);

-- A session without a profile row is a state the app would have to handle
-- everywhere, so the row is created with the account rather than on first
-- write. security definer because the trigger runs before the new user has a
-- session of their own to satisfy the policies below.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- the log
-- Real columns, not JSON: everything else in the app is derived from this, and
-- it is the one table that gets queried rather than merely hydrated.
create table if not exists public.sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  -- The id the client generated. Syncing the log is a set union rather than a
  -- merge -- sets are appended and never edited -- but that only holds if the
  -- same set carries the same identity on every device, so the client's id is
  -- kept and made unique per user. Uploading twice is then a no-op instead of
  -- a duplicate.
  client_uid   text not null,
  exercise_id  text not null,
  weight       numeric not null check (weight >= 0),
  reps         integer not null check (reps > 0),
  performed_at timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (user_id, client_uid)
);

-- Every read of this table is "one lift, newest first".
create index if not exists sets_by_lift
  on public.sets (user_id, exercise_id, performed_at desc);

-- ---------------------------------------------------------------- programmes
create table if not exists public.programs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  client_uid   text not null,
  name         text not null default '',
  -- A translation key for the workouts a ready-made plan created, resolved at
  -- render so a plan applied in English opens in Polish. Never a rendered
  -- label: storing one would freeze a language into the database.
  name_key     text,
  exercise_ids text[] not null default '{}',
  -- Targets stay JSONB deliberately. They are read whole and written whole,
  -- and their shape -- per-set loads, reps, the AMRAP flag, which planner
  -- wrote them -- belongs to the app and changes with it. Normalising it would
  -- buy a schema migration every time the planner learns something.
  targets      jsonb not null default '{}'::jsonb,
  position     integer not null default 0,
  updated_at   timestamptz not null default now(),
  unique (user_id, client_uid)
);

create index if not exists programs_by_user
  on public.programs (user_id, position);

-- ---------------------------------------------------------------- training maxes
-- One per lift, so the natural key is the right one. This table exists because
-- a training max that was reset by hand must survive being recomputed from the
-- log; see useTrainingMax.ts.
create table if not exists public.training_maxes (
  user_id      uuid not null references auth.users on delete cascade,
  exercise_id  text not null,
  tm           numeric not null check (tm > 0),
  -- What the log implied at the time, so the app can say what was overridden
  -- rather than presenting a number with no history.
  derived_from numeric not null check (derived_from > 0),
  set_at       timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- ================================================================
-- Row-level security. Nothing above is protected until this runs.
-- ================================================================

alter table public.profiles       enable row level security;
alter table public.sets           enable row level security;
alter table public.programs       enable row level security;
alter table public.training_maxes enable row level security;

-- One policy shape, four times: you touch your own rows and nobody else's.
--
-- Both clauses matter and only one of them is obvious. `using` decides which
-- rows you can see and change. `with check` decides what you are allowed to
-- write. With `using` alone, a signed-in user can insert rows stamped with
-- somebody else's user_id -- they cannot read them back, but they can put them
-- there, and the owner would find training they never did.
--
-- auth.uid() is null for the anon key, and `null = anything` is null rather
-- than true, so a visitor who is not signed in matches no row at all.

drop policy if exists own_profile on public.profiles;
create policy own_profile on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists own_sets on public.sets;
create policy own_sets on public.sets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists own_programs on public.programs;
create policy own_programs on public.programs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists own_training_maxes on public.training_maxes;
create policy own_training_maxes on public.training_maxes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
