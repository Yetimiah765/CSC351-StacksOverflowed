-- =============================================================================
-- Migration: Cancel sports wagers (SRS-205.6)
-- Author: SP (Samuel Parker)
--
-- Updates an EXISTING database to match supabase/schema.sql for cancelling
-- sports wagers. Run it once in the Supabase SQL Editor. It keeps every
-- existing wager, player, and balance, and is safe to run more than once.
--
-- What it changes:
--   1. Allows 'Cancelled' as a wager result (a cancelled wager pays back its
--      stake, like a refund).
--   2. Adds fn_cancel_wager(), callable only by the service role.
-- =============================================================================

BEGIN;

-- 1. Replace the result CHECK. schema.sql originally declared it inline
--    without a name, so it is found by its definition rather than by name.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'wagers'::regclass
           AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%''Refunded''%'
           AND conname <> 'chk_wagers_payout_matches_result'
    LOOP
        EXECUTE format('ALTER TABLE wagers DROP CONSTRAINT %I', r.conname);
    END LOOP;
END;
$$;

ALTER TABLE wagers
    ADD CONSTRAINT chk_wagers_result
    CHECK (result IN ('Won', 'Lost', 'Refunded', 'Cancelled'));

ALTER TABLE wagers DROP CONSTRAINT IF EXISTS chk_wagers_payout_matches_result;
ALTER TABLE wagers
    ADD CONSTRAINT chk_wagers_payout_matches_result
    CHECK (result IS NULL
           OR (result = 'Lost'      AND payout = 0)
           OR (result = 'Refunded'  AND payout = amount)
           OR (result = 'Cancelled' AND payout = amount)
           OR (result = 'Won'       AND payout > amount));

-- 2. SRS-205.6: cancels a player's open wager and returns the stake, as one
-- transaction. If any check fails, nothing changes.
--   * The player's row is locked first (the same order as fn_place_wager),
--     so a cancel and a new bet from the same player can't interleave.
--   * Only the player who placed the wager can cancel it.
--   * Only open wagers (no result yet) can be cancelled, so a wager is never
--     refunded twice or cancelled after it was settled.
--   * Cancelling closes 1 hour before the game starts
--     (CANCEL_CUTOFF_MS in lib/sports/wagers.ts).
CREATE OR REPLACE FUNCTION fn_cancel_wager(p_player_id INTEGER, p_wager_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance      BIGINT;
    v_owner        INTEGER;
    v_amount       BIGINT;
    v_result       VARCHAR(10);
    v_start_time   TIMESTAMPTZ;
BEGIN
    SELECT balance
      INTO v_balance
      FROM players
     WHERE player_id = p_player_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    SELECT w.player_id, w.amount, w.result, e.start_time
      INTO v_owner, v_amount, v_result, v_start_time
      FROM wagers w
      JOIN betting_options o ON o.option_id = w.option_id
      JOIN betting_markets m ON m.market_id = o.market_id
      JOIN sports_events e   ON e.event_id = m.event_id
     WHERE w.wager_id = p_wager_id
       FOR UPDATE OF w;

    -- Someone else's wager looks the same as a missing one.
    IF NOT FOUND OR v_owner <> p_player_id THEN
        RETURN jsonb_build_object('status', 'wager_not_found');
    END IF;

    IF v_result IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_settled', 'result', v_result);
    END IF;

    IF CURRENT_TIMESTAMP >= v_start_time - INTERVAL '1 hour' THEN
        RETURN jsonb_build_object('status', 'too_late');
    END IF;

    UPDATE players
       SET balance = balance + v_amount
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    UPDATE wagers
       SET result = 'Cancelled', payout = v_amount, settled_at = CURRENT_TIMESTAMP
     WHERE wager_id = p_wager_id;

    RETURN jsonb_build_object('status', 'cancelled',
                              'wager_id', p_wager_id,
                              'refund', v_amount,
                              'balance', v_balance);
END;
$$;

-- Only the server may call fn_cancel_wager. Supabase grants EXECUTE on new
-- functions to its anon and authenticated roles, and the anon key is public
-- (it ships to browsers for the poker page's Realtime connection), so those
-- grants are removed and only the service role keeps access. The role check
-- lets this script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_cancel_wager(INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_cancel_wager(INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_cancel_wager(INTEGER, INTEGER) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new function right away.
NOTIFY pgrst, 'reload schema';
