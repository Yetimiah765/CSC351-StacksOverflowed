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
--   * All timestamps are TIMESTAMPTZ.
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
DROP TABLE IF EXISTS daily_login_box_claims    CASCADE;
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
DROP FUNCTION IF EXISTS fn_open_daily_login_box(INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS fn_change_username(INTEGER, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS fn_players_grant_default_cosmetics() CASCADE;
DROP FUNCTION IF EXISTS fn_buy_blind_box(INTEGER, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS fn_buy_blind_box(INTEGER, INTEGER, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS fn_spin_roulette(INTEGER, JSONB, INTEGER) CASCADE;


-- =============================================================================
-- Home page, accounts, and profiles
-- =============================================================================

-- Table: games
-- Reviewed by: JO (James Ortiz)
-- Supports: SRS-107.1, SRS-107.2, SRS-108.1, SRS-108.2, SRS-116.3, SRS-118.1, SRS-118.3
-- Purpose: Lists each game and the sports-betting area shown on the home page and used to key per-game statistics.
CREATE TABLE games (
    game_code       VARCHAR(20)  PRIMARY KEY
                    CHECK (game_code ~ '^[a-z_]+$'),
    display_name    VARCHAR(50)  NOT NULL UNIQUE,
    is_available    BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Table: players
-- Reviewed by: JO (James Ortiz)
-- Supports: SRS-101.1, SRS-101.2, SRS-101.3, SRS-101.10, SRS-102.1, SRS-102.2, SRS-102.3, SRS-103.2, SRS-104.5, SRS-104.6, SRS-106.3, SRS-106.6, SRS-106.7, SRS-106.8, SRS-109.1, SRS-109.2, SRS-109.3, SRS-110.1, SRS-110.5, SRS-112.1, SRS-112.3, SRS-112.6, SRS-114.1, SRS-114.2, SRS-114.4, SRS-114.5, SRS-115.1, SRS-115.2, SRS-115.3, SRS-115.4, SRS-115.6, SRS-8.1, SRS-8.2, SRS-8.3, SRS-121.4, SRS-121.5, SRS-NFR-101, SRS-NFR-102
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
    -- SRS-112.6: when the player last changed their username (NULL until
    -- the first change); fn_change_username allows one change per 24 hours.
    username_changed_at     TIMESTAMPTZ,

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
                   AND octet_length(profile_photo) <= 5242880))
);

-- Table: usernames
-- Reviewed by: JO (James Ortiz)
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
-- (SRS-106.5) releases it. fn_change_username (below) and registration
-- delete reservations that have run out before checking a name.
CREATE UNIQUE INDEX uq_usernames_username_ci
    ON usernames (LOWER(username));

-- Each player has at most one current username.
CREATE UNIQUE INDEX uq_usernames_one_current_per_player
    ON usernames (player_id)
    WHERE is_current;

-- Changes a player's username as one transaction:
--   * The player's row is locked first, so two changes by the same player
--     run one at a time and the second sees the first's cooldown.
--   * SRS-112.4: same rules as registration: 6-10 letters and numbers, unique
--     ignoring case among current and reserved usernames.
--   * SRS-112.5: no password is asked for; the API only needs the session.
--   * SRS-112.6: at most one change in any 24 hours.
--   * SRS-112.7: the previous username stays reserved for 24 hours.
--   * SRS-112.8: reservations that have run out are deleted first, so their
--     usernames can be taken again.
-- Changing only the capitals (tester1 -> Tester1) counts as the day's change,
-- but reserves nothing, since the name is the same ignoring case.
CREATE OR REPLACE FUNCTION fn_change_username(p_player_id INTEGER, p_username VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_status      VARCHAR(20);
    v_changed_at  TIMESTAMPTZ;
    v_current     VARCHAR(10);
    v_now         TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
    IF p_username IS NULL OR p_username !~ '^[A-Za-z0-9]{6,10}$' THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    SELECT account_status, username_changed_at
      INTO v_status, v_changed_at
      FROM players
     WHERE player_id = p_player_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_status <> 'Active' THEN
        RETURN jsonb_build_object('status', 'not_active');
    END IF;

    SELECT username
      INTO v_current
      FROM usernames
     WHERE player_id = p_player_id
       AND is_current;

    IF v_current = p_username THEN
        RETURN jsonb_build_object('status', 'unchanged');
    END IF;

    IF v_changed_at > v_now - INTERVAL '24 hours' THEN
        RETURN jsonb_build_object('status', 'cooldown',
                                  'next_change_at', v_changed_at + INTERVAL '24 hours');
    END IF;

    DELETE FROM usernames
     WHERE NOT is_current
       AND reserved_until <= v_now;

    IF LOWER(v_current) = LOWER(p_username) THEN
        UPDATE usernames
           SET username = p_username
         WHERE player_id = p_player_id
           AND is_current;
    ELSE
        IF EXISTS (SELECT 1 FROM usernames WHERE LOWER(username) = LOWER(p_username)) THEN
            RETURN jsonb_build_object('status', 'taken');
        END IF;

        -- Another player can claim the same name between the check above and
        -- the insert; uq_usernames_username_ci then stops the second one, and
        -- this block's changes are undone.
        BEGIN
            UPDATE usernames
               SET is_current = FALSE,
                   reserved_until = v_now + INTERVAL '24 hours'
             WHERE player_id = p_player_id
               AND is_current;

            INSERT INTO usernames (player_id, username, is_current)
            VALUES (p_player_id, p_username, TRUE);
        EXCEPTION WHEN unique_violation THEN
            RETURN jsonb_build_object('status', 'taken');
        END;
    END IF;

    UPDATE players
       SET username_changed_at = v_now
     WHERE player_id = p_player_id;

    RETURN jsonb_build_object('status', 'changed',
                              'username', p_username,
                              'next_change_at', v_now + INTERVAL '24 hours');
END;
$$;

-- Only the server may call fn_change_username. Supabase grants EXECUTE on new
-- functions to its anon and authenticated roles, and the anon key is public
-- (it ships to browsers for the poker page's Realtime connection), so those
-- grants are removed and only the service role keeps access. The role check
-- lets this script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_change_username(INTEGER, VARCHAR) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_change_username(INTEGER, VARCHAR) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_change_username(INTEGER, VARCHAR) TO service_role';
    END IF;
END;
$$;

-- Table: player_sessions
-- Reviewed by: JO (James Ortiz)
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
-- Reviewed by: JO (James Ortiz)
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
-- Reviewed by: JO (James Ortiz)
-- Supports: SRS-119.2, SRS-119.3, SRS-119.4, SRS-120.1, SRS-120.3, SRS-122.2, SRS-123.5, SRS-123.8
-- Purpose: Catalog of every card, chip, and profile-outline cosmetic, including the one default cosmetic per category and the rare holographic items.
CREATE TABLE cosmetics (
    cosmetic_id     SERIAL       PRIMARY KEY,
    cosmetic_name   VARCHAR(50)  NOT NULL UNIQUE,
    category        VARCHAR(20)  NOT NULL
                    CHECK (category IN ('Card', 'Chip', 'Profile Outline')),
    is_default      BOOLEAN      NOT NULL DEFAULT FALSE,
    asset_path      VARCHAR(255) NOT NULL,
    -- SRS-123.8: a holographic item is in a box's rare tier.
    is_holographic  BOOLEAN      NOT NULL DEFAULT FALSE,

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
-- Reviewed by: JO (James Ortiz)
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
-- Reviewed by: JO (James Ortiz)
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
-- Reviewed by: JO (James Ortiz)
-- Supports: SRS-122.1, SRS-122.2, SRS-123.8, SRS-124.4, SRS-124.5
-- Purpose: Stores each blind box offered in the cosmetic shop with its description, price, availability, and chance of a holographic item.
CREATE TABLE blind_boxes (
    box_id          SERIAL       PRIMARY KEY,
    box_name        VARCHAR(50)  NOT NULL UNIQUE,
    description     VARCHAR(500) NOT NULL,
    price           INTEGER      NOT NULL
                    CHECK (price > 0),
    is_available    BOOLEAN      NOT NULL DEFAULT TRUE,
    -- SRS-122.3 / SRS-122.4: a limited-time (holiday) box is on sale only
    -- from available_from until just before available_until. NULL means no
    -- limit on that side.
    available_from  TIMESTAMPTZ,
    available_until TIMESTAMPTZ,
    -- SRS-123.8: the combined chance of drawing one of the box's holographic
    -- items, in basis points (300 = 3%, so 1.5% each for a card and a chip).
    holographic_chance_bp INTEGER NOT NULL DEFAULT 300
                    CONSTRAINT chk_blind_boxes_holographic_chance CHECK (holographic_chance_bp BETWEEN 0 AND 10000),

    CONSTRAINT chk_blind_boxes_window
        CHECK (available_from IS NULL OR available_until IS NULL OR available_from < available_until)
);

-- Table: blind_box_rewards
-- Reviewed by: JO (James Ortiz)
-- Supports: SRS-122.2, SRS-123.1, SRS-123.2, SRS-123.3, SRS-123.4, SRS-123.5, SRS-123.6, SRS-123.8, SRS-125.1
-- Purpose: Lists the possible cosmetic rewards in each blind box. Its regular items share the box's chance equally, as do its holographic items (cosmetics.is_holographic).
CREATE TABLE blind_box_rewards (
    box_id          INTEGER      NOT NULL
                    REFERENCES blind_boxes(box_id) ON DELETE CASCADE,
    cosmetic_id     INTEGER      NOT NULL,
    is_default      BOOLEAN      NOT NULL DEFAULT FALSE
                    CHECK (is_default = FALSE),

    -- SRS-123.4: no weight column; a reward's chance comes only from whether
    -- it is holographic (SRS-123.8).
    PRIMARY KEY (box_id, cosmetic_id),

    -- SRS-123.5: default cosmetics can never be placed in a reward pool,
    -- and a cosmetic in a pool cannot later be flagged as a default.
    CONSTRAINT fk_blind_box_rewards_non_default
        FOREIGN KEY (cosmetic_id, is_default)
        REFERENCES cosmetics(cosmetic_id, is_default)
);

-- Table: blind_box_purchases
-- Reviewed by: JO (James Ortiz)
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

-- SRS-119.4 / SRS-120.3: a new account owns and wears the default card,
-- chip and profile outline. A trigger does it in the same transaction as the
-- players insert, so no account can exist without them.
CREATE OR REPLACE FUNCTION fn_players_grant_default_cosmetics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO player_cosmetics (player_id, cosmetic_id)
    SELECT NEW.player_id, cosmetic_id FROM cosmetics WHERE is_default
    ON CONFLICT DO NOTHING;

    INSERT INTO player_equipped_cosmetics (player_id, category, cosmetic_id)
    SELECT NEW.player_id, category, cosmetic_id FROM cosmetics WHERE is_default
    ON CONFLICT (player_id, category) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_players_grant_default_cosmetics ON players;
CREATE TRIGGER trg_players_grant_default_cosmetics
    AFTER INSERT ON players
    FOR EACH ROW
    EXECUTE FUNCTION fn_players_grant_default_cosmetics();

-- Buys and opens one blind box as one transaction (SRS-124.4 - SRS-126.5):
--   * The player's row is locked first, so simultaneous purchases run one at
--     a time and each sees the balance the previous one left.
--   * Only Active accounts may buy.
--   * SRS-122.3 / SRS-122.4: the box must be available now; a limited-time
--     box is refused before its start or from its end time on.
--   * SRS-124.5: a balance below the price is refused and nothing changes.
--   * SRS-123.1 / SRS-123.2 / SRS-123.8 / SRS-125.1: the API rolls p_roll,
--     a uniformly random number from 0 to 9999 (crypto.randomInt). Below the
--     box's holographic_chance_bp it draws from the box's holographic items,
--     otherwise from its regular ones; a box with no holographic items always
--     draws a regular one. p_pick is then a uniformly random index into that
--     group, ordered by cosmetic_id, so each regular item is
--     (1 - chance) / n likely and each holographic one chance / h. A NULL
--     roll draws a regular item (the 3-argument version below). A pick that
--     is out of range (the box changed) returns 'stale_pick' with the
--     group sizes, and nothing changes.
--   * SRS-125.2 / SRS-126.1 - SRS-126.4: a new cosmetic joins the collection;
--     a duplicate is not stored again and refunds 50% of the price, rounded up.
--   * SRS-124.4 / SRS-125.3: the price is deducted and the result is saved in
--     this one call, so it completes even if the player closes the tab.
CREATE OR REPLACE FUNCTION fn_buy_blind_box(p_player_id INTEGER, p_box_id INTEGER, p_roll INTEGER, p_pick INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_status      VARCHAR(20);
    v_balance     BIGINT;
    v_box         blind_boxes%ROWTYPE;
    v_regular     INTEGER;
    v_holographic INTEGER;
    v_rare        BOOLEAN;
    v_group       INTEGER;
    v_cosmetic    cosmetics%ROWTYPE;
    v_duplicate   BOOLEAN;
    v_refund      INTEGER := 0;
    v_now         TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
    SELECT account_status, balance
      INTO v_status, v_balance
      FROM players
     WHERE player_id = p_player_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_status <> 'Active' THEN
        RETURN jsonb_build_object('status', 'not_active');
    END IF;

    SELECT * INTO v_box FROM blind_boxes WHERE box_id = p_box_id;

    IF NOT FOUND
       OR NOT v_box.is_available
       OR (v_box.available_from IS NOT NULL AND v_now < v_box.available_from)
       OR (v_box.available_until IS NOT NULL AND v_now >= v_box.available_until) THEN
        RETURN jsonb_build_object('status', 'unavailable');
    END IF;

    SELECT COUNT(*) FILTER (WHERE NOT c.is_holographic), COUNT(*) FILTER (WHERE c.is_holographic)
      INTO v_regular, v_holographic
      FROM blind_box_rewards r
      JOIN cosmetics c ON c.cosmetic_id = r.cosmetic_id
     WHERE r.box_id = p_box_id;

    -- SRS-123.6: an empty box can't be bought.
    IF v_regular + v_holographic = 0 THEN
        RETURN jsonb_build_object('status', 'unavailable');
    END IF;

    v_rare := v_holographic > 0 AND p_roll IS NOT NULL
              AND (v_regular = 0 OR p_roll < v_box.holographic_chance_bp);
    v_group := CASE WHEN v_rare THEN v_holographic ELSE v_regular END;

    IF (p_roll IS NOT NULL AND (p_roll < 0 OR p_roll >= 10000))
       OR p_pick IS NULL OR p_pick < 0 OR p_pick >= v_group THEN
        RETURN jsonb_build_object('status', 'stale_pick',
                                  'regular_count', v_regular,
                                  'holographic_count', v_holographic,
                                  'reward_count', v_group);
    END IF;

    IF v_balance < v_box.price THEN
        RETURN jsonb_build_object('status', 'insufficient_balance', 'balance', v_balance, 'price', v_box.price);
    END IF;

    SELECT c.*
      INTO v_cosmetic
      FROM blind_box_rewards r
      JOIN cosmetics c ON c.cosmetic_id = r.cosmetic_id
     WHERE r.box_id = p_box_id
       AND c.is_holographic = v_rare
     ORDER BY c.cosmetic_id
    OFFSET p_pick
     LIMIT 1;

    v_duplicate := EXISTS (
        SELECT 1 FROM player_cosmetics
         WHERE player_id = p_player_id AND cosmetic_id = v_cosmetic.cosmetic_id
    );

    IF v_duplicate THEN
        v_refund := CEIL(v_box.price / 2.0);
    ELSE
        INSERT INTO player_cosmetics (player_id, cosmetic_id)
        VALUES (p_player_id, v_cosmetic.cosmetic_id);
    END IF;

    UPDATE players
       SET balance = balance - v_box.price + v_refund
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    INSERT INTO blind_box_purchases (player_id, box_id, cosmetic_id, price_paid, was_duplicate, refund_amount)
    VALUES (p_player_id, p_box_id, v_cosmetic.cosmetic_id, v_box.price, v_duplicate, v_refund);

    RETURN jsonb_build_object('status', 'opened',
                              'cosmetic_id', v_cosmetic.cosmetic_id,
                              'cosmetic_name', v_cosmetic.cosmetic_name,
                              'category', v_cosmetic.category,
                              'art_key', v_cosmetic.asset_path,
                              'is_holographic', v_cosmetic.is_holographic,
                              'was_duplicate', v_duplicate,
                              'refund', v_refund,
                              'price', v_box.price,
                              'balance', v_balance);
END;
$$;

-- The version the app called before holographic items: it now draws only
-- regular items. Its pick is an index over all of a box's items, so one past
-- the regular ones comes back as 'stale_pick' with the regular count, and
-- that app picks again from the regular items, which keeps them equally
-- likely.
CREATE OR REPLACE FUNCTION fn_buy_blind_box(p_player_id INTEGER, p_box_id INTEGER, p_pick INTEGER)
RETURNS JSONB
LANGUAGE sql
AS $$
    SELECT fn_buy_blind_box(p_player_id, p_box_id, NULL::INTEGER, p_pick);
$$;

-- Only the server may call fn_buy_blind_box, for the same reason as
-- fn_open_daily_login_box: the anon key is public. The role check lets this
-- script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_buy_blind_box(INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_buy_blind_box(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_buy_blind_box(INTEGER, INTEGER, INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_buy_blind_box(INTEGER, INTEGER, INTEGER, INTEGER) TO service_role';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_buy_blind_box(INTEGER, INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_buy_blind_box(INTEGER, INTEGER, INTEGER) TO service_role';
    END IF;
END;
$$;

-- The catalog. asset_path is the key lib/cosmeticArt.ts draws the
-- cosmetic from (all artwork is drawn in code; there are no image files).
INSERT INTO cosmetics (cosmetic_name, category, is_default, asset_path) VALUES
    ('Classic Navy',     'Card',            TRUE,  'classic-navy'),
    ('Classic Red',      'Chip',            TRUE,  'classic-red'),
    ('Classic Ring',     'Profile Outline', TRUE,  'classic-ring'),
    ('Neon Horizon',     'Card',            FALSE, 'neon-horizon'),
    ('Neon Volt',        'Chip',            FALSE, 'neon-volt'),
    ('Neon Halo',        'Profile Outline', FALSE, 'neon-halo'),
    ('Neon Arcade',      'Card',            FALSE, 'neon-arcade'),
    ('Neon Pulse',       'Chip',            FALSE, 'neon-pulse'),
    ('Neon Circuit',     'Profile Outline', FALSE, 'neon-circuit'),
    ('Royal Crest',      'Card',            FALSE, 'royal-crest'),
    ('Royal Sovereign',  'Chip',            FALSE, 'royal-sovereign'),
    ('Royal Jewels',     'Profile Outline', FALSE, 'royal-jewels'),
    ('Royal Damask',     'Card',            FALSE, 'royal-damask'),
    ('Royal Signet',     'Chip',            FALSE, 'royal-signet'),
    ('Golden Laurel',    'Profile Outline', FALSE, 'golden-laurel'),
    ('Deep Anchor',      'Card',            FALSE, 'deep-anchor'),
    ('Ocean Tide',       'Chip',            FALSE, 'ocean-tide'),
    ('Sea Foam',         'Profile Outline', FALSE, 'sea-foam'),
    ('Coral Reef',       'Card',            FALSE, 'coral-reef'),
    ('Pearl Diver',      'Chip',            FALSE, 'pearl-diver'),
    ('Riptide',          'Profile Outline', FALSE, 'riptide'),
    ('Inferno Blaze',    'Card',            FALSE, 'inferno-blaze'),
    ('Inferno Ember',    'Chip',            FALSE, 'inferno-ember'),
    ('Inferno Corona',   'Profile Outline', FALSE, 'inferno-corona'),
    ('Dragon Eye',       'Card',            FALSE, 'dragon-eye'),
    ('Magma Core',       'Chip',            FALSE, 'magma-core'),
    ('Phoenix',          'Profile Outline', FALSE, 'phoenix'),
    ('Galaxy Nebula',    'Card',            FALSE, 'galaxy-nebula'),
    ('Galaxy Orbit',     'Chip',            FALSE, 'galaxy-orbit'),
    ('Galaxy Starlight', 'Profile Outline', FALSE, 'galaxy-starlight'),
    ('Total Eclipse',    'Card',            FALSE, 'total-eclipse'),
    ('Supernova',        'Chip',            FALSE, 'supernova'),
    ('Orbitals',         'Profile Outline', FALSE, 'orbitals'),
    ('Haunted Moon',     'Card',            FALSE, 'haunted-moon'),
    ('Graveyard Ghost',  'Card',            FALSE, 'graveyard-ghost'),
    ('Jack-o''-Lantern', 'Chip',            FALSE, 'jack-o-lantern'),
    ('Bat Wing',         'Profile Outline', FALSE, 'bat-wing'),
    ('Harvest Turkey',   'Card',            FALSE, 'harvest-turkey'),
    ('Pumpkin Pie',      'Card',            FALSE, 'pumpkin-pie'),
    ('Autumn Leaf',      'Chip',            FALSE, 'autumn-leaf'),
    ('Harvest Wreath',   'Profile Outline', FALSE, 'harvest-wreath'),
    ('Evergreen',        'Card',            FALSE, 'evergreen'),
    ('Frosty Night',     'Card',            FALSE, 'frosty-night'),
    ('Candy Cane',       'Chip',            FALSE, 'candy-cane'),
    ('Holly Wreath',     'Profile Outline', FALSE, 'holly-wreath')
ON CONFLICT (cosmetic_name) DO UPDATE SET asset_path = EXCLUDED.asset_path;

-- Prices follow the number of rewards: 6 rewards = 350 coins, 4 = 500;
-- a limited-time (holiday) box costs 1.25x, so 4 rewards = 625. Holiday
-- windows are midnight to midnight, Eastern Time.
INSERT INTO blind_boxes (box_name, description, price, is_available, available_from, available_until) VALUES
    ('Neon Box',         'Synthwave sunsets, arcade light bars and circuit traces in hot pink and electric cyan.', 350, TRUE, NULL, NULL),
    ('Royal Gold Box',   'Burgundy velvet and navy damask under gold leaf, with crowns, laurels and cut gems.',   350, TRUE, NULL, NULL),
    ('Ocean Box',        'Deep-sea blues, coral reefs, rolling waves, pearls and a rope-wrapped anchor.',         350, TRUE, NULL, NULL),
    ('Inferno Box',      'Flames, embers, molten rock, a dragon''s eye and a rising phoenix.',                    350, TRUE, NULL, NULL),
    ('Galaxy Box',       'Violet nebulae, a total eclipse, a supernova and planets on their orbits.',             350, TRUE, NULL, NULL),
    ('Halloween Box',    'A harvest moon, bats, a graveyard ghost and a grinning jack-o''-lantern.',              625, TRUE,
        '2026-10-01 00:00 America/New_York', '2026-11-01 00:00 America/New_York'),
    ('Thanksgiving Box', 'Falling maple leaves, wheat, a fanned-out turkey and a pumpkin pie.',                   625, TRUE,
        '2026-11-01 00:00 America/New_York', '2026-12-01 00:00 America/New_York'),
    ('Christmas Box',    'Evergreen and presents, a snowman under the moon, candy canes and holly.',              625, TRUE,
        '2026-12-01 00:00 America/New_York', '2027-01-01 00:00 America/New_York')
ON CONFLICT (box_name) DO UPDATE
    SET description     = EXCLUDED.description,
        price           = EXCLUDED.price,
        available_from  = EXCLUDED.available_from,
        available_until = EXCLUDED.available_until;

-- SRS-123.5: defaults are never in a box (blind_box_rewards' foreign key
-- on (cosmetic_id, is_default) also enforces it).
INSERT INTO blind_box_rewards (box_id, cosmetic_id)
SELECT b.box_id, c.cosmetic_id
  FROM (VALUES
    ('Neon Box', 'Neon Horizon'), ('Neon Box', 'Neon Volt'), ('Neon Box', 'Neon Halo'),
    ('Neon Box', 'Neon Arcade'), ('Neon Box', 'Neon Pulse'), ('Neon Box', 'Neon Circuit'),
    ('Royal Gold Box', 'Royal Crest'), ('Royal Gold Box', 'Royal Sovereign'), ('Royal Gold Box', 'Royal Jewels'),
    ('Royal Gold Box', 'Royal Damask'), ('Royal Gold Box', 'Royal Signet'), ('Royal Gold Box', 'Golden Laurel'),
    ('Ocean Box', 'Deep Anchor'), ('Ocean Box', 'Ocean Tide'), ('Ocean Box', 'Sea Foam'),
    ('Ocean Box', 'Coral Reef'), ('Ocean Box', 'Pearl Diver'), ('Ocean Box', 'Riptide'),
    ('Inferno Box', 'Inferno Blaze'), ('Inferno Box', 'Inferno Ember'), ('Inferno Box', 'Inferno Corona'),
    ('Inferno Box', 'Dragon Eye'), ('Inferno Box', 'Magma Core'), ('Inferno Box', 'Phoenix'),
    ('Galaxy Box', 'Galaxy Nebula'), ('Galaxy Box', 'Galaxy Orbit'), ('Galaxy Box', 'Galaxy Starlight'),
    ('Galaxy Box', 'Total Eclipse'), ('Galaxy Box', 'Supernova'), ('Galaxy Box', 'Orbitals'),
    ('Halloween Box', 'Haunted Moon'), ('Halloween Box', 'Graveyard Ghost'),
    ('Halloween Box', 'Jack-o''-Lantern'), ('Halloween Box', 'Bat Wing'),
    ('Thanksgiving Box', 'Harvest Turkey'), ('Thanksgiving Box', 'Pumpkin Pie'),
    ('Thanksgiving Box', 'Autumn Leaf'), ('Thanksgiving Box', 'Harvest Wreath'),
    ('Christmas Box', 'Evergreen'), ('Christmas Box', 'Frosty Night'),
    ('Christmas Box', 'Candy Cane'), ('Christmas Box', 'Holly Wreath')
  ) AS v (box_name, cosmetic_name)
  JOIN blind_boxes b ON b.box_name = v.box_name
  JOIN cosmetics c   ON c.cosmetic_name = v.cosmetic_name
ON CONFLICT DO NOTHING;

-- The holographic items (SRS-123.8) and the Spring, Summer, Autumn, Winter
-- and Nature boxes.
INSERT INTO cosmetics (cosmetic_name, category, is_default, asset_path, is_holographic) VALUES
    ('Neon Prism',       'Card',            FALSE, 'holo-neon',              TRUE),
    ('Prism Volt',       'Chip',            FALSE, 'holo-chip-neon',         TRUE),
    ('Gilded Prism',     'Card',            FALSE, 'holo-royal',             TRUE),
    ('Prism Crown',      'Chip',            FALSE, 'holo-chip-royal',        TRUE),
    ('Opal Tide',        'Card',            FALSE, 'holo-ocean',             TRUE),
    ('Opal Pearl',       'Chip',            FALSE, 'holo-chip-ocean',        TRUE),
    ('Prism Flame',      'Card',            FALSE, 'holo-inferno',           TRUE),
    ('Prism Ember',      'Chip',            FALSE, 'holo-chip-inferno',      TRUE),
    ('Stardust Prism',   'Card',            FALSE, 'holo-galaxy',            TRUE),
    ('Prism Nova',       'Chip',            FALSE, 'holo-chip-galaxy',       TRUE),
    ('Spectral Pumpkin', 'Card',            FALSE, 'holo-halloween',         TRUE),
    ('Spectral Bat',     'Chip',            FALSE, 'holo-chip-halloween',    TRUE),
    ('Golden Harvest',   'Card',            FALSE, 'holo-thanksgiving',      TRUE),
    ('Prism Leaf',       'Chip',            FALSE, 'holo-chip-thanksgiving', TRUE),
    ('Aurora Star',      'Card',            FALSE, 'holo-christmas',         TRUE),
    ('Aurora Flake',     'Chip',            FALSE, 'holo-chip-christmas',    TRUE),
    ('Cherry Blossom',   'Card',            FALSE, 'spring-blossom',         FALSE),
    ('Spring Showers',   'Card',            FALSE, 'spring-showers',         FALSE),
    ('Sakura',           'Chip',            FALSE, 'sakura',                 FALSE),
    ('Butterfly',        'Chip',            FALSE, 'butterfly',              FALSE),
    ('Blossom Branch',   'Profile Outline', FALSE, 'blossom-branch',         FALSE),
    ('Daisy Chain',      'Profile Outline', FALSE, 'daisy-chain',            FALSE),
    ('Prism Bloom',      'Card',            FALSE, 'holo-spring',            TRUE),
    ('Prism Petal',      'Chip',            FALSE, 'holo-chip-spring',       TRUE),
    ('Sunset Palms',     'Card',            FALSE, 'summer-sunset',          FALSE),
    ('Beach Day',        'Card',            FALSE, 'beach-day',              FALSE),
    ('Sunburst',         'Chip',            FALSE, 'sunburst',               FALSE),
    ('Watermelon',       'Chip',            FALSE, 'watermelon',             FALSE),
    ('Sun Ring',         'Profile Outline', FALSE, 'sun-ring',               FALSE),
    ('Tropical Fronds',  'Profile Outline', FALSE, 'tropical-fronds',        FALSE),
    ('Prism Sunset',     'Card',            FALSE, 'holo-summer',            TRUE),
    ('Prism Sun',        'Chip',            FALSE, 'holo-chip-summer',       TRUE),
    ('Maple Grove',      'Card',            FALSE, 'maple-grove',            FALSE),
    ('Night Owl',        'Card',            FALSE, 'night-owl',              FALSE),
    ('Acorn',            'Chip',            FALSE, 'acorn',                  FALSE),
    ('Toadstool',        'Chip',            FALSE, 'toadstool',              FALSE),
    ('Falling Leaves',   'Profile Outline', FALSE, 'falling-leaves',         FALSE),
    ('Fairy Ring',       'Profile Outline', FALSE, 'fairy-ring',             FALSE),
    ('Prism Maple',      'Card',            FALSE, 'holo-autumn',            TRUE),
    ('Prism Acorn',      'Chip',            FALSE, 'holo-chip-autumn',       TRUE),
    ('Northern Lights',  'Card',            FALSE, 'northern-lights',        FALSE),
    ('Ice Crystal',      'Card',            FALSE, 'ice-crystal',            FALSE),
    ('Penguin',          'Chip',            FALSE, 'penguin',                FALSE),
    ('Glacier',          'Chip',            FALSE, 'glacier',                FALSE),
    ('Icicle Ring',      'Profile Outline', FALSE, 'icicle-ring',            FALSE),
    ('Frost Ring',       'Profile Outline', FALSE, 'frost-ring',             FALSE),
    ('Prism Frost',      'Card',            FALSE, 'holo-winter',            TRUE),
    ('Prism Glacier',    'Chip',            FALSE, 'holo-chip-winter',       TRUE),
    ('Ancient Oak',      'Card',            FALSE, 'ancient-oak',            FALSE),
    ('Misty Pines',      'Card',            FALSE, 'misty-pines',            FALSE),
    ('Oak Leaf',         'Chip',            FALSE, 'oak-leaf',               FALSE),
    ('Pinecone',         'Chip',            FALSE, 'pinecone',               FALSE),
    ('Ivy Vine',         'Profile Outline', FALSE, 'ivy-vine',               FALSE),
    ('Songbird Branch',  'Profile Outline', FALSE, 'songbird-branch',        FALSE),
    ('Prism Grove',      'Card',            FALSE, 'holo-nature',            TRUE),
    ('Prism Sprout',     'Chip',            FALSE, 'holo-chip-nature',       TRUE)
ON CONFLICT (cosmetic_name) DO UPDATE
    SET asset_path     = EXCLUDED.asset_path,
        is_holographic = EXCLUDED.is_holographic;

-- The five new boxes are always in the shop. 6 regular items = 350 coins,
-- like the other theme boxes.
INSERT INTO blind_boxes (box_name, description, price, is_available, available_from, available_until) VALUES
    ('Spring Box', 'Cherry blossoms, spring showers, butterflies, tulips and a chain of daisies.',              350, TRUE, NULL, NULL),
    ('Summer Box', 'Sunset palms, a day at the beach, a sunburst, watermelon and tropical flowers.',            350, TRUE, NULL, NULL),
    ('Autumn Box', 'A maple grove, a night owl under the harvest moon, acorns and a fairy ring of toadstools.', 350, TRUE, NULL, NULL),
    ('Winter Box', 'Northern lights, ice crystals, a penguin, glaciers and a ring of icicles.',                 350, TRUE, NULL, NULL),
    ('Nature Box', 'An ancient oak, misty pines, oak leaves, a pinecone, ivy and a songbird on a branch.',      350, TRUE, NULL, NULL)
ON CONFLICT (box_name) DO UPDATE
    SET description = EXCLUDED.description,
        price       = EXCLUDED.price;

INSERT INTO blind_box_rewards (box_id, cosmetic_id)
SELECT b.box_id, c.cosmetic_id
  FROM (VALUES
    ('Neon Box', 'Neon Prism'), ('Neon Box', 'Prism Volt'),
    ('Royal Gold Box', 'Gilded Prism'), ('Royal Gold Box', 'Prism Crown'),
    ('Ocean Box', 'Opal Tide'), ('Ocean Box', 'Opal Pearl'),
    ('Inferno Box', 'Prism Flame'), ('Inferno Box', 'Prism Ember'),
    ('Galaxy Box', 'Stardust Prism'), ('Galaxy Box', 'Prism Nova'),
    ('Halloween Box', 'Spectral Pumpkin'), ('Halloween Box', 'Spectral Bat'),
    ('Thanksgiving Box', 'Golden Harvest'), ('Thanksgiving Box', 'Prism Leaf'),
    ('Christmas Box', 'Aurora Star'), ('Christmas Box', 'Aurora Flake'),
    ('Spring Box', 'Cherry Blossom'), ('Spring Box', 'Spring Showers'), ('Spring Box', 'Sakura'),
    ('Spring Box', 'Butterfly'), ('Spring Box', 'Blossom Branch'), ('Spring Box', 'Daisy Chain'),
    ('Spring Box', 'Prism Bloom'), ('Spring Box', 'Prism Petal'),
    ('Summer Box', 'Sunset Palms'), ('Summer Box', 'Beach Day'), ('Summer Box', 'Sunburst'),
    ('Summer Box', 'Watermelon'), ('Summer Box', 'Sun Ring'), ('Summer Box', 'Tropical Fronds'),
    ('Summer Box', 'Prism Sunset'), ('Summer Box', 'Prism Sun'),
    ('Autumn Box', 'Maple Grove'), ('Autumn Box', 'Night Owl'), ('Autumn Box', 'Acorn'),
    ('Autumn Box', 'Toadstool'), ('Autumn Box', 'Falling Leaves'), ('Autumn Box', 'Fairy Ring'),
    ('Autumn Box', 'Prism Maple'), ('Autumn Box', 'Prism Acorn'),
    ('Winter Box', 'Northern Lights'), ('Winter Box', 'Ice Crystal'), ('Winter Box', 'Penguin'),
    ('Winter Box', 'Glacier'), ('Winter Box', 'Icicle Ring'), ('Winter Box', 'Frost Ring'),
    ('Winter Box', 'Prism Frost'), ('Winter Box', 'Prism Glacier'),
    ('Nature Box', 'Ancient Oak'), ('Nature Box', 'Misty Pines'), ('Nature Box', 'Oak Leaf'),
    ('Nature Box', 'Pinecone'), ('Nature Box', 'Ivy Vine'), ('Nature Box', 'Songbird Branch'),
    ('Nature Box', 'Prism Grove'), ('Nature Box', 'Prism Sprout')
  ) AS v (box_name, cosmetic_name)
  JOIN blind_boxes b ON b.box_name = v.box_name
  JOIN cosmetics c   ON c.cosmetic_name = v.cosmetic_name
ON CONFLICT DO NOTHING;

-- A holographic profile outline in every box, so a box's holographic card,
-- chip and outline share its 3% tier at 1% each (SRS-123.8).
INSERT INTO cosmetics (cosmetic_name, category, is_default, asset_path, is_holographic) VALUES
    ('Prism Halo',       'Profile Outline', FALSE, 'holo-outline-neon',         TRUE),
    ('Prism Laurel',     'Profile Outline', FALSE, 'holo-outline-royal',        TRUE),
    ('Opal Wave',        'Profile Outline', FALSE, 'holo-outline-ocean',        TRUE),
    ('Prism Blaze',      'Profile Outline', FALSE, 'holo-outline-inferno',      TRUE),
    ('Prism Orbit',      'Profile Outline', FALSE, 'holo-outline-galaxy',       TRUE),
    ('Spectral Web',     'Profile Outline', FALSE, 'holo-outline-halloween',    TRUE),
    ('Prism Wreath',     'Profile Outline', FALSE, 'holo-outline-thanksgiving', TRUE),
    ('Aurora Wreath',    'Profile Outline', FALSE, 'holo-outline-christmas',    TRUE),
    ('Prism Garden',     'Profile Outline', FALSE, 'holo-outline-spring',       TRUE),
    ('Prism Tropics',    'Profile Outline', FALSE, 'holo-outline-summer',       TRUE),
    ('Prism Fairy Ring', 'Profile Outline', FALSE, 'holo-outline-autumn',       TRUE),
    ('Prism Icicles',    'Profile Outline', FALSE, 'holo-outline-winter',       TRUE),
    ('Prism Vine',       'Profile Outline', FALSE, 'holo-outline-nature',       TRUE)
ON CONFLICT (cosmetic_name) DO UPDATE
    SET asset_path     = EXCLUDED.asset_path,
        is_holographic = EXCLUDED.is_holographic;

INSERT INTO blind_box_rewards (box_id, cosmetic_id)
SELECT b.box_id, c.cosmetic_id
  FROM (VALUES
    ('Neon Box', 'Prism Halo'), ('Royal Gold Box', 'Prism Laurel'), ('Ocean Box', 'Opal Wave'),
    ('Inferno Box', 'Prism Blaze'), ('Galaxy Box', 'Prism Orbit'), ('Halloween Box', 'Spectral Web'),
    ('Thanksgiving Box', 'Prism Wreath'), ('Christmas Box', 'Aurora Wreath'), ('Spring Box', 'Prism Garden'),
    ('Summer Box', 'Prism Tropics'), ('Autumn Box', 'Prism Fairy Ring'), ('Winter Box', 'Prism Icicles'),
    ('Nature Box', 'Prism Vine')
  ) AS v (box_name, cosmetic_name)
  JOIN blind_boxes b ON b.box_name = v.box_name
  JOIN cosmetics c   ON c.cosmetic_name = v.cosmetic_name
ON CONFLICT DO NOTHING;

-- Table: daily_login_box_claims
-- Reviewed by: JO (James Ortiz)
-- Supports: SRS-110.2, SRS-110.3, SRS-110.4, SRS-128.3, SRS-128.5, SRS-128.8, SRS-128.9, SRS-128.11, SRS-128.12, SRS-128.15, SRS-128.16, SRS-128.18, SRS-128.19, SRS-NFR-108
-- Purpose: Records each Daily Login Box opening with its coin reward and when the player's next box becomes available. A player with no rows can open a box right away.
CREATE TABLE daily_login_box_claims (
    claim_id            SERIAL       PRIMARY KEY,
    player_id           INTEGER      NOT NULL
                        REFERENCES players(player_id) ON DELETE CASCADE,
    reward_amount       INTEGER      NOT NULL,
    claimed_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    next_available_at   TIMESTAMPTZ  NOT NULL,

    -- SRS-128.5: the rewards are 250, 500, 750, and 1,000 coins. 25, 50, 75,
    -- and 100 were the rewards before 2026-10-15 and stay allowed so those
    -- earlier claims remain valid.
    CONSTRAINT chk_daily_login_box_claims_reward
        CHECK (reward_amount IN (250, 500, 750, 1000, 25, 50, 75, 100)),

    -- SRS-128.11: the cooldown lasts exactly 24 hours from the claim.
    CONSTRAINT chk_daily_login_box_claims_cooldown
        CHECK (next_available_at = claimed_at + INTERVAL '24 hours')
);

CREATE INDEX ix_daily_login_box_claims_player
    ON daily_login_box_claims (player_id, next_available_at DESC);

-- Opens a player's Daily Login Box as one transaction (SRS-128.9,
-- SRS-NFR-108): checks the player may open it, credits the reward, records
-- the claim, and starts the 24-hour cooldown. If any step fails, nothing is
-- kept and the box stays available (SRS-128.21).
--   * SRS-128.19: the player's row is locked first, so simultaneous
--     requests run one at a time and only the first one can claim.
--   * SRS-128.12: no second claim before next_available_at.
--   * SRS-128.20: only Active accounts may open the box.
-- The API picks the reward with a cryptographically secure random number
-- (lib/dailyLoginBox.ts) and passes it in; this function accepts only the
-- allowed amounts. The app awards 250-1,000 coins (SRS-128.5); 25-100, the
-- amounts before 2026-10-15, are still accepted so copies of the app that
-- haven't pulled the change yet keep working instead of failing to open.
CREATE OR REPLACE FUNCTION fn_open_daily_login_box(p_player_id INTEGER, p_reward INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_status        VARCHAR(20);
    v_available_at  TIMESTAMPTZ;
    v_balance       BIGINT;
    v_claimed_at    TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
    IF p_reward IS NULL OR p_reward NOT IN (250, 500, 750, 1000, 25, 50, 75, 100) THEN
        RAISE EXCEPTION 'Invalid Daily Login Box reward: %', p_reward;
    END IF;

    SELECT account_status
      INTO v_status
      FROM players
     WHERE player_id = p_player_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_status <> 'Active' THEN
        RETURN jsonb_build_object('status', 'not_active');
    END IF;

    SELECT MAX(next_available_at)
      INTO v_available_at
      FROM daily_login_box_claims
     WHERE player_id = p_player_id;

    IF v_available_at > v_claimed_at THEN
        RETURN jsonb_build_object('status', 'cooldown',
                                  'next_available_at', v_available_at);
    END IF;

    UPDATE players
       SET balance = balance + p_reward
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    INSERT INTO daily_login_box_claims (player_id, reward_amount, claimed_at, next_available_at)
    VALUES (p_player_id, p_reward, v_claimed_at, v_claimed_at + INTERVAL '24 hours');

    RETURN jsonb_build_object('status', 'opened',
                              'reward', p_reward,
                              'balance', v_balance,
                              'next_available_at', v_claimed_at + INTERVAL '24 hours');
END;
$$;

-- Only the server may call fn_open_daily_login_box. Supabase grants EXECUTE
-- on new functions to its anon and authenticated roles, and the anon key is
-- public (it ships to browsers for the poker page's Realtime connection), so
-- those grants are removed and only the service role keeps access. The role
-- check lets this script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_open_daily_login_box(INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_open_daily_login_box(INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_open_daily_login_box(INTEGER, INTEGER) TO service_role';
    END IF;
END;
$$;


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
    -- The Odds API sport key (e.g. 'americanfootball_nfl'); NULL for
    -- leagues entered by hand.
    odds_api_key    VARCHAR(100) UNIQUE,

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
    -- The Odds API event id, used to upsert on each sync; NULL for events
    -- entered by hand.
    external_id     VARCHAR(64)  UNIQUE,
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
    -- 'Cancelled' when the player cancels before the cutoff (fn_cancel_wager).
    result              VARCHAR(10)
                        CONSTRAINT chk_wagers_result
                        CHECK (result IN ('Won', 'Lost', 'Refunded', 'Cancelled')),
    payout              BIGINT,
    settled_at          TIMESTAMPTZ,
    -- NULL until the player dismisses the results pop-up showing this
    -- wager's result (SRS-209.1, SRS-210.2, SRS-210.4).
    result_seen_at      TIMESTAMPTZ,

    -- Result, payout, and settlement time are recorded together.
    CONSTRAINT chk_wagers_settlement_complete
        CHECK ((result IS NULL AND payout IS NULL AND settled_at IS NULL)
               OR (result IS NOT NULL AND payout IS NOT NULL AND settled_at IS NOT NULL)),

    -- SRS-210.1 - SRS-210.4: lost pays 0, refunded and cancelled return the
    -- stake, won pays more than the stake.
    CONSTRAINT chk_wagers_payout_matches_result
        CHECK (result IS NULL
               OR (result = 'Lost'      AND payout = 0)
               OR (result = 'Refunded'  AND payout = amount)
               OR (result = 'Cancelled' AND payout = amount)
               OR (result = 'Won'       AND payout > amount))
);

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

-- SRS-205.6: cancels a player's open wager and returns the stake, as one
-- transaction. If any check fails, nothing changes.
--   * The player's row is locked first (the same order as fn_place_wager),
--     so a cancel and a new bet from the same player can't interleave.
--   * Only the player who placed the wager can cancel it.
--   * Only open wagers (no result yet) can be cancelled, so a wager is never
--     refunded twice or cancelled after it was settled.
--   * Cancelling closes 1 hour before the game starts
--     (CANCEL_CUTOFF_MS in lib/sports/wagers.ts).
CREATE OR REPLACE FUNCTION fn_cancel_wager(p_player_id INTEGER, p_wager_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance      BIGINT;
    v_owner        INTEGER;
    v_amount       BIGINT;
    v_result       VARCHAR(10);
    v_start_time   TIMESTAMPTZ;
BEGIN
    SELECT balance
      INTO v_balance
      FROM players
     WHERE player_id = p_player_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    SELECT w.player_id, w.amount, w.result, e.start_time
      INTO v_owner, v_amount, v_result, v_start_time
      FROM wagers w
      JOIN betting_options o ON o.option_id = w.option_id
      JOIN betting_markets m ON m.market_id = o.market_id
      JOIN sports_events e   ON e.event_id = m.event_id
     WHERE w.wager_id = p_wager_id
       FOR UPDATE OF w;

    -- Someone else's wager looks the same as a missing one.
    IF NOT FOUND OR v_owner <> p_player_id THEN
        RETURN jsonb_build_object('status', 'wager_not_found');
    END IF;

    IF v_result IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_settled', 'result', v_result);
    END IF;

    IF CURRENT_TIMESTAMP >= v_start_time - INTERVAL '1 hour' THEN
        RETURN jsonb_build_object('status', 'too_late');
    END IF;

    UPDATE players
       SET balance = balance + v_amount
     WHERE player_id = p_player_id
    RETURNING balance INTO v_balance;

    UPDATE wagers
       SET result = 'Cancelled', payout = v_amount, settled_at = CURRENT_TIMESTAMP
     WHERE wager_id = p_wager_id;

    RETURN jsonb_build_object('status', 'cancelled',
                              'wager_id', p_wager_id,
                              'refund', v_amount,
                              'balance', v_balance);
END;
$$;

-- Only the server may call fn_cancel_wager. Supabase grants EXECUTE on new
-- functions to its anon and authenticated roles, and the anon key is public
-- (it ships to browsers for the poker page's Realtime connection), so those
-- grants are removed and only the service role keeps access. The role check
-- lets this script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_cancel_wager(INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_cancel_wager(INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_cancel_wager(INTEGER, INTEGER) TO service_role';
    END IF;
END;
$$;

-- Settles one open wager as one transaction (SRS-209.1, SRS-210.1,
-- SRS-210.3, SRS-NFR-4): records the result, pays the player, and adds the
-- outcome to their sports-betting stats (SRS-117, SRS-118). The result is
-- worked out by lib/sports/settle.ts from the final score and the market's
-- rules; the payout is worked out here from the stored stake and odds, so
-- the amount paid always matches the wager.
--   * Won pays FLOOR(stake x odds at placement), the same rounding as
--     potentialPayout() in lib/sports/payout.ts; Refunded returns the stake;
--     Lost pays nothing.
--   * The player's row is locked before the wager's (the same order as
--     fn_place_wager and fn_cancel_wager), and a wager that already has a
--     result is left alone, so a wager is never paid twice.
--   * SRS-117 / SRS-118: a win adds its profit (payout - stake) to
--     money_won, a loss adds the stake to money_lost, and a refund adds to
--     neither.
CREATE OR REPLACE FUNCTION fn_settle_wager(p_wager_id INTEGER, p_result VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_player_id  INTEGER;
    v_amount     BIGINT;
    v_odds       NUMERIC(7,3);
    v_existing   VARCHAR(10);
    v_payout     BIGINT;
BEGIN
    IF p_result IS NULL OR p_result NOT IN ('Won', 'Lost', 'Refunded') THEN
        RAISE EXCEPTION 'Invalid wager result: %', p_result;
    END IF;

    SELECT player_id INTO v_player_id FROM wagers WHERE wager_id = p_wager_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    PERFORM 1 FROM players WHERE player_id = v_player_id FOR UPDATE;

    SELECT amount, odds_at_placement, result
      INTO v_amount, v_odds, v_existing
      FROM wagers
     WHERE wager_id = p_wager_id
       FOR UPDATE;

    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_settled', 'result', v_existing);
    END IF;

    v_payout := CASE p_result
                    WHEN 'Won'      THEN FLOOR(v_amount * v_odds)
                    WHEN 'Refunded' THEN v_amount
                    ELSE 0
                END;

    IF v_payout > 0 THEN
        UPDATE players SET balance = balance + v_payout WHERE player_id = v_player_id;
    END IF;

    UPDATE wagers
       SET result = p_result, payout = v_payout, settled_at = CURRENT_TIMESTAMP
     WHERE wager_id = p_wager_id;

    IF p_result <> 'Refunded' THEN
        INSERT INTO player_game_stats (player_id, game_code, money_won, money_lost)
        VALUES (v_player_id, 'sports_betting',
                CASE WHEN p_result = 'Won'  THEN v_payout - v_amount ELSE 0 END,
                CASE WHEN p_result = 'Lost' THEN v_amount ELSE 0 END)
        ON CONFLICT (player_id, game_code) DO UPDATE
           SET money_won  = player_game_stats.money_won  + EXCLUDED.money_won,
               money_lost = player_game_stats.money_lost + EXCLUDED.money_lost;
    END IF;

    RETURN jsonb_build_object('status', 'settled',
                              'wager_id', p_wager_id,
                              'player_id', v_player_id,
                              'result', p_result,
                              'payout', v_payout);
END;
$$;

-- Only the server may call fn_settle_wager. Supabase grants EXECUTE on new
-- functions to its anon and authenticated roles, and the anon key is public
-- (it ships to browsers for the poker page's Realtime connection), so those
-- grants are removed and only the service role keeps access. The role check
-- lets this script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_settle_wager(INTEGER, VARCHAR) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_settle_wager(INTEGER, VARCHAR) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_settle_wager(INTEGER, VARCHAR) TO service_role';
    END IF;
END;
$$;

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
    -- When the sync picked this game as its sport's Showdown.
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The team that won, once Settled; NULL while Pending or when Refunded.
    winning_team_id INTEGER      REFERENCES teams(team_id),

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
    -- When the player last topped up this entry.
    updated_at      TIMESTAMPTZ,
    -- NULL until the player dismisses the results pop-up showing this entry.
    result_seen_at  TIMESTAMPTZ,

    -- SRS-212.3: one entry per player per public bet, so a player can
    -- never back both teams.
    CONSTRAINT uq_public_bet_entries_one_per_player UNIQUE (public_bet_id, player_id)
);

-- Joins or tops up a player's Showdown entry as one transaction
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

-- Settles a Showdown and pays everyone, as one transaction (SRS-214,
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


-- =============================================================================
-- Roulette
-- =============================================================================

-- Table: roulette_spins
-- Reviewed by: CL (Cris Luperon)
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
-- Reviewed by: CL (Cris Luperon)
-- Supports: SRS-117.1, SRS-117.4, SRS-118.1, SRS-118.3, SRS-301.1, SRS-301.3, SRS-301.5, SRS-304.1, SRS-304.3
-- Purpose: Stores each bet a player places on a roulette round and its payout once the spin is settled.
CREATE TABLE roulette_bets (
    bet_id          SERIAL       PRIMARY KEY,
    spin_id         INTEGER      NOT NULL
                    REFERENCES roulette_spins(spin_id) ON DELETE CASCADE,
    bet_type        VARCHAR(10)  NOT NULL,
    bet_number      SMALLINT     CHECK (bet_number BETWEEN 0 AND 36),
    amount          BIGINT       NOT NULL
                    CHECK (amount > 0),
    -- Coins the bet returned: its stake plus winnings on a win, 0 on a loss
    -- (SRS-304.1). Pending bets live only on the page until Spin
    -- (SRS-301.8), so fn_spin_roulette writes each row already settled.
    payout          BIGINT       CHECK (payout >= 0),

    -- SRS-301.3: the bet types the table offers.
    CONSTRAINT chk_roulette_bets_type
        CHECK (bet_type IN ('Number', 'Red', 'Black', 'Odd', 'Even', 'Low', 'High',
                            'Dozen1', 'Dozen2', 'Dozen3', 'Column1', 'Column2', 'Column3')),

    -- SRS-301.5: every bet is a sum of 5/10/25/50/100 chips.
    CONSTRAINT chk_roulette_bets_chip_amount
        CHECK (amount % 5 = 0),

    -- Only a specific-number bet names a number.
    CONSTRAINT chk_roulette_bets_number
        CHECK ((bet_type = 'Number') = (bet_number IS NOT NULL))
);

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


-- =============================================================================
-- Slot machine
-- =============================================================================

-- Table: slot_bet_amounts
-- Reviewed by: CL (Cris Luperon)
-- Supports: SRS-306.1
-- Purpose: Lists the bet amounts a player may choose from before spinning the slot machine.
CREATE TABLE slot_bet_amounts (
    bet_amount      INTEGER      PRIMARY KEY
                    CHECK (bet_amount > 0)
);

-- Table: slot_spins
-- Reviewed by: CL (Cris Luperon)
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

-- SRS-203.1, SRS-203.2, SRS-215.2: the market types synced from The Odds API
-- (h2h, spreads, totals) with the rules shown to players.
INSERT INTO market_types (market_type_code, display_name, description, rules_text, tie_rules, refund_conditions) VALUES
    ('moneyline', 'Moneyline',
     'Pick which team wins the game outright.',
     'Your pick must win the game. Overtime counts.',
     'If the game ends in a tie and no Draw option was offered, the wager is refunded. If a Draw option was offered, only the Draw pick wins.',
     'Refunded if the event is canceled or postponed.'),
    ('point_spread', 'Point Spread',
     'Pick a team to cover the spread: the favorite must win by more than the line, the underdog must win or lose by less than it.',
     'Add the spread to your team''s final score. Your pick wins if that adjusted score is higher than the opponent''s. Overtime counts.',
     'If the adjusted scores are equal (a push), the wager is refunded.',
     'Refunded on a push, or if the event is canceled or postponed.'),
    ('total', 'Over/Under',
     'Pick whether the combined final score will be over or under the line.',
     'Add both teams'' final scores. Over wins if the sum is above the line; Under wins if it is below. Overtime counts.',
     'If the combined score equals the line exactly (a push), the wager is refunded.',
     'Refunded on a push, or if the event is canceled or postponed.');
