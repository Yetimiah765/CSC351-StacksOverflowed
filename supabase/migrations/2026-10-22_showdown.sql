-- =============================================================================
-- Migration: The Showdown, public bets (SRS-212, SRS-213, SRS-214)
-- Author: SP (Samuel Parker)
--
-- Updates an EXISTING database to match supabase/schema.sql for The
-- Showdown: one featured public bet per sport, where players back one team
-- and the winning side splits the whole pool. Run it once in the Supabase SQL
-- Editor. It keeps all existing data and is safe to run more than once.
--
-- What it changes:
--   1. public_bets: when it was picked, and the winning team once settled.
--   2. public_bet_entries: when an entry was last topped up, and whether the
--      player has seen its result in the results pop-up.
--   3. Adds fn_join_showdown() and fn_settle_showdown(), callable only by
--      the service role.
-- =============================================================================

BEGIN;

-- 1.
ALTER TABLE public_bets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public_bets ADD COLUMN IF NOT EXISTS winning_team_id INTEGER REFERENCES teams(team_id);

-- 2.
ALTER TABLE public_bet_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE public_bet_entries ADD COLUMN IF NOT EXISTS result_seen_at TIMESTAMPTZ;

-- 3a. Joins or tops up a player's Showdown entry as one transaction
-- (SRS-212.1, SRS-NFR-4): takes the coins and records the entry.
--   * SRS-212.2: a player backs one team only. A second bet on the same team
--     adds to the entry (a top-up); a bet on the other team is refused.
--   * SRS-212.3: only while the public bet is open and its game hasn't
--     started.
--   * At least 50 coins (MIN_WAGER in lib/sports/wagers.ts), and never more
--     than the player's balance.
--   * The public bet's row is locked (shared) before the player's, the same
--     order as fn_settle_showdown, so a join and a settlement can't deadlock.
CREATE OR REPLACE FUNCTION fn_join_showdown(
    p_player_id      INTEGER,
    p_public_bet_id  INTEGER,
    p_team_id        INTEGER,
    p_amount         BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_outcome         VARCHAR(10);
    v_event_status    VARCHAR(20);
    v_start_time      TIMESTAMPTZ;
    v_home_team_id    INTEGER;
    v_away_team_id    INTEGER;
    v_account_status  VARCHAR(20);
    v_balance         BIGINT;
    v_existing_team   INTEGER;
    v_entry_amount    BIGINT;
BEGIN
    IF p_amount IS NULL OR p_amount < 50 THEN
        RETURN jsonb_build_object('status', 'invalid_amount');
    END IF;

    SELECT pb.outcome, e.status, e.start_time, e.home_team_id, e.away_team_id
      INTO v_outcome, v_event_status, v_start_time, v_home_team_id, v_away_team_id
      FROM public_bets pb
      JOIN sports_events e ON e.event_id = pb.event_id
     WHERE pb.public_bet_id = p_public_bet_id
       FOR SHARE OF pb;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'showdown_not_found');
    END IF;

    IF v_outcome <> 'Pending' OR v_event_status <> 'Upcoming' OR v_start_time <= CURRENT_TIMESTAMP THEN
        RETURN jsonb_build_object('status', 'closed');
    END IF;

    IF p_team_id IS NULL OR p_team_id NOT IN (v_home_team_id, v_away_team_id) THEN
        RETURN jsonb_build_object('status', 'invalid_team');
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

    SELECT team_id
      INTO v_existing_team
      FROM public_bet_entries
     WHERE public_bet_id = p_public_bet_id
       AND player_id = p_player_id
       FOR UPDATE;

    IF FOUND AND v_existing_team <> p_team_id THEN
        RETURN jsonb_build_object('status', 'other_side', 'team_id', v_existing_team);
    END IF;

    IF v_balance < p_amount THEN
        RETURN jsonb_build_object('status', 'insufficient_balance', 'balance', v_balance);
    END IF;

    UPDATE players
       SET balance = balance - p_amount
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    INSERT INTO public_bet_entries (public_bet_id, player_id, team_id, amount)
    VALUES (p_public_bet_id, p_player_id, p_team_id, p_amount)
    ON CONFLICT (public_bet_id, player_id) DO UPDATE
       SET amount = public_bet_entries.amount + EXCLUDED.amount,
           updated_at = CURRENT_TIMESTAMP
    RETURNING amount INTO v_entry_amount;

    RETURN jsonb_build_object('status', 'joined',
                              'team_id', p_team_id,
                              'added', p_amount,
                              'entry_amount', v_entry_amount,
                              'balance', v_balance);
END;
$$;

