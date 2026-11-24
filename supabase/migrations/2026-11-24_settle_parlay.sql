-- =============================================================================
-- Migration: Settle parlays and pay out (SRS-219.4)
-- Author: SP (Samuel Parker)
--
-- Updates an EXISTING database to match supabase/schema.sql for settling
-- parlays. Run it once in the Supabase SQL Editor, after
-- 2026-11-23_place_parlay.sql. It only adds a function, so existing players,
-- balances, wagers and parlays are kept. It is safe to run more than once.
--
-- What it changes:
--   1. Adds fn_settle_parlay(), callable only by the service role.
-- =============================================================================

BEGIN;

-- Settles one open parlay as one transaction (SRS-219.4): records each leg's
-- result and the parlay's, pays the player, and adds the outcome to their
-- sports-betting stats (SRS-117, SRS-118), like fn_settle_wager. Each leg is
-- graded by lib/sports/settle.ts (decideWager, the same rules as a single
-- bet) and passed in leg order in p_leg_results, NULL for a leg whose game
-- isn't decided yet. The parlay's result and payout are worked out here from
-- the stored stake and odds, the same rules as decideParlay() in
-- lib/sports/parlays.ts:
--   * Lost as soon as any leg is lost (payout 0), even with games to play.
--   * Otherwise it can only be settled once every leg is decided.
--   * Refunded legs drop out; with no leg left the stake comes back
--     (Refunded). Otherwise Won pays FLOOR(stake x the product of the won
--     legs' odds), or the stake back (Refunded) if that rounds down to it.
--   * The player's row is locked before the parlay's (the same order as
--     fn_place_parlay), and a parlay that already has a result is left
--     alone, so it is never paid twice.
--   * SRS-117 / SRS-118: a win adds its profit (payout - stake) to
--     money_won, a loss adds the stake to money_lost, a refund neither.
CREATE OR REPLACE FUNCTION fn_settle_parlay(p_parlay_id INTEGER, p_leg_results VARCHAR[])
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_player_id  INTEGER;
    v_amount     BIGINT;
    v_existing   VARCHAR(10);
    v_leg_count  INTEGER;
    v_won_odds   NUMERIC := 1;
    v_won_legs   INTEGER := 0;
    v_result     VARCHAR(10);
    v_payout     BIGINT;
    v_leg        RECORD;
BEGIN
    SELECT player_id INTO v_player_id FROM parlays WHERE parlay_id = p_parlay_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    PERFORM 1 FROM players WHERE player_id = v_player_id FOR UPDATE;

    SELECT amount, result
      INTO v_amount, v_existing
      FROM parlays
     WHERE parlay_id = p_parlay_id
       FOR UPDATE;

    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_settled', 'result', v_existing);
    END IF;

    SELECT COUNT(*) INTO v_leg_count FROM parlay_legs WHERE parlay_id = p_parlay_id;
    IF COALESCE(array_length(p_leg_results, 1), 0) <> v_leg_count THEN
        RAISE EXCEPTION 'Parlay % has % legs, but % results were given',
            p_parlay_id, v_leg_count, COALESCE(array_length(p_leg_results, 1), 0);
    END IF;

    FOR v_leg IN
        SELECT l.leg_number, l.odds_at_placement, p_leg_results[l.leg_number] AS result
          FROM parlay_legs l
         WHERE l.parlay_id = p_parlay_id
         ORDER BY l.leg_number
    LOOP
        IF v_leg.result IS NOT NULL AND v_leg.result NOT IN ('Won', 'Lost', 'Refunded') THEN
            RAISE EXCEPTION 'Invalid parlay leg result: %', v_leg.result;
        END IF;
        IF v_leg.result = 'Won' THEN
            v_won_odds := v_won_odds * v_leg.odds_at_placement;
            v_won_legs := v_won_legs + 1;
        END IF;
    END LOOP;

    IF 'Lost' = ANY (p_leg_results) THEN
        v_result := 'Lost';
        v_payout := 0;
    ELSIF array_position(p_leg_results, NULL) IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'undecided');
    ELSIF v_won_legs = 0 THEN
        v_result := 'Refunded';
        v_payout := v_amount;
    ELSE
        v_payout := FLOOR(v_amount * v_won_odds);
        IF v_payout > v_amount THEN
            v_result := 'Won';
        ELSE
            v_result := 'Refunded';
            v_payout := v_amount;
        END IF;
    END IF;

    UPDATE parlay_legs
       SET result = p_leg_results[leg_number]
     WHERE parlay_id = p_parlay_id;

    IF v_payout > 0 THEN
        UPDATE players SET balance = balance + v_payout WHERE player_id = v_player_id;
    END IF;

    UPDATE parlays
       SET result = v_result, payout = v_payout, settled_at = CURRENT_TIMESTAMP
     WHERE parlay_id = p_parlay_id;

    IF v_result <> 'Refunded' THEN
        INSERT INTO player_game_stats (player_id, game_code, money_won, money_lost)
        VALUES (v_player_id, 'sports_betting',
                CASE WHEN v_result = 'Won'  THEN v_payout - v_amount ELSE 0 END,
                CASE WHEN v_result = 'Lost' THEN v_amount ELSE 0 END)
        ON CONFLICT (player_id, game_code) DO UPDATE
           SET money_won  = player_game_stats.money_won  + EXCLUDED.money_won,
               money_lost = player_game_stats.money_lost + EXCLUDED.money_lost;
    END IF;

    RETURN jsonb_build_object('status', 'settled',
                              'parlay_id', p_parlay_id,
                              'player_id', v_player_id,
                              'result', v_result,
                              'payout', v_payout);
END;
$$;

-- Only the server may call fn_settle_parlay (the anon key is public).
REVOKE EXECUTE ON FUNCTION fn_settle_parlay(INTEGER, VARCHAR[]) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_settle_parlay(INTEGER, VARCHAR[]) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_settle_parlay(INTEGER, VARCHAR[]) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new function right away.
NOTIFY pgrst, 'reload schema';
