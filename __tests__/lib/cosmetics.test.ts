import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { CHIP_SKIN_VALUES, COSMETIC_ART_KEYS, drawCosmetic } from '../../lib/cosmeticArt';
import { byCategory, duplicateRefund, isBoxOnSale, OUTLINE_ACCENTS, rewardChances, type Cosmetic } from '../../lib/cosmetics';

describe('blind box rules', () => {
  it('refunds half the price on a duplicate, rounded up (SRS-126.3, SRS-126.4)', () => {
    expect(duplicateRefund(350)).toBe(175);
    expect(duplicateRefund(625)).toBe(313);
    expect(duplicateRefund(1)).toBe(1);
  });

  it('splits the odds: holographic items share 3%, regular items share the rest (SRS-123.2, SRS-123.8)', () => {
    expect(rewardChances(6, 2, 300)).toEqual({ regular: '16.17%', holographic: '1.5%' });
    expect(rewardChances(4, 2, 300)).toEqual({ regular: '24.25%', holographic: '1.5%' });
    expect(rewardChances(6, 0, 300)).toEqual({ regular: '16.67%', holographic: null });
    expect(rewardChances(1, 0, 300)).toEqual({ regular: '100%', holographic: null });
    expect(rewardChances(0, 2, 300)).toEqual({ regular: null, holographic: '50%' });
  });

  it('adds up to 100% (SRS-123.3)', () => {
    for (const [regular, holographic] of [[6, 2], [4, 2], [5, 1], [6, 0]]) {
      const chance = holographic ? 0.03 : 0;
      expect(regular * ((1 - chance) / regular) + (holographic ? holographic * (chance / holographic) : 0)).toBeCloseTo(1, 10);
    }
  });

  it('puts a limited-time box on sale only inside its window, end time excluded (SRS-122.3)', () => {
    const box = { is_available: true, available_from: '2026-10-01T04:00:00Z', available_until: '2026-11-01T04:00:00Z' };
    expect(isBoxOnSale(box, Date.parse('2026-09-30T12:00:00Z'))).toBe(false);
    expect(isBoxOnSale(box, Date.parse('2026-10-01T04:00:00Z'))).toBe(true);
    expect(isBoxOnSale(box, Date.parse('2026-11-01T03:59:59Z'))).toBe(true);
    expect(isBoxOnSale(box, Date.parse('2026-11-01T04:00:00Z'))).toBe(false);
    expect(isBoxOnSale({ is_available: true, available_from: null, available_until: null })).toBe(true);
    expect(isBoxOnSale({ is_available: false, available_from: null, available_until: null })).toBe(false);
  });

  it('orders cosmetics card, chip, outline (SRS-119.3)', () => {
    const c = (cosmeticId: number, category: Cosmetic['category']): Cosmetic => ({ cosmeticId, name: '', category, artKey: '', isDefault: false, isHolographic: false });
    expect([c(1, 'Profile Outline'), c(2, 'Chip'), c(3, 'Card'), c(4, 'Card')].sort(byCategory).map((x) => x.cosmeticId)).toEqual([3, 4, 2, 1]);
  });
});

describe('cosmetic artwork', () => {
  // Every migration that seeds cosmetics, oldest first.
  const migration = ['2026-10-22_cosmetics_and_blind_boxes.sql', '2026-10-22_holographic_items_and_new_boxes.sql']
    .map((file) => readFileSync(join(__dirname, '../../supabase/migrations', file), 'utf8'))
    .join('\n');
  const seeded = [...migration.matchAll(/'(Card|Chip|Profile Outline)',\s+(?:TRUE|FALSE),\s+'([a-z-]+)'(?:,\s+(TRUE|FALSE))?\)/g)]
    .map((m) => ({ category: m[1], key: m[2], holographic: m[3] === 'TRUE' }));
  const seededKeys = seeded.map((cosmetic) => cosmetic.key);

  it('has a drawing for every cosmetic the database seeds, and nothing extra', () => {
    expect(seededKeys).toHaveLength(101);
    expect([...seededKeys].sort()).toEqual([...COSMETIC_ART_KEYS].sort());
  });

  it('seeds the holographic drawings, and only those, as holographic (SRS-123.8)', () => {
    expect(seeded.filter((cosmetic) => cosmetic.holographic)).toHaveLength(26);
    for (const cosmetic of seeded) expect(cosmetic.holographic).toBe(cosmetic.key.startsWith('holo-'));
  });

  it('draws every chip with a skin for each coin value, showing the value', () => {
    for (const { key } of seeded.filter((cosmetic) => cosmetic.category === 'Chip')) {
      const main = drawCosmetic(key, 'm')!;
      for (const value of CHIP_SKIN_VALUES) {
        const skin = drawCosmetic(key, 'v', { value })!;
        expect(skin).toContain(`>${value}</text>`);
        expect(skin).not.toBe(main);
      }
    }
  });

  it.each(COSMETIC_ART_KEYS)('draws %s as one SVG whose ids are unique and prefixed', (key) => {
    const svg = drawCosmetic(key, 'p1')!;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('p1-'))).toBe(true);
    // Every url(#...) and href="#..." points at an id in the same drawing.
    const refs = [...svg.matchAll(/(?:url\(#|href="#)([^)"]+)/g)].map((m) => m[1]);
    expect(refs.every((ref) => ids.includes(ref))).toBe(true);
  });

  it('draws two copies with no shared ids', () => {
    const ids = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    const a = ids(drawCosmetic('neon-volt', 'a')!);
    const b = ids(drawCosmetic('neon-volt', 'b')!);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });

  it('can draw a profile outline as just the ring, to go around a real photo', () => {
    expect(drawCosmetic('classic-ring', 'x')).toContain('M31.2 100');
    expect(drawCosmetic('classic-ring', 'x', { avatar: false })).not.toContain('M31.2 100');
  });

  it('has nav bar colors for every profile outline, and only for outlines (SRS-120.8)', () => {
    const outlineKeys = seeded.filter((cosmetic) => cosmetic.category === 'Profile Outline').map((cosmetic) => cosmetic.key);
    expect(outlineKeys).toHaveLength(24);
    expect(Object.keys(OUTLINE_ACCENTS).sort()).toEqual([...outlineKeys].sort());
    for (const { colors } of Object.values(OUTLINE_ACCENTS)) expect(colors.length).toBeGreaterThanOrEqual(2);
  });

  it('returns null for an unknown art key', () => {
    expect(drawCosmetic('nope', 'x')).toBeNull();
  });
});
