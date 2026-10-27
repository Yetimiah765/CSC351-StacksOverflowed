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
// players.balance. A player can be seated at only one table at a time. Once
// three players are seated, a table counts down HAND_START_COUNTDOWN_MS and
// then starts a hand (dealer button, blinds, cards — see lib/pokerTable.ts);
// this process owns that countdown's timer. Seated players then take turns
// with `act` actions (fold/check/call/bet/raise) until the hand ends, which
// the table works out itself, showdown included. A seat survives a dropped
// connection (closing the tab does not free it or refund the stack) so a
// player can reconnect and resume it later (SRS-2.1) — there is no
// disconnection-timeout removal yet (SRS-9.x/10.x).
//
// The channels are public (anyone with the anon key can read and send), so:
// - join/leave/act are only accepted when signed with POKER_SERVER_SECRET by
//   POST /api/poker/action, which resolved the player's session token over
//   HTTPS (lib/pokerSecure.ts). The signed player_id is trusted; nothing a
//   client broadcasts directly is, except 'sync'. Seat ownership is checked
//   by player_id, never by which connection is asking, which is also what
//   makes leaving work from a reconnected tab.
// - each player's hole cards go out in the `state` broadcast sealed for
//   them alone (SRS-6.1); POST /api/poker/hole-cards opens them for their
//   owner.
//
// Run with: npm run realtime

import { randomInt } from 'crypto';
import { config as loadEnv } from 'dotenv';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  HAND_START_COUNTDOWN_MS,
  MAX_BUY_IN_MULTIPLIER,
  MIN_BUY_IN_MULTIPLIER,
  PokerTable,
} from '../lib/pokerTable';
import { POKER_TABLES, type PokerTableConfig } from '../lib/pokerTables';
import { getSupabaseClient } from '../lib/supabase';
import { getPlayerUsername } from '../lib/playerDisplay';
import {
  POKER_EVENT_ACTION,
  POKER_EVENT_ACK,
  POKER_EVENT_STATE,
  POKER_LOBBY_CHANNEL_NAME,
  pokerTableChannelName,
  type PokerLobbyState,
  type PokerTableBroadcast,
} from '../lib/pokerRealtime';
import type { BettingMove } from '../lib/pokerTable';
import {
  RELAY_MAX_AGE_MS,
  getPokerServerSecret,
  sealHoleCards,
  verifyRelayedAction,
  type RelayedAction,
} from '../lib/pokerSecure';

// Unlike Next.js, a standalone Node process doesn't auto-load .env files, so
// this has to happen before getSupabaseClient() reads process.env below.
// .env.local takes precedence, matching Next's own env-loading order.
loadEnv();
loadEnv({ path: '.env.local', override: true });

interface TableEntry {
  config: PokerTableConfig;
  table: PokerTable;
  channel: RealtimeChannel;
  /** Fires when this table's pre-hand countdown ends; null when none is running. */
  startTimer: ReturnType<typeof setTimeout> | null;
  /** Fires when the next busted player runs out of time (SRS-12.10); null when nobody is busted. */
  bustedTimer: ReturnType<typeof setTimeout> | null;
}

type AckResult = { ok: boolean; error?: string; seatNumber?: number; pending?: boolean };

const BETTING_MOVES: BettingMove[] = ['fold', 'check', 'call', 'bet', 'raise'];

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

