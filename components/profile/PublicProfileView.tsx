'use client';

import CosmeticArt from '../cosmetics/CosmeticArt';
import DefaultAvatar from './DefaultAvatar';
import { COSMETIC_CATEGORIES } from '../../lib/cosmetics';
import type { PublicProfile } from '../../app/api/players/[playerId]/profile/route';

// Another player's public profile (UR-121), shown on its own page and, smaller,
// in the window over the poker table (SRS-121.14). It only ever receives the
// fields cleared for public viewing (SRS-NFR-106): the username (SRS-121.3),
// bio (SRS-121.4), photo (SRS-121.5), overall money won and lost (SRS-121.7,
// SRS-121.8), and equipped cosmetics, with the outline around the photo
// (SRS-121.13), and the whole collection (SRS-121.9).

const LOOK = {
  page: {
    section: 'rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 sm:p-8',
    header: 'flex flex-col items-center gap-6 sm:flex-row sm:items-start',
    headerText: 'min-w-0 flex-1 text-center sm:text-left',
    photo: 'h-28 w-28',
    // The outline hangs a quarter of the photo past each side.
    ringRoom: 'm-7',
    ring: '-inset-7',
    name: 'mt-1 break-words text-3xl font-semibold',
    bio: 'mt-4 whitespace-pre-wrap break-words text-slate-200',
    h2: 'text-xl font-semibold',
    moneyGrid: 'mt-5 grid gap-3 sm:grid-cols-2',
    money: 'mt-1 text-2xl font-semibold',
    coins: 'text-sm',
    equippedItem: 'w-32',
    equippedBox: 'mt-2 flex h-28 w-28 items-center justify-center rounded-xl border-2 border-slate-800 bg-slate-950 p-2',
    equippedText: 'w-28',
    collectionItem: 'w-24 shrink-0',
    collectionBox: 'h-24 w-24',
  },
  window: {
    section: 'rounded-2xl border border-slate-800 bg-slate-900/90 p-4',
    header: 'flex items-center gap-4',
    headerText: 'min-w-0 flex-1',
    photo: 'h-16 w-16',
    ringRoom: 'm-4',
    ring: '-inset-4',
    name: 'break-words text-xl font-semibold',
    bio: 'mt-2 whitespace-pre-wrap break-words text-sm text-slate-200',
    h2: 'text-sm font-semibold uppercase tracking-widest text-slate-300',
    moneyGrid: 'mt-3 grid grid-cols-2 gap-2',
    // One line even for a seven-figure total.
    money: 'mt-0.5 whitespace-nowrap text-base font-semibold',
    coins: 'text-xs',
    // Three across the window's width, so the labels fit.
    equippedItem: 'min-w-0',
    equippedBox: 'mt-1 flex aspect-square w-full items-center justify-center rounded-lg border-2 border-slate-800 bg-slate-950 p-2',
    equippedText: 'w-full',
    collectionItem: 'w-16 shrink-0',
    collectionBox: 'h-16 w-16',
  },
} as const;

