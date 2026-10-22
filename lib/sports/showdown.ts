// The Showdown: one featured public bet per sport (SRS-212, SRS-213,
// SRS-214). Players back one team and the winning side splits the whole
// pool in proportion to their stakes. The sync picks each sport's game
// (selectShowdowns), the page reads the pools (fetchShowdowns), and the sync
// settles finished ones (settleShowdowns). Money only moves inside
// fn_join_showdown and fn_settle_showdown in supabase/schema.sql.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SportsEvent } from './events';
import { effectiveStatus } from './events';
import { NO_RESULT_REFUND_MS } from './settle';

// A Showdown is picked from games starting between these two times from now,
// so there's time to bet but the game isn't weeks away.
export const SHOWDOWN_MIN_LEAD_MS = 2 * 60 * 60 * 1000;
export const SHOWDOWN_MAX_LEAD_MS = 7 * 24 * 60 * 60 * 1000;

// ----------------------------------------------------------------- picking

export type ShowdownCandidate = {
  eventId: number;
  startTime: string;
  homeOdds: number;
  awayOdds: number;
};

// How far a game is from a coin flip: 0 when the moneyline odds give each
// team an equal chance, up to 0.5 for a sure thing. Uses the bookmaker's
// implied probabilities, normalized so the two add up to 1.
export function lopsidedness(homeOdds: number, awayOdds: number): number {
  const home = 1 / homeOdds;
  const away = 1 / awayOdds;
  return Math.abs(home / (home + away) - 0.5);
}

// The most even game starting in the pick window, earliest first on a tie;
// null when none qualifies.
export function pickMostEven(candidates: ShowdownCandidate[], now: Date): ShowdownCandidate | null {
  const from = now.getTime() + SHOWDOWN_MIN_LEAD_MS;
  const to = now.getTime() + SHOWDOWN_MAX_LEAD_MS;
  const inWindow = candidates.filter((c) => {
    const start = new Date(c.startTime).getTime();
    return start >= from && start <= to && c.homeOdds > 1 && c.awayOdds > 1;
  });
  inWindow.sort(
    (a, b) => lopsidedness(a.homeOdds, a.awayOdds) - lopsidedness(b.homeOdds, b.awayOdds) || a.startTime.localeCompare(b.startTime),
  );
  return inWindow[0] ?? null;
}

// ----------------------------------------------------------------- pool math

export type PoolEntry = { entryId: number; teamId: number; amount: number; placedAt: string };

// SRS-214.1 / SRS-214.3: what each entry gets back. Mirrors
// fn_settle_showdown exactly (the database does the real payout): winners get
// FLOOR(stake x pool / winning side's total), the coins lost to rounding go to
// the winning side's biggest bettor (earliest on a tie), and everyone is
// refunded when there's no winner or nobody backed the winning team.
export function splitPool(entries: PoolEntry[], winningTeamId: number | null): Map<number, number> {
  const pool = entries.reduce((sum, e) => sum + e.amount, 0);
  const winners = winningTeamId === null ? [] : entries.filter((e) => e.teamId === winningTeamId);
  const winTotal = winners.reduce((sum, e) => sum + e.amount, 0);
  const payouts = new Map<number, number>();

  if (winTotal === 0) {
    for (const e of entries) payouts.set(e.entryId, e.amount);
    return payouts;
  }

  for (const e of entries) {
    payouts.set(e.entryId, e.teamId === winningTeamId ? Number((BigInt(e.amount) * BigInt(pool)) / BigInt(winTotal)) : 0);
  }
  const paid = [...payouts.values()].reduce((sum, p) => sum + p, 0);
  const biggest = [...winners].sort(
    (a, b) => b.amount - a.amount || a.placedAt.localeCompare(b.placedAt) || a.entryId - b.entryId,
  )[0];
  payouts.set(biggest.entryId, payouts.get(biggest.entryId)! + (pool - paid));
  return payouts;
}

