-- =====================================================================
-- Row Level Security on poker_seats (Sprint 6, JN)
--
-- Rules (see the RLS card on the board):
--   select  a logged-in player may read only their own seat rows
--   insert  nobody through the public API
--   update  nobody through the public API
--   delete  nobody through the public API
--   anon    nothing
--
-- Why no insert/update/delete, not even for the owner: a seat's chip_stack
-- is money. The poker server sits a player down, buys them back in and
-- cashes them out with fn_poker_join / fn_poker_rebuy / fn_poker_leave,
-- which move the same coins between players.balance and the seat in one
-- transaction. A player who could write their own row could give themselves
-- chips that never left their balance, or keep a seat after cashing out.
-- The poker server uses the service role, which bypasses RLS, so it keeps
-- working unchanged.
--
-- The owner column is poker_seats.player_id (an INTEGER from players). This
-- app logs players in with its own sessions, not Supabase Auth, so
-- auth.uid() (a Supabase Auth uuid) has no link to a player on its own.
-- player_auth_links gives it one: a Supabase Auth user is linked to at most
-- one player, and only the service role can create a link. Real players
-- have no link yet, so nothing in the app changes.
--
-- Safe to re-run. Run it once in the Supabase SQL Editor.
-- =====================================================================

-- 1. The link from a Supabase Auth user to a player.
CREATE TABLE IF NOT EXISTS public.player_auth_links (
    auth_user_id  UUID     PRIMARY KEY
                  REFERENCES auth.users(id) ON DELETE CASCADE,
    player_id     INTEGER  NOT NULL UNIQUE
                  REFERENCES public.players(player_id) ON DELETE CASCADE
);

-- Nobody but the service role reads or writes the links: RLS on, no policies,
-- and no table privileges for the browser roles either.
ALTER TABLE public.player_auth_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_auth_links FROM anon, authenticated;

-- 2. The player the caller is logged in as, or NULL.
-- SECURITY DEFINER so it can read player_auth_links, which the caller can't.
-- It only ever returns the caller's own link (auth.uid() comes from their
-- signed login token), and search_path is pinned so it can't be hijacked.
CREATE OR REPLACE FUNCTION public.current_player_id()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT player_id
      FROM public.player_auth_links
     WHERE auth_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_player_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_player_id() TO authenticated;

-- 3. Turn RLS on. From here every row is hidden from anon and authenticated
--    until a policy allows it.
ALTER TABLE public.poker_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players can read their own seats" ON public.poker_seats;

-- 4. READ: a logged-in player sees only rows whose player_id is the player
--    their auth.uid() is linked to.
CREATE POLICY "Players can read their own seats"
    ON public.poker_seats
    FOR SELECT
    TO authenticated
    USING (
        (SELECT auth.uid()) IS NOT NULL
        AND player_id = (SELECT public.current_player_id())
    );

-- 5. INSERT, UPDATE, DELETE: intentionally NO policy, so nobody can do them
--    through the API (only the poker server, with the service role).
-- 6. anon (not logged in): intentionally NO policy, so they see nothing.

-- ---------------------------------------------------------------------
-- Check (Step 3 in the slides): run these after the script.
-- ---------------------------------------------------------------------
-- SELECT relname AS table_name, relrowsecurity AS rls_enabled
--   FROM pg_class
--  WHERE relname IN ('poker_seats', 'player_auth_links');
--
-- SELECT policyname, cmd, roles, qual AS using_rule, with_check
--   FROM pg_policies
--  WHERE tablename = 'poker_seats'
--  ORDER BY cmd;
