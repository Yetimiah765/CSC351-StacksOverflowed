-- =============================================================================
-- Migration: Settle sports wagers and pay out (SRS-209, SRS-210)
-- Author: SP (Samuel Parker)
--
-- Updates an EXISTING database to match supabase/schema.sql for settling
-- sports wagers. Run it once in the Supabase SQL Editor. It keeps every
-- existing wager, player, and balance, and is safe to run more than once.
--
-- What it changes:
--   1. Adds wagers.result_seen_at, set once the player has seen a settled
--      wager's result in the results pop-up.
--   2. Adds fn_settle_wager(), callable only by the service role.
-- =============================================================================

BEGIN;

-- 1. NULL until the player dismisses the results pop-up that shows this
--    wager's result (SRS-209.1, SRS-210.2, SRS-210.4).
ALTER TABLE wagers ADD COLUMN IF NOT EXISTS result_seen_at TIMESTAMPTZ;

-- 2. Settles one open wager as one transaction (SRS-209.1, SRS-210.1,
-- SRS-210.3, SRS-NFR-4): records the result, pays the player, and adds the
-- outcome to their sports-betting stats (SRS-117, SRS-118). The result is
-- worked out by lib/sports/settle.ts from the final score and the market's
-- rules; the payout is worked out here from the stored stake and odds, so
-- the amount paid always matches the wager.
--   * Won pays FLOOR(stake x odds at placement), the same rounding as
--     potentialPayout() in lib/sports/payout.ts; Refunded returns the stake;
--     Lost pays nothing.
--   * The player's row is locked before the wager's (the same order as
--     fn_place_wager and fn_cancel_wager), and a wager that already has a
--     result is left alone, so a wager is never paid twice.
--   * SRS-117 / SRS-118: a win adds its profit (payout - stake) to
--     money_won, a loss adds the stake to money_lost, and a refund adds to
--     neither.
CREATE OR REPLACE FUNCTION fn_settle_wager(p_wager_id INTEGER, p_result VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_player_id  INTEGER;
    v_amount     BIGINT;
    v_odds       NUMERIC(7,3);
    v_existing   VARCHAR(10);
    v_payout     BIGINT;
BEGIN
    IF p_result IS NULL OR p_result NOT IN ('Won', 'Lost', 'Refunded') THEN
        RAISE EXCEPTION 'Invalid wager result: %', p_result;
    END IF;

    SELECT player_id INTO v_player_id FROM wagers WHERE wager_id = p_wager_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    PERFORM 1 FROM players WHERE player_id = v_player_id FOR UPDATE;

    SELECT amount, odds_at_placement, result
      INTO v_amount, v_odds, v_existing
      FROM wagers
     WHERE wager_id = p_wager_id
       FOR UPDATE;

    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_settled', 'result', v_existing);
    END IF;

    v_payout := CASE p_result
                    WHEN 'Won'      THEN FLOOR(v_amount * v_odds)
                    WHEN 'Refunded' THEN v_amount
                    ELSE 0
                END;

    IF v_payout > 0 THEN
        UPDATE players SET balance = balance + v_payout WHERE player_id = v_player_id;
    END IF;

    UPDATE wagers
       SET result = p_result, payout = v_payout, settled_at = CURRENT_TIMESTAMP
     WHERE wager_id = p_wager_id;

    IF p_result <> 'Refunded' THEN
        INSERT INTO player_game_stats (player_id, game_code, money_won, money_lost)
        VALUES (v_player_id, 'sports_betting',
                CASE WHEN p_result = 'Won'  THEN v_payout - v_amount ELSE 0 END,
                CASE WHEN p_result = 'Lost' THEN v_amount ELSE 0 END)
        ON CONFLICT (player_id, game_code) DO UPDATE
           SET money_won  = player_game_stats.money_won  + EXCLUDED.money_won,
               money_lost = player_game_stats.money_lost + EXCLUDED.money_lost;
    END IF;

    RETURN jsonb_build_object('status', 'settled',
                              'wager_id', p_wager_id,
                              'player_id', v_player_id,
                              'result', p_result,
                              'payout', v_payout);
END;
$$;

-- Only the server may call fn_settle_wager. Supabase grants EXECUTE on new
-- functions to its anon and authenticated roles, and the anon key is public
-- (it ships to browsers for the poker page's Realtime connection), so those
-- grants are removed and only the service role keeps access. The role check
-- lets this script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_settle_wager(INTEGER, VARCHAR) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_settle_wager(INTEGER, VARCHAR) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_settle_wager(INTEGER, VARCHAR) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new column and function right away.
NOTIFY pgrst, 'reload schema';
