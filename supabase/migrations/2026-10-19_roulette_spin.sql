-- =============================================================================
-- Migration: Roulette spin transaction (SRS-302.2)
-- Author: CL (Cris Luperon)
--
-- Updates an EXISTING database to match supabase/schema.sql for roulette
-- spins. Run it once in the Supabase SQL Editor. It drops nothing, so
-- existing players, balances, and other data are kept. It is safe to run
-- more than once.
--
-- What it changes:
--   1. roulette_bets accepts every bet type in SRS-301.3 (adds Low, High,
--      the three dozens, and the three columns) and only chip-sized amounts
--      (multiples of 5, SRS-301.5).
--   2. Adds fn_spin_roulette(), callable only by the service role.
-- =============================================================================

BEGIN;

-- SRS-301.3: the old inline CHECK only allowed Red/Black/Odd/Even/Number.
ALTER TABLE roulette_bets DROP CONSTRAINT IF EXISTS roulette_bets_bet_type_check;
ALTER TABLE roulette_bets DROP CONSTRAINT IF EXISTS chk_roulette_bets_type;
ALTER TABLE roulette_bets ADD CONSTRAINT chk_roulette_bets_type
    CHECK (bet_type IN ('Number', 'Red', 'Black', 'Odd', 'Even', 'Low', 'High',
                        'Dozen1', 'Dozen2', 'Dozen3', 'Column1', 'Column2', 'Column3'));

-- SRS-301.5: every bet is a sum of 5/10/25/50/100 chips.
ALTER TABLE roulette_bets DROP CONSTRAINT IF EXISTS chk_roulette_bets_chip_amount;
ALTER TABLE roulette_bets ADD CONSTRAINT chk_roulette_bets_chip_amount
    CHECK (amount % 5 = 0);

COMMENT ON COLUMN roulette_bets.payout IS
    'Coins the bet returned: its stake plus winnings on a win, 0 on a loss (SRS-304.1).';

