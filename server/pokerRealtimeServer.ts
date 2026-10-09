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
// seat, leaving a seat, a hard cap on seat count, and a buy-in (SRS-1.2,
// SRS-1.3) deducted from/refunded to players.balance. A seat survives a
// dropped connection (closing the tab does not free it or refund the stack)
// so a player can reconnect and resume it later (SRS-2.1) — there is no
// disconnection-timeout removal yet (SRS-9.x/10.x), and full hand/betting
// logic is deferred to later sprints.
//
// Both joining and leaving require a valid player_sessions token (the same
// one issued by POST /api/auth/login): the server resolves it to a
// player_id itself, rather than trusting whatever a client claims about
// itself (SRS-8.1: every seated player's client sees the real profile
// picture of who is actually seated) — this is also what makes leaving work
// from a reconnected tab/session, since seat ownership is checked by
// player_id, never by which connection is asking.
//
// Run with: npm run realtime

import { config as loadEnv } from 'dotenv';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_BIG_BLIND, DEFAULT_TABLE_SEATS, PokerTable } from '../lib/pokerTable';
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

// The buy-in range for this single demo table is 50x-200x its big blind.
// Not tied to poker_seats' own 40x-100x-big-blind rule in
// supabase/schema.sql — that's a different multiplier for a table row this
// sprint's single in-memory table doesn't have.
const MIN_BUY_IN_MULTIPLIER = 50;
const MAX_BUY_IN_MULTIPLIER = 200;

// Unlike Next.js, a standalone Node process doesn't auto-load .env files, so
// this has to happen before getSupabaseClient() reads process.env below.
// .env.local takes precedence, matching Next's own env-loading order.
loadEnv();
loadEnv({ path: '.env.local', override: true });

const MAX_SEATS = Number(process.env.POKER_TABLE_MAX_SEATS) || DEFAULT_TABLE_SEATS;
const BIG_BLIND = Number(process.env.POKER_BIG_BLIND) || DEFAULT_BIG_BLIND;
const MIN_BUY_IN = MIN_BUY_IN_MULTIPLIER * BIG_BLIND;
const MAX_BUY_IN = MAX_BUY_IN_MULTIPLIER * BIG_BLIND;

const table = new PokerTable('table-1', MAX_SEATS, BIG_BLIND);
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

// PostgREST calls can't share a transaction, so both of these use an
// optimistic-lock read-then-conditional-update (matching the balance just
// read), retried once on a lost race, instead of a raw increment/decrement.
const BALANCE_WRITE_ATTEMPTS = 2;

async function deductBalance(
  supabase: SupabaseClient,
  playerId: number,
  amount: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < BALANCE_WRITE_ATTEMPTS; attempt++) {
    const { data: player, error: readError } = await supabase
      .from('players')
      .select('balance')
      .eq('player_id', playerId)
      .maybeSingle();

    if (readError || !player) return { ok: false, error: 'Unable to read your balance.' };
    if (player.balance < amount) return { ok: false, error: 'That buy-in exceeds your balance.' };

    const { data: updated, error: updateError } = await supabase
      .from('players')
      .update({ balance: player.balance - amount })
      .eq('player_id', playerId)
      .eq('balance', player.balance)
      .select('balance');

    if (updateError) return { ok: false, error: 'Unable to update your balance.' };
    if (updated && updated.length > 0) return { ok: true };
    // Balance changed between the read and the write — retry once.
  }
  return { ok: false, error: 'Please try again.' };
}

// Refunding has no ack to attach a failure to, so this just logs if it ever
// exhausts its retries instead of returning a result.
async function refundBalance(supabase: SupabaseClient, playerId: number, amount: number): Promise<void> {
  for (let attempt = 0; attempt < BALANCE_WRITE_ATTEMPTS; attempt++) {
    const { data: player } = await supabase.from('players').select('balance').eq('player_id', playerId).maybeSingle();
    if (!player) return;

    const { data: updated } = await supabase
      .from('players')
      .update({ balance: player.balance + amount })
      .eq('player_id', playerId)
      .eq('balance', player.balance)
      .select('balance');

    if (updated && updated.length > 0) return;
  }
  // eslint-disable-next-line no-console
  console.error(`Failed to refund ${amount} to player ${playerId} after ${BALANCE_WRITE_ATTEMPTS} attempts.`);
}

channel?.on(
  'broadcast',
  { event: POKER_EVENT_ACTION },
  async ({ payload }: { payload: PokerActionPayload }) => {
    const { requestId, action, token, buyIn } = payload;

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

      // SRS-1.3: the server never trusts the client's chosen amount beyond
      // this sprint's flat range — deductBalance() below re-checks it
      // against the player's real, freshly-read balance regardless.
      if (!Number.isInteger(buyIn) || (buyIn as number) < MIN_BUY_IN || (buyIn as number) > MAX_BUY_IN) {
        sendAck(requestId, {
          ok: false,
          error: `Buy-in must be between ${MIN_BUY_IN} and ${MAX_BUY_IN}.`,
        });
        return;
      }

      const deduction = await deductBalance(supabase, playerId, buyIn as number);
      if (!deduction.ok) {
        sendAck(requestId, { ok: false, error: deduction.error });
        return;
      }

      // Seats carry only a username here — avatars are fetched separately
      // by clients (GET /api/players/[playerId]/avatar) rather than carried
      // through this broadcast, since a profile photo as base64 can easily
      // exceed Realtime's broadcast payload size limit.
      const result = table.join(String(playerId), username, buyIn as number);
      if (result.ok) {
        broadcastState();
      } else {
        // The seat was taken out from under us between the deduction above
        // and this call (e.g. the table filled up) — give the money back.
        await refundBalance(supabase, playerId, buyIn as number);
      }
      sendAck(requestId, result);
      return;
    }

    if (action === 'leave') {
      if (!supabase) {
        sendAck(requestId, { ok: false, error: 'Supabase credentials are not configured.' });
        return;
      }

      if (!token) {
        sendAck(requestId, { ok: false, error: 'You must be signed in to leave the table.' });
        return;
      }

      const playerId = await getPlayerIdForToken(supabase, token);
      if (playerId === null) {
        sendAck(requestId, { ok: false, error: 'Your session has expired. Please log in again.' });
        return;
      }

      const result = table.leave(String(playerId));
      if (result.ok) {
        if (result.chipStack) {
          await refundBalance(supabase, playerId, result.chipStack);
        }
        broadcastState();
      }
      sendAck(requestId, result);
    }
  }
);

channel?.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    // eslint-disable-next-line no-console
    console.log(
      `Poker realtime server subscribed to "${POKER_CHANNEL_NAME}" (table cap: ${MAX_SEATS} seats, big blind: ${BIG_BLIND}, buy-in: ${MIN_BUY_IN}-${MAX_BUY_IN})`
    );
  }
});