-- 3b. Settles a Showdown and pays everyone, as one transaction (SRS-214,
-- SRS-NFR-4). p_winning_team_id is the team that won the game, or NULL when
-- it can't be decided (tie, canceled, postponed, or no result).
--   * SRS-214.1 / SRS-214.2: each winner gets their stake x whole pool /
--     winning side's total, rounded down (exact whole-number division). The coins lost
--     to rounding go to the winning side's biggest bettor (earliest entry on
--     a tie), so exactly the whole pool is paid out.
--   * SRS-214.3: everyone gets their stake back when there's no winner, or
--     when nobody backed the winning team.
--   * SRS-117 / SRS-118: profit adds to money_won and a lost stake to
--     money_lost in each player's sports-betting stats; refunds add to
--     neither.
--   * The public bet's row is locked first and must still be Pending, so a
--     Showdown is never paid twice. Players are then locked in player_id
--     order.
CREATE OR REPLACE FUNCTION fn_settle_showdown(p_public_bet_id INTEGER, p_winning_team_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_outcome     VARCHAR(10);
    v_pool        BIGINT;
    v_win_total   BIGINT := 0;
    v_refund      BOOLEAN;
    v_leftover    BIGINT;
    v_entries     INTEGER;
    r             RECORD;
BEGIN
    SELECT outcome INTO v_outcome FROM public_bets WHERE public_bet_id = p_public_bet_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_outcome <> 'Pending' THEN
        RETURN jsonb_build_object('status', 'already_settled', 'outcome', v_outcome);
    END IF;

    SELECT COALESCE(SUM(amount), 0), COUNT(*)
      INTO v_pool, v_entries
      FROM public_bet_entries
     WHERE public_bet_id = p_public_bet_id;

    IF p_winning_team_id IS NOT NULL THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_win_total
          FROM public_bet_entries
         WHERE public_bet_id = p_public_bet_id
           AND team_id = p_winning_team_id;
    END IF;

    v_refund := p_winning_team_id IS NULL OR v_win_total = 0;

    IF v_refund THEN
        UPDATE public_bet_entries SET payout = amount WHERE public_bet_id = p_public_bet_id;
    ELSE
        UPDATE public_bet_entries
           SET payout = CASE WHEN team_id = p_winning_team_id
                             THEN div(amount::NUMERIC * v_pool, v_win_total)
                             ELSE 0
                        END
         WHERE public_bet_id = p_public_bet_id;

        SELECT v_pool - COALESCE(SUM(payout), 0)
          INTO v_leftover
          FROM public_bet_entries
         WHERE public_bet_id = p_public_bet_id;

        IF v_leftover > 0 THEN
            UPDATE public_bet_entries
               SET payout = payout + v_leftover
             WHERE entry_id = (SELECT entry_id
                                 FROM public_bet_entries
                                WHERE public_bet_id = p_public_bet_id
                                  AND team_id = p_winning_team_id
                                ORDER BY amount DESC, placed_at, entry_id
                                LIMIT 1);
        END IF;
    END IF;

    FOR r IN
        SELECT player_id, amount, payout
          FROM public_bet_entries
         WHERE public_bet_id = p_public_bet_id
         ORDER BY player_id
    LOOP
        PERFORM 1 FROM players WHERE player_id = r.player_id FOR UPDATE;

        IF r.payout > 0 THEN
            UPDATE players SET balance = balance + r.payout WHERE player_id = r.player_id;
        END IF;

        IF NOT v_refund AND r.payout <> r.amount THEN
            INSERT INTO player_game_stats (player_id, game_code, money_won, money_lost)
            VALUES (r.player_id, 'sports_betting',
                    GREATEST(r.payout - r.amount, 0),
                    GREATEST(r.amount - r.payout, 0))
            ON CONFLICT (player_id, game_code) DO UPDATE
               SET money_won  = player_game_stats.money_won  + EXCLUDED.money_won,
                   money_lost = player_game_stats.money_lost + EXCLUDED.money_lost;
        END IF;
    END LOOP;

    UPDATE public_bets
       SET outcome = CASE WHEN v_refund THEN 'Refunded' ELSE 'Settled' END,
           winning_team_id = CASE WHEN v_refund THEN NULL ELSE p_winning_team_id END,
           settled_at = CURRENT_TIMESTAMP
     WHERE public_bet_id = p_public_bet_id;

    RETURN jsonb_build_object('status', 'settled',
                              'outcome', CASE WHEN v_refund THEN 'Refunded' ELSE 'Settled' END,
                              'pool', v_pool,
                              'entries', v_entries);
END;
$$;

-- Only the server may call these. Supabase grants EXECUTE on new functions
-- to its anon and authenticated roles, and the anon key is public (it ships
-- to browsers for the poker page's Realtime connection), so those grants are
-- removed and only the service role keeps access. The role check lets this
-- script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_join_showdown(INTEGER, INTEGER, INTEGER, BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_settle_showdown(INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_join_showdown(INTEGER, INTEGER, INTEGER, BIGINT) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_join_showdown(INTEGER, INTEGER, INTEGER, BIGINT) TO service_role';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_settle_showdown(INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_settle_showdown(INTEGER, INTEGER) TO service_role';
    END IF;
END;
$$;

COMMIT;

-- Ask the Supabase API to pick up the new columns and functions right away.
NOTIFY pgrst, 'reload schema';
