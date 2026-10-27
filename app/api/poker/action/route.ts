import { randomUUID } from 'crypto';
import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';
import { getPokerTableConfig } from '../../../../lib/pokerTables';
import { getPokerServerSecret, signRelayedAction } from '../../../../lib/pokerSecure';
import { POKER_EVENT_ACTION, pokerTableChannelName, type PokerActionRequest } from '../../../../lib/pokerRealtime';
import type { BettingMove } from '../../../../lib/pokerTable';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

const ACTIONS = ['join', 'leave', 'act', 'rebuy', 'post-blinds', 'wait-for-big-blind'];
const MOVES: BettingMove[] = ['fold', 'check', 'call', 'bet', 'raise'];
const isOptionalNumber = (value: unknown) => value === undefined || typeof value === 'number';

// A poker player's join/leave/act/rebuy, or their choice to post missed blinds or wait for the big blind. The session token is checked here, over
// HTTPS, and the action is then broadcast on the table's Realtime channel
// with the resolved player_id and a signature the poker realtime server
// verifies (lib/pokerSecure.ts) — so the token itself never goes over the
// public channel. The outcome arrives as an `ack` on that channel, matched by
// requestId; a 202 here only means the action was handed on.
export async function POST(request: Request) {
  const secret = getPokerServerSecret();
  if (!secret) return Response.json({ error: 'POKER_SERVER_SECRET is not configured.' }, { status: 500 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'You must be signed in to play.' }, { status: 401 });

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) {
    return Response.json({ error: 'Your session has expired. Please log in again.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Partial<PokerActionRequest> | null;
  if (
    !body ||
    typeof body.tableId !== 'string' ||
    !getPokerTableConfig(body.tableId) ||
    typeof body.requestId !== 'string' ||
    body.requestId.length === 0 ||
    body.requestId.length > 100 ||
    !ACTIONS.includes(body.action as string) ||
    !isOptionalNumber(body.buyIn) ||
    !isOptionalNumber(body.seatNumber) ||
    !isOptionalNumber(body.amount) ||
    (body.action === 'act' && !MOVES.includes(body.move as BettingMove))
  ) {
    return Response.json({ error: 'Invalid poker action.' }, { status: 400 });
  }

  const relayed = signRelayedAction(
    {
      tableId: body.tableId,
      requestId: body.requestId,
      nonce: randomUUID(),
      issuedAt: Date.now(),
      playerId,
      action: body.action as PokerActionRequest['action'],
      buyIn: body.buyIn,
      seatNumber: body.seatNumber,
      move: body.action === 'act' ? body.move : undefined,
      amount: body.amount,
    },
    secret
  );

  // REST broadcast: no need to subscribe just to send one message.
  const channel = supabase.channel(pokerTableChannelName(body.tableId));
  try {
    await channel.httpSend(POKER_EVENT_ACTION, relayed);
  } catch {
    return Response.json({ error: 'Unable to reach the poker server.' }, { status: 502 });
  } finally {
    await supabase.removeChannel(channel);
  }

  return Response.json({ ok: true }, { status: 202 });
}
