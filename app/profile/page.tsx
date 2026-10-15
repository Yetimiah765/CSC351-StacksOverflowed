'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import BioEditor from '../../components/profile/BioEditor';
import CosmeticsSection from '../../components/profile/CosmeticsSection';
import ProfileField from '../../components/profile/ProfileField';
import StatsSection from '../../components/profile/StatsSection';

interface Profile {
  playerId: number;
  firstName: string;
  lastName: string;
  username: string | null;
  bio: string | null;
  balance: number;
  profilePhotoDataUrl: string | null;
}

// The player's own profile (UR-111): photo and Log out, names, username and
// password, the bio, cosmetics, and game statistics (SRS-111.2).
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingBio, setEditingBio] = useState(false);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('player_token');
    setToken(stored);
    // SRS-111.3: guests are redirected to log in.
    if (!stored) {
      router.replace('/login');
      return;
    }
    fetchProfile(stored);
  }, []);

  async function fetchProfile(playerToken: string) {
    setLoading(true);
    const res = await fetch('/api/profile', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    // The session ended elsewhere (a newer login, SRS-103.5), so this
    // browser is no longer logged in.
    if (res.status === 401) {
      localStorage.removeItem('player_token');
      router.replace('/login');
      return;
    }
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || 'Failed to load profile.');
      return;
    }
    setProfile(data.profile);
  }

  // Saves the bio from the pop-up. Returns an error message for the pop-up to
  // show, or null once saved, which also closes it.
  async function saveBio(bio: string): Promise<string | null> {
    if (!token) return 'You are not logged in.';
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bio }),
      });
      const data = await res.json();
      if (!res.ok) return data.error || 'Could not save your bio.';
      setProfile(data.profile);
      setEditingBio(false);
      return null;
    } catch {
      return 'Could not save your bio. Please try again.';
    }
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    setUploading(false);
    if (res.ok) {
      setProfile((previous) => (previous ? { ...previous, profilePhotoDataUrl: data.profilePhotoDataUrl } : previous));
    } else {
      setError(data.error || 'Failed to upload image.');
    }
    event.target.value = '';
  }

  // SRS-105.1: end the session on the server too, so this token stops
  // working everywhere. The local token is cleared even if that request
  // fails, so the player is always logged out of this browser.
  async function handleLogout() {
    setLoggingOut(true);
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Network failure: still log out locally below.
    }
    localStorage.removeItem('player_token');
    router.push('/');
  }

  // Guests stay on this view until the redirect to /login completes.
  if (loading) {
    return (
      <main className="min-h-page bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-page bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <h1 className="text-3xl font-semibold">Your profile</h1>

        {error ? (
          <p className="rounded-xl border border-red-800 bg-red-900/30 p-3 text-sm text-red-300">{error}</p>
        ) : null}

        {profile ? (
          <>
            <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
              <div className="flex flex-col gap-8 sm:flex-row">
                {/* Photo, with Log out underneath */}
                <div className="flex flex-col items-center gap-3 sm:w-40 sm:shrink-0">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-slate-700 bg-slate-800 transition hover:border-emerald-400 disabled:opacity-70"
                    title="Change profile photo"
                  >
                    {profile.profilePhotoDataUrl ? (
                      <img src={profile.profilePhotoDataUrl} alt="Your profile photo" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-3xl font-semibold text-slate-300">
                        {(profile.username ?? profile.firstName)[0]?.toUpperCase()}
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs text-white opacity-0 transition group-hover:opacity-100">
                      {uploading ? 'Uploading…' : 'Change photo'}
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <span className="text-xs text-slate-500">PNG only, up to 5 MB</span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm transition hover:border-red-400 hover:text-red-200 disabled:opacity-70"
                  >
                    {loggingOut ? 'Logging out…' : 'Log out'}
                  </button>
                </div>

                {/* Names on top, then username and password on one line */}
                <div className="grid flex-1 content-start gap-4 sm:grid-cols-2">
                  <ProfileField label="First name" value={profile.firstName} />
                  <ProfileField label="Last name" value={profile.lastName} />
                  <ProfileField label="Username" value={profile.username ?? ''} />
                  <ProfileField label="Password" value="" secret />
                </div>
              </div>

              {/* SRS-114.3: a new account shows an empty bio box. */}
              <div className="mt-6">
                <ProfileField label="Bio" value={profile.bio ?? ''} multiline onEdit={() => setEditingBio(true)} />
              </div>
            </section>

            <CosmeticsSection />
            <StatsSection />
          </>
        ) : (
          <p className="text-slate-300">Unable to load your profile.</p>
        )}
      </div>

      {editingBio && profile ? (
        <BioEditor initialBio={profile.bio ?? ''} onSave={saveBio} onCancel={() => setEditingBio(false)} />
      ) : null}
    </main>
  );
}
