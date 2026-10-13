'use client';

// Client-side plumbing shared by the poker lobby (app/poker/page.tsx) and a
// table (app/poker/[tableId]/page.tsx): loading the signed-in player, and
// subscribing to one of the poker Realtime channels (lib/pokerRealtime.ts).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../lib/supabase';
import {
  POKER_EVENT_ACTION,
  POKER_EVENT_ACK,
  POKER_EVENT_STATE,
  type PokerAckPayload,
  type PokerAction,
  type PokerActionPayload,
} from '../../lib/pokerRealtime';

export interface OwnProfile {
  playerId: number;
  username: string | null;
  profilePhotoDataUrl: string | null;
  balance: number;
}

// A tiny dependency-free id, unique-enough for correlating ack requests —
// not crypto.randomUUID(), which is secure-context-only and would silently
// break testing over plain http://<lan-ip>:3000, exactly the cross-laptop
// scenario these pages' real-time transport is for.
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * SRS-1.1/1.7: the poker room (and seeing any table) requires a signed-in
 * player whose own profile — username and picture — is what gets seated.
 */
export function usePlayerProfile() {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('player_token');
    setToken(stored);
    if (!stored) {
      setLoading(false);
      return;
    }

    fetch('/api/profile', { headers: { Authorization: `Bearer ${stored}` } })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to load your profile.');
          return;
        }
        setProfile(data.profile);
      })
      .finally(() => setLoading(false));
  }, []);

  return { token, profile, setProfile, loading, error };
}

/**
 * Subscribes to `channelName` while `enabled`, hands every `state` broadcast
 * to `onState`, and asks for a snapshot (`sync`) as soon as it's subscribed.
 * `sendAction` resolves with the server's matching `ack`.
 */
export function usePokerChannel<State>(
  channelName: string | null,
  enabled: boolean,
  onState: (state: State) => void
) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const pendingRef = useRef(new Map<string, (ack: PokerAckPayload) => void>());
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    if (!channelName || !enabled) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Realtime is not configured.');
      return;
    }

    const nextChannel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    nextChannel.on('broadcast', { event: POKER_EVENT_STATE }, ({ payload }) => onStateRef.current(payload as State));
    nextChannel.on('broadcast', { event: POKER_EVENT_ACK }, ({ payload }: { payload: PokerAckPayload }) => {
      pendingRef.current.get(payload.requestId)?.(payload);
      pendingRef.current.delete(payload.requestId);
    });

    nextChannel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
      if (status === 'SUBSCRIBED') {
        nextChannel.send({
          type: 'broadcast',
          event: POKER_EVENT_ACTION,
          payload: { requestId: generateId(), action: 'sync' },
        });
      }
    });

    setChannel(nextChannel);

    return () => {
      setChannel(null);
      setConnected(false);
      supabase.removeChannel(nextChannel);
    };
  }, [channelName, enabled]);

  const sendAction = useCallback(
    (action: PokerAction, extra?: Omit<PokerActionPayload, 'requestId' | 'action'>): Promise<PokerAckPayload> =>
      new Promise((resolve) => {
        const requestId = generateId();
        pendingRef.current.set(requestId, resolve);
        channel?.send({
          type: 'broadcast',
          event: POKER_EVENT_ACTION,
          payload: { requestId, action, ...extra },
        });
      }),
    [channel]
  );

  return { connected, error, sendAction };
}
