-- =====================================================================
-- Row Level Security on wagers (sports betting)
-- Safe to re-run. Run once in the Supabase SQL Editor.
-- Tested by __tests__/security/wagers.rls.test.ts (npm run test:security).
-- =====================================================================
--
-- wagers holds every sports bet: which player placed it, how many coins,
-- the odds, and what it paid. Anyone with the public anon key (which ships to
-- every browser) can call the database's API directly, so the database itself
-- has to refuse them.
--
-- Who may do what. This app does not use Supabase Auth: players log in with
-- our own player_sessions tokens, so auth.uid() is always NULL for them and no
-- real player ever reaches the database as `anon` or `authenticated`. Every
-- legitimate read and write goes through our API routes and fn_place_wager /
-- fn_cancel_wager / the settlement sync, all with the service-role key, which
-- bypasses RLS; those routes check whose bet it is themselves
-- (.eq('player_id', playerId)). So "only your own rows" can't be written as a
-- policy here (player_id is an integer, not an auth uuid), and the rule is:
--
--   | Operation | anon (not logged in) | authenticated (signed up to      | service_role (our server) |
--   |           |                      | Supabase Auth, never a player)   |                           |
--   |-----------|----------------------|----------------------------------|---------------------------|
--   | select    | no                   | no                               | yes (bypasses RLS)        |
--   | insert    | no                   | no                               | yes                       |
--   | update    | no                   | no                               | yes                       |
--   | delete    | no                   | no                               | yes                       |
--
-- Least privilege, three layers deep:

-- 1. Turn RLS on. From here every row is hidden from anon and authenticated
--    unless a policy allows it, and none does.
ALTER TABLE public.wagers ENABLE ROW LEVEL SECURITY;

-- 2. A RESTRICTIVE policy that denies both roles everything. Restrictive
--    policies are ANDed with any permissive ones, so even if someone later
--    adds a broad permissive policy (say, the dashboard's "Enable read access
--    for all users" template), the table stays shut.
--    USING (false):      no existing row can be seen, updated or deleted.
--    WITH CHECK (false): no new or changed row can be saved.
DROP POLICY IF EXISTS "wagers: no access from the public API" ON public.wagers;
CREATE POLICY "wagers: no access from the public API"
    ON public.wagers
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

-- 3. Take away the table privileges too, so the roles are refused before RLS
--    is even consulted (defence in depth).
REVOKE ALL ON public.wagers FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.wagers_wager_id_seq FROM anon, authenticated;

-- Check it worked (expect rls_enabled = true and the one policy above):
--   SELECT relname, relrowsecurity AS rls_enabled FROM pg_class WHERE relname = 'wagers';
--   SELECT policyname, permissive, cmd, roles, qual, with_check
--     FROM pg_policies WHERE tablename = 'wagers';