-- Spins the wheel for one player as one transaction (SRS-302.2, SRS-NFR-302):
-- validates the bets, deducts their total, settles each bet against the
-- winning number, credits the returns, and records the spin and its bets.
-- If any step fails, nothing is kept (SRS-302.6).
--   * SRS-302.5: the player's row is locked with NOWAIT, so a second spin
--     sent while the first is still running is rejected as 'busy' instead
--     of queuing up behind it.
--   * SRS-301.10: only Active accounts may spin.
--   * SRS-302.4, SRS-301.5, SRS-301.6: at least one bet, chip-sized
--     amounts, at most 500 coins in total, and no more than the balance.
--   * SRS-301.3, SRS-301.4, SRS-304.1: payouts, with every outside bet
--     losing on 0.
-- The API picks the winning number with a cryptographically secure random
-- number (SRS-302.1, SRS-NFR-5) and passes it in. p_bets is a JSON array of
-- { "type": ..., "number": 0-36 (Number bets only), "amount": ... }.
CREATE OR REPLACE FUNCTION fn_spin_roulette(p_player_id INTEGER, p_bets JSONB, p_winning_number INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    n             INTEGER := p_winning_number;
    v_red         BOOLEAN := p_winning_number = ANY (ARRAY[1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    v_status      VARCHAR(20);
    v_balance     BIGINT;
    v_bet         JSONB;
    v_type        TEXT;
    v_number      INTEGER;
    v_amount      BIGINT;
    v_value       NUMERIC;
    v_wins        BOOLEAN;
    v_payout      BIGINT;
    v_staked      NUMERIC := 0;
    v_returned    BIGINT := 0;
    v_spin_id     INTEGER;
    v_settled     JSONB := '[]'::JSONB;
BEGIN
    IF n IS NULL OR n NOT BETWEEN 0 AND 36 THEN
        RAISE EXCEPTION 'Invalid roulette winning number: %', p_winning_number;
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

    -- First pass: check every bet's shape and add up the stake.
    IF p_bets IS NULL OR jsonb_typeof(p_bets) <> 'array' OR jsonb_array_length(p_bets) = 0 THEN
        RETURN jsonb_build_object('status', 'invalid_bets');
    END IF;

    -- Checked step by step, since SQL doesn't promise to stop at the first
    -- true OR, and a non-numeric value must be rejected before it is cast.
    FOR v_bet IN SELECT value FROM jsonb_array_elements(p_bets) LOOP
        IF jsonb_typeof(v_bet) <> 'object' OR jsonb_typeof(v_bet->'amount') IS DISTINCT FROM 'number' THEN
            RETURN jsonb_build_object('status', 'invalid_bets');
        END IF;

        v_type := v_bet->>'type';
        v_value := (v_bet->>'amount')::NUMERIC;
        IF v_type IS NULL
           OR v_type NOT IN ('Number', 'Red', 'Black', 'Odd', 'Even', 'Low', 'High',
                             'Dozen1', 'Dozen2', 'Dozen3', 'Column1', 'Column2', 'Column3')
           OR v_value <= 0
           OR v_value % 5 <> 0 THEN
            RETURN jsonb_build_object('status', 'invalid_bets');
        END IF;
        v_staked := v_staked + v_value;

        IF v_type = 'Number' THEN
            IF jsonb_typeof(v_bet->'number') IS DISTINCT FROM 'number' THEN
                RETURN jsonb_build_object('status', 'invalid_bets');
            END IF;
            v_value := (v_bet->>'number')::NUMERIC;
            IF v_value NOT BETWEEN 0 AND 36 OR v_value % 1 <> 0 THEN
                RETURN jsonb_build_object('status', 'invalid_bets');
            END IF;
        END IF;
    END LOOP;

    IF v_staked > 500 THEN
        RETURN jsonb_build_object('status', 'over_limit');
    END IF;

    IF v_staked > v_balance THEN
        RETURN jsonb_build_object('status', 'insufficient_balance', 'balance', v_balance);
    END IF;

    INSERT INTO roulette_spins (player_id, winning_number, spun_at)
    VALUES (p_player_id, n, CURRENT_TIMESTAMP)
    RETURNING spin_id INTO v_spin_id;

    -- Second pass: settle and record each bet.
    FOR v_bet IN SELECT value FROM jsonb_array_elements(p_bets) LOOP
        v_type := v_bet->>'type';
        v_amount := (v_bet->>'amount')::BIGINT;
        v_number := CASE WHEN v_type = 'Number' THEN (v_bet->>'number')::INTEGER END;

        v_wins := CASE v_type
            WHEN 'Number'  THEN v_number = n
            WHEN 'Red'     THEN v_red
            WHEN 'Black'   THEN n > 0 AND NOT v_red
            WHEN 'Odd'     THEN n > 0 AND n % 2 = 1
            WHEN 'Even'    THEN n > 0 AND n % 2 = 0
            WHEN 'Low'     THEN n BETWEEN 1 AND 18
            WHEN 'High'    THEN n BETWEEN 19 AND 36
            WHEN 'Dozen1'  THEN n BETWEEN 1 AND 12
            WHEN 'Dozen2'  THEN n BETWEEN 13 AND 24
            WHEN 'Dozen3'  THEN n BETWEEN 25 AND 36
            WHEN 'Column1' THEN n > 0 AND n % 3 = 1
            WHEN 'Column2' THEN n > 0 AND n % 3 = 2
            WHEN 'Column3' THEN n > 0 AND n % 3 = 0
        END;

        -- Stake back plus 35:1, 2:1, or 1:1 (SRS-301.3).
        v_payout := CASE
            WHEN NOT v_wins THEN 0
            WHEN v_type = 'Number' THEN v_amount * 36
            WHEN v_type LIKE 'Dozen%' OR v_type LIKE 'Column%' THEN v_amount * 3
            ELSE v_amount * 2
        END;
        v_returned := v_returned + v_payout;

        INSERT INTO roulette_bets (spin_id, bet_type, bet_number, amount, payout)
        VALUES (v_spin_id, v_type, v_number, v_amount, v_payout);

        v_settled := v_settled || jsonb_build_object('type', v_type, 'number', v_number,
                                                     'amount', v_amount, 'payout', v_payout);
    END LOOP;

    UPDATE players
       SET balance = balance - v_staked::BIGINT + v_returned
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    RETURN jsonb_build_object('status', 'spun',
                              'spin_id', v_spin_id,
                              'winning_number', n,
                              'staked', v_staked::BIGINT,
                              'returned', v_returned,
                              'balance', v_balance,
                              'bets', v_settled);
END;
$$;

-- Only the server may call fn_spin_roulette, for the same reason as
-- fn_open_daily_login_box: the anon key is public.
REVOKE EXECUTE ON FUNCTION fn_spin_roulette(INTEGER, JSONB, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_spin_roulette(INTEGER, JSONB, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_spin_roulette(INTEGER, JSONB, INTEGER) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new function right away.
NOTIFY pgrst, 'reload schema';
