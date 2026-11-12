-- =============================================================================
-- Migration: Save the blackjack round in play in the database
-- Author: HC (Hershey Contreras)
--
-- Updates an EXISTING database to match supabase/schema.sql. Run it once in
-- the Supabase SQL Editor. It is safe to run more than once.
--
-- What it changes:
--   The cards of a blackjack round in play were kept in one server's memory,
--   so on the live site a move that reached another copy of the server found
--   no hand ("You have no hand in play" / "you already have a hand in play").
--   This adds blackjack_hands.round_state, where the round's cards now live
--   while it is played (NULL once it is over), and a unique index so a
--   player has at most one round in play.
--
--   Before the index is made, any player with more than one open round keeps
--   only the newest; the older ones are closed as a Push and their bets are
--   returned to the player's balance (the same as the app does for a round
--   the server lost). Normally there are none.
--
--   Row level security is switched on for the table (the live database
--   already has it on every table), since round_state holds the deck and the
--   dealer's face-down card. The app reads it with the service role key.
-- =============================================================================

BEGIN;

ALTER TABLE blackjack_hands ADD COLUMN IF NOT EXISTS round_state JSONB;

ALTER TABLE blackjack_hands DROP CONSTRAINT IF EXISTS chk_blackjack_hands_state_only_in_play;
ALTER TABLE blackjack_hands ADD CONSTRAINT chk_blackjack_hands_state_only_in_play
    CHECK (completed_at IS NULL OR round_state IS NULL);

-- Return the bets of every open round but each player's newest.
WITH extra AS (
    SELECT hand_id
    FROM (SELECT hand_id,
                 row_number() OVER (PARTITION BY player_id ORDER BY hand_id DESC) AS newest
          FROM blackjack_hands
          WHERE completed_at IS NULL) AS open_rounds
    WHERE newest > 1
),
closed AS (
    UPDATE blackjack_hands AS h
    SET result = 'Push', net_amount = 0, completed_at = CURRENT_TIMESTAMP, round_state = NULL
    FROM extra
    WHERE h.hand_id = extra.hand_id AND h.completed_at IS NULL
    RETURNING h.player_id, h.bet_amount
)
UPDATE players AS p
SET balance = p.balance + returned.total
FROM (SELECT player_id, SUM(bet_amount) AS total FROM closed GROUP BY player_id) AS returned
WHERE p.player_id = returned.player_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_blackjack_hands_one_open_per_player
    ON blackjack_hands (player_id)
    WHERE completed_at IS NULL;

ALTER TABLE blackjack_hands ENABLE ROW LEVEL SECURITY;

COMMIT;