function startServer(supabase: SupabaseClient, secret: string) {
  const lobbyChannel = supabase.channel(POKER_LOBBY_CHANNEL_NAME, CHANNEL_CONFIG);
  const entries: TableEntry[] = POKER_TABLES.map((config) => ({
    config,
    table: new PokerTable(config.id, config.maxSeats, config.bigBlind, config.smallBlind),
    channel: supabase.channel(pokerTableChannelName(config.id), CHANNEL_CONFIG),
    startTimer: null,
    bustedTimer: null,
  }));

  // Players with a join being processed right now. A join awaits several
  // database calls between checking that the player isn't seated anywhere
  // and actually seating them, so without this two quick joins at different
  // tables could both pass that check and seat (and charge) them twice.
  const joinsInFlight = new Set<number>();

  // Nonces of signed actions already handled, with when each may be
  // forgotten — a copy of a signed message rebroadcast by someone else is
  // ignored. Older messages are rejected by their timestamp anyway.
  const seenNonces = new Map<string, number>();
  function isReplay(action: RelayedAction, now: number): boolean {
    seenNonces.forEach((expiresAt, nonce) => {
      if (expiresAt < now) seenNonces.delete(nonce);
    });
    if (seenNonces.has(action.nonce)) return true;
    seenNonces.set(action.nonce, now + 2 * RELAY_MAX_AGE_MS);
    return false;
  }

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
          phase: state.phase,
          playerIds: state.seats.flatMap((seat) => (seat.playerId ? [seat.playerId] : [])),
        };
      }),
    };
  }

  function broadcastLobby() {
    lobbyChannel.send({ type: 'broadcast', event: POKER_EVENT_STATE, payload: getLobbyState() });
  }

  function broadcastTable(entry: TableEntry) {
    // Every change is broadcast, so this is where busted players' decision
    // clocks start and stop (SRS-12.10), before the state that shows them.
    scheduleBustedTimeout(entry);
    const state = entry.table.getState();
    // SRS-6.1: every player's hole cards ride along sealed for them alone.
    const holeCards: Record<string, string> = {};
    for (const { playerId, cards } of entry.table.getHoleCards()) {
      holeCards[playerId] = sealHoleCards(secret, entry.config.id, state.handNumber, playerId, cards);
    }
    const payload: PokerTableBroadcast = { ...state, holeCards };
    entry.channel.send({ type: 'broadcast', event: POKER_EVENT_STATE, payload });
  }

  // SRS-12.10: one timer per table, for whichever busted player runs out of
  // time first. When it fires, everyone out of time is removed (they have no
  // chips, so nothing to refund) and the new state is broadcast, which
  // schedules the next one. The removed player's page sees its seat gone
  // while busted and shows why (SRS-9.11).
  function scheduleBustedTimeout(entry: TableEntry) {
    const now = Date.now();
    entry.table.trackBusted(now);
    if (entry.bustedTimer) {
      clearTimeout(entry.bustedTimer);
      entry.bustedTimer = null;
    }
    const deadline = entry.table.nextBustedDeadline();
    if (deadline === null) return;

    entry.bustedTimer = setTimeout(() => {
      entry.bustedTimer = null;
      const removed = entry.table.removeTimedOutBusted(Date.now());
      if (removed.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`${entry.config.name}: removed busted player(s) ${removed.join(', ')} after the decision timeout`);
        refreshCountdown(entry);
        broadcastLobby();
      }
      broadcastTable(entry);
    }, Math.max(0, deadline - now));
  }

  // Players who asked to leave during a hand are removed when it ends
  // (SRS-21.3) — refund what they had left. Call after anything that can end
  // a hand.
  async function settleRemovals(entry: TableEntry) {
    for (const removal of entry.table.drainRemovals()) {
      await refundBalance(supabase, Number(removal.playerId), removal.chipStack);
    }
  }

  // Starts or cancels this table's countdown to match who's seated now (see
  // PokerTable.updateCountdown). Called after every successful join/leave,
  // before the resulting state is broadcast.
  function refreshCountdown(entry: TableEntry) {
    const change = entry.table.updateCountdown(Date.now());

    if (change === 'started') {
      entry.startTimer = setTimeout(() => {
        entry.startTimer = null;
        // SRS-13.1/16.1: crypto.randomInt picks the first hand's dealer and
        // shuffles the deck — the same RNG the Daily Login Box uses.
        const started = entry.table.startHand((n) => randomInt(n));
        void settleRemovals(entry);
        if (started) {
          const { handNumber, dealerSeat, smallBlindSeat, bigBlindSeat } = entry.table.getState();
          // eslint-disable-next-line no-console
          console.log(
            `${entry.config.name}: hand #${handNumber} started (button seat ${dealerSeat}, SB seat ${smallBlindSeat}, BB seat ${bigBlindSeat})`
          );
        }
        broadcastTable(entry);
        broadcastLobby();
      }, HAND_START_COUNTDOWN_MS);
    } else if (change === 'cancelled' && entry.startTimer) {
      clearTimeout(entry.startTimer);
      entry.startTimer = null;
    }
  }

  async function handleJoin(entry: TableEntry, action: RelayedAction): Promise<AckResult> {
    const { playerId, buyIn, seatNumber } = action;
    const { table } = entry;

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
        refreshCountdown(entry);
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

  // SRS-12.4-12.7: a busted player buys back in at the same seat, for an
  // amount in this table's buy-in range (SRS-NFR-021) and no more than their
  // balance. Shares joinsInFlight with handleJoin, so a double click can't
  // charge twice.
  async function handleRebuy(entry: TableEntry, action: RelayedAction): Promise<AckResult> {
    const { playerId, buyIn } = action;
    const { table } = entry;

    if (joinsInFlight.has(playerId)) {
      return { ok: false, error: 'Your previous buy-in is still being processed.' };
    }
    joinsInFlight.add(playerId);

    try {
      // Refuse before any money moves; table.rebuy() re-checks below.
      const rebuyError = table.checkRebuy(String(playerId));
      if (rebuyError) return { ok: false, error: rebuyError };

      // SRS-12.6: out of range. SRS-12.7 (more than the balance) is checked
      // by deductBalance() against the freshly-read balance.
      const minBuyIn = MIN_BUY_IN_MULTIPLIER * table.bigBlind;
      const maxBuyIn = MAX_BUY_IN_MULTIPLIER * table.bigBlind;
      if (!Number.isInteger(buyIn) || (buyIn as number) < minBuyIn || (buyIn as number) > maxBuyIn) {
        return { ok: false, error: `Buy-in must be between ${minBuyIn} and ${maxBuyIn}.` };
      }

      const deduction = await deductBalance(supabase, playerId, buyIn as number);
      if (!deduction.ok) return { ok: false, error: deduction.error };

      const result = table.rebuy(String(playerId), buyIn as number);
      if (result.ok) {
        // Chips again: this player may complete the three needed to start.
        refreshCountdown(entry);
        broadcastTable(entry);
        broadcastLobby();
      } else {
        // They left (or were removed) while we awaited — give the money back.
        await refundBalance(supabase, playerId, buyIn as number);
      }
      return result;
    } finally {
      joinsInFlight.delete(playerId);
    }
  }

  // SRS-11.6/11.9: a player who owes blinds elects to post them and be
  // dealt into the next hand, or goes back to waiting for the big blind. The
  // table refuses an election it can't allow; either way the next hand may
  // now be able to start (or not).
  function handlePostBlinds(entry: TableEntry, action: RelayedAction, post: boolean): AckResult {
    const result = entry.table.setPostMissedBlinds(String(action.playerId), post);
    if (result.ok) {
      refreshCountdown(entry);
      broadcastTable(entry);
      broadcastLobby();
    }
    return result;
  }

  async function handleLeave(entry: TableEntry, action: RelayedAction): Promise<AckResult> {
    const { playerId } = action;

    // A player still in the hand gets `pending` back and stays seated until
    // the hand ends (SRS-21.2/21.3); anyone else is removed and refunded now.
    const result = entry.table.leave(String(playerId));
    if (result.ok) {
      if (result.chipStack) {
        await refundBalance(supabase, playerId, result.chipStack);
      }
      // Folding a leaver whose turn it was can end the hand.
      await settleRemovals(entry);
      // Leaving can cancel a countdown, or end a hand and start a new
      // countdown right away.
      refreshCountdown(entry);
      broadcastTable(entry);
      broadcastLobby();
    }
    return result;
  }

  // SRS-15: a betting action. The table checks it's this player's turn
  // (SRS-3.1) and that the move and amount are legal (SRS-15.9/15.10).
  async function handleAct(entry: TableEntry, action: RelayedAction): Promise<AckResult> {
    const { playerId, move, amount } = action;

    if (!move || !BETTING_MOVES.includes(move)) return { ok: false, error: 'Unknown action.' };

    const result = entry.table.act(String(playerId), move, amount);
    if (result.ok) {
      await settleRemovals(entry);
      // The hand may have just ended: start the next countdown if there
      // are still enough players.
      refreshCountdown(entry);
      broadcastTable(entry);
      broadcastLobby();
    }
    return result;
  }

  // SRS-1.7 (simplified): any client can ask for the current state.
  // Realtime broadcast has no "send to just this one newly-subscribed
  // client" primitive, so a freshly-subscribed client requests a snapshot
  // itself instead of the server pushing one unprompted on connect.
  lobbyChannel.on('broadcast', { event: POKER_EVENT_ACTION }, ({ payload }: { payload: { action?: string } }) => {
    if (payload?.action === 'sync') broadcastLobby();
  });

  for (const entry of entries) {
    entry.channel.on('broadcast', { event: POKER_EVENT_ACTION }, async ({ payload }: { payload: unknown }) => {
      if ((payload as { action?: string } | null)?.action === 'sync') {
        broadcastTable(entry);
        return;
      }

      // Anything else must be signed by POST /api/poker/action. Unsigned,
      // forged, stale, or replayed messages are dropped without an ack.
      const now = Date.now();
      const action = verifyRelayedAction(payload, secret, entry.config.id, now);
      if (!action || isReplay(action, now)) return;

      let result: AckResult;
      if (action.action === 'join') result = await handleJoin(entry, action);
      else if (action.action === 'leave') result = await handleLeave(entry, action);
      else if (action.action === 'rebuy') result = await handleRebuy(entry, action);
      else if (action.action === 'post-blinds') result = handlePostBlinds(entry, action, true);
      else if (action.action === 'wait-for-big-blind') result = handlePostBlinds(entry, action, false);
      else result = await handleAct(entry, action);

      entry.channel.send({
        type: 'broadcast',
        event: POKER_EVENT_ACK,
        payload: { requestId: action.requestId, ...result },
      });
    });
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
const secret = getPokerServerSecret();

if (!supabase) {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase credentials are not configured — the poker server cannot verify signed-in players. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).'
  );
} else if (!secret) {
  // eslint-disable-next-line no-console
  console.error(
    'POKER_SERVER_SECRET is not configured — the poker server cannot verify player actions or deal private cards. Set the same value for the Next app and this process (see .env.example).'
  );
} else {
  startServer(supabase, secret);
}
