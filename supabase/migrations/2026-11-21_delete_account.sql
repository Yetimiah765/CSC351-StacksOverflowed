-- =============================================================================
-- Migration: Deleting an account (UR-106)
-- Author: JO (James Ortiz)
--
-- Updates an EXISTING database to match supabase/schema.sql for deleting an
-- account. Run it once in the Supabase SQL Editor. It changes no table and
-- deletes nothing by itself. It is safe to run more than once.
--
-- What it changes:
--   1. Adds fn_delete_account(), callable only by the service role, which
--      refuses while the player is seated at poker (SRS-106.10) and otherwise
--      deletes the player and everything tied to them (SRS-106.3).
-- =============================================================================

BEGIN;

-- Deletes a player's account as one transaction (UR-106).
--   * The player's row is locked first. fn_poker_join locks the same row
--     before it seats anyone, so a player can't sit down at a table while
--     their account is being deleted.
--   * SRS-106.10: a player seated at a poker table (a poker_seats row) is
--     refused, with the table they're at, and nothing is deleted: the poker
--     server still has them at the table.
--   * SRS-106.3: otherwise the player's row is deleted, and with it every
--     row that refers to it (all ON DELETE CASCADE): their username,
--     sessions, statistics, cosmetics and each game's rows.
-- The route checks the player's password first (SRS-106.2). This function
-- trusts the player id it's given, so only the server may call it.
CREATE OR REPLACE FUNCTION fn_delete_account(p_player_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_found      INTEGER;
    v_table_key  VARCHAR(30);
BEGIN
    SELECT player_id
      INTO v_found
      FROM players
     WHERE player_id = p_player_id
       FOR UPDATE;

    IF v_found IS NULL THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    SELECT t.table_key
      INTO v_table_key
      FROM poker_seats s
      JOIN poker_tables t ON t.table_id = s.table_id
     WHERE s.player_id = p_player_id
     LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object('status', 'seated', 'table_key', v_table_key);
    END IF;

    DELETE FROM players WHERE player_id = p_player_id;
    RETURN jsonb_build_object('status', 'deleted');
END;
$$;

-- Only the server may call fn_delete_account, for the same reason as the
-- other functions that act on a player: the anon key is public.
REVOKE EXECUTE ON FUNCTION fn_delete_account(INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_delete_account(INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_delete_account(INTEGER) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new function right away.
NOTIFY pgrst, 'reload schema';
