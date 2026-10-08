// Reads sports events with their markets, current odds, and market rules
// (SRS-201.1 - SRS-204.1, SRS-215) in the shape the sports page uses.

import type { SupabaseClient } from '@supabase/supabase-js';

export type OptionSide = 'home' | 'away' | 'over' | 'under' | 'draw';

export type SportsOption = {
  id: number;
  side: OptionSide;
  label: string;
  winningCondition: string;
  decimalOdds: number;
};

export type SportsMarket = {
  id: number;
  type: 'moneyline' | 'point_spread' | 'total';
  name: string;
  line: number | null;
  isOpen: boolean;
  description: string;
  rules: string;
  tieRules: string | null;
  refundConditions: string;
  options: SportsOption[];
};

export type SportsEvent = {
  id: number;
  sport: string;
  league: string;
  leagueId: number;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: 'Upcoming' | 'In Progress' | 'Completed' | 'Canceled' | 'Postponed';
  homeScore: number | null;
  awayScore: number | null;
  markets: SportsMarket[];
};

export type SportsLeague = { id: number; name: string; sport: string };

export type EventRow = {
  event_id: number;
  start_time: string;
  status: SportsEvent['status'];
  home_score: number | null;
  away_score: number | null;
  home_team_id: number;
  away_team_id: number;
  league: { league_id: number; league_name: string; sport: { sport_name: string } | null } | null;
  home: { team_name: string } | null;
  away: { team_name: string } | null;
  betting_markets: {
    market_id: number;
    market_type_code: SportsMarket['type'];
    line: number | string | null;
    is_open: boolean;
    market_types: {
      display_name: string;
      description: string;
      rules_text: string;
      tie_rules: string | null;
      refund_conditions: string;
    } | null;
    betting_options: {
      option_id: number;
      team_id: number | null;
      option_label: string;
      winning_condition: string;
      decimal_odds: number | string;
    }[];
  }[];
};

export const EVENT_SELECT = `
  event_id, start_time, status, home_score, away_score, home_team_id, away_team_id,
  league:leagues(league_id, league_name, sport:sports(sport_name)),
  home:teams!fk_sports_events_home_team(team_name),
  away:teams!fk_sports_events_away_team(team_name),
  betting_markets(
    market_id, market_type_code, line, is_open,
    market_types(display_name, description, rules_text, tie_rules, refund_conditions),
    betting_options(option_id, team_id, option_label, winning_condition, decimal_odds)
  )
`;

const MARKET_ORDER: SportsMarket['type'][] = ['moneyline', 'point_spread', 'total'];

// Show finished games for a day so players can see recent results.
export const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function optionSide(teamId: number | null, label: string, row: EventRow): OptionSide {
  if (teamId !== null && teamId === row.home_team_id) return 'home';
  if (teamId !== null && teamId === row.away_team_id) return 'away';
  if (label.startsWith('Over')) return 'over';
  if (label.startsWith('Under')) return 'under';
  return 'draw';
}

export function toSportsEvent(row: EventRow): SportsEvent {
  // A line move closes the old market but keeps it for existing wagers, so
  // only list closed markets when no open market of that type remains.
  const openTypes = new Set(row.betting_markets.filter((m) => m.is_open).map((m) => m.market_type_code));
  const markets = row.betting_markets
    .filter((m) => m.is_open || !openTypes.has(m.market_type_code))
    .map((m) => ({
      id: m.market_id,
      type: m.market_type_code,
      name: m.market_types?.display_name ?? m.market_type_code,
      // PostgREST returns NUMERIC columns as strings.
      line: m.line === null ? null : Number(m.line),
      isOpen: m.is_open,
      description: m.market_types?.description ?? '',
      rules: m.market_types?.rules_text ?? '',
      tieRules: m.market_types?.tie_rules ?? null,
      refundConditions: m.market_types?.refund_conditions ?? '',
      options: m.betting_options
        .map((o) => ({
          id: o.option_id,
          side: optionSide(o.team_id, o.option_label, row),
          label: o.option_label,
          winningCondition: o.winning_condition,
          decimalOdds: Number(o.decimal_odds),
        }))
        .sort((a, b) => a.id - b.id),
    }))
    // Keep only the newest closed market per type (highest id).
    .sort((a, b) => MARKET_ORDER.indexOf(a.type) - MARKET_ORDER.indexOf(b.type) || b.id - a.id)
    .filter((m, i, all) => i === 0 || all[i - 1].type !== m.type);

  return {
    id: row.event_id,
    sport: row.league?.sport?.sport_name ?? 'Other',
    league: row.league?.league_name ?? 'Other',
    leagueId: row.league?.league_id ?? 0,
    homeTeam: row.home?.team_name ?? 'TBD',
    awayTeam: row.away?.team_name ?? 'TBD',
    startTime: row.start_time,
    status: row.status,
    homeScore: row.home_score,
    awayScore: row.away_score,
    markets,
  };
}

export type EventListing = { sports: string[]; leagues: SportsLeague[]; events: SportsEvent[] };

// The filter lists come from every loaded event, so choosing a sport or
// league never hides the other filter buttons.
export function buildListing(all: SportsEvent[], filters: { sport?: string | null; leagueId?: number | null }): EventListing {
  const leagues = new Map<number, SportsLeague>();
  for (const e of all) leagues.set(e.leagueId, { id: e.leagueId, name: e.league, sport: e.sport });

  return {
    sports: [...new Set(all.map((e) => e.sport))].sort(),
    leagues: [...leagues.values()].sort((a, b) => a.name.localeCompare(b.name)),
    events: all.filter((e) => (!filters.sport || e.sport === filters.sport) && (!filters.leagueId || e.leagueId === filters.leagueId)),
  };
}

export async function fetchEvents(supabase: SupabaseClient, now: Date = new Date()): Promise<SportsEvent[]> {
  const { data, error } = await supabase
    .from('sports_events')
    .select(EVENT_SELECT)
    .gte('start_time', new Date(now.getTime() - RECENT_WINDOW_MS).toISOString())
    .order('start_time', { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data as unknown as EventRow[]).map(toSportsEvent);
}
