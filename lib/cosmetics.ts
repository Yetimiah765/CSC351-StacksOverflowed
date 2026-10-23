// Cosmetics and blind-box rules shared by the API routes and the pages
// (UR-119 - UR-127). Kept free of Node-only imports so pages can use them.

// SRS-119.3: the three categories, in the order the profile lists them.
export type CosmeticCategory = 'Card' | 'Chip' | 'Profile Outline';
export const COSMETIC_CATEGORIES: { category: CosmeticCategory; label: string }[] = [
  { category: 'Card', label: 'Cards' },
  { category: 'Chip', label: 'Poker Chips' },
  { category: 'Profile Outline', label: 'Profile Outline' },
];

export interface Cosmetic {
  cosmeticId: number;
  name: string;
  category: CosmeticCategory;
  // The key lib/cosmeticArt.ts draws it from (cosmetics.asset_path).
  artKey: string;
  isDefault: boolean;
  // SRS-123.8: one of a box's rare holographic items.
  isHolographic: boolean;
}

export interface CosmeticRow {
  cosmetic_id: number;
  cosmetic_name: string;
  category: CosmeticCategory;
  is_default: boolean;
  asset_path: string;
  is_holographic?: boolean;
}

export function toCosmetic(row: CosmeticRow): Cosmetic {
  return {
    cosmeticId: row.cosmetic_id,
    name: row.cosmetic_name,
    category: row.category,
    artKey: row.asset_path,
    isDefault: row.is_default,
    isHolographic: row.is_holographic ?? false,
  };
}

const CATEGORY_ORDER = new Map(COSMETIC_CATEGORIES.map(({ category }, i) => [category, i]));
export const byCategory = (a: Cosmetic, b: Cosmetic) =>
  (CATEGORY_ORDER.get(a.category) ?? 0) - (CATEGORY_ORDER.get(b.category) ?? 0) || a.cosmeticId - b.cosmeticId;

