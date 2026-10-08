'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../lib/supabase';
import {
  POKER_CHANNEL_NAME,
  POKER_EVENT_ACTION,
  POKER_EVENT_ACK,
  POKER_EVENT_STATE,
  type PokerAckPayload,
  type PokerAction,
} from '../../lib/pokerRealtime';

interface Seat {
  seatNumber: number;
  playerId: string | null;
  username: string | null;
  avatarUrl: string | null;
}

interface TableState {
  tableId: string;
  maxSeats: number;
  seatedCount: number;
  seats: Seat[];
}

interface OwnProfile {
  playerId: number;
  username: string | null;
  profilePhotoDataUrl: string | null;
}

// A tiny dependency-free id, unique-enough for correlating requests/presence
// — not crypto.randomUUID(), which is secure-context-only and would silently
// break testing over plain http://<lan-ip>:3000, exactly the cross-laptop
// scenario this page's real-time transport is for.
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export default function PokerTablePage() {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [connected, setConnected] = useState(false);
  const [tableState, setTableState] = useState<TableState | null>(null);
  const [joinError, setJoinError] = useState('');
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  const connectionIdRef = useRef(generateId());
  const pendingRef = useRef(new Map<string, (ack: PokerAckPayload) => void>());
  const fetchedAvatarsRef = useRef(new Set<string>());

  // Avatars aren't carried through the table:state broadcast (a profile
  // photo as base64 can exceed Realtime's broadcast payload size limit), so
  // each seated player's avatar is fetched separately as seats appear.
  useEffect(() => {
    if (!tableState) return;

    tableState.seats.forEach((seat) => {
      if (!seat.playerId || fetchedAvatarsRef.current.has(seat.playerId)) return;
      fetchedAvatarsRef.current.add(seat.playerId);

      fetch(`/api/players/${seat.playerId}/avatar`)
        .then((res) => res.json())
        .then((data) => setAvatars((prev) => ({ ...prev, [seat.playerId as string]: data.avatarUrl ?? null })))
        .catch(() => setAvatars((prev) => ({ ...prev, [seat.playerId as string]: null })));
    });
  }, [tableState]);

  // SRS-1.1/1.7: joining (and seeing the table) requires a signed-in player
  // whose own profile — username and picture — is what gets seated.
  useEffect(() => {
    const stored = localStorage.getItem('player_token');
    setToken(stored);
    if (!stored) {
      setProfileLoading(false);
      return;
    }

    fetch('/api/profile', { headers: { Authorization: `Bearer ${stored}` } })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setProfileError(data.error || 'Failed to load your profile.');
          return;
        }
        setProfile(data.profile);
      })
      .finally(() => setProfileLoading(false));
  }, []);

  useEffect(() => {
    if (!token || !profile) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setJoinError('Realtime is not configured.');
      return;
    }

    const connectionId = connectionIdRef.current;
    const nextChannel = supabase.channel(POKER_CHANNEL_NAME, {
      config: { broadcast: { self: false }, presence: { key: connectionId } },
    });

    nextChannel.on(
      'broadcast',
      { event: POKER_EVENT_STATE },
      ({ payload }: { payload: TableState }) => setTableState(payload)
    );
    nextChannel.on(
      'broadcast',
      { event: POKER_EVENT_ACK },
      ({ payload }: { payload: PokerAckPayload }) => {
        pendingRef.current.get(payload.requestId)?.(payload);
        pendingRef.current.delete(payload.requestId);
      }
    );

    nextChannel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
      if (status === 'SUBSCRIBED') {
        nextChannel.send({
          type: 'broadcast',
          event: POKER_EVENT_ACTION,
          payload: { requestId: generateId(), action: 'sync', connectionId },
        });
      }
    });

    setChannel(nextChannel);

    return () => {
      supabase.removeChannel(nextChannel);
    };
  }, [token, profile]);

  function sendAction(action: PokerAction): Promise<PokerAckPayload> {
    return new Promise((resolve) => {
      const requestId = generateId();
      pendingRef.current.set(requestId, resolve);
      channel?.send({
        type: 'broadcast',
        event: POKER_EVENT_ACTION,
        payload: {
          requestId,
          action,
          connectionId: connectionIdRef.current,
          token: token ?? undefined,
        },
      });
    });
  }

  const mySeat = useMemo(() => {
    if (!profile || !tableState) return null;
    return tableState.seats.find((seat) => seat.playerId === String(profile.playerId)) ?? null;
  }, [profile, tableState]);

  const isFull = tableState ? tableState.seatedCount >= tableState.maxSeats : false;

  async function handleJoin() {
    if (!channel || !token) return;
    setJoinError('');
    const result = await sendAction('join');
    if (result.ok) {
      await channel.track({ joinedAt: Date.now() });
    } else {
      setJoinError(result.error || 'Unable to join the table.');
    }
  }

  async function handleLeave() {
    if (!channel) return;
    setJoinError('');
    const result = await sendAction('leave');
    if (result.ok) {
      await channel.untrack();
    } else {
      setJoinError(result.error || 'Unable to leave the table.');
    }
  }

  if (profileLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </main>
    );
  }

  // SRS-1.1 (simplified): the poker room is only accessible to a signed-in player.
  if (!token || !profile) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
        <section className="text-center space-y-4">
          <p className="text-slate-300">
            {profileError || 'You must be logged in to join the poker table.'}
          </p>
          <Link
            href="/login"
            className="inline-block rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm hover:border-emerald-400 hover:text-emerald-200"
          >
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-page bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Poker Room</p>
        <h1 className="mt-4 text-3xl font-semibold">Table 1</h1>
        <p className="mt-2 text-slate-300">
          {connected ? 'Connected to the table server.' : 'Connecting to the table server…'}
        </p>

        {tableState ? (
          <p className="mt-2 text-sm text-slate-400">
            {tableState.seatedCount} / {tableState.maxSeats} seats filled
            {isFull ? ' — table full' : ''}
          </p>
        ) : null}

        <div className="relative mx-auto mt-8 h-[320px] w-full max-w-xl sm:h-[400px]">
          {/* Wooden rail */}
          <div className="absolute inset-[6%] rounded-[50%] bg-gradient-to-br from-amber-700 via-amber-900 to-amber-950 shadow-2xl shadow-black/60" />

          {/* Felt */}
          <div className="absolute inset-[11%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,_#15803d_0%,_#065f46_60%,_#022c22_100%)] shadow-[inset_0_0_50px_rgba(0,0,0,0.6)]">
            {/* Racetrack line */}
            <div className="absolute inset-[9%] rounded-[50%] border border-emerald-300/15" />
            {/* Center emblem */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              <p className="text-xs uppercase tracking-[0.4em] text-emerald-300/25">Stacks Overflowed</p>
              <p className="text-2xl font-bold uppercase tracking-[0.2em] text-emerald-200/15">Table 1</p>
            </div>
          </div>

          {tableState?.seats.map((seat, index) => {
            // Seats are placed by angle around an oval, starting at the top
            // and going clockwise, like sitting around a real table.
            const angle = (2 * Math.PI * index) / tableState.maxSeats - Math.PI / 2;
            const left = 50 + 46 * Math.cos(angle);
            const top = 50 + 44 * Math.sin(angle);
            const isOwnSeat = seat.playerId === String(profile.playerId);

            return (
              <div
                key={seat.seatNumber}
                style={{ left: `${left}%`, top: `${top}%` }}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              >
                <div
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 shadow-lg shadow-black/50 ${
                    seat.playerId
                      ? isOwnSeat
                        ? 'border-emerald-300 bg-slate-900'
                        : 'border-emerald-500/60 bg-slate-900'
                      : 'border-slate-600/70 bg-slate-800/80'
                  }`}
                >
                  {seat.playerId ? (
                    avatars[seat.playerId] ? (
                      <img src={avatars[seat.playerId] as string} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-base font-semibold text-emerald-200">
                        {seat.username?.[0]?.toUpperCase()}
                      </span>
                    )
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                      {seat.seatNumber}
                    </span>
                  )}
                </div>
                <p
                  className={`max-w-[84px] truncate rounded-full bg-black/40 px-2 py-0.5 text-center text-xs font-medium backdrop-blur-sm ${
                    seat.playerId ? 'text-emerald-100' : 'text-slate-400'
                  }`}
                >
                  {seat.username ?? 'Open'}
                </p>
                {isOwnSeat ? <p className="text-[10px] text-emerald-300">(you)</p> : null}
              </div>
            );
          })}
        </div>

        <div className="mt-8 space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-700 bg-slate-900">
              {profile.profilePhotoDataUrl ? (
                <img src={profile.profilePhotoDataUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-300">
                  {profile.username?.[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-300">
              Signed in as <span className="font-semibold text-slate-100">{profile.username}</span>
            </p>
          </div>

          {!mySeat ? (
            <button
              type="button"
              onClick={handleJoin}
              disabled={!connected || isFull}
              className="w-full rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isFull ? 'Table full' : 'Join table'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLeave}
              className="w-full rounded-xl bg-red-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-red-300"
            >
              Leave seat {mySeat.seatNumber}
            </button>
          )}

          {joinError ? (
            <p className="rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{joinError}</p>
          ) : null}
        </div>

        <p className="mt-6 text-sm text-slate-300">
          Back to{' '}
          <Link href="/" className="text-emerald-300 hover:underline">
            home
          </Link>
        </p>
      </section>
    </main>
  );
}
