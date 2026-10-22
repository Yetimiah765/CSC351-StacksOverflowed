import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { COSMETIC_ART_KEYS, drawCosmetic } from '../../lib/cosmeticArt';
import { byCategory, duplicateRefund, isBoxOnSale, OUTLINE_ACCENTS, rewardChance, type Cosmetic } from '../../lib/cosmetics';

describe('blind box rules', () => {
  it('refunds half the price on a duplicate, rounded up (SRS-126.3, SRS-126.4)', () => {
    expect(duplicateRefund(350)).toBe(175);
    expect(duplicateRefund(625)).toBe(313);
    expect(duplicateRefund(1)).toBe(1);
  });

  it('shows each reward as 1/n (SRS-123.2)', () => {
    expect(rewardChance(6)).toBe('16.7%');
    expect(rewardChance(4)).toBe('25%');
    expect(rewardChance(1)).toBe('100%');
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
    const c = (cosmeticId: number, category: Cosmetic['category']): Cosmetic => ({ cosmeticId, name: '', category, artKey: '', isDefault: false });
    expect([c(1, 'Profile Outline'), c(2, 'Chip'), c(3, 'Card'), c(4, 'Card')].sort(byCategory).map((x) => x.cosmeticId)).toEqual([3, 4, 2, 1]);
  });
});

describe('cosmetic artwork', () => {
  const migration = readFileSync(join(__dirname, '../../supabase/migrations/2026-10-22_cosmetics_and_blind_boxes.sql'), 'utf8');
  const seededKeys = [...migration.matchAll(/'(?:Card|Chip|Profile Outline)',\s+(?:TRUE|FALSE),\s+'([a-z-]+)'\)/g)].map((m) => m[1]);

  it('has a drawing for every cosmetic the database seeds, and nothing extra', () => {
    expect(seededKeys).toHaveLength(45);
    expect([...seededKeys].sort()).toEqual([...COSMETIC_ART_KEYS].sort());
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
    const outlineKeys = [...migration.matchAll(/'Profile Outline',\s+(?:TRUE|FALSE),\s+'([a-z-]+)'\)/g)].map((m) => m[1]);
    expect(outlineKeys).toHaveLength(14);
    expect(Object.keys(OUTLINE_ACCENTS).sort()).toEqual([...outlineKeys].sort());
    for (const { colors } of Object.values(OUTLINE_ACCENTS)) expect(colors.length).toBeGreaterThanOrEqual(2);
  });

  it('returns null for an unknown art key', () => {
    expect(drawCosmetic('nope', 'x')).toBeNull();
  });
});
