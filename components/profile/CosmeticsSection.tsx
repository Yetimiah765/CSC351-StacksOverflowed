'use client';

import Link from 'next/link';
import { useState } from 'react';
import { COSMETIC_CATEGORIES, type Cosmetic, type CosmeticCategory } from '../../lib/cosmetics';
import CosmeticArt from '../cosmetics/CosmeticArt';

// The profile page's cosmetics section (UR-119, UR-120): every cosmetic the
// player owns, one row per category, the default leftmost (SRS-119.2). The
// equipped one has a green border (SRS-120.1). Clicking another one selects
// it, and Confirm equips it in place of the current one, which stays in the
// collection (SRS-120.4 - SRS-120.6).
export default function CosmeticsSection({
  owned,
  equipped,
  loadError,
  onEquip,
}: {
  owned: Cosmetic[] | null;
  equipped: Partial<Record<CosmeticCategory, number>>;
  loadError: string;
  // Resolves to an error message, or null once equipped.
  onEquip: (cosmetic: Cosmetic) => Promise<string | null>;
}) {
  const [selected, setSelected] = useState<Cosmetic | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    setError('');
    const equipError = await onEquip(selected);
    setSaving(false);
    if (equipError) setError(equipError);
    else setSelected(null);
  }

  const onlyDefaults = owned !== null && owned.every((cosmetic) => cosmetic.isDefault);

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Cosmetics</h2>
        <Link href="/shop" className="text-sm text-slate-400 underline-offset-2 hover:text-emerald-200 hover:underline">
          {onlyDefaults ? 'Win more from blind boxes in the shop' : 'Cosmetic Shop'}
        </Link>
      </div>

      {loadError ? <p className="mt-4 text-sm text-red-300">{loadError}</p> : null}
      {owned === null && !loadError ? <p className="mt-4 text-sm text-slate-400">Loading your cosmetics…</p> : null}

      {owned ? (
        <div className="mt-4 divide-y divide-slate-800">
          {COSMETIC_CATEGORIES.map(({ category, label }) => {
            const items = owned.filter((cosmetic) => cosmetic.category === category);
            const pick = selected?.category === category ? selected : null;
            return (
              <div key={category} className="py-4 first:pt-0 last:pb-0">
                <div className="flex min-h-[2.25rem] flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm uppercase tracking-widest text-slate-400">{label}</h3>
                  {pick ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-slate-300">Equip {pick.name}?</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(null);
                          setError('');
                        }}
                        disabled={saving}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-sm transition hover:border-slate-500 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirm}
                        disabled={saving}
                        className="rounded-lg bg-emerald-400 px-3 py-1 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
                      >
                        {saving ? 'Equipping…' : 'Confirm'}
                      </button>
                    </div>
                  ) : null}
                </div>
                {pick && error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
                <ul className="mt-3 flex gap-3 overflow-x-auto pb-1">
                  {items.map((cosmetic) => {
                    const isEquipped = equipped[category] === cosmetic.cosmeticId;
                    const isPicked = pick?.cosmeticId === cosmetic.cosmeticId;
                    return (
                      <li key={cosmetic.cosmeticId} className="w-24 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setError('');
                            setSelected(isEquipped ? null : cosmetic);
                          }}
                          aria-pressed={isEquipped || isPicked}
                          aria-label={`${cosmetic.name}${isEquipped ? ' (equipped)' : ''}`}
                          className={`flex h-24 w-24 items-center justify-center rounded-xl border-2 bg-slate-950 p-2 transition ${
                            isEquipped
                              ? 'border-emerald-400'
                              : isPicked
                                ? 'border-slate-100'
                                : 'border-slate-800 hover:border-slate-500'
                          }`}
                        >
                          <CosmeticArt artKey={cosmetic.artKey} category={cosmetic.category} />
                        </button>
                        <p className="mt-1 truncate text-center text-xs text-slate-300" title={cosmetic.name}>
                          {cosmetic.name}
                        </p>
                        {cosmetic.isHolographic ? (
                          <p className="bg-gradient-to-r from-pink-300 via-amber-200 to-cyan-300 bg-clip-text text-center text-[11px] font-semibold text-transparent">
                            Holographic
                          </p>
                        ) : null}
                        {isEquipped ? <p className="text-center text-[11px] font-semibold text-emerald-300">Equipped</p> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
