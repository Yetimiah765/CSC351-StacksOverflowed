-- =============================================================================
-- Migration: Persistent poker stacks (UR-007: SRS-7.1 - SRS-7.4, SRS-NFR-019)
-- Author: JN (Jeremiah Nicols)
--
-- Updates an EXISTING database to match supabase/schema.sql for poker seats
-- and stacks. Run it once in the Supabase SQL Editor. It drops nothing, so
-- existing players, balances, and other data are kept. It is safe to run
-- more than once.
--
-- The poker realtime server (server/pokerRealtimeServer.ts) keeps each
-- table in memory while it plays, but from now on poker_seats is the record:
-- a seat and its stack are written when a player sits down, buys back in or
-- leaves, and after every hand — never mid-hand, so a stored stack is always
-- the value from before any hand in progress. When the server starts it
-- rebuilds every table from these rows, which also voids a hand that a
-- restart interrupted (SRS-7.4).
--
-- What it changes:
--   1. poker_tables gets a table_key matching lib/pokerTables.ts ('low-1',
--      ...) and one row for each of the six lobby tables.
--   2. The poker_seats buy-in rule is 50x - 200x the big blind (SRS-NFR-021),
--      as the SRS and the code now say, instead of 40x - 100x.
--   3. Adds fn_poker_join, fn_poker_rebuy, fn_poker_leave,
--      fn_poker_hand_started and fn_poker_hand_finished, callable only by
--      the service role. Each moves coins and seat rows together in one
--      transaction (SRS-NFR-4).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The lobby's tables
-- -----------------------------------------------------------------------------
ALTER TABLE poker_tables ADD COLUMN IF NOT EXISTS table_key VARCHAR(30);
CREATE UNIQUE INDEX IF NOT EXISTS uq_poker_tables_table_key ON poker_tables (table_key);
COMMENT ON COLUMN poker_tables.table_key IS
    'The table''s id in lib/pokerTables.ts and its URL (/poker/low-1), which the realtime server looks rows up by.';

-- Keep in step with POKER_TABLES in lib/pokerTables.ts.
INSERT INTO poker_tables (table_key, table_name, max_seats, small_blind, big_blind) VALUES
    ('low-1',  'Low Stakes 1',  6,  2,  5),
    ('low-2',  'Low Stakes 2',  6,  2,  5),
    ('mid-1',  'Mid Stakes 1',  6,  5, 10),
    ('mid-2',  'Mid Stakes 2',  6,  5, 10),
    ('high-1', 'High Stakes 1', 6, 10, 20),
    ('high-2', 'High Stakes 2', 6, 10, 20)
ON CONFLICT (table_key) DO UPDATE
    SET table_name  = EXCLUDED.table_name,
        max_seats   = EXCLUDED.max_seats,
        small_blind = EXCLUDED.small_blind,
        big_blind   = EXCLUDED.big_blind;

-- -----------------------------------------------------------------------------
-- 2. Buy-ins are 50x - 200x the big blind (SRS-NFR-021)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_poker_seats_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_seats  SMALLINT;
    v_big_blind  INTEGER;
BEGIN
    SELECT max_seats, big_blind
      INTO v_max_seats, v_big_blind
      FROM poker_tables
     WHERE table_id = NEW.table_id;

    IF NEW.seat_number > v_max_seats THEN
        RAISE EXCEPTION 'Seat % does not exist at table % (max % seats)',
            NEW.seat_number, NEW.table_id, v_max_seats;
    END IF;

    IF (TG_OP = 'INSERT'
        OR (OLD.busted_at IS NOT NULL AND NEW.busted_at IS NULL))
       AND NEW.chip_stack NOT BETWEEN 50 * v_big_blind AND 200 * v_big_blind THEN
        RAISE EXCEPTION 'Buy-in of % is outside the allowed range % to %',
            NEW.chip_stack, 50 * v_big_blind, 200 * v_big_blind;
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Sitting down, buying back in, leaving, and saving each hand
-- -----------------------------------------------------------------------------

