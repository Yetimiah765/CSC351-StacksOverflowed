'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import DefaultAvatar from '../../../components/profile/DefaultAvatar';
import type { PublicProfile } from '../../api/players/[playerId]/profile/route';

// Another player's public profile (UR-121). Anyone can open it, guests
// included, and it only ever receives the fields cleared for public viewing
// (SRS-NFR-106): the username (SRS-121.3), bio (SRS-121.4), photo
// (SRS-121.5) and overall money won (SRS-121.7).
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
            {/* The uploaded photo, or the same blank icon as the profile. */}
            <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-slate-700 bg-slate-800">
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt={`${profile.username}'s profile photo`} className="h-full w-full object-cover" />
              ) : (
                <DefaultAvatar />
              )}
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
            {[{ label: 'Money won', value: profile.moneyWon, color: 'text-emerald-300' }].map(({ label, value, color }) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
                <p className={`mt-1 text-2xl font-semibold ${color}`}>
                  {value.toLocaleString('en-US')} <span className="text-sm font-normal text-slate-400">coins</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
