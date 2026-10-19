-- =============================================================================
-- Migration: Change username (SRS-112.4 - SRS-112.8)
-- Author: JO (James Ortiz)
--
-- Updates an EXISTING database to match supabase/schema.sql. Run it once in
-- the Supabase SQL Editor. It only adds things, so no data is removed, and it
-- is safe to run more than once.
--
-- What it changes:
--   1. Adds players.username_changed_at, the time of the player's last
--      username change (NULL until they first change it). It enforces the
--      once-per-24-hours limit (SRS-112.6), including a change of capitals
--      only, which leaves no reserved row behind to check.
--   2. Adds fn_change_username(), callable only by the service role.
-- =============================================================================

BEGIN;

ALTER TABLE players ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

-- Changes a player's username as one transaction:
--   * The player's row is locked first, so two changes by the same player
--     run one at a time and the second sees the first's cooldown.
--   * SRS-112.4: same rules as registration: 6-10 letters and numbers, unique
--     ignoring case among current and reserved usernames.
--   * SRS-112.5: no password is asked for; the API only needs the session.
--   * SRS-112.6: at most one change in any 24 hours.
--   * SRS-112.7: the previous username stays reserved for 24 hours.
--   * SRS-112.8: reservations that have run out are deleted first, so their
--     usernames can be taken again.
-- Changing only the capitals (tester1 -> Tester1) counts as the day's change,
-- but reserves nothing, since the name is the same ignoring case.
CREATE OR REPLACE FUNCTION fn_change_username(p_player_id INTEGER, p_username VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_status      VARCHAR(20);
    v_changed_at  TIMESTAMPTZ;
    v_current     VARCHAR(10);
    v_now         TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
    IF p_username IS NULL OR p_username !~ '^[A-Za-z0-9]{6,10}$' THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    SELECT account_status, username_changed_at
      INTO v_status, v_changed_at
      FROM players
     WHERE player_id = p_player_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_status <> 'Active' THEN
        RETURN jsonb_build_object('status', 'not_active');
    END IF;

    SELECT username
      INTO v_current
      FROM usernames
     WHERE player_id = p_player_id
       AND is_current;

    IF v_current = p_username THEN
        RETURN jsonb_build_object('status', 'unchanged');
    END IF;

    IF v_changed_at > v_now - INTERVAL '24 hours' THEN
        RETURN jsonb_build_object('status', 'cooldown',
                                  'next_change_at', v_changed_at + INTERVAL '24 hours');
    END IF;

    DELETE FROM usernames
     WHERE NOT is_current
       AND reserved_until <= v_now;

    IF LOWER(v_current) = LOWER(p_username) THEN
        UPDATE usernames
           SET username = p_username
         WHERE player_id = p_player_id
           AND is_current;
    ELSE
        IF EXISTS (SELECT 1 FROM usernames WHERE LOWER(username) = LOWER(p_username)) THEN
            RETURN jsonb_build_object('status', 'taken');
        END IF;

        -- Another player can claim the same name between the check above and
        -- the insert; uq_usernames_username_ci then stops the second one, and
        -- this block's changes are undone.
        BEGIN
            UPDATE usernames
               SET is_current = FALSE,
                   reserved_until = v_now + INTERVAL '24 hours'
             WHERE player_id = p_player_id
               AND is_current;

            INSERT INTO usernames (player_id, username, is_current)
            VALUES (p_player_id, p_username, TRUE);
        EXCEPTION WHEN unique_violation THEN
            RETURN jsonb_build_object('status', 'taken');
        END;
    END IF;

    UPDATE players
       SET username_changed_at = v_now
     WHERE player_id = p_player_id;

    RETURN jsonb_build_object('status', 'changed',
                              'username', p_username,
                              'next_change_at', v_now + INTERVAL '24 hours');
END;
$$;

-- Only the server may call fn_change_username. Supabase grants EXECUTE on new
-- functions to its anon and authenticated roles, and the anon key is public
-- (it ships to browsers for the poker page's Realtime connection), so those
-- grants are removed and only the service role keeps access. The role check
-- lets this script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_change_username(INTEGER, VARCHAR) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_change_username(INTEGER, VARCHAR) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_change_username(INTEGER, VARCHAR) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new function right away.
NOTIFY pgrst, 'reload schema';
