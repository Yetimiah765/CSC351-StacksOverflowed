'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import CosmeticArt from '../../../components/cosmetics/CosmeticArt';
import DefaultAvatar from '../../../components/profile/DefaultAvatar';
import { COSMETIC_CATEGORIES } from '../../../lib/cosmetics';
import type { PublicProfile } from '../../api/players/[playerId]/profile/route';

// Another player's public profile (UR-121). Anyone can open it, guests
// included, and it only ever receives the fields cleared for public viewing
// (SRS-NFR-106): the username (SRS-121.3), bio (SRS-121.4), photo
// (SRS-121.5), overall money won and lost (SRS-121.7, SRS-121.8), and
// equipped cosmetics, with the outline around the photo (SRS-121.13), and
// the whole collection (SRS-121.9).
export default function PublicProfilePage() {
  const { playerId } = useParams<{ playerId: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/players/${encodeURIComponent(playerId)}/profile`);
        if (cancelled) return;
        if (res.status === 404 || res.status === 400) {
          setStatus('not-found');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        setProfile(await res.json());
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const outline = profile?.equipped['Profile Outline'] ?? null;

  if (status === 'loading') {
    return (
      <main className="min-h-page bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </main>
    );
  }

  if (status !== 'ready' || !profile) {
    return (
      <main className="min-h-page bg-slate-950 px-6 py-12 text-slate-100">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <h1 className="text-3xl font-semibold">{status === 'not-found' ? 'Player not found' : 'Profile unavailable'}</h1>
          <p className="text-slate-400">
            {status === 'not-found'
              ? "There's no player with this profile. They may have deleted their account."
              : "This profile couldn't be loaded. Please try again."}
          </p>
          <Link href="/" className="inline-block text-sm text-emerald-300 underline-offset-2 hover:underline">
            Back to the home page
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-page bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            {/* The uploaded photo, or the same blank icon as the profile, inside
                their equipped outline, which hangs 28px past each side (m-7). */}
            <div className={`relative shrink-0 ${outline ? 'm-7' : ''}`}>
              <div
                className={`flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 bg-slate-800 ${
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
                <span aria-hidden="true" className="pointer-events-none absolute -inset-7 z-10">
                  <CosmeticArt artKey={outline.artKey} avatar={false} className="h-full w-full" />
                </span>
              ) : null}
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-xs uppercase tracking-widest text-slate-400">Public profile</p>
              <h1 className="mt-1 break-words text-3xl font-semibold">{profile.username}</h1>
              {/* Only when they've written one: no empty box for someone else's profile. */}
              {profile.bio ? <p className="mt-4 whitespace-pre-wrap break-words text-slate-200">{profile.bio}</p> : null}
            </div>
          </div>
        </section>

        {/* Overall only: per-game figures stay private (SRS-121.11). */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
          <h2 className="text-xl font-semibold">Money won and lost</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Money won', value: profile.moneyWon, color: 'text-emerald-300' },
              { label: 'Money lost', value: profile.moneyLost, color: 'text-rose-300' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
                <p className={`mt-1 text-2xl font-semibold ${color}`}>
                  {value.toLocaleString('en-US')} <span className="text-sm font-normal text-slate-400">coins</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
          <h2 className="text-xl font-semibold">Equipped</h2>
          <ul className="mt-4 flex flex-wrap gap-4">
            {COSMETIC_CATEGORIES.map(({ category, label }) => {
              const cosmetic = profile.equipped[category];
              return (
                <li key={category} className="w-32">
                  <p className="whitespace-nowrap text-xs uppercase tracking-widest text-slate-400">{label}</p>
                  <div className="mt-2 flex h-28 w-28 items-center justify-center rounded-xl border-2 border-slate-800 bg-slate-950 p-2">
                    {cosmetic ? (
                      <CosmeticArt artKey={cosmetic.artKey} category={cosmetic.category} />
                    ) : (
                      <span className="text-xs text-slate-500">None</span>
                    )}
                  </div>
                  {cosmetic ? (
                    <>
                      <p className="mt-1 w-28 truncate text-center text-xs text-slate-300" title={cosmetic.name}>
                        {cosmetic.name}
                      </p>
                      {cosmetic.isHolographic ? (
                        <p className="w-28 bg-gradient-to-r from-pink-300 via-amber-200 to-cyan-300 bg-clip-text text-center text-[11px] font-semibold text-transparent">
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

        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">Collection</h2>
            <p className="text-sm text-slate-400">
              {profile.owned.length} {profile.owned.length === 1 ? 'cosmetic' : 'cosmetics'}
            </p>
          </div>
          <div className="mt-4 divide-y divide-slate-800">
            {COSMETIC_CATEGORIES.map(({ category, label }) => {
              const items = profile.owned.filter((cosmetic) => cosmetic.category === category);
              return (
                <div key={category} className="py-4 first:pt-0 last:pb-0">
                  <h3 className="text-sm uppercase tracking-widest text-slate-400">{label}</h3>
                  {items.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">None yet.</p>
                  ) : (
                    <ul className="mt-3 flex gap-3 overflow-x-auto pb-1">
                      {items.map((cosmetic) => {
                        const isEquipped = profile.equipped[category]?.cosmeticId === cosmetic.cosmeticId;
                        return (
                          <li key={cosmetic.cosmeticId} className="w-24 shrink-0">
                            <div
                              className={`flex h-24 w-24 items-center justify-center rounded-xl border-2 bg-slate-950 p-2 ${
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
      </div>
    </main>
  );
}
