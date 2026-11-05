-- =============================================================================
-- Migration: Wishing Fountain (UR-129)
-- Author: JO (James Ortiz)
--
-- Updates an EXISTING database to match supabase/schema.sql for the lobby's
-- wishing fountain. Run it once in the Supabase SQL Editor. It drops
-- nothing, so existing players, balances, and other data are kept. It is
-- safe to run more than once.
--
-- What it changes:
--   1. Adds the fountain_wishes table, one row per wish.
--   2. Adds fn_make_wish(), callable only by the service role.
-- =============================================================================

BEGIN;

-- Table: fountain_wishes
-- Reviewed by: JO (James Ortiz)
-- Supports: SRS-129.1, SRS-129.2, SRS-129.3
-- Purpose: Records each wish a player makes at the lobby's fountain: the
-- calendar day it was made on (midnight to midnight Eastern time, like the
-- holiday blind boxes), the coin it cost and the coins it returned. A player
-- has at most one wish per day.
CREATE TABLE IF NOT EXISTS fountain_wishes (
    wish_id     SERIAL       PRIMARY KEY,
    player_id   INTEGER      NOT NULL
                REFERENCES players(player_id) ON DELETE CASCADE,
    wish_day    DATE         NOT NULL,
    -- SRS-129.1: a wish costs 1 coin.
    cost        INTEGER      NOT NULL DEFAULT 1
                CHECK (cost = 1),
    -- SRS-129.3: it returns 2 coins, or nothing.
    reward      INTEGER      NOT NULL
                CHECK (reward IN (0, 2)),
    wished_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- SRS-129.2: one wish per player per calendar day, Eastern time.
    CONSTRAINT uq_fountain_wishes_player_day UNIQUE (player_id, wish_day),
    CONSTRAINT chk_fountain_wishes_day
        CHECK (wish_day = (wished_at AT TIME ZONE 'America/New_York')::DATE)
);

-- Like every other table in the live database, only the server (the service
-- role, which bypasses it) can read or write it; the public anon key can't.
ALTER TABLE fountain_wishes ENABLE ROW LEVEL SECURITY;

-- Makes a player's wish as one transaction (SRS-129.3): checks they may
-- wish, takes the coin, returns the reward and records the wish. If any step
-- fails, nothing is kept and the day's wish stays available.
--   * The player's row is locked with NOWAIT, so a second wish sent while
--     the first is still running is rejected as 'busy'.
--   * Only Active accounts may wish.
--   * SRS-129.1: the player needs at least 1 coin.
--   * SRS-129.2: one wish per calendar day, midnight to midnight Eastern
--     time; a second wish that day returns 'already_wished' with when the
--     next one is available.
-- The API decides the reward with a cryptographically secure random number
-- (2 coins with a 60% chance, otherwise 0) and passes it in; this function
-- accepts only 0 or 2. The client never sends a reward.
CREATE OR REPLACE FUNCTION fn_make_wish(p_player_id INTEGER, p_reward INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_status     VARCHAR(20);
    v_balance    BIGINT;
    v_now        TIMESTAMPTZ := CURRENT_TIMESTAMP;
    v_today      DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::DATE;
    v_next_wish  TIMESTAMPTZ := ((CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::DATE + 1)::TIMESTAMP AT TIME ZONE 'America/New_York';
BEGIN
    IF p_reward IS NULL OR p_reward NOT IN (0, 2) THEN
        RAISE EXCEPTION 'Invalid wish reward: %', p_reward;
    END IF;

    BEGIN
        SELECT account_status, balance
          INTO v_status, v_balance
          FROM players
         WHERE player_id = p_player_id
           FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
        RETURN jsonb_build_object('status', 'busy');
    END;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_status <> 'Active' THEN
        RETURN jsonb_build_object('status', 'not_active');
    END IF;

    IF EXISTS (SELECT 1 FROM fountain_wishes WHERE player_id = p_player_id AND wish_day = v_today) THEN
        RETURN jsonb_build_object('status', 'already_wished', 'next_wish_at', v_next_wish);
    END IF;

    IF v_balance < 1 THEN
        RETURN jsonb_build_object('status', 'insufficient_balance', 'balance', v_balance);
    END IF;

    INSERT INTO fountain_wishes (player_id, wish_day, cost, reward, wished_at)
    VALUES (p_player_id, v_today, 1, p_reward, v_now);

    UPDATE players
       SET balance = balance - 1 + p_reward
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    RETURN jsonb_build_object('status', 'wished',
                              'reward', p_reward,
                              'balance', v_balance,
                              'next_wish_at', v_next_wish);
END;
$$;

-- Only the server may call fn_make_wish, for the same reason as
-- fn_open_daily_login_box: the anon key is public.
REVOKE EXECUTE ON FUNCTION fn_make_wish(INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_make_wish(INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_make_wish(INTEGER, INTEGER) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new table and function right away.
NOTIFY pgrst, 'reload schema';
