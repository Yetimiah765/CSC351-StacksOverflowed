// The weekly sports leaderboard (UR-216, SRS-216.1 – 216.6). Nothing is
// stored and no coins ever move: each request adds up the bets decided in the
// week, from regular wagers (`wagers.settled_at`) and Showdown entries (their
// `public_bets.settled_at`). Refunded and cancelled bets are left out, since
// they count as zero (SRS-216.3).

import type { SupabaseClient } from '@supabase/supabase-js';

export const LEADERBOARD_TIME_ZONE = 'America/New_York';
export const TOP_EARNERS_LIMIT = 10;
export const BIGGEST_WINS_LIMIT = 5;

// ------------------------------------------------------------ the week (216.2)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function easternParts(at: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LEADERBOARD_TIME_ZONE,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

// Eastern wall-clock time minus UTC at a moment, in ms (-4h or -5h).
function easternOffsetMs(at: Date): number {
  const p = easternParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

// The UTC instant of 00:00 Eastern on a calendar date. Daylight saving changes
// at 2 AM, so midnight itself is never skipped or repeated.
function easternMidnight(year: number, month: number, day: number): Date {
  const wall = Date.UTC(year, month - 1, day);
  const first = wall - easternOffsetMs(new Date(wall));
  return new Date(wall - easternOffsetMs(new Date(first)));
}

export type LeaderboardWeek = { start: Date; end: Date };

// Monday 00:00 through Sunday 23:59 Eastern (end is exclusive: next Monday
// 00:00). weeksAgo = 1 is the previous week (SRS-216.6).
export function leaderboardWeek(now: Date, weeksAgo = 0): LeaderboardWeek {
  const today = easternParts(now);
  const daysSinceMonday = (today.weekday + 6) % 7;
  const monday = new Date(Date.UTC(today.year, today.month - 1, today.day - daysSinceMonday - 7 * weeksAgo));
  const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    start: easternMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
    end: easternMidnight(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate()),
  };
}

// ------------------------------------------------------------ the rankings

// One bet decided (won or lost) during the week.
export type DecidedBet = {
  playerId: number;
  stake: number;
  payout: number;
  settledAt: string;
  kind: 'wager' | 'showdown';
  // What was picked ("Brooklyn Nets +11.5") and the game ("Nets @ Celtics").
  pick: string;
  game: string;
};

export type TopEarner = { rank: number; playerId: number; username: string; net: number; bets: number; wins: number };
export type BiggestWin = {
  rank: number;
  playerId: number;
  username: string;
  payout: number;
  profit: number;
  kind: 'wager' | 'showdown';
  pick: string;
  game: string;
  settledAt: string;
};
export type MyStanding = { rank: number | null; net: number; bets: number };

export type Leaderboard = {
  week: { start: string; end: string };
  topEarners: TopEarner[];
  biggestWins: BiggestWin[];
  // The logged-in player's standing (SRS-216.4); null for guests.
  me: MyStanding | null;
  // The winner of the week before, shown on the current week.
  lastWeekChampion: TopEarner | null;
};

type Standing = Omit<TopEarner, 'username'>;

// SRS-216.1 / 216.3: everyone with a decided bet, by net winnings. Equal nets
// share a rank (1, 2, 2, 4); within a tie, fewer bets lists first.
export function rankEarners(bets: DecidedBet[]): Standing[] {
  const totals = new Map<number, { net: number; bets: number; wins: number }>();
  for (const bet of bets) {
    const total = totals.get(bet.playerId) ?? { net: 0, bets: 0, wins: 0 };
    total.net += bet.payout - bet.stake;
    total.bets += 1;
    if (bet.payout > bet.stake) total.wins += 1;
    totals.set(bet.playerId, total);
  }
  const sorted = [...totals.entries()]
    .map(([playerId, total]) => ({ playerId, ...total }))
    .sort((a, b) => b.net - a.net || a.bets - b.bets || a.playerId - b.playerId);
  let rank = 0;
  return sorted.map((row, i) => {
    if (i === 0 || sorted[i - 1].net !== row.net) rank = i + 1;
    return { ...row, rank };
  });
}

// SRS-216.5: the largest single payouts from winning bets, earliest first on a tie.
export function biggestWins(bets: DecidedBet[], limit = BIGGEST_WINS_LIMIT): Omit<BiggestWin, 'username' | 'rank'>[] {
  return bets
    .filter((bet) => bet.payout > bet.stake)
    .sort((a, b) => b.payout - a.payout || a.settledAt.localeCompare(b.settledAt))
    .slice(0, limit)
    .map(({ playerId, payout, stake, kind, pick, game, settledAt }) => ({
      playerId,
      payout,
      profit: payout - stake,
      kind,
      pick,
      game,
      settledAt,
    }));
}