// The clash line in the Showdown animation (components/sports/ShowdownArena.tsx)
// moves between these points (% from the left), so both logos stay in view.
export const CLASH_LINE_MIN = 34;
export const CLASH_LINE_MAX = 66;

// Where the clash line sits: the away team's share of the pool, squeezed into
// [CLASH_LINE_MIN, CLASH_LINE_MAX]. The side with more coins pushes the line
// into the other side's half; an empty pool is dead center.
export function clashLinePosition(awayTotal: number, pool: number): number {
  const share = pool > 0 ? awayTotal / pool : 0.5;
  return CLASH_LINE_MIN + (CLASH_LINE_MAX - CLASH_LINE_MIN) * share;
}

// "If it ended now": what a stake on a team would pay back if that team won
// with the pool as it stands. Ignores the leftover-coin bonus.
export function projectedPayout(stake: number, teamTotal: number, pool: number): number {
  if (stake <= 0 || teamTotal <= 0) return 0;
  return Number((BigInt(stake) * BigInt(pool)) / BigInt(teamTotal));
}

// ----------------------------------------------------------------- selection

type CandidateRow = {
  event_id: number;
  start_time: string;
  home_team_id: number;
  away_team_id: number;
  league: { sport: { sport_name: string } | null } | null;
  betting_markets: { betting_options: { team_id: number | null; decimal_odds: number | string }[] }[];
};

type PendingShowdownRow = {
  public_bet_id: number;
  event_id: number;
  event: {
    start_time: string;
    status: SportsEvent['status'];
    home_score: number | null;
    away_score: number | null;
    home_team_id: number;
    away_team_id: number;
    league: { sport: { sport_name: string } | null } | null;
  } | null;
};

const PENDING_SELECT = `
  public_bet_id, event_id,
  event:sports_events(
    start_time, status, home_score, away_score, home_team_id, away_team_id,
    league:leagues(sport:sports(sport_name))
  )
`;

async function loadPending(supabase: SupabaseClient): Promise<PendingShowdownRow[]> {
  const { data, error } = await supabase.from('public_bets').select(PENDING_SELECT).eq('outcome', 'Pending');
  if (error) throw new Error(`Loading Showdowns failed: ${error.message}`);
  return data as unknown as PendingShowdownRow[];
}

export type SelectSummary = { picked: { sport: string; eventId: number }[]; errors: string[] };

// Gives every sport without an open Showdown a new one: the most even game
// in the pick window. Called by the sync after it saves new odds, so a new
// Showdown opens as soon as the last one's game starts.
export async function selectShowdowns(supabase: SupabaseClient, now: Date = new Date()): Promise<SelectSummary> {
  const summary: SelectSummary = { picked: [], errors: [] };

  let pending: PendingShowdownRow[];
  try {
    pending = await loadPending(supabase);
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
    return summary;
  }
  const sportsWithOpenShowdown = new Set(
    pending
      .filter((p) => p.event && new Date(p.event.start_time).getTime() > now.getTime())
      .map((p) => p.event!.league?.sport?.sport_name),
  );

  const { data: used, error: usedError } = await supabase.from('public_bets').select('event_id');
  if (usedError) {
    summary.errors.push(`Loading past Showdowns failed: ${usedError.message}`);
    return summary;
  }
  const usedEvents = new Set((used ?? []).map((row: { event_id: number }) => row.event_id));

  const { data, error } = await supabase
    .from('sports_events')
    .select(
      `event_id, start_time, home_team_id, away_team_id,
       league:leagues(sport:sports(sport_name)),
       betting_markets!inner(betting_options(team_id, decimal_odds))`,
    )
    .eq('status', 'Upcoming')
    .gte('start_time', new Date(now.getTime() + SHOWDOWN_MIN_LEAD_MS).toISOString())
    .lte('start_time', new Date(now.getTime() + SHOWDOWN_MAX_LEAD_MS).toISOString())
    .eq('betting_markets.market_type_code', 'moneyline')
    .eq('betting_markets.is_open', true);
  if (error) {
    summary.errors.push(`Loading Showdown candidates failed: ${error.message}`);
    return summary;
  }

  const bySport = new Map<string, ShowdownCandidate[]>();
  for (const row of data as unknown as CandidateRow[]) {
    const sport = row.league?.sport?.sport_name;
    if (!sport || sportsWithOpenShowdown.has(sport) || usedEvents.has(row.event_id)) continue;
    const options = row.betting_markets.flatMap((m) => m.betting_options);
    const home = options.find((o) => o.team_id === row.home_team_id);
    const away = options.find((o) => o.team_id === row.away_team_id);
    if (!home || !away) continue;
    const list = bySport.get(sport) ?? [];
    list.push({ eventId: row.event_id, startTime: row.start_time, homeOdds: Number(home.decimal_odds), awayOdds: Number(away.decimal_odds) });
    bySport.set(sport, list);
  }

  for (const [sport, candidates] of bySport) {
    const pick = pickMostEven(candidates, now);
    if (!pick) continue;
    const { error: insertError } = await supabase.from('public_bets').insert({ event_id: pick.eventId });
    if (insertError) summary.errors.push(`Picking the ${sport} Showdown failed: ${insertError.message}`);
    else summary.picked.push({ sport, eventId: pick.eventId });
  }

  return summary;
}

