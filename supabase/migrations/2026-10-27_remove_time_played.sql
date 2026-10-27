-- =============================================================================
-- Migration: Remove time played (UR-116 removed)
-- Author: JO (James Ortiz)
--
-- Updates an EXISTING database to match supabase/schema.sql. Run it once in
-- the Supabase SQL Editor. It is safe to run more than once.
--
-- What it changes:
--   The platform no longer tracks time played: UR-116 and SRS-116.1 to
--   SRS-116.13 were removed from the SRS on 2026-10-27. This drops the unused
--   player_game_stats.seconds_played column and the check that kept sports
--   betting at zero seconds. Nothing ever wrote to the column; on 2026-10-27
--   every row held 0, so no data is lost. money_won and money_lost are kept.
-- =============================================================================

BEGIN;

ALTER TABLE player_game_stats DROP CONSTRAINT IF EXISTS chk_player_game_stats_no_sports_time;
ALTER TABLE player_game_stats DROP COLUMN IF EXISTS seconds_played;

COMMENT ON TABLE player_game_stats IS
    'Each player''s money won and money lost per game; overall totals are the sum of these rows.';

COMMIT;
