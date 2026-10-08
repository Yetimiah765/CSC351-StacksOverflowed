import { describe, expect, it } from 'vitest';
import type { OddsApiEvent, OddsApiScoreEvent, OddsApiSport } from '../../lib/oddsApi';
import { eventStatus, normalizeEvents, pickMarket } from '../../lib/sports/normalize';

const NFL: OddsApiSport = {
  key: 'americanfootball_nfl',
  group: 'American Football',
  title: 'NFL',
  description: 'US Football',
  active: true,
  has_outrights: false,
};

const NOW = new Date('2026-10-08T12:00:00Z');

function oddsEvent(overrides: Partial<OddsApiEvent> = {}): OddsApiEvent {
  return {
    id: 'evt1',
    sport_key: 'americanfootball_nfl',
    sport_title: 'NFL',
    commence_time: '2026-10-11T17:00:00Z',
    home_team: 'Kansas City Chiefs',
    away_team: 'Buffalo Bills',
    bookmakers: [
      {
        key: 'somebook',
        title: 'Some Book',
        last_update: '2026-10-08T11:00:00Z',
        markets: [{ key: 'h2h', last_update: '', outcomes: [{ name: 'Kansas City Chiefs', price: 9 }, { name: 'Buffalo Bills', price: 9 }] }],
      },
      {
        key: 'draftkings',
        title: 'DraftKings',
        last_update: '2026-10-08T11:00:00Z',
        markets: [
          { key: 'h2h', last_update: '', outcomes: [{ name: 'Kansas City Chiefs', price: 1.667 }, { name: 'Buffalo Bills', price: 2.25 }] },
          {
            key: 'spreads',
            last_update: '',
            outcomes: [
              { name: 'Kansas City Chiefs', price: 1.91, point: -3.5 },
              { name: 'Buffalo Bills', price: 1.91, point: 3.5 },
            ],
          },
          {
            key: 'totals',
            last_update: '',
            outcomes: [
              { name: 'Over', price: 1.87, point: 47.5 },
              { name: 'Under', price: 1.95, point: 47.5 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function scoreEvent(overrides: Partial<OddsApiScoreEvent> = {}): OddsApiScoreEvent {
  return {
    id: 'evt1',
    sport_key: 'americanfootball_nfl',
    sport_title: 'NFL',
    commence_time: '2026-10-11T17:00:00Z',
    completed: false,
    home_team: 'Kansas City Chiefs',
    away_team: 'Buffalo Bills',
    scores: null,
    last_update: null,
    ...overrides,
  };
}

describe('pickMarket', () => {
  it('prefers the highest-ranked bookmaker that offers the market', () => {
    const market = pickMarket(oddsEvent().bookmakers, 'h2h');
    expect(market?.outcomes[0].price).toBe(1.667);
  });

  it('falls back to any bookmaker when no preferred one has the market', () => {
    const [somebook] = oddsEvent().bookmakers;
    expect(pickMarket([somebook], 'h2h')?.outcomes[0].price).toBe(9);
    expect(pickMarket([somebook], 'spreads')).toBeNull();
  });
});

describe('eventStatus', () => {
  it('is Upcoming before the start time, In Progress after, Completed when finished', () => {
    expect(eventStatus('2026-10-11T17:00:00Z', false, NOW)).toBe('Upcoming');
    expect(eventStatus('2026-10-08T11:00:00Z', false, NOW)).toBe('In Progress');
    expect(eventStatus('2026-10-08T11:00:00Z', true, NOW)).toBe('Completed');
  });
});

describe('normalizeEvents', () => {
  it('maps h2h, spreads, and totals onto our market types', () => {
    const [event] = normalizeEvents(NFL, [oddsEvent()], [], NOW);

    expect(event).toMatchObject({
      externalId: 'evt1',
      sportName: 'American Football',
      leagueName: 'NFL',
      homeTeam: 'Kansas City Chiefs',
      awayTeam: 'Buffalo Bills',
      status: 'Upcoming',
      homeScore: null,
      awayScore: null,
    });

    expect(event.markets).toEqual([
      {
        type: 'moneyline',
        line: null,
        options: [
          { label: 'Kansas City Chiefs', winningCondition: 'Kansas City Chiefs win', team: 'home', decimalOdds: 1.667 },
          { label: 'Buffalo Bills', winningCondition: 'Buffalo Bills win', team: 'away', decimalOdds: 2.25 },
        ],
      },
      {
        type: 'point_spread',
        line: -3.5,
        options: [
          { label: 'Kansas City Chiefs -3.5', winningCondition: 'Kansas City Chiefs win by more than 3.5 points', team: 'home', decimalOdds: 1.91 },
          { label: 'Buffalo Bills +3.5', winningCondition: 'Buffalo Bills win, or lose by fewer than 3.5 points', team: 'away', decimalOdds: 1.91 },
        ],
      },
      {
        type: 'total',
        line: 47.5,
        options: [
          { label: 'Over 47.5', winningCondition: 'Combined score is more than 47.5', team: null, decimalOdds: 1.87 },
          { label: 'Under 47.5', winningCondition: 'Combined score is less than 47.5', team: null, decimalOdds: 1.95 },
        ],
      },
    ]);
  });

  it('keeps a Draw outcome as a moneyline option with no team', () => {
    const soccer = oddsEvent({
      bookmakers: [
        {
          key: 'draftkings',
          title: 'DraftKings',
          last_update: '',
          markets: [
            {
              key: 'h2h',
              last_update: '',
              outcomes: [
                { name: 'Kansas City Chiefs', price: 2.1 },
                { name: 'Buffalo Bills', price: 3.4 },
                { name: 'Draw', price: 3.2 },
              ],
            },
          ],
        },
      ],
    });

    const [event] = normalizeEvents(NFL, [soccer], [], NOW);
    expect(event.markets[0].options[2]).toEqual({
      label: 'Draw',
      winningCondition: 'The game ends in a draw',
      team: null,
      decimalOdds: 3.2,
    });
  });

  it('drops outcomes with odds of 1 or less and markets left with one option', () => {
    const bad = oddsEvent({
      bookmakers: [
        {
          key: 'draftkings',
          title: 'DraftKings',
          last_update: '',
          markets: [{ key: 'h2h', last_update: '', outcomes: [{ name: 'Kansas City Chiefs', price: 1 }, { name: 'Buffalo Bills', price: 2 }] }],
        },
      ],
    });

    expect(normalizeEvents(NFL, [bad], [], NOW)[0].markets).toEqual([]);
  });

  it('applies scores and marks finished games Completed', () => {
    const finished = scoreEvent({
      commence_time: '2026-10-07T17:00:00Z',
      completed: true,
      scores: [
        { name: 'Kansas City Chiefs', score: '27' },
        { name: 'Buffalo Bills', score: '24' },
      ],
    });

    const [event] = normalizeEvents(NFL, [], [finished], NOW);
    expect(event).toMatchObject({ status: 'Completed', homeScore: 27, awayScore: 24, markets: [] });
  });

  it('keeps a completed game In Progress until both scores are known', () => {
    const noScore = scoreEvent({ commence_time: '2026-10-07T17:00:00Z', completed: true, scores: null });
    expect(normalizeEvents(NFL, [], [noScore], NOW)[0].status).toBe('In Progress');
  });

  it('merges odds and scores for the same event without duplicating it', () => {
    const events = normalizeEvents(NFL, [oddsEvent()], [scoreEvent(), scoreEvent({ id: 'evt2' })], NOW);
    expect(events.map((e) => e.externalId)).toEqual(['evt1', 'evt2']);
    expect(events[0].markets).toHaveLength(3);
  });
});
