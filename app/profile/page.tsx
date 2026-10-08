'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface Profile {
  playerId: number;
  firstName: string;
  lastName: string;
  username: string | null;
  bio: string | null;
  balance: number;
  profilePhotoDataUrl: string | null;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('player_token');
    setToken(stored);
    if (!stored) {
      setLoading(false);
      return;
    }
    fetchProfile(stored);
  }, []);

  async function fetchProfile(playerToken: string) {
    setLoading(true);
    const res = await fetch('/api/profile', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || 'Failed to load profile.');
      return;
    }
    setProfile(data.profile);
    setBio(data.profile?.bio ?? '');
  }

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bio }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setProfile(data.profile);
      setEditing(false);
    } else {
      setError(data.error || 'Failed to save.');
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

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
        <section className="text-center space-y-4">
          <p className="text-slate-300">You must be logged in to view your profile.</p>
          <Link href="/login" className="inline-block rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm hover:border-emerald-400 hover:text-emerald-200">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Profile</p>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-800 bg-red-900/30 p-3 text-sm text-red-300">{error}</p>
        ) : null}

        {profile ? (
          <>
            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="group relative h-24 w-24 overflow-hidden rounded-full border-2 border-slate-700 bg-slate-800 transition hover:border-emerald-400 disabled:opacity-70"
                title="Change profile photo"
              >
                {profile.profilePhotoDataUrl ? (
                  <img src={profile.profilePhotoDataUrl} alt="Avatar" className="h-full w-full object-cover" />
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
              <h1 className="text-3xl font-semibold">{profile.username}</h1>
              <p className="text-sm text-slate-400">
                {profile.firstName} {profile.lastName} &middot; {profile.balance.toLocaleString()} coins
              </p>
            </div>

            <div className="mt-6">
              <p className="text-xs uppercase tracking-widest text-slate-400">Biography</p>
              {editing ? (
                <div className="mt-2 space-y-3">
                  <textarea
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-70"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false);
                        setBio(profile.bio ?? '');
                      }}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm hover:border-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-slate-300">{profile.bio || 'No biography yet.'}</p>
                  <button
                    onClick={() => setEditing(true)}
                    className="mt-3 rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm hover:border-emerald-400 hover:text-emerald-200"
                  >
                    Edit biography
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="mt-4 text-slate-300">Unable to load your profile.</p>
        )}

        <p className="mt-8 text-sm text-slate-300">
          Back to <Link href="/" className="text-emerald-300 hover:underline">home</Link>
        </p>
      </section>
    </main>
  );
}