// ----------------------------------------------------------------- settlement

// The winning team's id, null to refund everyone, or undefined while the
// game is still undecided. Same rules as regular bets (lib/sports/settle.ts).
export function decideShowdown(row: PendingShowdownRow, now: Date): number | null | undefined {
  const event = row.event;
  if (!event) return null;
  if (event.status === 'Canceled' || event.status === 'Postponed') return null;
  if (event.status === 'Completed' && event.home_score !== null && event.away_score !== null) {
    if (event.home_score === event.away_score) return null; // SRS-214.3: no winner on a tie.
    return event.home_score > event.away_score ? event.home_team_id : event.away_team_id;
  }
  if (now.getTime() - new Date(event.start_time).getTime() >= NO_RESULT_REFUND_MS) return null;
  return undefined;
}

export type ShowdownSettleSummary = { settled: number; refunded: number; errors: string[] };

// SRS-214.2 / SRS-214.3: settles every Showdown whose game is decided.
export async function settleShowdowns(supabase: SupabaseClient, now: Date = new Date()): Promise<ShowdownSettleSummary> {
  const summary: ShowdownSettleSummary = { settled: 0, refunded: 0, errors: [] };

  let pending: PendingShowdownRow[];
  try {
    pending = await loadPending(supabase);
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
    return summary;
  }

  for (const row of pending) {
    const winner = decideShowdown(row, now);
    if (winner === undefined) continue;

    const { data, error } = await supabase.rpc('fn_settle_showdown', {
      p_public_bet_id: row.public_bet_id,
      p_winning_team_id: winner,
    });
    if (error) {
      summary.errors.push(`Showdown ${row.public_bet_id}: ${error.message}`);
      continue;
    }
    const reply = data as { status?: string; outcome?: string } | null;
    if (reply?.status !== 'settled') continue;
    if (reply.outcome === 'Refunded') summary.refunded += 1;
    else summary.settled += 1;
  }

  return summary;
}

// ----------------------------------------------------------------- page data

export type ShowdownTeam = {
  id: number;
  name: string;
  // SRS-213.1: coins wagered on this team, and by how many players.
  total: number;
  players: number;
};

