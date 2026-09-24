-- Takes the anon role's table privileges away on an existing project.
--
-- Apply with the Supabase SQL editor, same as the others. Safe to re-run, and
-- safe to run on a project that never had these grants -- revoking a
-- privilege nobody holds is a no-op, so this is also harmless in a new
-- project, where 0001 and 0004 simply never granted them.
--
-- Why this exists
-- ---------------
-- Until 30 October 2026 Supabase granted the Data API roles access to
-- anything created in `public` automatically, anon included. 0001 and 0004
-- now spell their grants out (see the table-privileges section at the foot of
-- each) and deliberately leave anon out of them: every table here is keyed to
-- auth.uid(), the app never touches one without a session -- pullAll and
-- pushAll in sync.ts both call requireUser() and return "not signed in"
-- before any query goes out -- and auth.uid() is null for the anon key, so
-- the role can never match a row. It held privileges it had no use for, on
-- data it could never reach, using a key that ships inside the JavaScript
-- bundle.
--
-- A project created before the change still carries the old grants, so
-- without this the live database and these files describe two different
-- states. This is the one statement that closes that gap.
--
-- What changes, behaviourally
-- --------------------------
-- Only what a signed-out client gets back. Today RLS filters every row and
-- the request succeeds with an empty result; afterwards it fails outright
-- with "permission denied for table ...". Nothing in the app makes such a
-- request, and tools/supabase/check-rls.mjs already treats either outcome as
-- a pass -- it was written to accept a hard block as a valid answer, so it
-- stays green across this change rather than needing an edit alongside it.
--
-- Schema-level `usage` on public is not touched. PostgREST needs it to serve
-- the anon role at all, including the auth endpoints a signed-out visitor
-- uses to sign in, which is the one thing anon still legitimately does.

revoke all on public.profiles        from anon;
revoke all on public.sets            from anon;
revoke all on public.programs        from anon;
revoke all on public.training_maxes  from anon;
revoke all on public.known_maxes     from anon;
revoke all on public.body_weight_log from anon;
