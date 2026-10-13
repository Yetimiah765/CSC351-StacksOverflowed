-- =============================================================================
-- Migration: Daily Login Box (UR-128)
-- Author: JO (James Ortiz)
--
-- Updates an EXISTING database to match supabase/schema.sql for the Daily
-- Login Box. Run it once in the Supabase SQL Editor. Unlike schema.sql, it
-- drops nothing but the unused daily-reward column, so existing players,
-- balances, and other data are kept. It is safe to run more than once.
--
-- What it changes:
--   1. Removes players.last_daily_reward_date and its CHECK. They modelled
--      the old automatic daily reward, and the CHECK blocked a reward on the
--      day an account was created, which SRS-110.2 / SRS-128.3 now require.
--   2. Adds the daily_login_box_claims table.
--   3. Adds fn_open_daily_login_box(), callable only by the service role.
-- =============================================================================

BEGIN;

ALTER TABLE players DROP CONSTRAINT IF EXISTS chk_players_daily_reward_after_creation;
ALTER TABLE players DROP COLUMN IF EXISTS last_daily_reward_date;

-- Table: daily_login_box_claims
-- Reviewed by: JO (James Ortiz)
-- Supports: SRS-110.2, SRS-110.3, SRS-110.4, SRS-128.3, SRS-128.5, SRS-128.8, SRS-128.9, SRS-128.11, SRS-128.12, SRS-128.15, SRS-128.16, SRS-128.18, SRS-128.19, SRS-NFR-108
-- Purpose: Records each Daily Login Box opening with its coin reward and when the player's next box becomes available. A player with no rows can open a box right away.
CREATE TABLE IF NOT EXISTS daily_login_box_claims (
    claim_id            SERIAL       PRIMARY KEY,
    player_id           INTEGER      NOT NULL
                        REFERENCES players(player_id) ON DELETE CASCADE,
    -- SRS-128.5: exactly one of the four reward amounts.
    reward_amount       INTEGER      NOT NULL
                        CHECK (reward_amount IN (25, 50, 75, 100)),
    claimed_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    next_available_at   TIMESTAMPTZ  NOT NULL,

    -- SRS-128.11: the cooldown lasts exactly 24 hours from the claim.
    CONSTRAINT chk_daily_login_box_claims_cooldown
        CHECK (next_available_at = claimed_at + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS ix_daily_login_box_claims_player
    ON daily_login_box_claims (player_id, next_available_at DESC);

-- Opens a player's Daily Login Box as one transaction (SRS-128.9,
-- SRS-NFR-108): checks the player may open it, credits the reward, records
-- the claim, and starts the 24-hour cooldown. If any step fails, nothing is
-- kept and the box stays available (SRS-128.21).
--   * SRS-128.19: the player's row is locked first, so simultaneous
--     requests run one at a time and only the first one can claim.
--   * SRS-128.12: no second claim before next_available_at.
--   * SRS-128.20: only Active accounts may open the box.
-- The API picks the reward with a cryptographically secure random number
-- (lib/dailyLoginBox.ts) and passes it in; this function accepts only the
-- four allowed amounts.
CREATE OR REPLACE FUNCTION fn_open_daily_login_box(p_player_id INTEGER, p_reward INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_status        VARCHAR(20);
    v_available_at  TIMESTAMPTZ;
    v_balance       BIGINT;
    v_claimed_at    TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
    IF p_reward IS NULL OR p_reward NOT IN (25, 50, 75, 100) THEN
        RAISE EXCEPTION 'Invalid Daily Login Box reward: %', p_reward;
    END IF;

    SELECT account_status
      INTO v_status
      FROM players
     WHERE player_id = p_player_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_status <> 'Active' THEN
        RETURN jsonb_build_object('status', 'not_active');
    END IF;

    SELECT MAX(next_available_at)
      INTO v_available_at
      FROM daily_login_box_claims
     WHERE player_id = p_player_id;

    IF v_available_at > v_claimed_at THEN
        RETURN jsonb_build_object('status', 'cooldown',
                                  'next_available_at', v_available_at);
    END IF;

    UPDATE players
       SET balance = balance + p_reward
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    INSERT INTO daily_login_box_claims (player_id, reward_amount, claimed_at, next_available_at)
    VALUES (p_player_id, p_reward, v_claimed_at, v_claimed_at + INTERVAL '24 hours');

    RETURN jsonb_build_object('status', 'opened',
                              'reward', p_reward,
                              'balance', v_balance,
                              'next_available_at', v_claimed_at + INTERVAL '24 hours');
END;
$$;

-- Only the server may call fn_open_daily_login_box. Supabase grants EXECUTE
-- on new functions to its anon and authenticated roles, and the anon key is
-- public (it ships to browsers for the poker page's Realtime connection), so
-- those grants are removed and only the service role keeps access. The role
-- check lets this script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_open_daily_login_box(INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_open_daily_login_box(INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_open_daily_login_box(INTEGER, INTEGER) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new function right away.
NOTIFY pgrst, 'reload schema';
