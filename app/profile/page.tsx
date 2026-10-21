'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import BioEditor from '../../components/profile/BioEditor';
import CosmeticsSection from '../../components/profile/CosmeticsSection';
import PasswordEditor, { type PasswordChange } from '../../components/profile/PasswordEditor';
import ProfileField from '../../components/profile/ProfileField';
import ProfilePhoto from '../../components/profile/ProfilePhoto';
import StatsSection from '../../components/profile/StatsSection';
import TextFieldEditor from '../../components/profile/TextFieldEditor';

interface Profile {
  playerId: number;
  firstName: string;
  lastName: string;
  username: string | null;
  bio: string | null;
  balance: number;
  profilePhotoDataUrl: string | null;
}

// The fields PATCH /api/profile edits, one pop-up each.
type EditableField = 'firstName' | 'lastName' | 'username' | 'bio';
// The password has its own route (Change Password, UR-113), not PATCH.
type Editing = EditableField | 'password';

const NAME_HINT = 'Letters, spaces, apostrophes, and hyphens.';
// SRS-112.4, SRS-112.6, SRS-112.7.
const USERNAME_HINT =
  '6-10 letters and numbers. You can change it once every 24 hours, and your old username stays reserved for 24 hours.';

// The player's own profile (UR-111): photo and Log out, names, username and
// password, the bio, cosmetics, and game statistics (SRS-111.2).
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<Editing | null>(null);
  // A one-line confirmation, e.g. after a password change, which otherwise
  // shows nothing new on the page.
  const [notice, setNotice] = useState('');

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

  // Saves one field from its pop-up. Returns an error message for the pop-up
  // to show, or null once saved, which also closes it.
  async function saveField(field: EditableField, value: string): Promise<string | null> {
    if (!token) return 'You are not logged in.';
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (!res.ok) return data.error || 'Could not save your changes.';
      setProfile(data.profile);
      setEditing(null);
      return null;
    } catch {
      return 'Could not save your changes. Please try again.';
    }
  }

  // Opening any pop-up clears the last confirmation.
  useEffect(() => {
    if (editing) setNotice('');
  }, [editing]);

  // Change Password (UR-113). Returns an error message for the pop-up to
  // show, or null once changed, which also closes it.
  async function changePassword(change: PasswordChange): Promise<string | null> {
    if (!token) return 'You are not logged in.';
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(change),
      });
      const data = await res.json();
      if (!res.ok) return data.error || 'Could not change your password.';
      setEditing(null);
      setNotice('Your password has been changed.');
      return null;
    } catch {
      return 'Could not change your password. Please try again.';
    }
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
        {notice ? (
          <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-900/30 p-3 text-sm text-emerald-200">
            {notice}
          </p>
        ) : null}

        {profile ? (
          <>
            <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
              <div className="flex flex-col gap-8 sm:flex-row">
                {/* Photo, with Log out underneath */}
                <div className="flex flex-col items-center gap-3 sm:w-40 sm:shrink-0">
                  <ProfilePhoto
                    photoUrl={profile.profilePhotoDataUrl}
                    token={token}
                    onChange={(photoUrl) =>
                      setProfile((previous) => (previous ? { ...previous, profilePhotoDataUrl: photoUrl } : previous))
                    }
                  />
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
                  <ProfileField label="First name" value={profile.firstName} onEdit={() => setEditing('firstName')} />
                  <ProfileField label="Last name" value={profile.lastName} onEdit={() => setEditing('lastName')} />
                  <ProfileField label="Username" value={profile.username ?? ''} onEdit={() => setEditing('username')} />
                  <ProfileField label="Password" value="" secret onEdit={() => setEditing('password')} />
                </div>
              </div>

              {/* SRS-114.3: a new account shows an empty bio box. */}
              <div className="mt-6">
                <ProfileField label="Bio" value={profile.bio ?? ''} multiline onEdit={() => setEditing('bio')} />
              </div>
            </section>

            <CosmeticsSection />
            <StatsSection />
          </>
        ) : (
          <p className="text-slate-300">Unable to load your profile.</p>
        )}
      </div>

      {editing === 'firstName' && profile ? (
        <TextFieldEditor
          title="Edit first name"
          label="First name"
          initialValue={profile.firstName}
          hint={NAME_HINT}
          onSave={(value) => saveField('firstName', value)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {editing === 'lastName' && profile ? (
        <TextFieldEditor
          title="Edit last name"
          label="Last name"
          initialValue={profile.lastName}
          hint={NAME_HINT}
          onSave={(value) => saveField('lastName', value)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {editing === 'username' && profile ? (
        <TextFieldEditor
          title="Edit username"
          label="Username"
          initialValue={profile.username ?? ''}
          hint={USERNAME_HINT}
          onSave={(value) => saveField('username', value)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {editing === 'password' ? (
        <PasswordEditor onSave={changePassword} onCancel={() => setEditing(null)} />
      ) : null}
      {editing === 'bio' && profile ? (
        <BioEditor
          initialBio={profile.bio ?? ''}
          onSave={(value) => saveField('bio', value)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </main>
  );
}
