// Settles open parlays once they're decided (SRS-219.4). Runs after every
// odds/scores sync, straight after the single bets are settled
// (scripts/syncSports.ts, app/api/sports/sync/route.ts). Each leg is graded
// with decideWager(), the same rules as a single bet; decideParlay() says
// whether the parlay is decided yet, and fn_settle_parlay records it and moves
// the money in one transaction.

import type { SupabaseClient } from '@supabase/supabase-js';
import { allRows } from './paging';
import { decideParlay } from './parlays';
import { PENDING_OPTION_SELECT, decideWager, type PendingOption, type SettleSummary } from './settle';

type OpenParlayRow = {
  parlay_id: number;
  amount: number | string;
  legs: { leg_number: number; odds_at_placement: number | string; option: PendingOption | null }[] | null;
};

const OPEN_PARLAY_SELECT = `
  parlay_id, amount,
  legs:parlay_legs(
    leg_number, odds_at_placement,
    ${PENDING_OPTION_SELECT}
  )
`;

// Each leg's result in leg order (null while its game is undecided), and
// whether the parlay can be settled now.
export function gradeParlay(row: OpenParlayRow, now: Date) {
  const legs = [...(row.legs ?? [])].sort((a, b) => a.leg_number - b.leg_number);
  const results = legs.map((leg) => decideWager(leg, now));
  const decision = decideParlay(
    Number(row.amount),
    legs.map((leg, i) => ({ result: results[i], odds: Number(leg.odds_at_placement) })),
  );
  return { results, decision };
}

export async function settleParlays(supabase: SupabaseClient, now: Date = new Date()): Promise<SettleSummary> {
  const summary: SettleSummary = { settled: 0, won: 0, lost: 0, refunded: 0, errors: [] };

  // Every open parlay, a page at a time, so none is left out however many
  // are open.
  let open: OpenParlayRow[];
  try {
    open = (await allRows((first, last) =>
      supabase.from('parlays').select(OPEN_PARLAY_SELECT).is('result', null).order('parlay_id').range(first, last),
    )) as unknown as OpenParlayRow[];
  } catch (error) {
    summary.errors.push(`Loading open parlays failed: ${error instanceof Error ? error.message : String(error)}`);
    return summary;
  }

  for (const row of open) {
    const { results, decision } = gradeParlay(row, now);
    if (!decision) continue;

    const { data: reply, error: rpcError } = await supabase.rpc('fn_settle_parlay', {
      p_parlay_id: row.parlay_id,
      p_leg_results: results,
    });
    if (rpcError) {
      summary.errors.push(`Parlay ${row.parlay_id}: ${rpcError.message}`);
      continue;
    }
    // Another run may have settled it first; that's fine.
    const settled = reply as { status?: string; result?: string } | null;
    if (settled?.status !== 'settled') continue;

    summary.settled += 1;
    if (settled.result === 'Won') summary.won += 1;
    else if (settled.result === 'Lost') summary.lost += 1;
    else summary.refunded += 1;
  }

  return summary;
}