export default function PublicProfileView({ profile, size = 'page', titleId }: { profile: PublicProfile; size?: 'page' | 'window'; titleId?: string }) {
  const look = LOOK[size];
  const outline = profile.equipped['Profile Outline'] ?? null;
  // The page's main heading; in the window the username names the window.
  const Name = size === 'page' ? 'h1' : 'h2';
  return (
    <>
      <section className={look.section}>
        <div className={look.header}>
          {/* The uploaded photo, or the same blank icon as the profile, inside
              their equipped outline, which hangs past each side. */}
          <div className={`relative shrink-0 ${outline ? look.ringRoom : ''}`}>
            <div
              className={`flex ${look.photo} items-center justify-center overflow-hidden rounded-full border-2 bg-slate-800 ${
                outline ? 'border-transparent' : 'border-slate-700'
              }`}
            >
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt={`${profile.username}'s profile photo`} className="h-full w-full object-cover" />
              ) : (
                <DefaultAvatar />
              )}
            </div>
            {outline ? (
              <span aria-hidden="true" className={`pointer-events-none absolute ${look.ring} z-10`}>
                <CosmeticArt artKey={outline.artKey} avatar={false} className="h-full w-full" />
              </span>
            ) : null}
          </div>

          <div className={look.headerText}>
            {size === 'page' ? <p className="text-xs uppercase tracking-widest text-slate-400">Public profile</p> : null}
            <Name id={titleId} className={look.name}>
              {profile.username}
            </Name>
            {/* Only when they've written one: no empty box for someone else's profile. */}
            {profile.bio ? <p className={look.bio}>{profile.bio}</p> : null}
          </div>
        </div>
      </section>

      {/* Overall only: per-game figures stay private (SRS-121.11). */}
      <section className={look.section}>
        <h2 className={look.h2}>Money won and lost</h2>
        <div className={look.moneyGrid}>
          {[
            { label: 'Money won', value: profile.moneyWon, color: 'text-emerald-300' },
            { label: 'Money lost', value: profile.moneyLost, color: 'text-rose-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className={size === 'page' ? 'rounded-2xl border border-slate-800 bg-slate-950/70 p-4' : 'rounded-xl border border-slate-800 bg-slate-950/70 p-3'}>
              <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
              <p className={`${look.money} ${color}`}>
                {value.toLocaleString('en-US')} <span className={`${look.coins} font-normal text-slate-400`}>coins</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className={look.section}>
        <h2 className={look.h2}>Equipped</h2>
        <ul className={size === 'page' ? 'mt-4 flex flex-wrap gap-4' : 'mt-3 grid grid-cols-3 gap-3'}>
          {COSMETIC_CATEGORIES.map(({ category, label }) => {
            const cosmetic = profile.equipped[category];
            return (
              <li key={category} className={look.equippedItem}>
                <p className={size === 'page' ? 'whitespace-nowrap text-xs uppercase tracking-widest text-slate-400' : 'truncate text-[10px] uppercase text-slate-400'}>{label}</p>
                <div className={look.equippedBox}>
                  {cosmetic ? (
                    <CosmeticArt artKey={cosmetic.artKey} category={cosmetic.category} />
                  ) : (
                    <span className="text-xs text-slate-500">None</span>
                  )}
                </div>
                {cosmetic ? (
                  <>
                    <p className={`mt-1 ${look.equippedText} truncate text-center text-xs text-slate-300`} title={cosmetic.name}>
                      {cosmetic.name}
                    </p>
                    {cosmetic.isHolographic ? (
                      <p className={`${look.equippedText} bg-gradient-to-r from-pink-300 via-amber-200 to-cyan-300 bg-clip-text text-center text-[11px] font-semibold text-transparent`}>
                        Holographic
                      </p>
                    ) : null}
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className={look.section}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={look.h2}>Collection</h2>
          <p className={size === 'page' ? 'text-sm text-slate-400' : 'text-xs text-slate-400'}>
            {profile.owned.length} {profile.owned.length === 1 ? 'cosmetic' : 'cosmetics'}
          </p>
        </div>
        <div className={size === 'page' ? 'mt-4 divide-y divide-slate-800' : 'mt-2 divide-y divide-slate-800'}>
          {COSMETIC_CATEGORIES.map(({ category, label }) => {
            const items = profile.owned.filter((cosmetic) => cosmetic.category === category);
            return (
              <div key={category} className={size === 'page' ? 'py-4 first:pt-0 last:pb-0' : 'py-2.5 first:pt-0 last:pb-0'}>
                <h3 className={size === 'page' ? 'text-sm uppercase tracking-widest text-slate-400' : 'text-[11px] uppercase tracking-widest text-slate-400'}>{label}</h3>
                {items.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">None yet.</p>
                ) : (
                  <ul className={size === 'page' ? 'mt-3 flex gap-3 overflow-x-auto pb-1' : 'mt-2 flex gap-2 overflow-x-auto pb-1'}>
                    {items.map((cosmetic) => {
                      const isEquipped = profile.equipped[category]?.cosmeticId === cosmetic.cosmeticId;
                      return (
                        <li key={cosmetic.cosmeticId} className={look.collectionItem}>
                          <div
                            className={`flex ${look.collectionBox} items-center justify-center rounded-xl border-2 bg-slate-950 p-2 ${
                              isEquipped ? 'border-emerald-400' : 'border-slate-800'
                            }`}
                          >
                            <CosmeticArt artKey={cosmetic.artKey} category={cosmetic.category} />
                          </div>
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
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
