'use client';

import { useEffect, useRef, useState } from 'react';
import EmoteArt from '../../components/emotes/EmoteArt';
import { DEFAULT_EMOTES, EMOTE_COOLDOWN_MS } from '../../lib/emotes';

// The emote button at a poker table (lib/emotes.ts): opens a grid of the
// player's emotes; tapping one sends it and closes the grid. It can be used
// at any time while seated — between hands, mid-hand, on anyone's turn. A
// short cooldown (the same one the server enforces) dims the button.
export default function EmotePicker({ onSend }: { onSend: (emoteId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [coolingUntil, setCoolingUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cooling = now < coolingUntil;

  // Re-render as the cooldown runs out.
  useEffect(() => {
    if (!cooling) return;
    const timer = setTimeout(() => setNow(Date.now()), coolingUntil - now + 20);
    return () => clearTimeout(timer);
  }, [cooling, coolingUntil, now]);

  // A click outside, or Escape, closes the grid.
  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function send(emoteId: string) {
    if (cooling) return;
    onSend(emoteId);
    const at = Date.now();
    setNow(at);
    setCoolingUntil(at + EMOTE_COOLDOWN_MS);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      {open ? (
        <div
          role="menu"
          aria-label="Emotes"
          className="absolute bottom-full left-0 mb-3 grid w-[17rem] grid-cols-4 gap-1.5 rounded-2xl border border-white/10 bg-slate-950/95 p-2.5 shadow-2xl shadow-black/60"
        >
          {DEFAULT_EMOTES.map((emote) => (
            <button
              key={emote.id}
              type="button"
              role="menuitem"
              onClick={() => send(emote.id)}
              disabled={cooling}
              title={emote.name}
              aria-label={emote.name}
              className="group rounded-xl p-1 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <EmoteArt emoteId={emote.id} className="h-14 w-14 transition group-hover:scale-110" />
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Emotes"
        title={cooling ? 'Wait a moment before sending another emote' : 'Emotes'}
        className={`flex h-14 w-14 items-center justify-center rounded-full border-2 bg-slate-900/90 shadow-lg shadow-black/50 transition hover:scale-105 ${
          open ? 'border-amber-300' : 'border-white/15 hover:border-amber-300/70'
        } ${cooling ? 'opacity-50' : ''}`}
      >
        <EmoteArt emoteId="laugh" className="h-11 w-11" />
      </button>
    </div>
  );
}
