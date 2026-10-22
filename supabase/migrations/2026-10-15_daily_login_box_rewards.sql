-- =============================================================================
-- Migration: Daily Login Box rewards 250 / 500 / 750 / 1,000 (SRS-128.5)
-- Author: JO (James Ortiz)
--
-- Updates an EXISTING database to match supabase/schema.sql. Run it once in
-- the Supabase SQL Editor. It changes only the Daily Login Box's allowed
-- reward amounts; no data is removed, and it is safe to run more than once.
--
-- What it changes:
--   1. The daily_login_box_claims reward CHECK now allows 250, 500, 750, and
--      1,000 coins. The old amounts (25, 50, 75, 100) stay allowed so earlier
--      claims remain valid.
--   2. fn_open_daily_login_box() accepts the new amounts. It still accepts the
--      old ones, so teammates' copies of the app that haven't pulled this
--      change yet keep working instead of failing to open the box.
-- =============================================================================

BEGIN;

-- The original CHECK was written inline, so PostgreSQL named it
-- daily_login_box_claims_reward_amount_check.
ALTER TABLE daily_login_box_claims DROP CONSTRAINT IF EXISTS daily_login_box_claims_reward_amount_check;
ALTER TABLE daily_login_box_claims DROP CONSTRAINT IF EXISTS chk_daily_login_box_claims_reward;
ALTER TABLE daily_login_box_claims ADD CONSTRAINT chk_daily_login_box_claims_reward
    CHECK (reward_amount IN (250, 500, 750, 1000, 25, 50, 75, 100));

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
-- allowed amounts. The app awards 250-1,000 coins (SRS-128.5); 25-100, the
-- amounts before 2026-10-15, are still accepted so copies of the app that
-- haven't pulled the change yet keep working instead of failing to open.
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
    IF p_reward IS NULL OR p_reward NOT IN (250, 500, 750, 1000, 25, 50, 75, 100) THEN
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

-- Ask the Supabase API to pick up the updated function right away.
NOTIFY pgrst, 'reload schema';
