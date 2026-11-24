-- =============================================================================
-- Migration: Place parlays (SRS-219.3, SRS-219.1, SRS-219.2, SRS-219.5)
-- Author: SP (Samuel Parker)
--
-- Updates an EXISTING database to match supabase/schema.sql for placing
-- parlays. Run it once in the Supabase SQL Editor. It only adds two new
-- tables and a function, so existing players, balances, wagers and other
-- data are kept. It is safe to run more than once.
--
-- What it changes:
--   1. Adds the parlays table (one row per parlay: stake, combined odds,
--      potential payout, and later its result).
--   2. Adds the parlay_legs table (one row per pick in a parlay, with the
--      odds it was placed at).
--   3. Locks both tables away from the public API, like wagers
--      (2026-11-19_wagers_rls.sql): RLS on, a restrictive deny-all policy for
--      anon and authenticated, and their privileges revoked.
--   4. Adds fn_place_parlay(), callable only by the service role.
-- =============================================================================

BEGIN;

-- SRS-219.3: one row per parlay. result/payout/settled_at stay NULL while it
-- is open; settling a parlay (SRS-219.4) and cancelling one (SRS-219.6) fill
-- them in, with the same rules as wagers.
CREATE TABLE IF NOT EXISTS parlays (
    parlay_id           SERIAL       PRIMARY KEY,
    player_id           INTEGER      NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    -- Whole coins, at least 1 (fn_place_parlay asks for at least 50).
    amount              BIGINT       NOT NULL
                        CHECK (amount > 0),
    -- SRS-219.2: the exact product of the legs' odds when it was placed
    -- (NUMERIC with no scale, so nothing is rounded off).
    combined_odds       NUMERIC      NOT NULL
                        CHECK (combined_odds > 1),
    -- FLOOR(amount * combined_odds), frozen at placement.
    potential_payout    BIGINT       NOT NULL,
    placed_at           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    result              VARCHAR(10)
                        CONSTRAINT chk_parlays_result
                        CHECK (result IN ('Won', 'Lost', 'Refunded', 'Cancelled')),
    payout              BIGINT,
    settled_at          TIMESTAMPTZ,
    -- NULL until the player dismisses the results pop-up showing it.
    result_seen_at      TIMESTAMPTZ,

    CONSTRAINT chk_parlays_payout_above_stake
        CHECK (potential_payout > amount),

    CONSTRAINT chk_parlays_settlement_complete
        CHECK ((result IS NULL AND payout IS NULL AND settled_at IS NULL)
               OR (result IS NOT NULL AND payout IS NOT NULL AND settled_at IS NOT NULL)),

    -- Lost pays 0; refunded and cancelled return the stake; a win pays more
    -- than the stake (less than potential_payout if a leg was refunded).
    CONSTRAINT chk_parlays_payout_matches_result
        CHECK (result IS NULL
               OR (result = 'Lost'      AND payout = 0)
               OR (result = 'Refunded'  AND payout = amount)
               OR (result = 'Cancelled' AND payout = amount)
               OR (result = 'Won'       AND payout > amount AND payout <= potential_payout))
);

CREATE INDEX IF NOT EXISTS idx_parlays_player ON parlays (player_id, placed_at DESC);

