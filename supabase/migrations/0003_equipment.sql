-- Adds profiles.equipment: what the reader has access to right now.
--
-- Apply with the Supabase SQL editor, same as the others. Safe to re-run.
--
-- Unlike 0002, this one is not optional to defer. profileToRow() now sends
-- an `equipment` key on every profile upsert, so until this column exists,
-- syncing a profile fails outright for a signed-in user -- caught and
-- reported by pushAll()'s own error handling rather than crashing anything,
-- but sync silently stops working until this runs.
--
-- text[] rather than a boolean per equipment type: the set of tags is read
-- from the exercise catalogue's own equipment field elsewhere in the app
-- (see EQUIPMENT_TAGS in types.ts), and a fixed set of columns here would be
-- a second place that list has to be kept in sync with the first.

alter table public.profiles
  add column if not exists equipment text[] not null default '{}';