-- SRS-1.1 - SRS-1.5: sit down. Locks the player's row, so their own
-- requests are handled one at a time; the seat's primary key stops two
-- players taking the same seat. A player sits at one table at a time.
-- Returns { status: 'joined' | 'no_table' | 'not_found' | 'not_active' |
-- 'invalid_buy_in' | 'invalid_seat' | 'already_seated' | 'insufficient_balance'
-- | 'seat_taken', ... }.
CREATE OR REPLACE FUNCTION fn_poker_join(p_table_key VARCHAR, p_player_id INTEGER, p_seat_number INTEGER, p_buy_in BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_table    poker_tables%ROWTYPE;
    v_status   VARCHAR(20);
    v_balance  BIGINT;
    v_seated   VARCHAR(30);
BEGIN
    SELECT * INTO v_table FROM poker_tables WHERE table_key = p_table_key;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'no_table');
    END IF;

    SELECT account_status, balance INTO v_status, v_balance
      FROM players WHERE player_id = p_player_id FOR UPDATE;
    IF v_status IS NULL THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_status <> 'Active' THEN
        RETURN jsonb_build_object('status', 'not_active');
    END IF;

    IF p_buy_in IS NULL OR p_buy_in NOT BETWEEN 50 * v_table.big_blind AND 200 * v_table.big_blind THEN
        RETURN jsonb_build_object('status', 'invalid_buy_in',
                                  'min', 50 * v_table.big_blind, 'max', 200 * v_table.big_blind);
    END IF;
    IF p_seat_number IS NULL OR p_seat_number NOT BETWEEN 1 AND v_table.max_seats THEN
        RETURN jsonb_build_object('status', 'invalid_seat');
    END IF;

    SELECT t.table_key INTO v_seated
      FROM poker_seats s JOIN poker_tables t ON t.table_id = s.table_id
     WHERE s.player_id = p_player_id;
    IF FOUND THEN
        RETURN jsonb_build_object('status', 'already_seated', 'table_key', v_seated);
    END IF;

    IF p_buy_in > v_balance THEN
        RETURN jsonb_build_object('status', 'insufficient_balance', 'balance', v_balance);
    END IF;

    BEGIN
        INSERT INTO poker_seats (table_id, seat_number, player_id, chip_stack)
        VALUES (v_table.table_id, p_seat_number, p_player_id, p_buy_in);
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('status', 'seat_taken');
    END;

    UPDATE players SET balance = balance - p_buy_in
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    RETURN jsonb_build_object('status', 'joined', 'balance', v_balance);
END;
$$;

-- SRS-12.4 - SRS-12.7: a busted player (stack 0) buys back in at their seat.
-- Returns { status: 'rebought' | 'no_table' | 'not_found' | 'not_active' |
-- 'invalid_buy_in' | 'not_seated' | 'not_busted' | 'insufficient_balance', ... }.
CREATE OR REPLACE FUNCTION fn_poker_rebuy(p_table_key VARCHAR, p_player_id INTEGER, p_amount BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_table    poker_tables%ROWTYPE;
    v_status   VARCHAR(20);
    v_balance  BIGINT;
    v_stack    BIGINT;
BEGIN
    SELECT * INTO v_table FROM poker_tables WHERE table_key = p_table_key;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'no_table');
    END IF;

    SELECT account_status, balance INTO v_status, v_balance
      FROM players WHERE player_id = p_player_id FOR UPDATE;
    IF v_status IS NULL THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_status <> 'Active' THEN
        RETURN jsonb_build_object('status', 'not_active');
    END IF;

    IF p_amount IS NULL OR p_amount NOT BETWEEN 50 * v_table.big_blind AND 200 * v_table.big_blind THEN
        RETURN jsonb_build_object('status', 'invalid_buy_in',
                                  'min', 50 * v_table.big_blind, 'max', 200 * v_table.big_blind);
    END IF;

    SELECT chip_stack INTO v_stack
      FROM poker_seats
     WHERE table_id = v_table.table_id AND player_id = p_player_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_seated');
    END IF;
    IF v_stack <> 0 THEN
        RETURN jsonb_build_object('status', 'not_busted');
    END IF;

    IF p_amount > v_balance THEN
        RETURN jsonb_build_object('status', 'insufficient_balance', 'balance', v_balance);
    END IF;

    UPDATE poker_seats SET chip_stack = p_amount, busted_at = NULL
     WHERE table_id = v_table.table_id AND player_id = p_player_id;
    UPDATE players SET balance = balance - p_amount
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    RETURN jsonb_build_object('status', 'rebought', 'balance', v_balance);
END;
$$;