-- SRS-219.3: one row per pick. event_id is the pick's game, kept here so the
-- database itself refuses two picks from one game (SRS-219.5).
CREATE TABLE IF NOT EXISTS parlay_legs (
    parlay_id           INTEGER      NOT NULL REFERENCES parlays(parlay_id) ON DELETE CASCADE,
    -- SRS-219.1: 1 to 10, in the order the player picked them.
    leg_number          SMALLINT     NOT NULL
                        CHECK (leg_number BETWEEN 1 AND 10),
    option_id           INTEGER      NOT NULL
                        REFERENCES betting_options(option_id) ON DELETE RESTRICT,
    event_id            INTEGER      NOT NULL
                        REFERENCES sports_events(event_id) ON DELETE RESTRICT,
    odds_at_placement   NUMERIC(7,3) NOT NULL
                        CHECK (odds_at_placement > 1),
    -- NULL until the leg's game is settled (SRS-219.4).
    result              VARCHAR(10)
                        CONSTRAINT chk_parlay_legs_result
                        CHECK (result IN ('Won', 'Lost', 'Refunded')),

    PRIMARY KEY (parlay_id, leg_number),
    CONSTRAINT uq_parlay_legs_option UNIQUE (parlay_id, option_id),
    CONSTRAINT uq_parlay_legs_event  UNIQUE (parlay_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_parlay_legs_option ON parlay_legs (option_id);

-- Row Level Security, as for wagers: the app reaches these tables only with
-- the service-role key, which bypasses RLS, so nothing changes for it. The
-- anon key ships to every browser, so anon (and authenticated, which anyone
-- can become by signing up to Supabase Auth with that key) get no rows, and
-- no privileges either.
ALTER TABLE parlays     ENABLE ROW LEVEL SECURITY;
ALTER TABLE parlay_legs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parlays: no access from the public API" ON parlays;
DROP POLICY IF EXISTS "parlay_legs: no access from the public API" ON parlay_legs;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'CREATE POLICY "parlays: no access from the public API" ON parlays AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
        EXECUTE 'CREATE POLICY "parlay_legs: no access from the public API" ON parlay_legs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
        EXECUTE 'REVOKE ALL ON parlays FROM anon, authenticated';
        EXECUTE 'REVOKE ALL ON parlay_legs FROM anon, authenticated';
        EXECUTE 'REVOKE ALL ON SEQUENCE parlays_parlay_id_seq FROM anon, authenticated';
    END IF;
END;
$$;

-- Places a parlay as one transaction (SRS-219.3): takes the stake from the
-- player's balance and records the parlay and its legs with the odds the
-- player saw. If any check fails, nothing changes. Every rule the bet slip
-- shows is checked again here, since the slip can't be trusted and the odds
-- or a game can change at any moment:
--   * at least 50 coins, as for a single bet (MIN_WAGER);
--   * SRS-219.1: 2 to 10 picks, each picked once;
--   * the player's row is locked first, as fn_place_wager does, so bets
--     from the same player run one at a time and can't overdraw;
--   * every pick is on an open market of a game that hasn't started;
--   * SRS-219.5: no two picks from the same game;
--   * every pick's odds still equal the ones on the slip; if any moved, the
--     player is shown the new odds (all of them at once) to confirm;
--   * SRS-219.2: the payout is FLOOR(stake * the exact product of the odds),
--     the same as parlayPayout() in lib/sports/parlays.ts, and must be more
--     than the stake;
--   * the stake can't exceed the balance.
CREATE OR REPLACE FUNCTION fn_place_parlay(
    p_player_id     INTEGER,
    p_amount        BIGINT,
    p_option_ids    INTEGER[],
    p_expected_odds NUMERIC[]
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_account_status  VARCHAR(20);
    v_balance         BIGINT;
    v_count           INTEGER;
    v_leg             RECORD;
    v_event_ids       INTEGER[] := '{}';
    v_odds            NUMERIC[] := '{}';
    v_changes         JSONB := '[]'::JSONB;
    v_combined        NUMERIC := 1;
    v_payout          BIGINT;
    v_parlay_id       INTEGER;
    v_placed_at       TIMESTAMPTZ;
BEGIN
    IF p_amount IS NULL OR p_amount < 50 THEN
        RETURN jsonb_build_object('status', 'invalid_amount');
    END IF;

    v_count := COALESCE(array_length(p_option_ids, 1), 0);
    IF v_count < 2 OR v_count > 10
       OR COALESCE(array_length(p_expected_odds, 1), 0) <> v_count
       OR array_position(p_option_ids, NULL) IS NOT NULL
       OR (SELECT COUNT(DISTINCT id) FROM unnest(p_option_ids) AS id) <> v_count THEN
        RETURN jsonb_build_object('status', 'invalid_legs');
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
    -- (Locked here rather than below, where the left join would forbid it.)
    PERFORM 1 FROM betting_options WHERE option_id = ANY (p_option_ids) FOR SHARE;

    -- Each pick in order; a missing option comes back with no odds.
    FOR v_leg IN
        SELECT p.ord, p.option_id, p_expected_odds[p.ord] AS expected,
               o.decimal_odds, m.is_open, e.event_id, e.status, e.start_time
          FROM unnest(p_option_ids) WITH ORDINALITY AS p(option_id, ord)
          LEFT JOIN betting_options o ON o.option_id = p.option_id
          LEFT JOIN betting_markets m ON m.market_id = o.market_id
          LEFT JOIN sports_events e   ON e.event_id = m.event_id
         ORDER BY p.ord
    LOOP
        IF v_leg.decimal_odds IS NULL THEN
            RETURN jsonb_build_object('status', 'option_not_found', 'option_id', v_leg.option_id);
        END IF;

        IF NOT v_leg.is_open OR v_leg.status <> 'Upcoming' OR v_leg.start_time <= CURRENT_TIMESTAMP THEN
            RETURN jsonb_build_object('status', 'closed', 'option_id', v_leg.option_id);
        END IF;

        IF v_leg.event_id = ANY (v_event_ids) THEN
            RETURN jsonb_build_object('status', 'same_game', 'option_id', v_leg.option_id);
        END IF;
        v_event_ids := v_event_ids || v_leg.event_id;

        IF v_leg.expected IS NULL OR v_leg.decimal_odds <> v_leg.expected THEN
            v_changes := v_changes || jsonb_build_object('option_id', v_leg.option_id,
                                                         'current_odds', v_leg.decimal_odds);
        END IF;

        v_odds := v_odds || v_leg.decimal_odds;
        v_combined := v_combined * v_leg.decimal_odds;
    END LOOP;

    IF jsonb_array_length(v_changes) > 0 THEN
        RETURN jsonb_build_object('status', 'odds_changed', 'changes', v_changes);
    END IF;

    -- Same rounding as parlayPayout() in lib/sports/parlays.ts.
    v_payout := FLOOR(p_amount * v_combined);
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

    INSERT INTO parlays (player_id, amount, combined_odds, potential_payout)
    VALUES (p_player_id, p_amount, v_combined, v_payout)
    RETURNING parlay_id, placed_at INTO v_parlay_id, v_placed_at;

    INSERT INTO parlay_legs (parlay_id, leg_number, option_id, event_id, odds_at_placement)
    SELECT v_parlay_id, i, p_option_ids[i], v_event_ids[i], v_odds[i]
      FROM generate_series(1, v_count) AS i;

    RETURN jsonb_build_object('status', 'placed',
                              'parlay_id', v_parlay_id,
                              'amount', p_amount,
                              'combined_odds', v_combined,
                              'potential_payout', v_payout,
                              'placed_at', v_placed_at,
                              'balance', v_balance);
END;
$$;

-- Only the server may call fn_place_parlay (the anon key is public).
REVOKE EXECUTE ON FUNCTION fn_place_parlay(INTEGER, BIGINT, INTEGER[], NUMERIC[]) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_place_parlay(INTEGER, BIGINT, INTEGER[], NUMERIC[]) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_place_parlay(INTEGER, BIGINT, INTEGER[], NUMERIC[]) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new tables and function right away.
NOTIFY pgrst, 'reload schema';
