'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clampToViewport, defaultPosition, moveByKey, type Point } from '../../lib/floatingWindow';
import PublicProfileView from './PublicProfileView';
import { usePublicProfile } from './usePublicProfile';

// SRS-121.14: another player's public profile, opened from the poker table, in
// a small window over the game instead of a new tab, so the hand carries on.
// Drag it by its title bar (mouse, pen or touch), or move it with the arrow
// keys from the grip; close it with × or Escape. It always stays fully on
// screen, and opens where it was last left while the page is open.
let lastPosition: Point | null = null;

export default function ProfileWindow({ playerId, username, onClose }: { playerId: string; username: string | null; onClose: () => void }) {
  const { profile, status } = usePublicProfile(playerId);
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState<Point | null>(null);

  const sizeOf = () => ({ width: box.current?.offsetWidth ?? 352, height: box.current?.offsetHeight ?? 480 });
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  const place = (next: Point) => {
    const clamped = clampToViewport(next, sizeOf(), viewport());
    lastPosition = clamped;
    setPos(clamped);
  };

  // Placed before it's first painted: where it was left, or the top right.
  useLayoutEffect(() => {
    place(lastPosition ?? defaultPosition(sizeOf(), viewport()));
  }, []);

  // Back on screen if the browser window shrinks or the profile loads taller.
  useEffect(() => {
    const keepOnScreen = () => setPos((p) => (p ? clampToViewport(p, sizeOf(), viewport()) : p));
    keepOnScreen();
    window.addEventListener('resize', keepOnScreen);
    return () => window.removeEventListener('resize', keepOnScreen);
  }, [status]);

  // Focus moves into the window once it's placed (it's hidden until then, and
  // a hidden button can't take focus), and again when another seat switches
  // it; on closing, it goes back to the seat that last opened it.
  const opener = useRef<HTMLElement | null>(null);
  const placed = pos !== null;
  useEffect(() => {
    if (!placed) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !box.current?.contains(active)) opener.current = active;
    closeButton.current?.focus();
  }, [placed, playerId]);
  useEffect(() => () => opener.current?.focus(), []);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('[data-close]') || !box.current) return;
    const rect = box.current.getBoundingClientRect();
    drag.current = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const grab = drag.current;
    if (!grab || grab.pointerId !== event.pointerId) return;
    place({ x: event.clientX - grab.dx, y: event.clientY - grab.dy });
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function moveWithKeys(event: KeyboardEvent<HTMLButtonElement>) {
    const next = pos ? moveByKey(pos, event.key, event.shiftKey) : null;
    if (!next) return;
    event.preventDefault();
    place(next);
  }

  const name = profile?.username ?? username ?? 'This player';
  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      className="fixed z-50 flex max-h-[min(36rem,calc(100vh-1rem))] w-[22rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/95 text-slate-100 shadow-2xl shadow-black/60"
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      {/* The title bar is the handle: it takes the pointer while dragging. */}
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex cursor-grab touch-none select-none items-center gap-2 border-b border-slate-800 bg-slate-900 px-2 py-1.5 active:cursor-grabbing"
      >
        <button
          type="button"
          onKeyDown={moveWithKeys}
          aria-label="Move this window with the arrow keys"
          title="Drag the bar, or use the arrow keys, to move this window"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <svg aria-hidden="true" viewBox="0 0 12 18" className="h-4 w-3" fill="currentColor">
            {[3, 9].map((x) => [3, 9, 15].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} />))}
          </svg>
        </button>
        <p id={titleId} className="min-w-0 flex-1 truncate text-sm font-semibold">
          {name}&apos;s profile
        </p>
        <button
          ref={closeButton}
          type="button"
          data-close
          onClick={onClose}
          aria-label="Close profile"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          ×
        </button>
      </div>

      <div className="space-y-3 overflow-y-auto p-3">
        {status === 'loading' ? (
          <p className="p-2 text-sm text-slate-400">Loading…</p>
        ) : status === 'ready' && profile ? (
          <PublicProfileView profile={profile} size="window" />
        ) : (
          <p className="p-2 text-sm text-slate-400">
            {status === 'not-found' ? "There's no player with this profile. They may have deleted their account." : "This profile couldn't be loaded. Please try again."}
          </p>
        )}
      </div>
    </div>
  );
}
