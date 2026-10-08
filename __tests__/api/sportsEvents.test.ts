import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildListing, toSportsEvent, type EventRow, type SportsEvent } from '../../lib/sports/events';
import { potentialPayout } from '../../lib/sports/payout';

const mocks = vi.hoisted(() => ({ result: { data: [] as unknown, error: null as { message: string } | null } }));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => {
    const builder = {
      select: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => Promise.resolve(mocks.result),
    };
    return { from: () => builder };
  }),
}));

import { GET } from '../../app/api/sports/events/route';

const MARKET_TYPE = {
  display_name: 'Moneyline',
  description: 'Pick which team wins the game outright.',
  rules_text: 'Your pick must win the game.',
  tie_rules: null,
  refund_conditions: 'Refunded if the event is canceled or postponed.',
};

function row(overrides: Partial<EventRow> = {}): EventRow {
  return {
    event_id: 1,
    start_time: '2026-10-11T17:00:00Z',
    status: 'Upcoming',
    home_score: null,
    away_score: null,
    home_team_id: 10,
    away_team_id: 11,
    league: { league_id: 5, league_name: 'NFL', sport: { sport_name: 'American Football' } },
    home: { team_name: 'Dallas Cowboys' },
    away: { team_name: 'Tampa Bay Buccaneers' },
    betting_markets: [
      {
        market_id: 100,
        market_type_code: 'total',
        line: '48.5',
        is_open: true,
        market_types: { ...MARKET_TYPE, display_name: 'Over/Under' },
        betting_options: [
          { option_id: 2, team_id: null, option_label: 'Under 48.5', winning_condition: 'Combined score is less than 48.5', decimal_odds: '1.930' },
          { option_id: 1, team_id: null, option_label: 'Over 48.5', winning_condition: 'Combined score is more than 48.5', decimal_odds: '1.890' },
        ],
      },
      {
        market_id: 101,
        market_type_code: 'moneyline',
        line: null,
        is_open: true,
        market_types: MARKET_TYPE,
        betting_options: [
          { option_id: 3, team_id: 10, option_label: 'Dallas Cowboys', winning_condition: 'Dallas Cowboys win', decimal_odds: '1.210' },
          { option_id: 4, team_id: 11, option_label: 'Tampa Bay Buccaneers', winning_condition: 'Tampa Bay Buccaneers win', decimal_odds: '4.600' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('toSportsEvent', () => {
  it('flattens the row, converts NUMERIC strings, and orders markets', () => {
    const event = toSportsEvent(row());

    expect(event).toMatchObject({
      id: 1,
      sport: 'American Football',
      league: 'NFL',
      leagueId: 5,
      homeTeam: 'Dallas Cowboys',
      awayTeam: 'Tampa Bay Buccaneers',
      status: 'Upcoming',
    });
    expect(event.markets.map((m) => m.type)).toEqual(['moneyline', 'total']);
    expect(event.markets[1].line).toBe(48.5);
    expect(event.markets[1].options.map((o) => [o.label, o.side, o.decimalOdds])).toEqual([
      ['Over 48.5', 'over', 1.89],
      ['Under 48.5', 'under', 1.93],
    ]);
    expect(event.markets[0].options.map((o) => o.side)).toEqual(['home', 'away']);
  });

  it('hides a closed market when a newer open one of the same type exists', () => {
    const base = row().betting_markets[0];
    const event = toSportsEvent(
      row({
        betting_markets: [
          { ...base, market_id: 100, line: '47.5', is_open: false },
          { ...base, market_id: 102, line: '48.5', is_open: true },
        ],
      }),
    );

    expect(event.markets).toHaveLength(1);
    expect(event.markets[0]).toMatchObject({ id: 102, line: 48.5, isOpen: true });
  });

  it('keeps only the newest closed market once betting has closed', () => {
    const base = row().betting_markets[0];
    const event = toSportsEvent(
      row({
        status: 'In Progress',
        betting_markets: [
          { ...base, market_id: 100, line: '47.5', is_open: false },
          { ...base, market_id: 102, line: '48.5', is_open: false },
        ],
      }),
    );

    expect(event.markets.map((m) => m.id)).toEqual([102]);
  });

  it('labels a Draw option with no team', () => {
    const base = row().betting_markets[1];
    const event = toSportsEvent(
      row({
        betting_markets: [
          {
            ...base,
            betting_options: [
              ...base.betting_options,
              { option_id: 5, team_id: null, option_label: 'Draw', winning_condition: 'The game ends in a draw', decimal_odds: '3.2' },
            ],
          },
        ],
      }),
    );

    expect(event.markets[0].options.map((o) => o.side)).toEqual(['home', 'away', 'draw']);
  });
});

describe('buildListing', () => {
  const nfl = toSportsEvent(row());
  const nba: SportsEvent = { ...nfl, id: 2, sport: 'Basketball', league: 'NBA', leagueId: 6 };

  it('filters events but always lists every sport and league', () => {
    const listing = buildListing([nfl, nba], { sport: 'Basketball' });

    expect(listing.events.map((e) => e.id)).toEqual([2]);
    expect(listing.sports).toEqual(['American Football', 'Basketball']);
    expect(listing.leagues.map((l) => l.name)).toEqual(['NBA', 'NFL']);
  });

  it('filters by league id', () => {
    expect(buildListing([nfl, nba], { leagueId: 5 }).events.map((e) => e.id)).toEqual([1]);
  });
});

describe('potentialPayout', () => {
  it('returns stake plus winnings, rounded down to whole coins', () => {
    expect(potentialPayout(100, 1.91)).toBe(191);
    expect(potentialPayout(10, 1.15)).toBe(11);
    expect(potentialPayout(3, 1.667)).toBe(5);
  });

  it('returns 0 for invalid amounts or odds', () => {
    expect(potentialPayout(0, 2)).toBe(0);
    expect(potentialPayout(-5, 2)).toBe(0);
    expect(potentialPayout(1.5, 2)).toBe(0);
    expect(potentialPayout(10, 1)).toBe(0);
  });
});

describe('GET /api/sports/events', () => {
  beforeEach(() => {
    mocks.result = { data: [row()], error: null };
  });

  it('returns events with filter lists', async () => {
    const response = await GET(new Request('http://localhost/api/sports/events'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sports).toEqual(['American Football']);
    expect(body.leagues).toEqual([{ id: 5, name: 'NFL', sport: 'American Football' }]);
    expect(body.events).toHaveLength(1);
  });

  it('applies the sport filter', async () => {
    const response = await GET(new Request('http://localhost/api/sports/events?sport=Baseball'));
    expect((await response.json()).events).toEqual([]);
  });

  it('rejects a non-numeric league id', async () => {
    const response = await GET(new Request('http://localhost/api/sports/events?league=abc'));
    expect(response.status).toBe(400);
  });

  it('returns 500 when the query fails', async () => {
    mocks.result = { data: null, error: { message: 'relation does not exist' } };
    const response = await GET(new Request('http://localhost/api/sports/events'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'relation does not exist' });
  });
});