export type Showdown = {
  id: number;
  sport: string;
  league: string;
  eventId: number;
  startTime: string;
  status: SportsEvent['status'];
  homeScore: number | null;
  awayScore: number | null;
  home: ShowdownTeam;
  away: ShowdownTeam;
  // SRS-213.2: everything wagered by every player.
  pool: number;
  // Open for betting: Pending and the game hasn't started (SRS-212.3).
  open: boolean;
  outcome: 'Pending' | 'Settled' | 'Refunded';
  winningTeamId: number | null;
  // The player's own entry, if they're logged in and have one.
  mine: {
    teamId: number;
    amount: number;
    // If it ended now and their team won (an estimate while open).
    projectedPayout: number;
    // What they were actually paid once settled.
    payout: number | null;
  } | null;
};

type ShowdownRow = {
  public_bet_id: number;
  event_id: number;
  outcome: Showdown['outcome'];
  winning_team_id: number | null;
  settled_at: string | null;
  event: {
    start_time: string;
    status: SportsEvent['status'];
    home_score: number | null;
    away_score: number | null;
    home_team_id: number;
    away_team_id: number;
    league: { league_name: string; sport: { sport_name: string } | null } | null;
    home: { team_name: string } | null;
    away: { team_name: string } | null;
  } | null;
};

type EntryRow = { public_bet_id: number; player_id: number; team_id: number; amount: number | string; payout: number | string | null };

const SHOWDOWN_SELECT = `
  public_bet_id, event_id, outcome, winning_team_id, settled_at,
  event:sports_events(
    start_time, status, home_score, away_score, home_team_id, away_team_id,
    league:leagues(league_name, sport:sports(sport_name)),
    home:teams!fk_sports_events_home_team(team_name),
    away:teams!fk_sports_events_away_team(team_name)
  )
`;

// Settled Showdowns stay on the page this long so players see the result.
export const SHOWDOWN_RESULT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export function toShowdown(row: ShowdownRow, entries: EntryRow[], playerId: number | null, now: Date): Showdown | null {
  const event = row.event;
  if (!event) return null;

  const team = (id: number, name: string | undefined): ShowdownTeam => {
    const side = entries.filter((e) => e.team_id === id);
    return { id, name: name ?? 'TBD', total: side.reduce((sum, e) => sum + Number(e.amount), 0), players: side.length };
  };
  const home = team(event.home_team_id, event.home?.team_name);
  const away = team(event.away_team_id, event.away?.team_name);
  const pool = home.total + away.total;
  const status = effectiveStatus(event.status, event.start_time, now);

  const own = playerId === null ? undefined : entries.find((e) => e.player_id === playerId);
  const mineTeam = own ? (own.team_id === home.id ? home : away) : null;

  return {
    id: row.public_bet_id,
    sport: event.league?.sport?.sport_name ?? 'Other',
    league: event.league?.league_name ?? '',
    eventId: row.event_id,
    startTime: event.start_time,
    status,
    homeScore: event.home_score,
    awayScore: event.away_score,
    home,
    away,
    pool,
    open: row.outcome === 'Pending' && status === 'Upcoming',
    outcome: row.outcome,
    winningTeamId: row.winning_team_id,
    mine:
      own && mineTeam
        ? {
            teamId: own.team_id,
            amount: Number(own.amount),
            projectedPayout: projectedPayout(Number(own.amount), mineTeam.total, pool),
            payout: own.payout === null ? null : Number(own.payout),
          }
        : null,
  };
}

