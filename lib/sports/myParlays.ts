// Reads a player's parlays for My bets (SRS-219.3) in the shape the sports
// page uses, the same way lib/sports/myBets.ts reads single bets.

import type { SupabaseClient } from '@supabase/supabase-js';
import { effectiveStatus, type SportsEvent } from './events';
import { MY_BETS_LIMIT, type WagerResult } from './myBets';

export type LegResult = 'Won' | 'Lost' | 'Refunded';

export type MyParlayLeg = {
  legNumber: number;
  odds: number;
  // Null until the leg's game is settled (SRS-219.4).
  result: LegResult | null;
  selection: string;
  market: string;
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

export type MyParlay = {
  id: number;
  placedAt: string;
  amount: number;
  // SRS-219.2: as worked out when it was placed.
  combinedOdds: number;
  potentialPayout: number;
  decision: 'Pending' | 'Decided';
  result: WagerResult | null;
  payout: number | null;
  settledAt: string | null;
  legs: MyParlayLeg[];
};

export type MyParlays = { open: MyParlay[]; settled: MyParlay[] };

type ParlayLegRow = {
  leg_number: number;
  odds_at_placement: number | string;
  result: LegResult | null;
  option: {
    option_label: string;
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

export type ParlayRow = {
  parlay_id: number;
  amount: number | string;
  combined_odds: number | string;
  potential_payout: number | string;
  placed_at: string;
  result: WagerResult | null;
  payout: number | string | null;
  settled_at: string | null;
  legs: ParlayLegRow[] | null;
};

export const PARLAY_SELECT = `
  parlay_id, amount, combined_odds, potential_payout, placed_at, result, payout, settled_at,
  legs:parlay_legs(
    leg_number, odds_at_placement, result,
    option:betting_options(
      option_label,
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
  )
`;

function toLeg(row: ParlayLegRow, now: Date): MyParlayLeg {
  const market = row.option?.market;
  const event = market?.event;
  return {
    legNumber: row.leg_number,
    // PostgREST returns NUMERIC columns as strings.
    odds: Number(row.odds_at_placement),
    result: row.result,
    selection: row.option?.option_label ?? 'Unknown pick',
    market: market?.market_types?.display_name ?? market?.market_type_code ?? '',
    event: {
      id: event?.event_id ?? 0,
      league: event?.league?.league_name ?? '',
      homeTeam: event?.home?.team_name ?? 'TBD',
      awayTeam: event?.away?.team_name ?? 'TBD',
      startTime: event?.start_time ?? '',
      status: event ? effectiveStatus(event.status, event.start_time, now) : 'Upcoming',
      homeScore: event?.home_score ?? null,
      awayScore: event?.away_score ?? null,
    },
  };
}

export function toMyParlay(row: ParlayRow, now: Date = new Date()): MyParlay {
  return {
    id: row.parlay_id,
    placedAt: row.placed_at,
    amount: Number(row.amount),
    combinedOdds: Number(row.combined_odds),
    potentialPayout: Number(row.potential_payout),
    decision: row.result ? 'Decided' : 'Pending',
    result: row.result,
    payout: row.payout === null ? null : Number(row.payout),
    settledAt: row.settled_at,
    legs: (row.legs ?? []).map((leg) => toLeg(leg, now)).sort((a, b) => a.legNumber - b.legNumber),
  };
}

// Open parlays newest first; settled ones by when they were settled.
export async function fetchMyParlays(supabase: SupabaseClient, playerId: number, now: Date = new Date()): Promise<MyParlays> {
  const [open, settled] = await Promise.all([
    supabase
      .from('parlays')
      .select(PARLAY_SELECT)
      .eq('player_id', playerId)
      .is('result', null)
      .order('placed_at', { ascending: false }),
    supabase
      .from('parlays')
      .select(PARLAY_SELECT)
      .eq('player_id', playerId)
      .not('result', 'is', null)
      .order('settled_at', { ascending: false })
      .limit(MY_BETS_LIMIT),
  ]);
  if (open.error) throw new Error(open.error.message);
  if (settled.error) throw new Error(settled.error.message);
  return {
    open: (open.data as unknown as ParlayRow[]).map((row) => toMyParlay(row, now)),
    settled: (settled.data as unknown as ParlayRow[]).map((row) => toMyParlay(row, now)),
  };
}
