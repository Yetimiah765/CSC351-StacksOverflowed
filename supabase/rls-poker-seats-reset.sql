-- =====================================================================
-- RESET: put poker_seats back to the insecure "before" state, to show the
-- attack tests failing (__tests__/security/poker_seats.rls.test.ts).
--
-- The live database already had RLS on for poker_seats with no policies,
-- so the tests passed before any fix was written. Run this, run
-- `npm run test:security` and take the "before" screenshot, then run
-- supabase/rls-poker-seats.sql straight away.
--
-- While this is in effect anyone with the public anon key can read and
-- change every seat. The poker server uses the service role either way.
-- Never leave the database like this.
-- =====================================================================

DROP POLICY IF EXISTS "Players can read their own seats" ON public.poker_seats;
ALTER TABLE public.poker_seats DISABLE ROW LEVEL SECURITY;

-- Make sure the browser roles can reach the table, so the leak shows.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poker_seats TO anon, authenticated;