// Every Showdown worth showing: open and in-progress ones, plus ones settled
// in the last 2 days. Totals are worked out here, so no player ids or
// individual stakes ever reach the browser (SRS-213 shows totals only).
export async function fetchShowdowns(supabase: SupabaseClient, playerId: number | null, now: Date = new Date()): Promise<Showdown[]> {
  const since = new Date(now.getTime() - SHOWDOWN_RESULT_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('public_bets')
    .select(SHOWDOWN_SELECT)
    .or(`outcome.eq.Pending,settled_at.gte.${since}`)
    .order('public_bet_id', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const rows = data as unknown as ShowdownRow[];
  if (rows.length === 0) return [];

  const { data: entryData, error: entryError } = await supabase
    .from('public_bet_entries')
    .select('public_bet_id, player_id, team_id, amount, payout')
    .in('public_bet_id', rows.map((r) => r.public_bet_id));
  if (entryError) throw new Error(entryError.message);
  const entries = entryData as unknown as EntryRow[];

  return rows
    .map((row) => toShowdown(row, entries.filter((e) => e.public_bet_id === row.public_bet_id), playerId, now))
    .filter((s): s is Showdown => s !== null)
    .sort((a, b) => Number(b.open) - Number(a.open) || a.sport.localeCompare(b.sport) || a.startTime.localeCompare(b.startTime));
}

// ----------------------------------------------------------------- my entries

// One of the player's own Showdown entries, for My bets and the results
// pop-up.
export type MyShowdownEntry = {
  entryId: number;
  showdownId: number;
  sport: string;
  league: string;
  startTime: string;
  status: SportsEvent['status'];
  homeScore: number | null;
  awayScore: number | null;
  home: { id: number; name: string };
  away: { id: number; name: string };
  teamId: number;
  amount: number;
  outcome: Showdown['outcome'];
  winningTeamId: number | null;
  // What the entry paid back once settled (0 for a loss), else null.
  payout: number | null;
  // Pending until the Showdown settles, then Decided (like SRS-208.1).
  decision: 'Pending' | 'Decided';
  // Whether the player has dismissed the results pop-up for this entry.
  resultSeen: boolean;
};

export type MyShowdowns = { open: MyShowdownEntry[]; settled: MyShowdownEntry[]; unseen: MyShowdownEntry[] };

type MyEntryRow = {
  entry_id: number;
  public_bet_id: number;
  team_id: number;
  amount: number | string;
  payout: number | string | null;
  result_seen_at: string | null;
  showdown: ShowdownRow | null;
};

export function toMyShowdownEntry(row: MyEntryRow, now: Date): MyShowdownEntry | null {
  const event = row.showdown?.event;
  if (!row.showdown || !event) return null;
  const decided = row.showdown.outcome !== 'Pending';
  return {
    entryId: row.entry_id,
    showdownId: row.public_bet_id,
    sport: event.league?.sport?.sport_name ?? 'Other',
    league: event.league?.league_name ?? '',
    startTime: event.start_time,
    status: effectiveStatus(event.status, event.start_time, now),
    homeScore: event.home_score,
    awayScore: event.away_score,
    home: { id: event.home_team_id, name: event.home?.team_name ?? 'TBD' },
    away: { id: event.away_team_id, name: event.away?.team_name ?? 'TBD' },
    teamId: row.team_id,
    amount: Number(row.amount),
    outcome: row.showdown.outcome,
    winningTeamId: row.showdown.winning_team_id,
    payout: decided && row.payout !== null ? Number(row.payout) : null,
    decision: decided ? 'Decided' : 'Pending',
    resultSeen: !!row.result_seen_at,
  };
}

export async function fetchMyShowdowns(supabase: SupabaseClient, playerId: number, now: Date = new Date()): Promise<MyShowdowns> {
  const { data, error } = await supabase
    .from('public_bet_entries')
    .select(`entry_id, public_bet_id, team_id, amount, payout, result_seen_at, showdown:public_bets(${SHOWDOWN_SELECT})`)
    .eq('player_id', playerId)
    .order('entry_id', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const entries = (data as unknown as MyEntryRow[])
    .map((row) => toMyShowdownEntry(row, now))
    .filter((e): e is MyShowdownEntry => e !== null);
  const settled = entries.filter((e) => e.decision === 'Decided');
  return {
    open: entries.filter((e) => e.decision === 'Pending').sort((a, b) => a.startTime.localeCompare(b.startTime)),
    settled,
    unseen: settled.filter((e) => !e.resultSeen),
  };
}
