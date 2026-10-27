'use client';

// Client-side plumbing shared by the poker lobby (app/poker/page.tsx) and a
// table (app/poker/[tableId]/page.tsx): loading the signed-in player,
// subscribing to one of the poker Realtime channels (lib/pokerRealtime.ts),
// and sending actions through POST /api/poker/action.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase';
import {
  POKER_EVENT_ACTION,
  POKER_EVENT_ACK,
  POKER_EVENT_EMOTE,
  POKER_EVENT_STATE,
  type PokerEmotePayload,
  type PokerAckPayload,
  type PokerActionRequest,
  type PokerSyncPayload,
} from '../../lib/pokerRealtime';

// How long to wait for the poker server's ack before giving up — e.g. when
// `npm run realtime` isn't running, nothing would ever answer.
const ACK_TIMEOUT_MS = 10_000;

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
 * `sendAction` POSTs a join/leave/act to /api/poker/action with the player's
 * token (which never goes on the public channel) and resolves with the
 * server's matching `ack` from the channel, or an error.
 */
export function usePokerChannel<State>(
  channelName: string | null,
  enabled: boolean,
  onState: (state: State) => void,
  // A table's emotes (POKER_EVENT_EMOTE); the lobby has none.
  onEmote?: (emote: PokerEmotePayload) => void
) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const pendingRef = useRef(new Map<string, (ack: PokerAckPayload) => void>());
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  const onEmoteRef = useRef(onEmote);
  onEmoteRef.current = onEmote;

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
    nextChannel.on('broadcast', { event: POKER_EVENT_EMOTE }, ({ payload }) =>
      onEmoteRef.current?.(payload as PokerEmotePayload)
    );
    nextChannel.on('broadcast', { event: POKER_EVENT_ACK }, ({ payload }: { payload: PokerAckPayload }) => {
      pendingRef.current.get(payload.requestId)?.(payload);
      pendingRef.current.delete(payload.requestId);
    });

    nextChannel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
      if (status === 'SUBSCRIBED') {
        const sync: PokerSyncPayload = { requestId: generateId(), action: 'sync' };
        nextChannel.send({ type: 'broadcast', event: POKER_EVENT_ACTION, payload: sync });
      }
    });

    return () => {
      setConnected(false);
      supabase.removeChannel(nextChannel);
    };
  }, [channelName, enabled]);

  const sendAction = useCallback(
    async (token: string, request: Omit<PokerActionRequest, 'requestId'>): Promise<PokerAckPayload> => {
      const requestId = generateId();
      const fail = (error: string): PokerAckPayload => ({ requestId, ok: false, error });

      // Listen for the ack before sending, so a fast one can't be missed.
      const ack = new Promise<PokerAckPayload>((resolve) => {
        pendingRef.current.set(requestId, resolve);
        setTimeout(() => {
          if (pendingRef.current.delete(requestId)) resolve(fail('The poker server did not respond. Try again.'));
        }, ACK_TIMEOUT_MS);
      });

      const res = await fetch('/api/poker/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...request, requestId }),
      }).catch(() => null);

      if (!res || !res.ok) {
        pendingRef.current.delete(requestId);
        const data = await res?.json().catch(() => null);
        return fail(data?.error || 'Unable to reach the poker server.');
      }
      return ack;
    },
    []
  );

  return { connected, error, sendAction };
}