// SRS-120.8: each profile outline's colors, for the nav bar's balance pill:
// a border gradient (left to right) and a soft glow. Keyed by art key.
export const OUTLINE_ACCENTS: Record<string, { colors: string[]; glow: string | null }> = {
  'classic-ring': { colors: ['#64748b', '#475569'], glow: null },
  'neon-halo': { colors: ['#2ef2ff', '#ff3fd2'], glow: '#ff3fd2' },
  'neon-circuit': { colors: ['#2ef2ff', '#8b5cf6', '#ff3fd2'], glow: '#2ef2ff' },
  'royal-jewels': { colors: ['#f8e08e', '#c9971c', '#e11d48'], glow: '#d4af37' },
  'golden-laurel': { colors: ['#f8e08e', '#c9971c', '#8a6212'], glow: '#d4af37' },
  'sea-foam': { colors: ['#22d3ee', '#0e7490'], glow: '#22d3ee' },
  riptide: { colors: ['#e0f2fe', '#0369a1'], glow: '#38bdf8' },
  'inferno-corona': { colors: ['#fde047', '#f97316', '#dc2626'], glow: '#f97316' },
  phoenix: { colors: ['#fde047', '#f97316'], glow: '#f97316' },
  'galaxy-starlight': { colors: ['#f472b6', '#7c3aed', '#60a5fa'], glow: '#a78bfa' },
  orbitals: { colors: ['#c4b5fd', '#7c3aed', '#93c5fd'], glow: '#7c3aed' },
  'bat-wing': { colors: ['#f97316', '#a855f7'], glow: '#f97316' },
  'harvest-wreath': { colors: ['#ea580c', '#f59e0b', '#b91c1c'], glow: '#f59e0b' },
  'holly-wreath': { colors: ['#15803d', '#facc15', '#dc2626'], glow: '#22c55e' },
  'blossom-branch': { colors: ['#f9a8d4', '#be185d', '#7c2d12'], glow: '#f472b6' },
  'daisy-chain': { colors: ['#ffffff', '#facc15', '#16a34a'], glow: '#facc15' },
  'sun-ring': { colors: ['#fde047', '#f97316'], glow: '#f59e0b' },
  'tropical-fronds': { colors: ['#22c55e', '#f43f5e', '#15803d'], glow: '#22c55e' },
  'falling-leaves': { colors: ['#ea580c', '#f59e0b', '#dc2626'], glow: '#ea580c' },
  'fairy-ring': { colors: ['#65a30d', '#dc2626', '#4d7c0f'], glow: '#65a30d' },
  'icicle-ring': { colors: ['#e0f2fe', '#7dd3fc', '#0369a1'], glow: '#7dd3fc' },
  'frost-ring': { colors: ['#e0f2fe', '#38bdf8'], glow: '#38bdf8' },
  'ivy-vine': { colors: ['#22c55e', '#3f6212'], glow: '#22c55e' },
  'songbird-branch': { colors: ['#ea580c', '#5b3a1e', '#22c55e'], glow: '#ea580c' },
  // The holographic outlines use their foil colors.
  'holo-outline-neon': { colors: ['#ff3fd2', '#2ef2ff', '#8b5cf6'], glow: '#ff3fd2' },
  'holo-outline-royal': { colors: ['#fff3c4', '#f5c6a5', '#e9d5ff', '#f8e08e'], glow: '#f8e08e' },
  'holo-outline-ocean': { colors: ['#a5f3fc', '#fbcfe8', '#bbf7d0', '#ddd6fe'], glow: '#a5f3fc' },
  'holo-outline-inferno': { colors: ['#ef4444', '#f97316', '#fde047', '#fb7185'], glow: '#f97316' },
  'holo-outline-galaxy': { colors: ['#a78bfa', '#60a5fa', '#f472b6', '#e0e7ff'], glow: '#a78bfa' },
  'holo-outline-halloween': { colors: ['#fb923c', '#a855f7', '#84cc16'], glow: '#a855f7' },
  'holo-outline-thanksgiving': { colors: ['#fde68a', '#f59e0b', '#ea580c', '#dc2626'], glow: '#f59e0b' },
  'holo-outline-christmas': { colors: ['#4ade80', '#22d3ee', '#a78bfa', '#f0abfc'], glow: '#22d3ee' },
  'holo-outline-spring': { colors: ['#fbcfe8', '#e9d5ff', '#bbf7d0', '#fef9c3'], glow: '#f9a8d4' },
  'holo-outline-summer': { colors: ['#fde047', '#fb923c', '#22d3ee', '#f472b6'], glow: '#fb923c' },
  'holo-outline-autumn': { colors: ['#c2410c', '#f59e0b', '#fde68a', '#a16207'], glow: '#f59e0b' },
  'holo-outline-winter': { colors: ['#e0f2fe', '#a5f3fc', '#c7d2fe', '#f0f9ff'], glow: '#a5f3fc' },
  'holo-outline-nature': { colors: ['#bbf7d0', '#4ade80', '#fde68a', '#a3e635'], glow: '#4ade80' },
};

// SRS-126.3 / SRS-126.4: a duplicate refunds half the price, rounded up.
export function duplicateRefund(price: number): number {
  return Math.ceil(price / 2);
}

// SRS-123.8: the roll for a box's holographic tier is a whole number from 0
// to HOLOGRAPHIC_ROLLS - 1, compared with the box's chance in basis points.
export const HOLOGRAPHIC_ROLLS = 10000;

// SRS-123.1 / SRS-123.2 / SRS-123.8: a box's holographic items share its
// holographic chance equally, and its regular items share the rest equally;
// a box with no holographic items gives each of its n items 1/n. Shown as
// percents with at most two decimals, e.g. "16.17%" and "1.5%" for 6 regular
// and 2 holographic items at a 3% chance. null when the box has none of that kind.
export function rewardChances(regularCount: number, holographicCount: number, holographicChanceBp: number) {
  const holographic = holographicCount === 0 ? 0 : regularCount === 0 ? 1 : holographicChanceBp / HOLOGRAPHIC_ROLLS;
  const percent = (p: number) => `${Number((p * 100).toFixed(2))}%`;
  return {
    regular: regularCount > 0 ? percent((1 - holographic) / regularCount) : null,
    holographic: holographicCount > 0 ? percent(holographic / holographicCount) : null,
  };
}

// SRS-122.1 / SRS-122.3: whether a box is on sale at `now`. A NULL start or
// end means no limit on that side; the end time itself is already closed,
// matching fn_buy_blind_box.
export function isBoxOnSale(
  box: { is_available: boolean; available_from: string | null; available_until: string | null },
  now: number = Date.now()
): boolean {
  if (!box.is_available) return false;
  if (box.available_from && now < Date.parse(box.available_from)) return false;
  if (box.available_until && now >= Date.parse(box.available_until)) return false;
  return true;
}
