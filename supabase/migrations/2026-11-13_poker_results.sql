-- =============================================================================
-- Migration: Poker money won and lost (SRS-117, SRS-118)
-- Author: JN (Jeremiah Nicols)
--
-- Updates an EXISTING database to match supabase/schema.sql. Run it once in
-- the Supabase SQL Editor. It drops nothing and is safe to run more than once.
--
-- Poker now records its results in player_game_stats, as sports betting and
-- blackjack do, so the profile shows poker's money won and lost and they count
-- in the overall totals. The poker realtime server works out how each player
-- did in each hand (their stack when it ended, or when they left it, less
-- their stack when it was dealt) and passes them to fn_poker_record_results.
-- Buying in, buying back in and cashing out (fn_poker_join / fn_poker_rebuy /
-- fn_poker_leave) only move coins between the balance and the table, so they
-- never count.
-- =============================================================================

BEGIN;

-- Adds each hand's results to the players' poker row: a gain to money_won,
-- a loss to money_lost. p_results is a JSON array of { playerId, net }.
-- Returns { status: 'recorded', results: <how many> }.
CREATE OR REPLACE FUNCTION fn_poker_record_results(p_results JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_result  JSONB;
    v_net     BIGINT;
    v_count   INTEGER := 0;
BEGIN
    FOR v_result IN SELECT value FROM jsonb_array_elements(COALESCE(p_results, '[]'::JSONB)) LOOP
        v_net := (v_result->>'net')::BIGINT;
        IF v_net IS NULL OR v_net = 0 THEN
            CONTINUE;
        END IF;
        INSERT INTO player_game_stats (player_id, game_code, money_won, money_lost)
        VALUES ((v_result->>'playerId')::INTEGER, 'poker', GREATEST(v_net, 0), GREATEST(-v_net, 0))
        ON CONFLICT (player_id, game_code) DO UPDATE
           SET money_won  = player_game_stats.money_won  + EXCLUDED.money_won,
               money_lost = player_game_stats.money_lost + EXCLUDED.money_lost;
        v_count := v_count + 1;
    END LOOP;
    RETURN jsonb_build_object('status', 'recorded', 'results', v_count);
END;
$$;

-- Only the server may call it: the anon key is public.
REVOKE EXECUTE ON FUNCTION fn_poker_record_results(JSONB) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_poker_record_results(JSONB) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_poker_record_results(JSONB) TO service_role';
    END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
