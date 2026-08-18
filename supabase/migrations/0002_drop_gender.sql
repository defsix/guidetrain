-- Drops the profiles.gender column.
--
-- Apply with the Supabase SQL editor, same as 0001. Safe to re-run, and safe
-- to leave un-run for a while: the app already stopped reading and writing
-- this column, so it just sits there unused until this is applied. Nothing
-- breaks either way -- this is a cleanup, not a fix.
--
-- The app used to ask sex at onboarding to scale a starting-weight guess:
-- upper-body strength differs between sexes by more than lower-body does, so
-- the fraction was cut for "female" and "other" and left full for "male".
-- Nothing else ever read the field, the cut only ever applied to a number the
-- app already called a starting point rather than a measurement, and "other"
-- was already defined as taking the more conservative of the two figures --
-- of the two ways that guess can be wrong, starting light is the recoverable
-- one, for anybody. So the field is gone: every profile gets the
-- conservative fraction now, and the first real set finds the right number,
-- same as it always did once one existed.

alter table public.profiles drop column if exists gender;
