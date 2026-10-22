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
}

export interface CosmeticRow {
  cosmetic_id: number;
  cosmetic_name: string;
  category: CosmeticCategory;
  is_default: boolean;
  asset_path: string;
}

export function toCosmetic(row: CosmeticRow): Cosmetic {
  return {
    cosmeticId: row.cosmetic_id,
    name: row.cosmetic_name,
    category: row.category,
    artKey: row.asset_path,
    isDefault: row.is_default,
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
};

// SRS-126.3 / SRS-126.4: a duplicate refunds half the price, rounded up.
export function duplicateRefund(price: number): number {
  return Math.ceil(price / 2);
}

// SRS-123.1 / SRS-123.2: every one of a box's n rewards is 1/n likely. Shown
// as a percent with at most one decimal, e.g. "16.7%" for 6 rewards.
export function rewardChance(rewardCount: number): string {
  const percent = 100 / rewardCount;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
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
