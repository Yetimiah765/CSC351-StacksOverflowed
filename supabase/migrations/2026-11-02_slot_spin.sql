-- =============================================================================
-- Migration: Slot machine spin transaction (SRS-307.2)
-- Author: CL (Cris Luperon)
--
-- Updates an EXISTING database to match supabase/schema.sql for slot spins.
-- Run it once in the Supabase SQL Editor, after
-- 2026-11-02_slot_bet_amounts.sql. It drops nothing, so existing players,
-- balances, and other data are kept. It is safe to run more than once.
--
-- What it changes:
--   1. slot_spins records the three reel symbols (SRS-309.6).
--   2. Adds fn_spin_slots(), callable only by the service role.
-- =============================================================================

BEGIN;

-- SRS-309.6: each spin records the symbol on each reel. Added without NOT
-- NULL first, so a database that already holds spins can still take the
-- columns; NOT NULL is added below only when no old spin lacks them.
ALTER TABLE slot_spins ADD COLUMN IF NOT EXISTS reel_1 VARCHAR(10);
ALTER TABLE slot_spins ADD COLUMN IF NOT EXISTS reel_2 VARCHAR(10);
ALTER TABLE slot_spins ADD COLUMN IF NOT EXISTS reel_3 VARCHAR(10);

ALTER TABLE slot_spins DROP CONSTRAINT IF EXISTS chk_slot_spins_reels;
ALTER TABLE slot_spins ADD CONSTRAINT chk_slot_spins_reels
    CHECK (reel_1 IN ('Cherry', 'Lemon', 'Orange', 'Bell', 'Bar', 'Seven')
       AND reel_2 IN ('Cherry', 'Lemon', 'Orange', 'Bell', 'Bar', 'Seven')
       AND reel_3 IN ('Cherry', 'Lemon', 'Orange', 'Bell', 'Bar', 'Seven'));

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM slot_spins WHERE reel_1 IS NULL OR reel_2 IS NULL OR reel_3 IS NULL) THEN
        ALTER TABLE slot_spins ALTER COLUMN reel_1 SET NOT NULL;
        ALTER TABLE slot_spins ALTER COLUMN reel_2 SET NOT NULL;
        ALTER TABLE slot_spins ALTER COLUMN reel_3 SET NOT NULL;
    END IF;
END;
$$;

COMMENT ON COLUMN slot_spins.payout IS
    'Coins the spin paid: the bet times the matched paytable row''s multiplier, or 0 (SRS-309.1).';

-- Spins the slot machine for one player as one transaction (SRS-307.2):
-- validates the bet, deducts it, turns the three reel rolls into symbols,
-- pays the matching paytable row, records the spin, and credits the payout.
-- If any step fails, nothing is kept.
--   * SRS-307.4: the player's row is locked with NOWAIT, so a second spin
--     sent while the first is still running is rejected as 'busy'.
--   * SRS-306.5: only Active accounts may spin.
--   * SRS-306.2, SRS-306.3: the bet must be one of slot_bet_amounts and no
--     more than the balance.
--   * SRS-307.1: each roll (0-31) maps to a symbol with the SRS's odds out
--     of 32: Cherry 10, Lemon 8, Orange 6, Bell 4, Bar 3, Seven 1.
--   * SRS-309.1 - SRS-309.3: at most one paytable row pays, as a multiple of
--     the bet.
-- The API draws the rolls with a cryptographically secure random number
-- generator (SRS-307.1) and passes them in; the client never sends symbols
-- or a payout (SRS-307.3).
CREATE OR REPLACE FUNCTION fn_spin_slots(p_player_id INTEGER, p_bet INTEGER, p_rolls INTEGER[])
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_status      VARCHAR(20);
    v_balance     BIGINT;
    v_roll        INTEGER;
    v_reels       TEXT[] := ARRAY[]::TEXT[];
    v_multiplier  INTEGER;
    v_payout      BIGINT;
    v_spin_id     INTEGER;
BEGIN
    IF p_rolls IS NULL OR cardinality(p_rolls) <> 3 THEN
        RAISE EXCEPTION 'A slot spin needs exactly three reel rolls';
    END IF;

    FOREACH v_roll IN ARRAY p_rolls LOOP
        IF v_roll IS NULL OR v_roll NOT BETWEEN 0 AND 31 THEN
            RAISE EXCEPTION 'Invalid reel roll: %', v_roll;
        END IF;
        v_reels := v_reels || CASE
            WHEN v_roll < 10 THEN 'Cherry'
            WHEN v_roll < 18 THEN 'Lemon'
            WHEN v_roll < 24 THEN 'Orange'
            WHEN v_roll < 28 THEN 'Bell'
            WHEN v_roll < 31 THEN 'Bar'
            ELSE 'Seven'
        END;
    END LOOP;

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

    IF p_bet IS NULL OR NOT EXISTS (SELECT 1 FROM slot_bet_amounts WHERE bet_amount = p_bet) THEN
        RETURN jsonb_build_object('status', 'invalid_bet');
    END IF;

    IF p_bet > v_balance THEN
        RETURN jsonb_build_object('status', 'insufficient_balance', 'balance', v_balance);
    END IF;

    v_multiplier := CASE
        WHEN v_reels[1] = v_reels[2] AND v_reels[2] = v_reels[3] THEN
            CASE v_reels[1]
                WHEN 'Seven'  THEN 200
                WHEN 'Bar'    THEN 100
                WHEN 'Bell'   THEN 50
                WHEN 'Orange' THEN 20
                WHEN 'Lemon'  THEN 10
                ELSE 6
            END
        WHEN v_reels[1] = 'Cherry' AND v_reels[2] = 'Cherry' THEN 4
        ELSE 0
    END;
    v_payout := p_bet::BIGINT * v_multiplier;

    INSERT INTO slot_spins (player_id, bet_amount, reel_1, reel_2, reel_3, payout, spun_at)
    VALUES (p_player_id, p_bet, v_reels[1], v_reels[2], v_reels[3], v_payout, CURRENT_TIMESTAMP)
    RETURNING spin_id INTO v_spin_id;

    UPDATE players
       SET balance = balance - p_bet + v_payout
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    RETURN jsonb_build_object('status', 'spun',
                              'spin_id', v_spin_id,
                              'reels', to_jsonb(v_reels),
                              'bet', p_bet,
                              'multiplier', v_multiplier,
                              'payout', v_payout,
                              'balance', v_balance);
END;
$$;

-- Only the server may call fn_spin_slots, for the same reason as
-- fn_spin_roulette: the anon key is public.
REVOKE EXECUTE ON FUNCTION fn_spin_slots(INTEGER, INTEGER, INTEGER[]) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_spin_slots(INTEGER, INTEGER, INTEGER[]) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_spin_slots(INTEGER, INTEGER, INTEGER[]) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new function right away.
NOTIFY pgrst, 'reload schema';
