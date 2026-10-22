-- =============================================================================
-- Migration: Holographic items and five new blind boxes (UR-122, UR-123, UR-125, UR-127)
-- Author: JO (James Ortiz)
--
-- Updates an EXISTING database to match supabase/schema.sql. Run it once in
-- the Supabase SQL Editor, after 2026-10-22_cosmetics_and_blind_boxes.sql.
-- It only adds things (no data is removed), and it is safe to run more than
-- once.
--
-- What it changes:
--   1. cosmetics.is_holographic marks the rare holographic items, and
--      blind_boxes.holographic_chance_bp is a box's combined chance of giving
--      one of them, in basis points: 300 = 3%, so 1.5% each for a box's
--      holographic card and chip (SRS-123.8).
--   2. fn_buy_blind_box gets a 4-argument version that rolls for the
--      holographic tier first (SRS-123.2, SRS-125.1). The 3-argument version
--      from the last migration now picks only regular items, so a copy of the
--      app from before this change never gives a holographic item at the
--      wrong odds.
--   3. Adds 56 cosmetics: a holographic card and chip for each of the 8
--      existing boxes, and the Spring, Summer, Autumn, Winter and Nature
--      boxes (6 items plus a holographic card and chip each), which are
--      always in the shop at 350 coins.
-- =============================================================================

BEGIN;

-- 1. The holographic tier.
ALTER TABLE cosmetics   ADD COLUMN IF NOT EXISTS is_holographic        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE blind_boxes ADD COLUMN IF NOT EXISTS holographic_chance_bp INTEGER NOT NULL DEFAULT 300;
ALTER TABLE blind_boxes DROP CONSTRAINT IF EXISTS chk_blind_boxes_holographic_chance;
ALTER TABLE blind_boxes ADD CONSTRAINT chk_blind_boxes_holographic_chance
    CHECK (holographic_chance_bp BETWEEN 0 AND 10000);

-- 2. Buys and opens one blind box as one transaction (SRS-124.4 - SRS-126.5):
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

-- 3. The new cosmetics. asset_path is the key lib/cosmeticArt.ts draws the
-- cosmetic from.
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

COMMIT;

-- Ask the Supabase API to pick up the new function and columns right away.
NOTIFY pgrst, 'reload schema';