export function buildLeaderboard(
  bets: DecidedBet[],
  usernames: Map<number, string>,
  week: LeaderboardWeek,
  playerId: number | null,
): Omit<Leaderboard, 'lastWeekChampion'> {
  const name = (id: number) => usernames.get(id) ?? 'Player';
  const standings = rankEarners(bets);
  const mine = playerId === null ? null : standings.find((row) => row.playerId === playerId);
  return {
    week: { start: week.start.toISOString(), end: week.end.toISOString() },
    topEarners: standings.slice(0, TOP_EARNERS_LIMIT).map((row) => ({ ...row, username: name(row.playerId) })),
    biggestWins: biggestWins(bets).map((win, i) => ({ ...win, rank: i + 1, username: name(win.playerId) })),
    me: playerId === null ? null : mine ? { rank: mine.rank, net: mine.net, bets: mine.bets } : { rank: null, net: 0, bets: 0 },
  };
}

// ------------------------------------------------------------ loading

type TeamName = { team_name: string } | null;
type GameRow = { home: TeamName; away: TeamName; home_team_id?: number; away_team_id?: number } | null;

type WagerRow = {
  player_id: number;
  amount: number;
  payout: number | null;
  settled_at: string;
  option: { option_label: string; market: { event: GameRow } | null } | null;
};

type ShowdownRow = {
  settled_at: string;
  event: GameRow;
  entries: { player_id: number; team_id: number; amount: number; payout: number | null }[];
};

function gameName(event: GameRow): string {
  return event ? `${event.away?.team_name ?? 'Away'} @ ${event.home?.team_name ?? 'Home'}` : '';
}

const WAGER_SELECT = `
  player_id, amount, payout, settled_at,
  option:betting_options(
    option_label,
    market:betting_markets(
      event:sports_events(
        home:teams!fk_sports_events_home_team(team_name),
        away:teams!fk_sports_events_away_team(team_name)
      )
    )
  )
`;

const SHOWDOWN_SELECT = `
  settled_at,
  event:sports_events(
    home_team_id, away_team_id,
    home:teams!fk_sports_events_home_team(team_name),
    away:teams!fk_sports_events_away_team(team_name)
  ),
  entries:public_bet_entries(player_id, team_id, amount, payout)
`;

export async function loadDecidedBets(supabase: SupabaseClient, week: LeaderboardWeek): Promise<DecidedBet[]> {
  const from = week.start.toISOString();
  const to = week.end.toISOString();

  const [wagers, showdowns] = await Promise.all([
    supabase.from('wagers').select(WAGER_SELECT).in('result', ['Won', 'Lost']).gte('settled_at', from).lt('settled_at', to),
    // A Refunded Showdown paid everyone back, so only Settled ones count.
    supabase.from('public_bets').select(SHOWDOWN_SELECT).eq('outcome', 'Settled').gte('settled_at', from).lt('settled_at', to),
  ]);
  if (wagers.error) throw new Error(wagers.error.message);
  if (showdowns.error) throw new Error(showdowns.error.message);

  const bets: DecidedBet[] = (wagers.data as unknown as WagerRow[]).map((row) => ({
    playerId: row.player_id,
    stake: Number(row.amount),
    payout: Number(row.payout ?? 0),
    settledAt: row.settled_at,
    kind: 'wager',
    pick: row.option?.option_label ?? 'Bet',
    game: gameName(row.option?.market?.event ?? null),
  }));

  for (const showdown of showdowns.data as unknown as ShowdownRow[]) {
    for (const entry of showdown.entries ?? []) {
      const team = entry.team_id === showdown.event?.home_team_id ? showdown.event?.home : showdown.event?.away;
      bets.push({
        playerId: entry.player_id,
        stake: Number(entry.amount),
        payout: Number(entry.payout ?? 0),
        settledAt: showdown.settled_at,
        kind: 'showdown',
        pick: team?.team_name ?? 'Showdown',
        game: gameName(showdown.event),
      });
    }
  }
  return bets;
}

async function loadUsernames(supabase: SupabaseClient, playerIds: number[]): Promise<Map<number, string>> {
  if (playerIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('usernames')
    .select('player_id, username')
    .eq('is_current', true)
    .in('player_id', playerIds);
  if (error) throw new Error(error.message);
  return new Map((data as { player_id: number; username: string }[]).map((row) => [row.player_id, row.username]));
}

// The whole leaderboard for one week. `weeksAgo` is 0 (this week) or 1 (last
// week, SRS-216.6); the current week also names last week's champion.
export async function fetchLeaderboard(
  supabase: SupabaseClient,
  playerId: number | null,
  weeksAgo: 0 | 1,
  now: Date = new Date(),
): Promise<Leaderboard> {
  const week = leaderboardWeek(now, weeksAgo);
  const bets = await loadDecidedBets(supabase, week);
  const previousBets = weeksAgo === 0 ? await loadDecidedBets(supabase, leaderboardWeek(now, 1)) : [];
  const champion = rankEarners(previousBets)[0] ?? null;

  const ids = new Set(bets.map((bet) => bet.playerId));
  if (champion) ids.add(champion.playerId);
  const usernames = await loadUsernames(supabase, [...ids]);

  return {
    ...buildLeaderboard(bets, usernames, week, playerId),
    // Only a week that ended with someone ahead has a champion.
    lastWeekChampion: champion && champion.net > 0 ? { ...champion, username: usernames.get(champion.playerId) ?? 'Player' } : null,
  };
}
