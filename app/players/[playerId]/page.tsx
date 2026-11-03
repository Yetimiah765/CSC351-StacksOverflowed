'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import PublicProfileView from '../../../components/profile/PublicProfileView';
import { usePublicProfile } from '../../../components/profile/usePublicProfile';

// Another player's public profile (UR-121). Anyone can open it, guests
// included; what it shows, and why, is in components/profile/PublicProfileView,
// which the window over the poker table uses too (SRS-121.14).
export default function PublicProfilePage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { profile, status } = usePublicProfile(playerId);

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
        <PublicProfileView profile={profile} />
      </div>
    </main>
  );
}
