// Standalone real-time relay process for the poker room, matching the
// "Poker Realtime Server" box in docs/architecture/C2.mmd. It runs as its
// own process, separate from the Next.js app and its REST API routes, and
// is the single authoritative holder of in-memory poker table state — Next
// serverless routes can't reliably share in-memory state across invocations,
// so this process still exists even though it no longer speaks Socket.io.
//
// It never binds an HTTP server or a port: all communication is an outbound
// connection to a Supabase Realtime channel. That's what lets players on
// different laptops/networks join without any inbound port-forwarding to
// this process — only outbound reachability to Supabase is required, by
// both this process and every browser client.
//
// Sprint 1 scope: a single hardcoded table that supports joining an open
// seat, leaving a seat, and a hard cap on seat count. Multi-table support,
// buy-ins, reconnection grace periods, and hand/betting logic are deferred
// to later sprints.
//
// Joining requires a valid player_sessions token (the same one issued by
// POST /api/auth/login): the server resolves it to a player_id and looks up
// that player's own username/profile photo, rather than trusting whatever a
// client claims about itself (SRS-8.1: every seated player's client sees
// the real profile picture of who is actually seated).
//
// Run with: npm run realtime

import { config as loadEnv } from 'dotenv';
import { DEFAULT_TABLE_SEATS, PokerTable } from '../lib/pokerTable';
import { getSupabaseClient } from '../lib/supabase';
import { getPlayerIdForToken } from '../lib/auth';
import { getPlayerUsername } from '../lib/playerDisplay';
import {
  POKER_CHANNEL_NAME,
  POKER_EVENT_ACTION,
  POKER_EVENT_ACK,
  POKER_EVENT_STATE,
  type PokerActionPayload,
} from '../lib/pokerRealtime';

// Unlike Next.js, a standalone Node process doesn't auto-load .env files, so
// this has to happen before getSupabaseClient() reads process.env below.
// .env.local takes precedence, matching Next's own env-loading order.
loadEnv();
loadEnv({ path: '.env.local', override: true });

const MAX_SEATS = Number(process.env.POKER_TABLE_MAX_SEATS) || DEFAULT_TABLE_SEATS;

const table = new PokerTable('table-1', MAX_SEATS);
const supabase = getSupabaseClient();

if (!supabase) {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase credentials are not configured — the poker server cannot verify signed-in players. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).'
  );
}

const channel = supabase?.channel(POKER_CHANNEL_NAME, {
  config: { broadcast: { self: false } },
});

function broadcastState() {
  channel?.send({ type: 'broadcast', event: POKER_EVENT_STATE, payload: table.getState() });
}

function sendAck(requestId: string, result: { ok: boolean; error?: string; seatNumber?: number }) {
  channel?.send({ type: 'broadcast', event: POKER_EVENT_ACK, payload: { requestId, ...result } });
}

// Maps each client's self-chosen connectionId (its Realtime Presence key) to
// the player_id the server validated it as, so a presence "leave" (dropped
// connection) can free the right seat without trusting the client to say who
// it is a second time — mirrors the old socketPlayerIds map, just keyed by a
// connectionId instead of a server-assigned socket.id. The map's VALUE is
// only ever written here, from a server-side token lookup; the client can
// never assert a player_id directly, only an inert correlation handle.
const connectionPlayerIds = new Map<string, string>();

channel?.on(
  'broadcast',
  { event: POKER_EVENT_ACTION },
  async ({ payload }: { payload: PokerActionPayload }) => {
    const { requestId, action, connectionId, token } = payload;

    // SRS-1.7 (simplified): any client can ask for the current table state.
    // Realtime broadcast has no "send to just this one newly-subscribed
    // client" primitive, so a freshly-subscribed client requests a snapshot
    // itself instead of the server pushing one unprompted on connect.
    if (action === 'sync') {
      broadcastState();
      return;
    }

    if (action === 'join') {
      if (!supabase) {
        sendAck(requestId, { ok: false, error: 'Supabase credentials are not configured.' });
        return;
      }

      if (!token) {
        sendAck(requestId, { ok: false, error: 'You must be signed in to join the table.' });
        return;
      }

      const playerId = await getPlayerIdForToken(supabase, token);
      if (playerId === null) {
        sendAck(requestId, { ok: false, error: 'Your session has expired. Please log in again.' });
        return;
      }

      const username = await getPlayerUsername(supabase, playerId);
      if (!username) {
        sendAck(requestId, { ok: false, error: 'Unable to load your profile.' });
        return;
      }

      // Seats carry only a username here — avatars are fetched separately
      // by clients (GET /api/players/[playerId]/avatar) rather than carried
      // through this broadcast, since a profile photo as base64 can easily
      // exceed Realtime's broadcast payload size limit.
      const result = table.join(String(playerId), username);
      if (result.ok) {
        connectionPlayerIds.set(connectionId, String(playerId));
        broadcastState();
      }
      sendAck(requestId, result);
      return;
    }

    if (action === 'leave') {
      const playerId = connectionPlayerIds.get(connectionId);
      if (!playerId) {
        sendAck(requestId, { ok: false, error: 'You are not seated at this table.' });
        return;
      }

      const result = table.leave(playerId);
      if (result.ok) {
        connectionPlayerIds.delete(connectionId);
        broadcastState();
      }
      sendAck(requestId, result);
    }
  }
);

// Simplified for sprint 1: a dropped connection immediately frees the seat.
// The full reconnection grace period (SRS-10.x / SRS-9.x) is deferred to a
// later sprint. Presence "leave" fires whether the tab closed cleanly or the
// network just dropped, the same cases the old Socket.io `disconnect` event
// covered.
channel?.on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
  const playerId = connectionPlayerIds.get(key);
  if (!playerId) return;

  connectionPlayerIds.delete(key);
  const result = table.leave(playerId);
  if (result.ok) {
    broadcastState();
  }
});

channel?.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    // eslint-disable-next-line no-console
    console.log(
      `Poker realtime server subscribed to "${POKER_CHANNEL_NAME}" (table cap: ${MAX_SEATS} seats)`
    );
  }
});
