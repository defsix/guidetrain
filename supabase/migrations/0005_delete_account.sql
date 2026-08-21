-- Self-service account deletion.
--
-- Apply with the Supabase SQL editor, same as 0001. Safe to re-run.
--
-- A signed-in user can already delete every row they own directly -- the
-- own_* policies in 0001/0004 allow it, since they govern deletes the same
-- as reads and writes. What only a privileged function can do is remove the
-- auth.users row itself, and every table those migrations created references
-- it `on delete cascade` -- profiles, sets, programs, training_maxes,
-- known_maxes, body_weight_log -- so deleting that one row removes all of
-- them in a single statement, with nothing left to clean up by hand.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

-- security definer is what lets this reach auth.users at all -- neither the
-- anon nor the authenticated role has delete rights on it directly, the same
-- reason handle_new_user() in 0001 needed it to insert a profile row before
-- the new user has a session of their own. It must not become a general
-- "delete any account" tool: auth.uid() is read from the caller's own JWT
-- inside the function body, not accepted as an argument, so there is no id
-- parameter for a signed-in user to substitute somebody else's into.
--
-- Only a signed-in user may call this at all -- anon (signed out) has
-- nothing to delete, and auth.uid() would be null there regardless, which
-- deletes no row rather than erroring.
revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
