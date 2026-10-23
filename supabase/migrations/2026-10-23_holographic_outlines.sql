-- =============================================================================
-- Migration: Holographic profile outlines (UR-123)
-- Author: JO (James Ortiz)
--
-- Updates an EXISTING database to match supabase/schema.sql. Run it once in
-- the Supabase SQL Editor, after 2026-10-22_holographic_items_and_new_boxes.sql.
-- It only adds things (no data is removed), and it is safe to run more than
-- once.
--
-- What it changes:
--   Adds a holographic profile outline to each of the 13 blind boxes. A box's
--   holographic items share its holographic_chance_bp equally, so with a
--   card, a chip and an outline the 3% tier becomes 1% each, and the regular
--   items keep their 97% (SRS-123.8). fn_buy_blind_box already handles any
--   number of holographic items, so it is unchanged.
-- =============================================================================

BEGIN;

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

COMMIT;
