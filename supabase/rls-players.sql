-- =============================================================================
-- RLS, JO, Secure the players table
--
-- Each logged-in player may read, create, change and delete only their OWN
-- row, matched on the owner column player_id. Visitors who are not logged in
-- (anon) get nothing. Within their own row, column permissions (step 7) let
-- a player change only their name, bio and photo, keep their password hash
-- hidden, and leave creating accounts to the server. Safe to re-run.
--
-- Assumes player_id holds the player's Supabase Auth user id, the value
-- auth.uid() returns. Both sides are compared as text, because today
-- player_id is a SERIAL integer and Postgres won't compare a uuid with an
-- integer. Until player_id holds those ids, no login matches any row, so
-- nobody can reach the table through the public API.
--
-- The app's own routes use the service-role key, which bypasses RLS, so the
-- app keeps working; those routes still check the player's session token.
-- =============================================================================

-- 1. Turn RLS on. From here every row is hidden from the anon and
--    authenticated roles until a policy allows it.
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- (Re-run safety: remove old versions of these policies if they exist.)
DROP POLICY IF EXISTS "Players can read their own row"   ON public.players;
DROP POLICY IF EXISTS "Players can create their own row" ON public.players;
DROP POLICY IF EXISTS "Players can update their own row" ON public.players;
DROP POLICY IF EXISTS "Players can delete their own row" ON public.players;

-- 2. READ: a logged-in player sees only their own row.
CREATE POLICY "Players can read their own row"
    ON public.players
    FOR SELECT
    TO authenticated
    USING ( auth.uid()::text = player_id::text );

-- 3. CREATE: a logged-in player may insert a row only with their own id.
CREATE POLICY "Players can create their own row"
    ON public.players
    FOR INSERT
    TO authenticated
    WITH CHECK ( auth.uid()::text = player_id::text );

-- 4. UPDATE: a logged-in player may change only their own row (USING), and
--    it must still be theirs afterwards (WITH CHECK).
CREATE POLICY "Players can update their own row"
    ON public.players
    FOR UPDATE
    TO authenticated
    USING      ( auth.uid()::text = player_id::text )
    WITH CHECK ( auth.uid()::text = player_id::text );

-- 5. DELETE: a logged-in player may delete only their own row.
CREATE POLICY "Players can delete their own row"
    ON public.players
    FOR DELETE
    TO authenticated
    USING ( auth.uid()::text = player_id::text );

-- 6. anon (not logged in): intentionally NO policy, so they see nothing.

-- 7. Columns: the policies pick the rows, these permissions pick the columns.
--    A player may change only their name, bio and photo (SRS-112, SRS-114,
--    SRS-115); balance, password_hash, account_status and the rest change
--    only through the server. The service role keeps all its permissions.
REVOKE UPDATE ON public.players FROM anon, authenticated;
GRANT UPDATE (first_name, last_name, bio, profile_photo) ON public.players TO authenticated;

--    Never hand out a password hash, not even the player's own.
REVOKE SELECT ON public.players FROM anon, authenticated;
GRANT SELECT (player_id, first_name, last_name, birthday, balance, bio,
              profile_photo, account_status, created_at, username_changed_at)
    ON public.players TO authenticated;

--    Accounts are created only by sign-up on the server, which checks the
--    age and names and hashes the password, so the INSERT policy above
--    stays unused.
REVOKE INSERT ON public.players FROM anon, authenticated;
