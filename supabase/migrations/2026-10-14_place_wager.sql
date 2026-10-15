-- =============================================================================
-- Migration: Place sports wagers (SRS-205, SRS-206)
-- Author: SP (Samuel Parker)
--
-- Updates an EXISTING database to match supabase/schema.sql for placing
-- sports wagers. Run it once in the Supabase SQL Editor. It only adds a
-- function, so existing players, balances, and other data are kept. It is
-- safe to run more than once.
--
-- What it changes:
--   1. Adds fn_place_wager(), callable only by the service role.
-- =============================================================================

BEGIN;

-- Places a sports wager as one transaction (SRS-205.1 - SRS-205.3,
-- SRS-NFR-4): takes the stake from the player's balance and records the
-- wager with the odds the player saw. If any check fails, nothing changes.
--   * The player's row is locked first, so simultaneous bets from the same
--     player run one at a time and can never overdraw the balance.
--   * SRS-206.3: at least 50 coins (MIN_WAGER in lib/sports/wagers.ts).
--   * SRS-205.5 / SRS-206.2: only on an open market of a game that hasn't
--     started.
--   * The odds must still equal p_expected_odds (the odds on the player's
--     bet slip); otherwise the player is shown the new odds to confirm.
--   * A bet that couldn't win any coins (payout rounds down to the stake)
--     is refused, since chk_wagers_payout_matches_result needs a winning
--     payout above the stake.
--   * SRS-206.1: the stake can't exceed the player's balance.
CREATE OR REPLACE FUNCTION fn_place_wager(
    p_player_id     INTEGER,
    p_option_id     INTEGER,
    p_amount        BIGINT,
    p_expected_odds NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_account_status  VARCHAR(20);
    v_balance         BIGINT;
    v_odds            NUMERIC(7,3);
    v_market_open     BOOLEAN;
    v_event_status    VARCHAR(20);
    v_start_time      TIMESTAMPTZ;
    v_payout          BIGINT;
    v_wager_id        INTEGER;
    v_placed_at       TIMESTAMPTZ;
BEGIN
    IF p_amount IS NULL OR p_amount < 50 THEN
        RETURN jsonb_build_object('status', 'invalid_amount');
    END IF;

    SELECT account_status, balance
      INTO v_account_status, v_balance
      FROM players
     WHERE player_id = p_player_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_account_status <> 'Active' THEN
        RETURN jsonb_build_object('status', 'not_active');
    END IF;

    -- FOR SHARE keeps the sync from changing these odds until this commits.
    SELECT o.decimal_odds, m.is_open, e.status, e.start_time
      INTO v_odds, v_market_open, v_event_status, v_start_time
      FROM betting_options o
      JOIN betting_markets m ON m.market_id = o.market_id
      JOIN sports_events e   ON e.event_id = m.event_id
     WHERE o.option_id = p_option_id
       FOR SHARE OF o;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'option_not_found');
    END IF;

    IF NOT v_market_open OR v_event_status <> 'Upcoming' OR v_start_time <= CURRENT_TIMESTAMP THEN
        RETURN jsonb_build_object('status', 'closed');
    END IF;

    IF p_expected_odds IS NULL OR v_odds <> p_expected_odds THEN
        RETURN jsonb_build_object('status', 'odds_changed', 'current_odds', v_odds);
    END IF;

    -- Same rounding as potentialPayout() in lib/sports/payout.ts.
    v_payout := FLOOR(p_amount * v_odds);
    IF v_payout <= p_amount THEN
        RETURN jsonb_build_object('status', 'no_profit');
    END IF;

    IF v_balance < p_amount THEN
        RETURN jsonb_build_object('status', 'insufficient_balance', 'balance', v_balance);
    END IF;

    UPDATE players
       SET balance = balance - p_amount
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    INSERT INTO wagers (player_id, option_id, amount, odds_at_placement)
    VALUES (p_player_id, p_option_id, p_amount, v_odds)
    RETURNING wager_id, placed_at INTO v_wager_id, v_placed_at;

    RETURN jsonb_build_object('status', 'placed',
                              'wager_id', v_wager_id,
                              'amount', p_amount,
                              'odds', v_odds,
                              'potential_payout', v_payout,
                              'placed_at', v_placed_at,
                              'balance', v_balance);
END;
$$;

-- Only the server may call fn_place_wager. Supabase grants EXECUTE on new
-- functions to its anon and authenticated roles, and the anon key is public
-- (it ships to browsers for the poker page's Realtime connection), so those
-- grants are removed and only the service role keeps access. The role check
-- lets this script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_place_wager(INTEGER, INTEGER, BIGINT, NUMERIC) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_place_wager(INTEGER, INTEGER, BIGINT, NUMERIC) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_place_wager(INTEGER, INTEGER, BIGINT, NUMERIC) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new function right away.
NOTIFY pgrst, 'reload schema';
