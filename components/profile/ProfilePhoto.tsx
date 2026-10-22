'use client';

import { useEffect, useId, useRef, useState } from 'react';
import CosmeticArt from '../cosmetics/CosmeticArt';
import DefaultAvatar from './DefaultAvatar';

// The profile photo (UR-115), or the blank icon when there is none
// (SRS-115.5). Clicking it opens a menu: Upload new photo, which also
// replaces an existing one (SRS-115.4), and, only when there is a photo, a
// red Remove photo that goes back to the blank icon (SRS-115.6). Upload and
// remove errors are shown in the menu. The equipped profile outline
// (UR-120) is drawn around the photo.
export default function ProfilePhoto({
  photoUrl,
  token,
  outlineArtKey = null,
  onChange,
}: {
  photoUrl: string | null;
  token: string | null;
  // The equipped profile outline's art key, or null while it is unknown.
  outlineArtKey?: string | null;
  // Called with the new photo's data URL, or null once it is removed.
  onChange: (photoUrl: string | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<'uploading' | 'removing' | null>(null);
  const [error, setError] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuId = useId();

  function closeMenu() {
    setMenuOpen(false);
    setError('');
  }

  // A click outside the menu, or Escape, closes it, except mid-request.
  useEffect(() => {
    if (!menuOpen || busy) return;
    const handlePointer = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) closeMenu();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', handlePointer);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen, busy]);

  // Sends the upload or removal. Returns true once it succeeded.
  async function send(method: 'POST' | 'DELETE', body: FormData | undefined, failure: string) {
    if (!token) {
      setError('You are not logged in.');
      return false;
    }
    setError('');
    try {
      const res = await fetch('/api/profile/avatar', {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || failure);
        return false;
      }
      onChange(data.profilePhotoDataUrl);
      return true;
    } catch {
      setError(`${failure} Please try again.`);
      return false;
    }
  }

  async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file again still fires a change.
    event.target.value = '';
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    setBusy('uploading');
    const ok = await send('POST', formData, 'Could not upload your photo.');
    setBusy(null);
    if (ok) closeMenu();
  }

  async function handleRemove() {
    setBusy('removing');
    const ok = await send('DELETE', undefined, 'Could not remove your photo.');
    setBusy(null);
    if (ok) closeMenu();
  }

  return (
    // my-7 leaves room for the outline, which reaches 28px past the photo.
    <div ref={wrapperRef} className={`relative ${outlineArtKey ? 'my-7' : ''}`}>
      <button
        type="button"
        onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
        disabled={busy !== null}
        aria-expanded={menuOpen}
        aria-controls={menuId}
        title="Change profile photo"
        className={`group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 bg-slate-800 transition hover:border-emerald-400 disabled:opacity-70 ${
          outlineArtKey ? 'border-transparent' : 'border-slate-700'
        }`}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="Your profile photo" className="h-full w-full object-cover" />
        ) : (
          <DefaultAvatar />
        )}
        <span
          className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs text-white transition ${
            busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {busy === 'uploading' ? 'Uploading…' : busy === 'removing' ? 'Removing…' : photoUrl ? 'Change photo' : 'Add photo'}
        </span>
      </button>

      {/* The outline's drawing is 1.5x the photo (the photo fills its inner
          two thirds), so it hangs 28px past each side. */}
      {outlineArtKey ? (
        <span aria-hidden="true" className="pointer-events-none absolute -inset-7 z-10">
          <CosmeticArt artKey={outlineArtKey} avatar={false} className="h-full w-full" />
        </span>
      ) : null}

      {menuOpen ? (
        <div
          id={menuId}
          className={`absolute left-1/2 top-full z-20 ${outlineArtKey ? 'mt-9' : 'mt-2'} w-56 -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl shadow-black/50`}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy !== null}
            className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === 'uploading' ? 'Uploading…' : 'Upload new photo'}
            <span className="block text-xs text-slate-500">PNG only, up to 5 MB</span>
          </button>
          {photoUrl ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy !== null}
              className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-400 transition hover:bg-red-950/60 hover:text-red-300 disabled:opacity-50"
            >
              {busy === 'removing' ? 'Removing…' : 'Remove photo'}
            </button>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 rounded-xl border border-red-800 bg-red-950/60 p-2 text-xs text-red-200">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <input ref={fileInputRef} type="file" accept="image/png" className="hidden" onChange={handleFileChosen} />
    </div>
  );
}
