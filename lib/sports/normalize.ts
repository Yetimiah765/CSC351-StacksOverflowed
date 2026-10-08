// Converts The Odds API responses into the shape of our sports tables
// (sports_events, betting_markets, betting_options in supabase/schema.sql).
// Pure functions only, so the mapping rules can be unit tested.

import type {
  OddsApiBookmaker,
  OddsApiEvent,
  OddsApiMarket,
  OddsApiMarketKey,
  OddsApiScoreEvent,
  OddsApiSport,
} from '../oddsApi';

export type EventStatus = 'Upcoming' | 'In Progress' | 'Completed';
export type MarketTypeCode = 'moneyline' | 'point_spread' | 'total';

export type NormalizedOption = {
  label: string;
  winningCondition: string;
  // Which team the option backs; null for Draw, Over, and Under.
  team: 'home' | 'away' | null;
  decimalOdds: number;
};

export type NormalizedMarket = {
  type: MarketTypeCode;
  // Home team's spread for point_spread, the total for total, null for moneyline.
  line: number | null;
  options: NormalizedOption[];
};

export type NormalizedEvent = {
  externalId: string;
  sportKey: string;
  sportName: string;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: EventStatus;
  homeScore: number | null;
  awayScore: number | null;
  markets: NormalizedMarket[];
};

// One bookmaker's line is used per market so a market's options always agree
// on the line. Earlier entries win; any other bookmaker is the fallback.
export const PREFERRED_BOOKMAKERS = ['draftkings', 'fanduel', 'betmgm', 'williamhill_us'];

const MARKET_TYPES: Record<OddsApiMarketKey, MarketTypeCode> = {
  h2h: 'moneyline',
  spreads: 'point_spread',
  totals: 'total',
};

export function pickMarket(bookmakers: OddsApiBookmaker[], key: OddsApiMarketKey): OddsApiMarket | null {
  const rank = (bookmaker: OddsApiBookmaker) => {
    const index = PREFERRED_BOOKMAKERS.indexOf(bookmaker.key);
    return index === -1 ? PREFERRED_BOOKMAKERS.length : index;
  };

  const ordered = [...bookmakers].sort((a, b) => rank(a) - rank(b));
  for (const bookmaker of ordered) {
    const market = bookmaker.markets.find((m) => m.key === key);
    if (market && market.outcomes.length >= 2) return market;
  }
  return null;
}

function roundOdds(price: number): number {
  return Math.round(price * 1000) / 1000;
}

function formatPoint(point: number): string {
  return point > 0 ? `+${point}` : String(point);
}

function spreadCondition(team: string, point: number): string {
  if (point < 0) return `${team} win by more than ${-point} points`;
  if (point > 0) return `${team} win, or lose by fewer than ${point} points`;
  return `${team} win`;
}

function teamSide(name: string, event: OddsApiEvent): 'home' | 'away' | null {
  if (name === event.home_team) return 'home';
  if (name === event.away_team) return 'away';
  return null;
}

function normalizeMarket(market: OddsApiMarket, event: OddsApiEvent): NormalizedMarket | null {
  // The schema requires decimal odds above 1.
  const outcomes = market.outcomes.filter((o) => o.price > 1);
  if (outcomes.length < 2) return null;

  switch (market.key) {
    case 'h2h':
      return {
        type: 'moneyline',
        line: null,
        options: outcomes.map((o) => {
          const team = teamSide(o.name, event);
          return {
            label: o.name,
            winningCondition: team ? `${o.name} win` : 'The game ends in a draw',
            team,
            decimalOdds: roundOdds(o.price),
          };
        }),
      };

    case 'spreads': {
      const home = outcomes.find((o) => o.name === event.home_team);
      if (home?.point === undefined) return null;
      return {
        type: 'point_spread',
        line: home.point,
        options: outcomes
          .filter((o) => o.point !== undefined && teamSide(o.name, event))
          .map((o) => ({
            label: `${o.name} ${formatPoint(o.point!)}`,
            winningCondition: spreadCondition(o.name, o.point!),
            team: teamSide(o.name, event),
            decimalOdds: roundOdds(o.price),
          })),
      };
    }

    case 'totals': {
      const line = outcomes.find((o) => o.point !== undefined)?.point;
      if (line === undefined) return null;
      return {
        type: 'total',
        line,
        options: outcomes
          .filter((o) => (o.name === 'Over' || o.name === 'Under') && o.point === line)
          .map((o) => ({
            label: `${o.name} ${line}`,
            winningCondition: `Combined score is ${o.name === 'Over' ? 'more' : 'less'} than ${line}`,
            team: null,
            decimalOdds: roundOdds(o.price),
          })),
      };
    }
  }
}

export function eventStatus(commenceTime: string, completed: boolean, now: Date): EventStatus {
  if (completed) return 'Completed';
  return new Date(commenceTime).getTime() <= now.getTime() ? 'In Progress' : 'Upcoming';
}

function parseScore(scores: OddsApiScoreEvent['scores'], team: string): number | null {
  const entry = scores?.find((s) => s.name === team);
  if (!entry) return null;
  const value = Number.parseInt(entry.score, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// Merges one sport's odds and scores responses. Events that only appear in
// the scores response (finished games whose odds are gone) are kept so their
// status and final score still reach the database.
export function normalizeEvents(
  sport: OddsApiSport,
  oddsEvents: OddsApiEvent[],
  scoreEvents: OddsApiScoreEvent[],
  now: Date = new Date(),
): NormalizedEvent[] {
  const scoresById = new Map(scoreEvents.map((s) => [s.id, s]));
  const oddsById = new Map(oddsEvents.map((e) => [e.id, e]));
  const ids = [...new Set([...oddsById.keys(), ...scoresById.keys()])];

  return ids.map((id) => {
    const odds = oddsById.get(id);
    const score = scoresById.get(id);
    const base = (odds ?? score)!;

    const markets = odds
      ? (Object.keys(MARKET_TYPES) as OddsApiMarketKey[])
          .map((key) => pickMarket(odds.bookmakers, key))
          .map((market) => (market ? normalizeMarket(market, odds) : null))
          .filter((market): market is NormalizedMarket => market !== null && market.options.length >= 2)
      : [];

    const homeScore = parseScore(score?.scores ?? null, base.home_team);
    const awayScore = parseScore(score?.scores ?? null, base.away_team);
    // The schema rejects a Completed event without a final score, so wait
    // for the score to arrive before marking it Completed.
    const hasFinalScore = homeScore !== null && awayScore !== null;

    return {
      externalId: id,
      sportKey: sport.key,
      sportName: sport.group,
      leagueName: sport.title,
      homeTeam: base.home_team,
      awayTeam: base.away_team,
      startTime: base.commence_time,
      status: eventStatus(base.commence_time, (score?.completed ?? false) && hasFinalScore, now),
      homeScore,
      awayScore,
      markets,
    };
  });
}
