-- =============================================================================
-- Migration: Login attempt limit (SRS-104.8)
-- Author: JO (James Ortiz)
--
-- Updates an EXISTING database to match supabase/schema.sql for limiting
-- wrong passwords. Run it once in the Supabase SQL Editor. It drops nothing,
-- so existing players and sessions are kept. It is safe to run more than once.
--
-- What it changes:
--   1. Adds the login_attempts table: each account's wrong passwords in a
--      row, and when it may next be logged in to.
--   2. Adds fn_record_login(), callable only by the service role.
-- =============================================================================

BEGIN;

-- Table: login_attempts
-- Reviewed by: JO (James Ortiz)
-- Supports: SRS-104.8
-- Purpose: Counts each account's wrong passwords in a row and, after too
-- many, when it may next be logged in to (fn_record_login). Only the server
-- uses it (row level security on, no policies).
CREATE TABLE IF NOT EXISTS login_attempts (
    player_id       INTEGER      PRIMARY KEY
                    REFERENCES players(player_id) ON DELETE CASCADE,
    failures        SMALLINT     NOT NULL DEFAULT 0
                    CHECK (failures >= 0),
    locked_until    TIMESTAMPTZ
);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Records how a login attempt went (SRS-104.8), in one statement per
-- attempt, so attempts arriving together can't both read the old count.
--   * A correct password clears the count.
--   * A wrong one adds to it. Reaching p_max_failures locks the account until
--     p_lock_seconds from now and starts the count again.
-- The route passes the limits (lib/auth.ts), checks locked_until before it
-- checks a password, and never records an attempt made while locked.
-- Returns {status: 'cleared'}, {status: 'failed', failures} or
-- {status: 'locked', locked_until}.
CREATE OR REPLACE FUNCTION fn_record_login(p_player_id INTEGER, p_success BOOLEAN, p_max_failures INTEGER, p_lock_seconds INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_failures  INTEGER;
    v_locked    TIMESTAMPTZ;
BEGIN
    IF p_success THEN
        DELETE FROM login_attempts WHERE player_id = p_player_id;
        RETURN jsonb_build_object('status', 'cleared');
    END IF;

    INSERT INTO login_attempts (player_id, failures)
    VALUES (p_player_id, 1)
    ON CONFLICT (player_id) DO UPDATE SET failures = login_attempts.failures + 1
    RETURNING failures INTO v_failures;

    IF v_failures >= p_max_failures THEN
        v_locked := CURRENT_TIMESTAMP + make_interval(secs => p_lock_seconds);
        UPDATE login_attempts
           SET failures = 0, locked_until = v_locked
         WHERE player_id = p_player_id;
        RETURN jsonb_build_object('status', 'locked', 'locked_until', v_locked);
    END IF;

    RETURN jsonb_build_object('status', 'failed', 'failures', v_failures);
END;
$$;

-- Only the server may call fn_record_login: the anon key is public.
REVOKE EXECUTE ON FUNCTION fn_record_login(INTEGER, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_record_login(INTEGER, BOOLEAN, INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_record_login(INTEGER, BOOLEAN, INTEGER, INTEGER) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new table and function right away.
NOTIFY pgrst, 'reload schema';
