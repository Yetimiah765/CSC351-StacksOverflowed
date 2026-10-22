-- =============================================================================
-- Migration: Cosmetics collection and blind boxes (UR-119, UR-120, UR-122 - UR-127)
-- Author: JO (James Ortiz)
--
-- Updates an EXISTING database to match supabase/schema.sql. Run it once in
-- the Supabase SQL Editor. It only adds things (no data is removed), and it
-- is safe to run more than once.
--
-- What it changes:
--   1. blind_boxes gets optional start and end times, for limited-time
--      (holiday) boxes (SRS-122.3, SRS-122.4).
--   2. Every player gets the three default cosmetics, owned and equipped,
--      when their account is created (SRS-119.4, SRS-120.3), through a
--      trigger on players.
--   3. Adds fn_buy_blind_box(), callable only by the service role.
--   4. Fills in the cosmetic catalog: the 3 Classic defaults and the 42
--      cosmetics in 8 blind boxes, then gives the defaults to every
--      existing player.
-- =============================================================================

BEGIN;

-- 1. Limited-time boxes: NULL means no limit on that side.
ALTER TABLE blind_boxes ADD COLUMN IF NOT EXISTS available_from  TIMESTAMPTZ;
ALTER TABLE blind_boxes ADD COLUMN IF NOT EXISTS available_until TIMESTAMPTZ;
ALTER TABLE blind_boxes DROP CONSTRAINT IF EXISTS chk_blind_boxes_window;
ALTER TABLE blind_boxes ADD CONSTRAINT chk_blind_boxes_window
    CHECK (available_from IS NULL OR available_until IS NULL OR available_from < available_until);

-- 2. SRS-119.4 / SRS-120.3: a new account owns and wears the default card,
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

-- 3. Buys and opens one blind box as one transaction (SRS-124.4 - SRS-126.5):
--   * The player's row is locked first, so simultaneous purchases run one at
--     a time and each sees the balance the previous one left.
--   * Only Active accounts may buy.
--   * SRS-122.3 / SRS-122.4: the box must be available now; a limited-time
--     box is refused before its start or from its end time on.
--   * SRS-124.5: a balance below the price is refused and nothing changes.
--   * SRS-125.1 / SRS-123.1: the API picks p_pick, a uniformly random index
--     from 0 to n - 1 (crypto.randomInt), over the box's n rewards ordered by
--     cosmetic_id, so each reward is exactly 1/n likely. A pick that is out
--     of range (the pool changed) returns 'stale_pick' and nothing changes.
--   * SRS-125.2 / SRS-126.1 - SRS-126.4: a new cosmetic joins the collection;
--     a duplicate is not stored again and refunds 50% of the price, rounded up.
--   * SRS-124.4 / SRS-125.3: the price is deducted and the result is saved in
--     this one call, so it completes even if the player closes the tab.
CREATE OR REPLACE FUNCTION fn_buy_blind_box(p_player_id INTEGER, p_box_id INTEGER, p_pick INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_status     VARCHAR(20);
    v_balance    BIGINT;
    v_box        blind_boxes%ROWTYPE;
    v_count      INTEGER;
    v_cosmetic   cosmetics%ROWTYPE;
    v_duplicate  BOOLEAN;
    v_refund     INTEGER := 0;
    v_now        TIMESTAMPTZ := CURRENT_TIMESTAMP;
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

    SELECT COUNT(*) INTO v_count FROM blind_box_rewards WHERE box_id = p_box_id;

    -- SRS-123.6: an empty box can't be bought.
    IF v_count = 0 THEN
        RETURN jsonb_build_object('status', 'unavailable');
    END IF;

    IF p_pick IS NULL OR p_pick < 0 OR p_pick >= v_count THEN
        RETURN jsonb_build_object('status', 'stale_pick', 'reward_count', v_count);
    END IF;

    IF v_balance < v_box.price THEN
        RETURN jsonb_build_object('status', 'insufficient_balance', 'balance', v_balance, 'price', v_box.price);
    END IF;

    SELECT c.*
      INTO v_cosmetic
      FROM blind_box_rewards r
      JOIN cosmetics c ON c.cosmetic_id = r.cosmetic_id
     WHERE r.box_id = p_box_id
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
                              'was_duplicate', v_duplicate,
                              'refund', v_refund,
                              'price', v_box.price,
                              'balance', v_balance);
END;
$$;

-- Only the server may call fn_buy_blind_box, for the same reason as
-- fn_open_daily_login_box: the anon key is public. The role check lets this
-- script still run on plain PostgreSQL, which has no anon role.
REVOKE EXECUTE ON FUNCTION fn_buy_blind_box(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_buy_blind_box(INTEGER, INTEGER, INTEGER) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_buy_blind_box(INTEGER, INTEGER, INTEGER) TO service_role';
    END IF;
END;
$$;

-- 4. The catalog. asset_path is the key lib/cosmeticArt.ts draws the
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

-- Accounts created before this migration get their defaults now.
INSERT INTO player_cosmetics (player_id, cosmetic_id)
SELECT p.player_id, c.cosmetic_id
  FROM players p CROSS JOIN cosmetics c
 WHERE c.is_default
ON CONFLICT DO NOTHING;

INSERT INTO player_equipped_cosmetics (player_id, category, cosmetic_id)
SELECT p.player_id, c.category, c.cosmetic_id
  FROM players p CROSS JOIN cosmetics c
 WHERE c.is_default
ON CONFLICT (player_id, category) DO NOTHING;

COMMIT;

-- Ask the Supabase API to pick up the new function and columns right away.
NOTIFY pgrst, 'reload schema';
