-- =============================================================================
-- Migration: Cancel a parlay (SRS-219.6)
-- Author: SP (Samuel Parker)
--
-- Updates an EXISTING database to match supabase/schema.sql for cancelling
-- parlays. Run it once in the Supabase SQL Editor, after
-- 2026-11-23_place_parlay.sql. It only adds a function, so existing players,
-- balances, wagers and parlays are kept. It is safe to run more than once.
--
-- What it changes:
--   1. Adds fn_cancel_parlay(), callable only by the service role.
-- =============================================================================

BEGIN;

-- SRS-219.6: cancels a player's open parlay, the whole parlay with every one
-- of its picks, and returns the whole stake, as one transaction. If any
-- check fails, nothing changes. The same rules as fn_cancel_wager:
--   * The player's row is locked first (the same order as fn_place_parlay
--     and fn_settle_parlay), so a cancel can't interleave with a new bet or
--     with the parlay being settled.
--   * Only the player who placed the parlay can cancel it.
--   * Only an open parlay (no result yet) can be cancelled, so it is never
--     refunded twice or cancelled after it was settled.
--   * Cancelling closes 1 hour before the EARLIEST of its games starts
--     (CANCEL_CUTOFF_MS in lib/sports/wagers.ts).
CREATE OR REPLACE FUNCTION fn_cancel_parlay(p_player_id INTEGER, p_parlay_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance      BIGINT;
    v_owner        INTEGER;
    v_amount       BIGINT;
    v_result       VARCHAR(10);
    v_first_start  TIMESTAMPTZ;
BEGIN
    SELECT balance
      INTO v_balance
      FROM players
     WHERE player_id = p_player_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    SELECT player_id, amount, result
      INTO v_owner, v_amount, v_result
      FROM parlays
     WHERE parlay_id = p_parlay_id
       FOR UPDATE;

    -- Someone else's parlay looks the same as a missing one.
    IF NOT FOUND OR v_owner <> p_player_id THEN
        RETURN jsonb_build_object('status', 'parlay_not_found');
    END IF;

    IF v_result IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_settled', 'result', v_result);
    END IF;

    SELECT MIN(e.start_time)
      INTO v_first_start
      FROM parlay_legs l
      JOIN sports_events e ON e.event_id = l.event_id
     WHERE l.parlay_id = p_parlay_id;

    IF v_first_start IS NULL OR CURRENT_TIMESTAMP >= v_first_start - INTERVAL '1 hour' THEN
        RETURN jsonb_build_object('status', 'too_late');
    END IF;

    UPDATE players
       SET balance = balance + v_amount
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    UPDATE parlays
       SET result = 'Cancelled', payout = v_amount, settled_at = CURRENT_TIMESTAMP
     WHERE parlay_id = p_parlay_id;

    RETURN jsonb_build_object('status', 'cancelled',
                              'parlay_id', p_parlay_id,
                              'refund', v_amount,
                              'balance', v_balance);
END;
$$;

-- Only the server may call fn_cancel_parlay (the anon key is public).
REVOKE EXECUTE ON FUNCTION fn_cancel_parlay(INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_cancel_parlay(INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_cancel_parlay(INTEGER, INTEGER) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new function right away.
NOTIFY pgrst, 'reload schema';
