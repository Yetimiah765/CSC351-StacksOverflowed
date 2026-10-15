// Reads a player's sports wagers for the "My bets" view (SRS-207.1, SRS-208.1,
// SRS-208.2, SRS-211.1) in the shape the sports page uses.

import type { SupabaseClient } from '@supabase/supabase-js';
import { effectiveStatus, type SportsEvent } from './events';
import { potentialPayout } from './payout';

export type WagerResult = 'Won' | 'Lost' | 'Refunded';

export type MyBet = {
  id: number;
  placedAt: string;
  amount: number;
  odds: number;
  // SRS-207.1: what the bet pays back (stake + winnings) if it wins.
  potentialPayout: number;
  // SRS-208.1: Pending until the bet is settled, then Decided.
  decision: 'Pending' | 'Decided';
  result: WagerResult | null;
  // SRS-211.1: coins paid back when settled (0 for a loss).
  payout: number | null;
  settledAt: string | null;
  selection: string;
  winningCondition: string;
  market: string;
  // SRS-208.2: the related game's status and current or final score.
  event: {
    id: number;
    league: string;
    homeTeam: string;
    awayTeam: string;
    startTime: string;
    status: SportsEvent['status'];
    homeScore: number | null;
    awayScore: number | null;
  };
};

export type MyBets = { open: MyBet[]; settled: MyBet[] };

export type WagerRow = {
  wager_id: number;
  amount: number;
  odds_at_placement: number | string;
  placed_at: string;
  result: WagerResult | null;
  payout: number | null;
  settled_at: string | null;
  option: {
    option_label: string;
    winning_condition: string;
    market: {
      market_type_code: string;
      market_types: { display_name: string } | null;
      event: {
        event_id: number;
        start_time: string;
        status: SportsEvent['status'];
        home_score: number | null;
        away_score: number | null;
        league: { league_name: string } | null;
        home: { team_name: string } | null;
        away: { team_name: string } | null;
      } | null;
    } | null;
  } | null;
};

export const WAGER_SELECT = `
  wager_id, amount, odds_at_placement, placed_at, result, payout, settled_at,
  option:betting_options(
    option_label, winning_condition,
    market:betting_markets(
      market_type_code,
      market_types(display_name),
      event:sports_events(
        event_id, start_time, status, home_score, away_score,
        league:leagues(league_name),
        home:teams!fk_sports_events_home_team(team_name),
        away:teams!fk_sports_events_away_team(team_name)
      )
    )
  )
`;

// Enough for a player's open bets plus recent history.
export const MY_BETS_LIMIT = 100;

export function toMyBet(row: WagerRow, now: Date = new Date()): MyBet {
  const market = row.option?.market;
  const event = market?.event;
  // PostgREST returns NUMERIC columns as strings.
  const odds = Number(row.odds_at_placement);
  const amount = Number(row.amount);

  return {
    id: row.wager_id,
    placedAt: row.placed_at,
    amount,
    odds,
    potentialPayout: potentialPayout(amount, odds),
    decision: row.result ? 'Decided' : 'Pending',
    result: row.result,
    payout: row.payout === null ? null : Number(row.payout),
    settledAt: row.settled_at,
    selection: row.option?.option_label ?? 'Unknown pick',
    winningCondition: row.option?.winning_condition ?? '',
    market: market?.market_types?.display_name ?? market?.market_type_code ?? '',
    event: {
      id: event?.event_id ?? 0,
      league: event?.league?.league_name ?? '',
      homeTeam: event?.home?.team_name ?? 'TBD',
      awayTeam: event?.away?.team_name ?? 'TBD',
      startTime: event?.start_time ?? row.placed_at,
      status: event ? effectiveStatus(event.status, event.start_time, now) : 'Upcoming',
      homeScore: event?.home_score ?? null,
      awayScore: event?.away_score ?? null,
    },
  };
}

// Open bets first by game start (soonest first); settled bets newest first.
export function splitBets(bets: MyBet[]): MyBets {
  return {
    open: bets
      .filter((b) => b.decision === 'Pending')
      .sort((a, b) => a.event.startTime.localeCompare(b.event.startTime)),
    settled: bets
      .filter((b) => b.decision === 'Decided')
      .sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? '')),
  };
}

export async function fetchMyBets(supabase: SupabaseClient, playerId: number, now: Date = new Date()): Promise<MyBets> {
  const { data, error } = await supabase
    .from('wagers')
    .select(WAGER_SELECT)
    .eq('player_id', playerId)
    .order('placed_at', { ascending: false })
    .limit(MY_BETS_LIMIT);

  if (error) throw new Error(error.message);
  return splitBets((data as unknown as WagerRow[]).map((row) => toMyBet(row, now)));
}
