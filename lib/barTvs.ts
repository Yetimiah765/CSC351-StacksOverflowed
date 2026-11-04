// What the TVs over the casino floor's bar show: the sportsbook's Showdowns
// (GET /api/sports/showdown), exactly the ones the Showdown page lists and in
// its order, as a showcase for sports betting. Pure, so it's unit-tested;
// components/casinoFloor/textures.ts paints each one.

import type { Showdown, ShowdownTeam } from './sports/showdown';
import { TEAMS } from './sports/teams';

export interface TvTeam {
  name: string;
  short: string;
  color: string;
  score: number | null;
  /** Coins backing this team in the Showdown's pool, and by how many players. */
  coins: number;
  players: number;
}

export interface TvGame {
  league: string;
  away: TvTeam;
  home: TvTeam;
  /** Everything wagered on the Showdown. */
  pool: number;
  /**
   * 'upcoming' (still open to bets: the start time and the pool), 'live'
   * (the score), 'final' (the score), or 'off' (cancelled or postponed).
   */
  state: 'upcoming' | 'live' | 'final' | 'off';
  startTime: string;
}

/** How long a set of Showdowns stays on the TVs before the next set, when there are more Showdowns than TVs. */
export const TV_ROTATE_MS = 8000;

const FALLBACK_COLORS = ['#b91c1c', '#1d4ed8', '#047857', '#7c3aed', '#c2410c', '#0f766e'];

/** The team's ESPN code when known ("KC"), else its initials. */
function shortName(name: string): string {
  const code = TEAMS[name]?.code;
  if (code) return code.toUpperCase();
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

/** A team's colour that reads on a dark screen: its primary, or its secondary if that's near black. */
function teamColor(name: string, fallback: string): string {
  const team = TEAMS[name];
  if (!team) return fallback;
  const dark = (hex: string) => {
    const value = parseInt(hex.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b < 45;
  };
  return dark(team.primary) && !dark(team.secondary) ? team.secondary : team.primary;
}

function tvState(showdown: Showdown): TvGame['state'] {
  if (showdown.open || showdown.status === 'Upcoming') return 'upcoming';
  if (showdown.status === 'In Progress') return 'live';
  if (showdown.status === 'Completed') return 'final';
  return 'off';
}

/** Every Showdown, as the TVs show it, in the order given (the Showdown page's). */
export function showdownTvGames(showdowns: Showdown[]): TvGame[] {
  return showdowns.map((showdown, i) => {
    const team = (t: ShowdownTeam, score: number | null, fallback: number): TvTeam => ({
      name: t.name,
      short: shortName(t.name),
      color: teamColor(t.name, FALLBACK_COLORS[fallback % FALLBACK_COLORS.length]!),
      score,
      coins: t.total,
      players: t.players,
    });
    return {
      league: showdown.league,
      state: tvState(showdown),
      startTime: showdown.startTime,
      pool: showdown.pool,
      away: team(showdown.away, showdown.awayScore, i * 2),
      home: team(showdown.home, showdown.homeScore, i * 2 + 1),
    };
  });
}

/**
 * Which Showdown TV `tv` of `tvCount` shows at `time` (ms): with no more
 * Showdowns than TVs, each TV keeps one (repeating if there are fewer); with
 * more, the TVs page through them together, `tvCount` at a time, every
 * TV_ROTATE_MS, so every Showdown comes round. Null with none.
 */
export function showdownForTv<T>(games: T[], tv: number, tvCount: number, time: number): T | null {
  if (games.length === 0) return null;
  if (games.length <= tvCount) return games[tv % games.length]!;
  const pages = Math.ceil(games.length / tvCount);
  const page = Math.floor(time / TV_ROTATE_MS) % pages;
  // The last page wraps round to the start rather than leaving a TV blank.
  return games[(page * tvCount + tv) % games.length]!;
}

/** When an upcoming game starts, as the TV shows it: "TONIGHT 7:30 PM", "SAT 1:00 PM". */
export function kickoffLabel(startTime: string, now: Date = new Date()): string {
  const start = new Date(startTime);
  const time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toUpperCase();
  const sameDay = start.toDateString() === now.toDateString();
  if (sameDay) return `${start.getHours() >= 17 ? 'TONIGHT' : 'TODAY'} ${time}`;
  return `${start.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} ${time}`;
}