-- SRS-9.9 / SRS-9.10 / SRS-21.1 / SRS-21.3: the player leaves (or is removed),
-- freeing the seat and paying `p_chip_stack` into their balance. That's the
-- stack as the server holds it — less than the stored one if they leave
-- after folding mid-hand, since what they put in stays in the pot.
-- Returns { status: 'left' | 'no_table' | 'not_seated', balance? }.
CREATE OR REPLACE FUNCTION fn_poker_leave(p_table_key VARCHAR, p_player_id INTEGER, p_chip_stack BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_table_id  INTEGER;
    v_balance   BIGINT;
BEGIN
    SELECT table_id INTO v_table_id FROM poker_tables WHERE table_key = p_table_key;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'no_table');
    END IF;
    IF p_chip_stack IS NULL OR p_chip_stack < 0 THEN
        RAISE EXCEPTION 'Invalid chip stack % for player %', p_chip_stack, p_player_id;
    END IF;

    PERFORM 1 FROM players WHERE player_id = p_player_id FOR UPDATE;

    DELETE FROM poker_seats WHERE table_id = v_table_id AND player_id = p_player_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_seated');
    END IF;

    UPDATE players SET balance = balance + p_chip_stack
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    RETURN jsonb_build_object('status', 'left', 'balance', v_balance);
END;
$$;

-- SRS-7.4 / SRS-13.3: a hand has been dealt. Marks it in progress (so a
-- restart before it ends voids it) and records the button and blind seats.
CREATE OR REPLACE FUNCTION fn_poker_hand_started(p_table_key VARCHAR, p_dealer_seat INTEGER,
                                                 p_small_blind_seat INTEGER, p_big_blind_seat INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE poker_tables
       SET hand_in_progress      = TRUE,
           dealer_button_seat    = p_dealer_seat,
           last_small_blind_seat = p_small_blind_seat,
           last_big_blind_seat   = p_big_blind_seat
     WHERE table_key = p_table_key;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'no_table');
    END IF;
    RETURN jsonb_build_object('status', 'started');
END;
$$;

-- SRS-7.2 / SRS-NFR-019: a hand has ended. Saves every listed seat's stack
-- (and missed blinds), marks a player busted when their stack is 0
-- (SRS-12.1), and clears hand_in_progress, all in one transaction.
-- p_seats is a JSON array of { seatNumber, playerId, chipStack,
-- owesSmallBlind, owesBigBlind }.
CREATE OR REPLACE FUNCTION fn_poker_hand_finished(p_table_key VARCHAR, p_seats JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_table_id  INTEGER;
    v_seat      JSONB;
    v_stack     BIGINT;
    v_saved     INTEGER := 0;
BEGIN
    SELECT table_id INTO v_table_id FROM poker_tables WHERE table_key = p_table_key FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'no_table');
    END IF;

    FOR v_seat IN SELECT value FROM jsonb_array_elements(COALESCE(p_seats, '[]'::JSONB)) LOOP
        v_stack := (v_seat->>'chipStack')::BIGINT;
        UPDATE poker_seats
           SET chip_stack       = v_stack,
               busted_at        = CASE WHEN v_stack = 0 THEN COALESCE(busted_at, CURRENT_TIMESTAMP) ELSE NULL END,
               owes_small_blind = COALESCE((v_seat->>'owesSmallBlind')::BOOLEAN, FALSE),
               owes_big_blind   = COALESCE((v_seat->>'owesBigBlind')::BOOLEAN, FALSE)
         WHERE table_id    = v_table_id
           AND seat_number = (v_seat->>'seatNumber')::SMALLINT
           AND player_id   = (v_seat->>'playerId')::INTEGER;
        IF FOUND THEN
            v_saved := v_saved + 1;
        END IF;
    END LOOP;

    UPDATE poker_tables SET hand_in_progress = FALSE WHERE table_id = v_table_id;
    RETURN jsonb_build_object('status', 'saved', 'seats', v_saved);
END;
$$;

-- Only the server may call these, like the other money-moving functions:
-- the anon key is public.
REVOKE EXECUTE ON FUNCTION fn_poker_join(VARCHAR, INTEGER, INTEGER, BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_poker_rebuy(VARCHAR, INTEGER, BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_poker_leave(VARCHAR, INTEGER, BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_poker_hand_started(VARCHAR, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_poker_hand_finished(VARCHAR, JSONB) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_poker_join(VARCHAR, INTEGER, INTEGER, BIGINT) FROM anon, authenticated';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_poker_rebuy(VARCHAR, INTEGER, BIGINT) FROM anon, authenticated';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_poker_leave(VARCHAR, INTEGER, BIGINT) FROM anon, authenticated';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_poker_hand_started(VARCHAR, INTEGER, INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_poker_hand_finished(VARCHAR, JSONB) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_poker_join(VARCHAR, INTEGER, INTEGER, BIGINT) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_poker_rebuy(VARCHAR, INTEGER, BIGINT) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_poker_leave(VARCHAR, INTEGER, BIGINT) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_poker_hand_started(VARCHAR, INTEGER, INTEGER, INTEGER) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_poker_hand_finished(VARCHAR, JSONB) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new column and functions right away.
NOTIFY pgrst, 'reload schema';
