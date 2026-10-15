// Settles open sports wagers once their games are decided (SRS-209, SRS-210).
// Grading (which side won) happens here so the market rules can be unit
// tested; fn_settle_wager in supabase/schema.sql then records the result and
// moves the money in one transaction. Runs after every odds/scores sync
// (scripts/syncSports.ts, app/api/sports/sync/route.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketTypeCode } from './normalize';

export type GradedResult = 'Won' | 'Lost' | 'Refunded';
export type WagerSide = 'home' | 'away' | 'over' | 'under' | 'draw';

// SRS-209.3: a game with no final result this long after its start is
// treated as canceled or postponed, and its wagers are refunded. The Odds
// API only reports scores for 3 days, so no result can arrive after that.
export const NO_RESULT_REFUND_MS = 3 * 24 * 60 * 60 * 1000;

export type GradeInput = {
  marketType: MarketTypeCode;
  // Home team's spread for point_spread, the total for total, null for moneyline.
  line: number | null;
  side: WagerSide;
  homeScore: number;
  awayScore: number;
};

// SRS-209.2 / SRS-209.4: decides a wager from the final score using its
// market's rules (the rules text players see is in the market_types table).
export function gradeWager({ marketType, line, side, homeScore, awayScore }: GradeInput): GradedResult {
  const compare = (value: number): GradedResult => (value > 0 ? 'Won' : value < 0 ? 'Lost' : 'Refunded');
  const margin = homeScore - awayScore;

  switch (marketType) {
    case 'moneyline':
      // A tie only wins for a Draw pick, and refunds team picks here.
      // decideWager() turns that refund into a loss when the market also
      // offered a Draw option.
      if (side === 'draw') return margin === 0 ? 'Won' : 'Lost';
      if (side === 'home') return compare(margin);
      if (side === 'away') return compare(-margin);
      break;

    case 'point_spread':
      // `line` is the home team's spread; the away team gets the opposite.
      if (line === null) break;
      if (side === 'home') return compare(margin + line);
      if (side === 'away') return compare(-margin - line);
      break;

    case 'total':
      if (line === null) break;
      if (side === 'over') return compare(homeScore + awayScore - line);
      if (side === 'under') return compare(line - (homeScore + awayScore));
      break;
  }

  // An option that doesn't fit its market can't be graded fairly.
  return 'Refunded';
}

type PendingRow = {
  wager_id: number;
  option: {
    team_id: number | null;
    option_label: string;
    market: {
      market_type_code: MarketTypeCode;
      line: number | string | null;
      betting_options: { option_label: string; team_id: number | null }[];
      event: {
        start_time: string;
        status: 'Upcoming' | 'In Progress' | 'Completed' | 'Canceled' | 'Postponed';
        home_score: number | null;
        away_score: number | null;
        home_team_id: number;
        away_team_id: number;
      } | null;
    } | null;
  } | null;
};

const PENDING_SELECT = `
  wager_id,
  option:betting_options(
    team_id, option_label,
    market:betting_markets(
      market_type_code, line,
      betting_options(option_label, team_id),
      event:sports_events(start_time, status, home_score, away_score, home_team_id, away_team_id)
    )
  )
`;

function sideOf(teamId: number | null, label: string, homeTeamId: number, awayTeamId: number): WagerSide {
  if (teamId !== null && teamId === homeTeamId) return 'home';
  if (teamId !== null && teamId === awayTeamId) return 'away';
  if (label.startsWith('Over')) return 'over';
  if (label.startsWith('Under')) return 'under';
  return 'draw';
}

// Decides one open wager, or returns null while its game is still undecided.
export function decideWager(row: PendingRow, now: Date): GradedResult | null {
  const market = row.option?.market;
  const event = market?.event;
  if (!row.option || !market || !event) return 'Refunded';

  // SRS-209.3: canceled or postponed games refund every wager.
  if (event.status === 'Canceled' || event.status === 'Postponed') return 'Refunded';

  if (event.status === 'Completed' && event.home_score !== null && event.away_score !== null) {
    const side = sideOf(row.option.team_id, row.option.option_label, event.home_team_id, event.away_team_id);
    const result = gradeWager({
      marketType: market.market_type_code,
      line: market.line === null ? null : Number(market.line),
      side,
      homeScore: event.home_score,
      awayScore: event.away_score,
    });
    // A moneyline tie refunds team picks only when the market had no Draw
    // option; if a Draw was offered, team picks lose.
    const offeredDraw = market.betting_options.some(
      (o) => sideOf(o.team_id, o.option_label, event.home_team_id, event.away_team_id) === 'draw',
    );
    if (market.market_type_code === 'moneyline' && result === 'Refunded' && offeredDraw && side !== 'draw') return 'Lost';
    return result;
  }

  // SRS-209.3: no result long after the start means the game won't finish.
  if (now.getTime() - new Date(event.start_time).getTime() >= NO_RESULT_REFUND_MS) return 'Refunded';

  return null;
}

export type SettleSummary = {
  settled: number;
  won: number;
  lost: number;
  refunded: number;
  errors: string[];
};

export async function settleWagers(supabase: SupabaseClient, now: Date = new Date()): Promise<SettleSummary> {
  const summary: SettleSummary = { settled: 0, won: 0, lost: 0, refunded: 0, errors: [] };

  const { data, error } = await supabase.from('wagers').select(PENDING_SELECT).is('result', null).limit(1000);
  if (error) {
    summary.errors.push(`Loading open wagers failed: ${error.message}`);
    return summary;
  }

  for (const row of data as unknown as PendingRow[]) {
    const result = decideWager(row, now);
    if (!result) continue;

    const { data: reply, error: rpcError } = await supabase.rpc('fn_settle_wager', {
      p_wager_id: row.wager_id,
      p_result: result,
    });
    if (rpcError) {
      summary.errors.push(`Wager ${row.wager_id}: ${rpcError.message}`);
      continue;
    }
    // Another run may have settled it first; that's fine.
    if ((reply as { status?: string } | null)?.status !== 'settled') continue;

    summary.settled += 1;
    if (result === 'Won') summary.won += 1;
    else if (result === 'Lost') summary.lost += 1;
    else summary.refunded += 1;
  }

  return summary;
}
