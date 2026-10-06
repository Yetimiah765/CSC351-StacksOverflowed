-- =============================================================================
-- Stacks Overflowed — Database Schema
-- CSC 351
--
-- Builds the PostgreSQL schema required by the Stacks Overflowed SRS.
-- Runs top to bottom on a clean PostgreSQL database and is safe to re-run.
--
-- Conventions
--   * snake_case for every table, column, and constraint name.
--   * All virtual-currency amounts are whole coins stored as BIGINT.
--   * All timestamps are TIMESTAMPTZ; the daily-reward boundary
--     (SRS-110.3) is evaluated in America/New_York.
--   * Values the SRS defines as derivable are NOT stored, to avoid
--     repeating the same fact in two places:
--       - total time played / money won / money lost (SUM of per-game rows)
--       - blind-box reward probability (1 / number of rewards in the box)
--       - min/max poker buy-in (40x / 100x the table's big blind)
--       - potential sports payout (wager amount x recorded odds)
--       - public-bet totals per team and pool total (SUM of entries)
--       - roulette winning color (fixed by the winning number)
--       - wager "Pending"/"Decided" status (whether a result is recorded)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Drop existing objects (reverse dependency order) so the script is re-runnable
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS ai_suggestions            CASCADE;
DROP TABLE IF EXISTS blackjack_hands           CASCADE;
DROP TABLE IF EXISTS slot_spins                CASCADE;
DROP TABLE IF EXISTS slot_bet_amounts          CASCADE;
DROP TABLE IF EXISTS roulette_bets             CASCADE;
DROP TABLE IF EXISTS roulette_spins            CASCADE;
DROP TABLE IF EXISTS public_bet_entries        CASCADE;
DROP TABLE IF EXISTS public_bets               CASCADE;
DROP TABLE IF EXISTS wagers                    CASCADE;
DROP TABLE IF EXISTS betting_options           CASCADE;
DROP TABLE IF EXISTS betting_markets           CASCADE;
DROP TABLE IF EXISTS market_types              CASCADE;
DROP TABLE IF EXISTS sports_events             CASCADE;
DROP TABLE IF EXISTS teams                     CASCADE;
DROP TABLE IF EXISTS leagues                   CASCADE;
DROP TABLE IF EXISTS sports                    CASCADE;
DROP TABLE IF EXISTS poker_removal_notices     CASCADE;
DROP TABLE IF EXISTS poker_seats               CASCADE;
DROP TABLE IF EXISTS poker_tables              CASCADE;
DROP TABLE IF EXISTS blind_box_purchases       CASCADE;
DROP TABLE IF EXISTS blind_box_rewards         CASCADE;
DROP TABLE IF EXISTS blind_boxes               CASCADE;
DROP TABLE IF EXISTS player_equipped_cosmetics CASCADE;
DROP TABLE IF EXISTS player_cosmetics          CASCADE;
DROP TABLE IF EXISTS cosmetics                 CASCADE;
DROP TABLE IF EXISTS player_game_stats         CASCADE;
DROP TABLE IF EXISTS player_sessions           CASCADE;
DROP TABLE IF EXISTS usernames                 CASCADE;
DROP TABLE IF EXISTS players                   CASCADE;
DROP TABLE IF EXISTS games                     CASCADE;
DROP FUNCTION IF EXISTS fn_poker_seats_rules()          CASCADE;
DROP FUNCTION IF EXISTS fn_poker_tables_seat_capacity() CASCADE;


-- =============================================================================
-- Home page, accounts, and profiles
-- =============================================================================

-- Table: games
-- Reviewed by: JO (<JO full name>)
-- Supports: SRS-107.1, SRS-107.2, SRS-108.1, SRS-108.2, SRS-116.3, SRS-118.1, SRS-118.3
-- Purpose: Lists each game and the sports-betting area shown on the home page and used to key per-game statistics.
CREATE TABLE games (
    game_code       VARCHAR(20)  PRIMARY KEY
                    CHECK (game_code ~ '^[a-z_]+$'),
    display_name    VARCHAR(50)  NOT NULL UNIQUE,
    is_available    BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Table: players
-- Reviewed by: JO (<JO full name>)
-- Supports: SRS-101.1, SRS-101.2, SRS-101.3, SRS-101.10, SRS-102.1, SRS-102.2, SRS-102.3, SRS-103.2, SRS-104.5, SRS-104.6, SRS-106.3, SRS-106.6, SRS-106.7, SRS-106.8, SRS-109.1, SRS-109.2, SRS-109.3, SRS-110.1, SRS-110.2, SRS-110.3, SRS-110.4, SRS-110.5, SRS-112.1, SRS-112.3, SRS-114.1, SRS-114.2, SRS-114.4, SRS-114.5, SRS-115.1, SRS-115.2, SRS-115.3, SRS-115.4, SRS-115.6, SRS-8.1, SRS-8.2, SRS-8.3, SRS-121.4, SRS-121.5, SRS-NFR-101, SRS-NFR-102
-- Purpose: Stores each registered player's account, authentication hash, virtual-currency balance, and profile details.
CREATE TABLE players (
    player_id               SERIAL       PRIMARY KEY,
    first_name              VARCHAR(50)  NOT NULL,
    last_name               VARCHAR(50)  NOT NULL,
    birthday                DATE         NOT NULL,
    password_hash           VARCHAR(255) NOT NULL,
    balance                 BIGINT       NOT NULL DEFAULT 1000
                            CHECK (balance >= 0),
    bio                     VARCHAR(1000),
    profile_photo           BYTEA,
    account_status          VARCHAR(20)  NOT NULL DEFAULT 'Active'
                            CHECK (account_status IN ('Active', 'Pending Deletion')),
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_daily_reward_date  DATE,

    -- SRS-101.2 / SRS-101.3: letters, spaces, apostrophes, hyphens only.
    CONSTRAINT chk_players_first_name
        CHECK (first_name ~ '^[A-Za-z][A-Za-z'' -]*$'),
    CONSTRAINT chk_players_last_name
        CHECK (last_name ~ '^[A-Za-z][A-Za-z'' -]*$'),

    -- SRS-102.1: at least 21 years old on the day the account was created.
    CONSTRAINT chk_players_minimum_age
        CHECK (birthday <= (created_at AT TIME ZONE 'America/New_York')::DATE
                           - INTERVAL '21 years'),

    -- SRS-114.1, SRS-114.2, SRS-114.5: optional bio, trimmed, at most 50
    -- whitespace-separated words. An empty bio is stored as NULL.
    CONSTRAINT chk_players_bio
        CHECK (bio IS NULL
               OR (bio <> ''
                   AND bio = btrim(bio)
                   AND array_length(regexp_split_to_array(bio, '\s+'), 1) <= 50)),

    -- SRS-115.1 - SRS-115.3: PNG data (checked by file signature, not
    -- filename) no larger than 5 MB. NULL means the default icon (SRS-115.5).
    CONSTRAINT chk_players_profile_photo
        CHECK (profile_photo IS NULL
               OR (substring(profile_photo FROM 1 FOR 8) = '\x89504e470d0a1a0a'::BYTEA
                   AND octet_length(profile_photo) <= 5242880)),

    -- SRS-110.2 / SRS-110.3: no daily reward on or before the creation day.
    CONSTRAINT chk_players_daily_reward_after_creation
        CHECK (last_daily_reward_date IS NULL
               OR last_daily_reward_date > (created_at AT TIME ZONE 'America/New_York')::DATE)
);

-- Table: usernames
-- Reviewed by: JO (<JO full name>)
-- Supports: SRS-101.4, SRS-101.5, SRS-101.6, SRS-101.7, SRS-103.1, SRS-106.5, SRS-112.1, SRS-112.4, SRS-112.5, SRS-112.6, SRS-112.7, SRS-112.8, SRS-121.3
-- Purpose: Stores each player's current username and any previous username still inside its 24-hour reservation window.
CREATE TABLE usernames (
    username_id     SERIAL       PRIMARY KEY,
    player_id       INTEGER      NOT NULL
                    REFERENCES players(player_id) ON DELETE CASCADE,
    username        VARCHAR(10)  NOT NULL
                    CHECK (username ~ '^[A-Za-z0-9]{6,10}$'),
    is_current      BOOLEAN      NOT NULL DEFAULT TRUE,
    reserved_until  TIMESTAMPTZ,

    -- A current username has no reservation expiry; a reserved
    -- (previous) username always does.
    CONSTRAINT chk_usernames_reservation
        CHECK ((is_current AND reserved_until IS NULL)
               OR (NOT is_current AND reserved_until IS NOT NULL))
);

-- SRS-101.6 / SRS-101.7 / SRS-112.7: a username, ignoring case, can belong to
-- only one row, whether it is in use or reserved. Deleting a reserved row
-- (when reserved_until passes, SRS-112.8) or deleting the account
-- (SRS-106.5) releases it. A reserved row created within the last 24 hours
-- also tells the application a change was made in that window (SRS-112.6).
CREATE UNIQUE INDEX uq_usernames_username_ci
    ON usernames (LOWER(username));

-- Each player has at most one current username.
CREATE UNIQUE INDEX uq_usernames_one_current_per_player
    ON usernames (player_id)
    WHERE is_current;

-- Table: player_sessions
-- Reviewed by: JO (<JO full name>)
-- Supports: SRS-103.3, SRS-103.4, SRS-103.5, SRS-103.6, SRS-103.7, SRS-103.8, SRS-105.1, SRS-105.2, SRS-105.3, SRS-106.7
-- Purpose: Stores the single active authenticated session for each player so a new login or duplicated tab can invalidate it.
CREATE TABLE player_sessions (
    session_id      SERIAL       PRIMARY KEY,
    player_id       INTEGER      NOT NULL UNIQUE
                    REFERENCES players(player_id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: player_game_stats
-- Reviewed by: JO (<JO full name>)
-- Supports: SRS-103.2, SRS-111.2, SRS-116.1, SRS-116.2, SRS-116.3, SRS-116.4, SRS-116.12, SRS-117.1, SRS-117.2, SRS-117.4, SRS-117.5, SRS-118.1, SRS-118.2, SRS-118.3, SRS-118.4, SRS-118.5, SRS-121.6, SRS-121.7, SRS-121.8, SRS-NFR-102, SRS-NFR-107
-- Purpose: Stores each player's active playtime, money won, and money lost per game; overall totals are the sum of these rows.
CREATE TABLE player_game_stats (
    player_id       INTEGER      NOT NULL
                    REFERENCES players(player_id) ON DELETE CASCADE,
    game_code       VARCHAR(20)  NOT NULL
                    REFERENCES games(game_code),
    seconds_played  BIGINT       NOT NULL DEFAULT 0
                    CHECK (seconds_played >= 0),
    money_won       BIGINT       NOT NULL DEFAULT 0
                    CHECK (money_won >= 0),
    money_lost      BIGINT       NOT NULL DEFAULT 0
                    CHECK (money_lost >= 0),

    PRIMARY KEY (player_id, game_code),

    -- SRS-116.12: sports betting never adds to time played.
    CONSTRAINT chk_player_game_stats_no_sports_time
        CHECK (game_code <> 'sports_betting' OR seconds_played = 0)
);


-- =============================================================================
-- Cosmetics and the cosmetic shop
-- =============================================================================

-- Table: cosmetics
-- Reviewed by: JO (<JO full name>)
-- Supports: SRS-119.2, SRS-119.3, SRS-119.4, SRS-120.1, SRS-120.3, SRS-122.2, SRS-123.5
-- Purpose: Catalog of every card, chip, and profile-outline cosmetic, including the one default cosmetic per category.
CREATE TABLE cosmetics (
    cosmetic_id     SERIAL       PRIMARY KEY,
    cosmetic_name   VARCHAR(50)  NOT NULL UNIQUE,
    category        VARCHAR(20)  NOT NULL
                    CHECK (category IN ('Card', 'Chip', 'Profile Outline')),
    is_default      BOOLEAN      NOT NULL DEFAULT FALSE,
    asset_path      VARCHAR(255) NOT NULL,

    -- Targets for composite foreign keys that enforce category matching
    -- (player_equipped_cosmetics) and default exclusion (blind_box_rewards).
    CONSTRAINT uq_cosmetics_id_category UNIQUE (cosmetic_id, category),
    CONSTRAINT uq_cosmetics_id_default  UNIQUE (cosmetic_id, is_default)
);

-- SRS-119.4: exactly one default cosmetic per category (at most one here;
-- the application seeds one per category).
CREATE UNIQUE INDEX uq_cosmetics_one_default_per_category
    ON cosmetics (category)
    WHERE is_default;

-- Table: player_cosmetics
-- Reviewed by: JO (<JO full name>)
-- Supports: SRS-103.2, SRS-119.1, SRS-119.2, SRS-119.4, SRS-120.6, SRS-121.9, SRS-125.2, SRS-125.4, SRS-125.5, SRS-126.1, SRS-126.2, SRS-NFR-102
-- Purpose: Records which cosmetics each player owns, with at most one copy of any cosmetic per player.
CREATE TABLE player_cosmetics (
    player_id       INTEGER      NOT NULL
                    REFERENCES players(player_id) ON DELETE CASCADE,
    cosmetic_id     INTEGER      NOT NULL
                    REFERENCES cosmetics(cosmetic_id),
    acquired_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- SRS-126.2: the primary key makes a duplicate copy impossible.
    PRIMARY KEY (player_id, cosmetic_id)
);

-- Table: player_equipped_cosmetics
-- Reviewed by: JO (<JO full name>)
-- Supports: SRS-103.2, SRS-120.1, SRS-120.2, SRS-120.3, SRS-120.4, SRS-120.5, SRS-120.6, SRS-121.13, SRS-NFR-102, SRS-NFR-104
-- Purpose: Stores the one cosmetic each player has equipped in each cosmetic category.
CREATE TABLE player_equipped_cosmetics (
    player_id       INTEGER      NOT NULL
                    REFERENCES players(player_id) ON DELETE CASCADE,
    category        VARCHAR(20)  NOT NULL
                    CHECK (category IN ('Card', 'Chip', 'Profile Outline')),
    cosmetic_id     INTEGER      NOT NULL,

    -- SRS-120.2: at most one equipped cosmetic per category.
    PRIMARY KEY (player_id, category),

    -- SRS-120.4: only an owned cosmetic can be equipped.
    CONSTRAINT fk_equipped_owned
        FOREIGN KEY (player_id, cosmetic_id)
        REFERENCES player_cosmetics(player_id, cosmetic_id),

    -- SRS-120.4: the cosmetic must belong to the slot's category.
    CONSTRAINT fk_equipped_category
        FOREIGN KEY (cosmetic_id, category)
        REFERENCES cosmetics(cosmetic_id, category)
);

-- Table: blind_boxes
-- Reviewed by: JO (<JO full name>)
-- Supports: SRS-122.1, SRS-122.2, SRS-124.4, SRS-124.5
-- Purpose: Stores each blind box offered in the cosmetic shop with its description, price, and availability.
CREATE TABLE blind_boxes (
    box_id          SERIAL       PRIMARY KEY,
    box_name        VARCHAR(50)  NOT NULL UNIQUE,
    description     VARCHAR(500) NOT NULL,
    price           INTEGER      NOT NULL
                    CHECK (price > 0),
    is_available    BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Table: blind_box_rewards
-- Reviewed by: JO (<JO full name>)
-- Supports: SRS-122.2, SRS-123.1, SRS-123.2, SRS-123.3, SRS-123.4, SRS-123.5, SRS-123.6, SRS-125.1
-- Purpose: Lists the possible cosmetic rewards in each blind box, each with equal 1/n probability.
CREATE TABLE blind_box_rewards (
    box_id          INTEGER      NOT NULL
                    REFERENCES blind_boxes(box_id) ON DELETE CASCADE,
    cosmetic_id     INTEGER      NOT NULL,
    is_default      BOOLEAN      NOT NULL DEFAULT FALSE
                    CHECK (is_default = FALSE),

    -- SRS-123.4: no weight column; every reward in a box is equally likely.
    PRIMARY KEY (box_id, cosmetic_id),

    -- SRS-123.5: default cosmetics can never be placed in a reward pool,
    -- and a cosmetic in a pool cannot later be flagged as a default.
    CONSTRAINT fk_blind_box_rewards_non_default
        FOREIGN KEY (cosmetic_id, is_default)
        REFERENCES cosmetics(cosmetic_id, is_default)
);

-- Table: blind_box_purchases
-- Reviewed by: JO (<JO full name>)
-- Supports: SRS-117.10, SRS-117.11, SRS-124.4, SRS-124.6, SRS-124.7, SRS-125.1, SRS-125.3, SRS-125.6, SRS-126.1, SRS-126.3, SRS-126.4, SRS-126.5, SRS-127.1, SRS-127.4, SRS-NFR-103
-- Purpose: Records each completed blind-box purchase with its single price deduction and single reward outcome, including any duplicate refund.
CREATE TABLE blind_box_purchases (
    purchase_id     SERIAL       PRIMARY KEY,
    player_id       INTEGER      NOT NULL
                    REFERENCES players(player_id) ON DELETE CASCADE,
    box_id          INTEGER      NOT NULL,
    cosmetic_id     INTEGER      NOT NULL,
    -- Price at the moment of purchase; the box price may change later.
    price_paid      INTEGER      NOT NULL
                    CHECK (price_paid > 0),
    was_duplicate   BOOLEAN      NOT NULL,
    refund_amount   INTEGER      NOT NULL DEFAULT 0,
    purchased_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- SRS-125.1: the reward must come from that box's pool.
    CONSTRAINT fk_blind_box_purchases_reward
        FOREIGN KEY (box_id, cosmetic_id)
        REFERENCES blind_box_rewards(box_id, cosmetic_id),

    -- SRS-126.3 / SRS-126.4: duplicates refund 50% rounded up; new
    -- cosmetics refund nothing.
    CONSTRAINT chk_blind_box_purchases_refund
        CHECK ((was_duplicate AND refund_amount = CEIL(price_paid / 2.0))
               OR (NOT was_duplicate AND refund_amount = 0))
);


-- =============================================================================
-- Poker room
--
-- What is persisted, and why:
--   The SRS only requires poker data to survive between hands (SRS-7.2,
--   SRS-7.3) and requires an interrupted hand to be VOIDED rather than
--   resumed (SRS-7.4). So the database stores table configuration, seats,
--   and per-seat state that spans hands. Everything that exists only inside
--   a single hand is held in the real-time game server's memory and is
--   deliberately NOT stored:
--     - the deck, burn cards, and community cards
--     - hole cards (never written anywhere, which also supports the
--       confidentiality rule in SRS-6.1 and SRS-6.3)
--     - pots, side pots, round contributions, current bet, minimum raise
--     - the active turn, turn countdown, and missed-blind elections
--     - deferred removals and leave requests made during a hand
--       (SRS-9.13, SRS-21.2, SRS-21.3), which resolve when the hand ends
--   Derived terms (eligible, clear, dealt-in, in-hand, able-to-act player)
--   are computed from seat state and are not stored either.
-- =============================================================================

-- Table: poker_tables
-- Reviewed by: JN (Jeremiah Nicols)
-- Supports: SRS-1.1, SRS-1.3, SRS-1.4, SRS-5.7, SRS-5.8, SRS-7.4, SRS-11.1, SRS-11.2, SRS-11.3, SRS-12.6, SRS-13.1, SRS-13.2, SRS-13.5, SRS-14.1, SRS-14.2, SRS-14.3, SRS-14.4, SRS-14.7, SRS-15.3, SRS-15.5, SRS-18.8, SRS-20.7, SRS-NFR-021, SRS-NFR-022
-- Purpose: Stores each poker table's seat count, blind and chip-denomination settings, and the button and blind seats from its last successful hand setup.
CREATE TABLE poker_tables (
    table_id                SERIAL       PRIMARY KEY,
    table_name              VARCHAR(50)  NOT NULL UNIQUE,
    -- SRS-NFR-022: 3 to 9 seats.
    max_seats               SMALLINT     NOT NULL
                            CHECK (max_seats BETWEEN 3 AND 9),
    -- SRS-5.7 / SRS-5.8: split pots are divided in whole units of this chip.
    smallest_chip           INTEGER      NOT NULL DEFAULT 1
                            CHECK (smallest_chip > 0),
    -- "Configured" blind amounts used by SRS-11.7 - SRS-11.10, SRS-14.3,
    -- SRS-14.4, SRS-14.7, SRS-15.3, SRS-15.5, SRS-18.8. The buy-in range
    -- (40x - 100x big blind, SRS-NFR-021) is derived from big_blind.
    small_blind             INTEGER      NOT NULL
                            CHECK (small_blind > 0),
    big_blind               INTEGER      NOT NULL,
    -- Seats chosen by the most recent SUCCESSFUL hand setup (SRS-13.3).
    -- All NULL until the table's first hand (SRS-13.1, SRS-11.3); a failed
    -- setup leaves them unchanged (SRS-20.7). SRS-11.1 and SRS-11.2 compare
    -- the previous hand's blind seats against the new ones.
    dealer_button_seat      SMALLINT,
    last_small_blind_seat   SMALLINT,
    last_big_blind_seat     SMALLINT,
    -- SRS-7.4: TRUE while a hand is being dealt or played. If the server
    -- restarts and finds TRUE, the hand is voided and every stack in
    -- poker_seats is still its pre-hand value, because stacks are only
    -- written when a hand completes (SRS-7.2).
    hand_in_progress        BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT chk_poker_tables_blinds
        CHECK (big_blind > small_blind),
    CONSTRAINT chk_poker_tables_blinds_in_whole_chips
        CHECK (small_blind % smallest_chip = 0 AND big_blind % smallest_chip = 0),

    -- The three positions are set together by a successful hand setup.
    CONSTRAINT chk_poker_tables_positions_set_together
        CHECK ((dealer_button_seat IS NULL
                AND last_small_blind_seat IS NULL
                AND last_big_blind_seat IS NULL)
               OR (dealer_button_seat IS NOT NULL
                   AND last_small_blind_seat IS NOT NULL
                   AND last_big_blind_seat IS NOT NULL)),
    CONSTRAINT chk_poker_tables_positions_on_table
        CHECK (dealer_button_seat    BETWEEN 1 AND max_seats
           AND last_small_blind_seat BETWEEN 1 AND max_seats
           AND last_big_blind_seat   BETWEEN 1 AND max_seats),
    -- A successful setup has at least three dealt-in players (SRS-20.1),
    -- so the button, small blind, and big blind are three different seats.
    CONSTRAINT chk_poker_tables_positions_distinct
        CHECK (dealer_button_seat    <> last_small_blind_seat
           AND last_small_blind_seat <> last_big_blind_seat
           AND last_big_blind_seat   <> dealer_button_seat),

    -- A hand cannot be in progress before the button has been assigned.
    CONSTRAINT chk_poker_tables_hand_needs_button
        CHECK (NOT hand_in_progress OR dealer_button_seat IS NOT NULL)
);

-- Table: poker_seats
-- Reviewed by: JN (Jeremiah Nicols)
-- Supports: SRS-1.1, SRS-1.2, SRS-1.3, SRS-1.4, SRS-1.5, SRS-1.7, SRS-2.1, SRS-2.4, SRS-7.1, SRS-7.2, SRS-7.3, SRS-7.4, SRS-8.1, SRS-9.1, SRS-9.2, SRS-9.3, SRS-9.4, SRS-9.5, SRS-9.6, SRS-9.7, SRS-9.8, SRS-9.10, SRS-10.1, SRS-10.2, SRS-10.3, SRS-11.1, SRS-11.2, SRS-11.3, SRS-11.4, SRS-11.5, SRS-11.13, SRS-11.14, SRS-11.15, SRS-12.1, SRS-12.4, SRS-12.5, SRS-12.6, SRS-12.9, SRS-12.10, SRS-20.6, SRS-21.1, SRS-NFR-013, SRS-NFR-014, SRS-NFR-015, SRS-NFR-019, SRS-NFR-021, SRS-NFR-022
-- Purpose: Stores each occupied seat with its player, chip stack as of the last completed hand, missed-blind markers, and the connection, timeout, and busted state that carries across hands.
CREATE TABLE poker_seats (
    table_id                INTEGER      NOT NULL
                            REFERENCES poker_tables(table_id) ON DELETE CASCADE,
    -- Upper bound against the table's own max_seats is enforced by
    -- trg_poker_seats_rules below; 9 is the system-wide ceiling.
    seat_number             SMALLINT     NOT NULL
                            CHECK (seat_number BETWEEN 1 AND 9),
    player_id               INTEGER      NOT NULL
                            REFERENCES players(player_id) ON DELETE CASCADE,
    -- Written when the player buys in (SRS-1.2) or buys back (SRS-12.4),
    -- and after every completed hand (SRS-7.2, SRS-NFR-019). Never written
    -- mid-hand, so it is always the value to restore (SRS-7.3, SRS-7.4).
    chip_stack              BIGINT       NOT NULL
                            CHECK (chip_stack >= 0),
    -- Missed-blind markers (SRS-11.1 - SRS-11.4). Both may be TRUE at once
    -- (SRS-11.4). Either one TRUE drives the blind-owed indicator (SRS-11.15).
    owes_small_blind        BOOLEAN      NOT NULL DEFAULT FALSE,
    owes_big_blind          BOOLEAN      NOT NULL DEFAULT FALSE,
    -- NULL = connected. Otherwise the moment the player was marked
    -- disconnected (SRS-10.1, SRS-10.2), which starts the 2-minute removal
    -- timer (SRS-9.2, SRS-NFR-013). Cleared on reconnection (SRS-9.3, SRS-10.3).
    disconnected_at         TIMESTAMPTZ,
    -- Hands in a row with an automatic action (SRS-9.5, SRS-9.6). Reaching
    -- 4 triggers removal (SRS-9.7, SRS-NFR-014); 3 triggers the warning (SRS-9.8).
    consecutive_timeouts    SMALLINT     NOT NULL DEFAULT 0
                            CHECK (consecutive_timeouts BETWEEN 0 AND 4),
    -- NULL = not busted. Otherwise the end of the hand in which the stack
    -- hit zero (SRS-12.1), which starts the 60-second decision timer
    -- (SRS-12.10, SRS-NFR-015). Cleared by a buy-back (SRS-12.5).
    busted_at               TIMESTAMPTZ,
    seated_at               TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- SRS-1.5: one player per seat. An open seat has no row, so removal is
    -- a DELETE (SRS-9.10, SRS-21.1) and a full table is one with max_seats
    -- rows (SRS-1.4).
    PRIMARY KEY (table_id, seat_number),

    -- A player occupies at most one seat at a given table.
    CONSTRAINT uq_poker_seats_player_per_table UNIQUE (table_id, player_id),

    -- SRS-12.1 / SRS-12.5: a persisted stack is zero exactly when the
    -- player is busted. Buy-ins are at least 40 big blinds, so a seated,
    -- non-busted player always has chips.
    CONSTRAINT chk_poker_seats_busted_iff_empty
        CHECK ((chip_stack = 0) = (busted_at IS NOT NULL))
);

-- Rules that compare a seat to its table's settings. A CHECK constraint
-- cannot look at another table, so these are enforced by a trigger.
--   * SRS-1.1 / SRS-NFR-022: seat_number must exist on that table.
--   * SRS-1.3 / SRS-NFR-021: a new seat's starting stack is a buy-in of
--     40x - 100x the table's big blind.
--   * SRS-12.4 / SRS-12.6 / SRS-NFR-021: a buy-back (busted -> not busted)
--     also has to land in that range.
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
       AND NEW.chip_stack NOT BETWEEN 40 * v_big_blind AND 100 * v_big_blind THEN
        RAISE EXCEPTION 'Buy-in of % is outside the allowed range % to %',
            NEW.chip_stack, 40 * v_big_blind, 100 * v_big_blind;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_poker_seats_rules
    BEFORE INSERT OR UPDATE ON poker_seats
    FOR EACH ROW
    EXECUTE FUNCTION fn_poker_seats_rules();

-- SRS-1.1 / SRS-NFR-022: a table cannot shrink below a seat that is in use.
CREATE OR REPLACE FUNCTION fn_poker_tables_seat_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (SELECT 1
                 FROM poker_seats
                WHERE table_id = NEW.table_id
                  AND seat_number > NEW.max_seats) THEN
        RAISE EXCEPTION 'Table % has an occupied seat above %',
            NEW.table_id, NEW.max_seats;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_poker_tables_seat_capacity
    BEFORE UPDATE OF max_seats ON poker_tables
    FOR EACH ROW
    EXECUTE FUNCTION fn_poker_tables_seat_capacity();

-- Table: poker_removal_notices
-- Reviewed by: JN (Jeremiah Nicols)
-- Supports: SRS-9.4, SRS-9.7, SRS-9.11, SRS-9.12, SRS-12.10, SRS-NFR-020
-- Purpose: Records each automatic seat removal and its reason so the player is notified immediately or, if disconnected, the next time they open the application.
CREATE TABLE poker_removal_notices (
    notice_id       SERIAL       PRIMARY KEY,
    player_id       INTEGER      NOT NULL
                    REFERENCES players(player_id) ON DELETE CASCADE,
    table_id        INTEGER
                    REFERENCES poker_tables(table_id) ON DELETE SET NULL,
    -- The three automatic removals that require a notice. Voluntary leaves
    -- (SRS-12.3, SRS-21.1) need none.
    removal_reason  VARCHAR(30)  NOT NULL
                    CHECK (removal_reason IN ('Disconnection timeout',       -- SRS-9.4
                                              'Consecutive turn timeouts',   -- SRS-9.7
                                              'No busted-player response')), -- SRS-12.10
    removed_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULL until shown. A connected player sees it right away (SRS-9.11);
    -- a disconnected player sees it on next open (SRS-9.12).
    delivered_at    TIMESTAMPTZ,

    CONSTRAINT chk_poker_removal_notices_delivery
        CHECK (delivered_at IS NULL OR delivered_at >= removed_at)
);

-- Supports SRS-9.12: find a returning player's undelivered notices quickly.
CREATE INDEX ix_poker_removal_notices_undelivered
    ON poker_removal_notices (player_id)
    WHERE delivered_at IS NULL;


-- =============================================================================
-- Sports betting
-- =============================================================================

-- Table: sports
-- Reviewed by: SP (Samuel Parker)
-- Supports: SRS-201.1, SRS-201.2
-- Purpose: Lists the sports that events can be filtered by.
CREATE TABLE sports (
    sport_id        SERIAL       PRIMARY KEY,
    sport_name      VARCHAR(50)  NOT NULL UNIQUE
);

-- Table: leagues
-- Reviewed by: SP (Samuel Parker)
-- Supports: SRS-201.1, SRS-201.2, SRS-201.3
-- Purpose: Lists the leagues within each sport that events can be filtered by.
CREATE TABLE leagues (
    league_id       SERIAL       PRIMARY KEY,
    sport_id        INTEGER      NOT NULL
                    REFERENCES sports(sport_id),
    league_name     VARCHAR(100) NOT NULL,

    CONSTRAINT uq_leagues_name_per_sport UNIQUE (sport_id, league_name)
);

-- Table: teams
-- Reviewed by: SP (Samuel Parker)
-- Supports: SRS-202.3, SRS-212.1, SRS-213.1
-- Purpose: Lists the teams that compete in each league.
CREATE TABLE teams (
    team_id         SERIAL       PRIMARY KEY,
    league_id       INTEGER      NOT NULL
                    REFERENCES leagues(league_id),
    team_name       VARCHAR(100) NOT NULL,

    CONSTRAINT uq_teams_name_per_league UNIQUE (league_id, team_name),
    -- Target for the composite foreign keys in sports_events.
    CONSTRAINT uq_teams_id_league       UNIQUE (team_id, league_id)
);

-- Table: sports_events
-- Reviewed by: SP (Samuel Parker)
-- Supports: SRS-201.1, SRS-201.2, SRS-201.3, SRS-202.1, SRS-202.2, SRS-202.3, SRS-205.8, SRS-206.3, SRS-207.2, SRS-208.2, SRS-208.3, SRS-209.3, SRS-209.4, SRS-209.5, SRS-211.2, SRS-212.4, SRS-212.7
-- Purpose: Stores each sports event with its league, two teams, start time, status, and score.
CREATE TABLE sports_events (
    event_id        SERIAL       PRIMARY KEY,
    league_id       INTEGER      NOT NULL
                    REFERENCES leagues(league_id),
    home_team_id    INTEGER      NOT NULL,
    away_team_id    INTEGER      NOT NULL,
    start_time      TIMESTAMPTZ  NOT NULL,
    -- 'Canceled' and 'Postponed' are needed to drive refunds
    -- (SRS-209.4, SRS-209.5, SRS-212.7).
    status          VARCHAR(20)  NOT NULL DEFAULT 'Upcoming'
                    CHECK (status IN ('Upcoming', 'In Progress', 'Completed',
                                      'Canceled', 'Postponed')),
    home_score      SMALLINT     CHECK (home_score >= 0),
    away_score      SMALLINT     CHECK (away_score >= 0),

    CONSTRAINT chk_sports_events_distinct_teams
        CHECK (home_team_id <> away_team_id),

    -- Both teams must belong to the event's league.
    CONSTRAINT fk_sports_events_home_team
        FOREIGN KEY (home_team_id, league_id)
        REFERENCES teams(team_id, league_id),
    CONSTRAINT fk_sports_events_away_team
        FOREIGN KEY (away_team_id, league_id)
        REFERENCES teams(team_id, league_id),

    -- A completed event must have a final score.
    CONSTRAINT chk_sports_events_final_score
        CHECK (status <> 'Completed'
               OR (home_score IS NOT NULL AND away_score IS NOT NULL))
);

-- Table: market_types
-- Reviewed by: SP (Samuel Parker)
-- Supports: SRS-203.2, SRS-203.3, SRS-209.3, SRS-209.6, SRS-214.2, SRS-214.3, SRS-214.4
-- Purpose: Defines each supported betting market type with its description, rules, tie handling, and refund conditions.
CREATE TABLE market_types (
    market_type_code    VARCHAR(20)  PRIMARY KEY
                        CHECK (market_type_code IN ('moneyline', 'point_spread', 'total')),
    display_name        VARCHAR(50)  NOT NULL UNIQUE,
    description         VARCHAR(500) NOT NULL,
    rules_text          TEXT         NOT NULL,
    -- NULL when ties do not apply to this market type (SRS-214.3).
    tie_rules           TEXT,
    refund_conditions   TEXT         NOT NULL
);

-- Table: betting_markets
-- Reviewed by: SP (Samuel Parker)
-- Supports: SRS-203.1, SRS-203.3, SRS-205.7, SRS-205.8, SRS-206.3, SRS-209.6, SRS-214.2
-- Purpose: Stores each betting market offered on an event, its line for spreads and totals, and whether it is accepting wagers.
CREATE TABLE betting_markets (
    market_id           SERIAL       PRIMARY KEY,
    event_id            INTEGER      NOT NULL
                        REFERENCES sports_events(event_id) ON DELETE CASCADE,
    market_type_code    VARCHAR(20)  NOT NULL
                        REFERENCES market_types(market_type_code),
    -- Spread or over/under line; NULL for a moneyline market.
    line                NUMERIC(6,1),
    is_open             BOOLEAN      NOT NULL DEFAULT TRUE,

    CONSTRAINT chk_betting_markets_line
        CHECK ((market_type_code = 'moneyline') = (line IS NULL)),

    CONSTRAINT uq_betting_markets_per_event
        UNIQUE NULLS NOT DISTINCT (event_id, market_type_code, line)
);

-- Table: betting_options
-- Reviewed by: SP (Samuel Parker)
-- Supports: SRS-203.1, SRS-203.2, SRS-204.1, SRS-204.2, SRS-205.1, SRS-207.3, SRS-211.3, SRS-214.1
-- Purpose: Stores each selectable outcome within a market, its winning condition, and its current decimal odds.
CREATE TABLE betting_options (
    option_id           SERIAL       PRIMARY KEY,
    market_id           INTEGER      NOT NULL
                        REFERENCES betting_markets(market_id) ON DELETE CASCADE,
    option_label        VARCHAR(100) NOT NULL,
    winning_condition   VARCHAR(255) NOT NULL,
    -- The team this option backs; NULL for over/under options.
    team_id             INTEGER
                        REFERENCES teams(team_id),
    decimal_odds        NUMERIC(7,3) NOT NULL
                        CHECK (decimal_odds > 1),

    CONSTRAINT uq_betting_options_label_per_market UNIQUE (market_id, option_label)
);

-- Table: wagers
-- Reviewed by: SP (Samuel Parker)
-- Supports: SRS-109.3, SRS-117.1, SRS-117.4, SRS-118.1, SRS-118.3, SRS-205.1, SRS-205.2, SRS-205.4, SRS-205.5, SRS-205.6, SRS-205.7, SRS-206.1, SRS-206.5, SRS-207.1, SRS-207.2, SRS-207.3, SRS-207.4, SRS-207.5, SRS-207.6, SRS-208.1, SRS-209.1, SRS-209.2, SRS-209.4, SRS-209.5, SRS-210.1, SRS-210.2, SRS-210.3, SRS-210.4, SRS-210.5, SRS-211.1, SRS-211.2, SRS-211.3, SRS-211.4, SRS-211.5, SRS-211.6, SRS-211.7, SRS-NFR-204
-- Purpose: Stores each confirmed sports wager with its amount, odds at placement, and final result and payout once decided.
CREATE TABLE wagers (
    wager_id            SERIAL       PRIMARY KEY,
    player_id           INTEGER      NOT NULL
                        REFERENCES players(player_id) ON DELETE CASCADE,
    option_id           INTEGER      NOT NULL
                        REFERENCES betting_options(option_id) ON DELETE RESTRICT,
    -- SRS-206.5: positive whole-coin amounts only.
    amount              BIGINT       NOT NULL
                        CHECK (amount > 0),
    -- SRS-205.6: frozen at confirmation; current odds may change later.
    odds_at_placement   NUMERIC(7,3) NOT NULL
                        CHECK (odds_at_placement > 1),
    placed_at           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULL while active/"Pending"; set when "Decided" (SRS-208.1).
    result              VARCHAR(10)
                        CHECK (result IN ('Won', 'Lost', 'Refunded')),
    payout              BIGINT,
    settled_at          TIMESTAMPTZ,

    -- Result, payout, and settlement time are recorded together.
    CONSTRAINT chk_wagers_settlement_complete
        CHECK ((result IS NULL AND payout IS NULL AND settled_at IS NULL)
               OR (result IS NOT NULL AND payout IS NOT NULL AND settled_at IS NOT NULL)),

    -- SRS-210.1 - SRS-210.4: lost pays 0, refunded returns the stake,
    -- won pays more than the stake.
    CONSTRAINT chk_wagers_payout_matches_result
        CHECK (result IS NULL
               OR (result = 'Lost'     AND payout = 0)
               OR (result = 'Refunded' AND payout = amount)
               OR (result = 'Won'      AND payout > amount))
);

-- Table: public_bets
-- Reviewed by: SP (Samuel Parker)
-- Supports: SRS-212.1, SRS-212.4, SRS-212.6, SRS-212.7, SRS-213.1, SRS-213.2
-- Purpose: Stores each designated community bet on which team will win an event, and whether it has been paid out or refunded.
CREATE TABLE public_bets (
    public_bet_id   SERIAL       PRIMARY KEY,
    event_id        INTEGER      NOT NULL UNIQUE
                    REFERENCES sports_events(event_id) ON DELETE RESTRICT,
    outcome         VARCHAR(10)  NOT NULL DEFAULT 'Pending'
                    CHECK (outcome IN ('Pending', 'Settled', 'Refunded')),
    settled_at      TIMESTAMPTZ,

    CONSTRAINT chk_public_bets_settled_at
        CHECK ((outcome = 'Pending') = (settled_at IS NULL))
);

-- Table: public_bet_entries
-- Reviewed by: SP (Samuel Parker)
-- Supports: SRS-117.1, SRS-117.4, SRS-118.1, SRS-118.3, SRS-212.1, SRS-212.2, SRS-212.3, SRS-212.5, SRS-212.6, SRS-212.7, SRS-213.1, SRS-213.2, SRS-NFR-205
-- Purpose: Stores each player's single-team wager in a public bet and the share of the pool credited to them.
CREATE TABLE public_bet_entries (
    entry_id        SERIAL       PRIMARY KEY,
    public_bet_id   INTEGER      NOT NULL
                    REFERENCES public_bets(public_bet_id) ON DELETE RESTRICT,
    player_id       INTEGER      NOT NULL
                    REFERENCES players(player_id) ON DELETE CASCADE,
    team_id         INTEGER      NOT NULL
                    REFERENCES teams(team_id),
    amount          BIGINT       NOT NULL
                    CHECK (amount > 0),
    -- NULL until the public bet is settled or refunded.
    payout          BIGINT       CHECK (payout >= 0),
    placed_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- SRS-212.3: one entry per player per public bet, so a player can
    -- never back both teams.
    CONSTRAINT uq_public_bet_entries_one_per_player UNIQUE (public_bet_id, player_id)
);


-- =============================================================================
-- Roulette
-- =============================================================================

-- Table: roulette_spins
-- Reviewed by: CL (<CL full name>)
-- Supports: SRS-301.1, SRS-301.2, SRS-302.1, SRS-303.1, SRS-304.1
-- Purpose: Stores each roulette round for a player, from open betting through the spin and its winning number.
CREATE TABLE roulette_spins (
    spin_id         SERIAL       PRIMARY KEY,
    player_id       INTEGER      NOT NULL
                    REFERENCES players(player_id) ON DELETE CASCADE,
    -- Single-zero wheel. The color is fixed by the number, so it is not stored.
    winning_number  SMALLINT     CHECK (winning_number BETWEEN 0 AND 36),
    opened_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULL while bets may still be placed (SRS-301.1); set at spin (SRS-301.2).
    spun_at         TIMESTAMPTZ,

    CONSTRAINT chk_roulette_spins_result
        CHECK ((winning_number IS NULL) = (spun_at IS NULL))
);

-- Table: roulette_bets
-- Reviewed by: CL (<CL full name>)
-- Supports: SRS-117.1, SRS-117.4, SRS-118.1, SRS-118.3, SRS-301.1, SRS-304.1, SRS-305.1
-- Purpose: Stores each bet a player places on a roulette round and its payout once the spin is settled.
CREATE TABLE roulette_bets (
    bet_id          SERIAL       PRIMARY KEY,
    spin_id         INTEGER      NOT NULL
                    REFERENCES roulette_spins(spin_id) ON DELETE CASCADE,
    bet_type        VARCHAR(10)  NOT NULL
                    CHECK (bet_type IN ('Red', 'Black', 'Odd', 'Even', 'Number')),
    bet_number      SMALLINT     CHECK (bet_number BETWEEN 0 AND 36),
    amount          BIGINT       NOT NULL
                    CHECK (amount > 0),
    -- NULL until settled (SRS-304.1); unsettled rows are deleted by
    -- "Clear Bets" (SRS-305.1).
    payout          BIGINT       CHECK (payout >= 0),

    -- Only a specific-number bet names a number.
    CONSTRAINT chk_roulette_bets_number
        CHECK ((bet_type = 'Number') = (bet_number IS NOT NULL))
);


-- =============================================================================
-- Slot machine
-- =============================================================================

-- Table: slot_bet_amounts
-- Reviewed by: CL (<CL full name>)
-- Supports: SRS-306.1
-- Purpose: Lists the bet amounts a player may choose from before spinning the slot machine.
CREATE TABLE slot_bet_amounts (
    bet_amount      INTEGER      PRIMARY KEY
                    CHECK (bet_amount > 0)
);

-- Table: slot_spins
-- Reviewed by: CL (<CL full name>)
-- Supports: SRS-117.1, SRS-117.4, SRS-118.1, SRS-118.3, SRS-306.1, SRS-307.1, SRS-309.1
-- Purpose: Records each slot spin with the bet amount chosen and the winnings credited.
CREATE TABLE slot_spins (
    spin_id         SERIAL       PRIMARY KEY,
    player_id       INTEGER      NOT NULL
                    REFERENCES players(player_id) ON DELETE CASCADE,
    bet_amount      INTEGER      NOT NULL
                    REFERENCES slot_bet_amounts(bet_amount),
    payout          BIGINT       NOT NULL DEFAULT 0
                    CHECK (payout >= 0),
    spun_at         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =============================================================================
-- Blackjack and AI suggestions
-- =============================================================================

-- Table: blackjack_hands
-- Reviewed by: HC (<HC Hersy Contreras>)
-- Supports: SRS-117.1, SRS-117.4, SRS-118.1, SRS-118.3, SRS-901.1, SRS-901.2, SRS-907.1, SRS-908.1, SRS-909.1, SRS-1001.1
-- Purpose: Stores each blackjack hand's bet, declared result, and net winnings or losses for the player's hand history.
CREATE TABLE blackjack_hands (
    hand_id         SERIAL       PRIMARY KEY,
    player_id       INTEGER      NOT NULL
                    REFERENCES players(player_id) ON DELETE CASCADE,
    bet_amount      BIGINT       NOT NULL
                    CHECK (bet_amount > 0),
    -- NULL while the hand is in progress.
    result          VARCHAR(5)
                    CHECK (result IN ('Win', 'Lose', 'Bust', 'Push')),
    -- Positive = winnings, negative = loss, zero = push (SRS-909.1).
    net_amount      BIGINT,
    started_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMPTZ,

    CONSTRAINT chk_blackjack_hands_completion
        CHECK ((result IS NULL AND net_amount IS NULL AND completed_at IS NULL)
               OR (result IS NOT NULL AND net_amount IS NOT NULL AND completed_at IS NOT NULL)),

    -- SRS-907.1 / SRS-908.1: the balance change agrees with the result.
    CONSTRAINT chk_blackjack_hands_net_matches_result
        CHECK (result IS NULL
               OR (result = 'Win'           AND net_amount > 0)
               OR (result IN ('Lose','Bust') AND net_amount = -bet_amount)
               OR (result = 'Push'          AND net_amount = 0))
);

-- Table: ai_suggestions
-- Reviewed by: HC (<HC Hersy Contreras>)
-- Supports: SRS-1001.1, SRS-1001.2, SRS-1002.1, SRS-1003.1, SRS-1004.1, SRS-1005.1
-- Purpose: Records each AI suggestion a player requested, its recommendation and explanation, and the fee deducted.
CREATE TABLE ai_suggestions (
    suggestion_id       SERIAL       PRIMARY KEY,
    player_id           INTEGER      NOT NULL
                        REFERENCES players(player_id) ON DELETE CASCADE,
    -- Exactly one context: a blackjack hand (SRS-1002.1) or a sports
    -- event (SRS-1005.1).
    hand_id             INTEGER
                        REFERENCES blackjack_hands(hand_id) ON DELETE CASCADE,
    event_id            INTEGER
                        REFERENCES sports_events(event_id) ON DELETE CASCADE,
    recommended_action  VARCHAR(100) NOT NULL,
    explanation         VARCHAR(500) NOT NULL,
    fee_amount          BIGINT       NOT NULL
                        CHECK (fee_amount >= 0),
    requested_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_ai_suggestions_one_context
        CHECK (num_nonnulls(hand_id, event_id) = 1),

    -- Blackjack suggestions recommend a legal move from the SRS.
    CONSTRAINT chk_ai_suggestions_blackjack_action
        CHECK (hand_id IS NULL OR recommended_action IN ('Hit', 'Stand'))
);


-- =============================================================================
-- Reference data required by the SRS
-- =============================================================================

-- SRS-107.1: the games and areas the platform offers.
-- These keys are referenced by player_game_stats (SRS-116.3, SRS-118.1).
INSERT INTO games (game_code, display_name) VALUES
    ('poker',          'Poker'),
    ('roulette',       'Roulette'),
    ('slots',          'Slot Machine'),
    ('blackjack',      'Blackjack'),
    ('sports_betting', 'Sports Betting');
