// Standalone real-time relay process for the poker room, matching the
// "Poker Realtime Server" box in docs/architecture/C2.mmd. It runs as its
// own process, separate from the Next.js app and its REST API routes, and
// is the single authoritative holder of in-memory poker table state — Next
// serverless routes can't reliably share in-memory state across invocations,
// so this process still exists even though it no longer speaks Socket.io.
//
// It never binds an HTTP server or a port: all communication is an outbound
// connection to Supabase Realtime channels. That's what lets players on
// different laptops/networks join without any inbound port-forwarding to
// this process — only outbound reachability to Supabase is required, by
// both this process and every browser client.
//
// Sprint 1 scope: the fixed set of tables in lib/pokerTables.ts, each on its
// own Realtime channel, plus a lobby channel summarizing all of them. A table
// supports joining a chosen open seat, leaving a seat, a hard cap on seat
// count, and a buy-in (SRS-1.2, SRS-1.3) deducted from/refunded to
// players.balance. A player can be seated at only one table at a time. A
// seat survives a dropped connection (closing the tab does not free it or
// refund the stack) so a player can reconnect and resume it later
// (SRS-2.1) — there is no disconnection-timeout removal yet (SRS-9.x/10.x),
// and full hand/betting logic is deferred to later sprints.
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
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { MAX_BUY_IN_MULTIPLIER, MIN_BUY_IN_MULTIPLIER, PokerTable } from '../lib/pokerTable';
import { POKER_TABLES, type PokerTableConfig } from '../lib/pokerTables';
import { getSupabaseClient } from '../lib/supabase';
import { getPlayerIdForToken } from '../lib/auth';
import { getPlayerUsername } from '../lib/playerDisplay';
import {
  POKER_EVENT_ACTION,
  POKER_EVENT_ACK,
  POKER_EVENT_STATE,
  POKER_LOBBY_CHANNEL_NAME,
  pokerTableChannelName,
  type PokerActionPayload,
  type PokerLobbyState,
} from '../lib/pokerRealtime';

// Unlike Next.js, a standalone Node process doesn't auto-load .env files, so
// this has to happen before getSupabaseClient() reads process.env below.
// .env.local takes precedence, matching Next's own env-loading order.
loadEnv();
loadEnv({ path: '.env.local', override: true });

interface TableEntry {
  config: PokerTableConfig;
  table: PokerTable;
  channel: RealtimeChannel;
}

type AckResult = { ok: boolean; error?: string; seatNumber?: number };

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

const CHANNEL_CONFIG = { config: { broadcast: { self: false } } };

