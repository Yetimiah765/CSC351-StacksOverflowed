-- =============================================================================
-- Migration: Slot machine bet amounts (SRS-306.1)
-- Author: CL (Cris Luperon)
--
-- Updates an EXISTING database to match supabase/schema.sql for the slot
-- machine's bet amounts. Run it once in the Supabase SQL Editor. It drops
-- nothing and is safe to run more than once.
--
-- What it changes:
--   1. Fills slot_bet_amounts with the five bets a player may choose
--      before a spin: 5, 10, 25, 50, and 100 coins.
-- =============================================================================

BEGIN;

INSERT INTO slot_bet_amounts (bet_amount)
VALUES (5), (10), (25), (50), (100)
ON CONFLICT (bet_amount) DO NOTHING;

COMMIT;