function startServer(supabase: SupabaseClient) {
  const lobbyChannel = supabase.channel(POKER_LOBBY_CHANNEL_NAME, CHANNEL_CONFIG);
  const entries: TableEntry[] = POKER_TABLES.map((config) => ({
    config,
    table: new PokerTable(config.id, config.maxSeats, config.bigBlind, config.smallBlind),
    channel: supabase.channel(pokerTableChannelName(config.id), CHANNEL_CONFIG),
  }));

  // Players with a join being processed right now. A join awaits several
  // database calls between checking that the player isn't seated anywhere
  // and actually seating them, so without this two quick joins at different
  // tables could both pass that check and seat (and charge) them twice.
  const joinsInFlight = new Set<number>();

  function findSeatedEntry(playerId: string): TableEntry | undefined {
    return entries.find((entry) => entry.table.getSeatNumber(playerId) !== null);
  }

  function getLobbyState(): PokerLobbyState {
    return {
      tables: entries.map(({ config, table }) => {
        const state = table.getState();
        return {
          tableId: config.id,
          name: config.name,
          smallBlind: state.smallBlind,
          bigBlind: state.bigBlind,
          maxSeats: state.maxSeats,
          seatedCount: state.seatedCount,
          playerIds: state.seats.flatMap((seat) => (seat.playerId ? [seat.playerId] : [])),
        };
      }),
    };
  }

  function broadcastLobby() {
    lobbyChannel.send({ type: 'broadcast', event: POKER_EVENT_STATE, payload: getLobbyState() });
  }

  function broadcastTable(entry: TableEntry) {
    entry.channel.send({ type: 'broadcast', event: POKER_EVENT_STATE, payload: entry.table.getState() });
  }

  async function handleJoin(entry: TableEntry, payload: PokerActionPayload): Promise<AckResult> {
    const { token, buyIn, seatNumber } = payload;
    const { table } = entry;

    if (!token) return { ok: false, error: 'You must be signed in to join the table.' };

    const playerId = await getPlayerIdForToken(supabase, token);
    if (playerId === null) return { ok: false, error: 'Your session has expired. Please log in again.' };

    if (joinsInFlight.has(playerId)) {
      return { ok: false, error: 'Your previous join is still being processed.' };
    }
    joinsInFlight.add(playerId);

    try {
      // One table at a time: checked here (before any money moves) and
      // still true when table.join() runs below, thanks to joinsInFlight.
      const seatedEntry = findSeatedEntry(String(playerId));
      if (seatedEntry === entry) return { ok: false, error: 'You are already seated at this table.' };
      if (seatedEntry) {
        return {
          ok: false,
          error: `You are already seated at ${seatedEntry.config.name}. Leave that table first.`,
        };
      }

      const username = await getPlayerUsername(supabase, playerId);
      if (!username) return { ok: false, error: 'Unable to load your profile.' };

      // SRS-1.3: the server never trusts the client's chosen amount beyond
      // this table's range — deductBalance() below re-checks it against the
      // player's real, freshly-read balance regardless.
      const minBuyIn = MIN_BUY_IN_MULTIPLIER * table.bigBlind;
      const maxBuyIn = MAX_BUY_IN_MULTIPLIER * table.bigBlind;
      if (!Number.isInteger(buyIn) || (buyIn as number) < minBuyIn || (buyIn as number) > maxBuyIn) {
        return { ok: false, error: `Buy-in must be between ${minBuyIn} and ${maxBuyIn}.` };
      }

      // Reject a bad or taken seat before charging for it; table.join()
      // re-checks, since someone else can take the seat while we await.
      if (seatNumber !== undefined) {
        const seatError = table.checkSeat(seatNumber);
        if (seatError) return { ok: false, error: seatError };
      }

      const deduction = await deductBalance(supabase, playerId, buyIn as number);
      if (!deduction.ok) return { ok: false, error: deduction.error };

      // Seats carry only a username here — avatars are fetched separately
      // by clients (GET /api/players/[playerId]/avatar) rather than carried
      // through this broadcast, since a profile photo as base64 can easily
      // exceed Realtime's broadcast payload size limit.
      const result = table.join(String(playerId), username, buyIn as number, null, seatNumber);
      if (result.ok) {
        broadcastTable(entry);
        broadcastLobby();
      } else {
        // The seat was taken out from under us between the deduction above
        // and this call (e.g. someone else sat there) — give the money back.
        await refundBalance(supabase, playerId, buyIn as number);
      }
      return result;
    } finally {
      joinsInFlight.delete(playerId);
    }
  }

  async function handleLeave(entry: TableEntry, payload: PokerActionPayload): Promise<AckResult> {
    const { token } = payload;

    if (!token) return { ok: false, error: 'You must be signed in to leave the table.' };

    const playerId = await getPlayerIdForToken(supabase, token);
    if (playerId === null) return { ok: false, error: 'Your session has expired. Please log in again.' };

    const result = entry.table.leave(String(playerId));
    if (result.ok) {
      if (result.chipStack) {
        await refundBalance(supabase, playerId, result.chipStack);
      }
      broadcastTable(entry);
      broadcastLobby();
    }
    return result;
  }

  // SRS-1.7 (simplified): any client can ask for the current state.
  // Realtime broadcast has no "send to just this one newly-subscribed
  // client" primitive, so a freshly-subscribed client requests a snapshot
  // itself instead of the server pushing one unprompted on connect.
  lobbyChannel.on('broadcast', { event: POKER_EVENT_ACTION }, ({ payload }: { payload: PokerActionPayload }) => {
    if (payload.action === 'sync') broadcastLobby();
  });

  for (const entry of entries) {
    entry.channel.on(
      'broadcast',
      { event: POKER_EVENT_ACTION },
      async ({ payload }: { payload: PokerActionPayload }) => {
        if (payload.action === 'sync') {
          broadcastTable(entry);
          return;
        }

        let result: AckResult;
        if (payload.action === 'join') result = await handleJoin(entry, payload);
        else if (payload.action === 'leave') result = await handleLeave(entry, payload);
        else return;

        entry.channel.send({
          type: 'broadcast',
          event: POKER_EVENT_ACK,
          payload: { requestId: payload.requestId, ...result },
        });
      }
    );
  }

  lobbyChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      // eslint-disable-next-line no-console
      console.log(`Poker realtime server subscribed to "${POKER_LOBBY_CHANNEL_NAME}"`);
    }
  });

  for (const { config, channel } of entries) {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // eslint-disable-next-line no-console
        console.log(
          `Poker realtime server subscribed to "${pokerTableChannelName(config.id)}" (${config.name}: ${config.maxSeats} seats, blinds ${config.smallBlind}/${config.bigBlind}, buy-in ${MIN_BUY_IN_MULTIPLIER * config.bigBlind}-${MAX_BUY_IN_MULTIPLIER * config.bigBlind})`
        );
      }
    });
  }
}

const supabase = getSupabaseClient();

if (supabase) {
  startServer(supabase);
} else {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase credentials are not configured — the poker server cannot verify signed-in players. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).'
  );
}
