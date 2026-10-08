import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedEvent } from '../../lib/sports/normalize';

const mocks = vi.hoisted(() => ({
  supabase: {} as unknown,
  oddsApi: {} as unknown,
  syncSports: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({ getSupabaseClient: vi.fn(() => mocks.supabase) }));
vi.mock('../../lib/oddsApi', () => ({ getOddsApiClient: vi.fn(() => mocks.oddsApi) }));
vi.mock('../../lib/sports/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/sports/sync')>()),
  syncSports: mocks.syncSports,
}));

import { POST } from '../../app/api/sports/sync/route';
import { saveEvent } from '../../lib/sports/sync';

type Call = { table: string; op: string; payload?: unknown; options?: unknown; filters: unknown[][] };

// Minimal stand-in for the Supabase query builder: records each query and
// answers selects with incrementing ids.
function fakeSupabase() {
  const calls: Call[] = [];
  let nextId = 1;

  const idColumn: Record<string, string> = {
    sports: 'sport_id',
    leagues: 'league_id',
    sports_events: 'event_id',
    betting_markets: 'market_id',
  };

  const client = {
    from(table: string) {
      const call: Call = { table, op: '', filters: [] };
      calls.push(call);
      let wantsRows = false;

      const builder = {
        upsert(payload: unknown, options: unknown) {
          Object.assign(call, { op: 'upsert', payload, options });
          return builder;
        },
        update(payload: unknown) {
          Object.assign(call, { op: 'update', payload });
          return builder;
        },
        select() {
          wantsRows = true;
          return builder;
        },
        single() {
          return builder;
        },
        eq(...args: unknown[]) {
          call.filters.push(['eq', ...args]);
          return builder;
        },
        not(...args: unknown[]) {
          call.filters.push(['not', ...args]);
          return builder;
        },
        then(resolve: (value: unknown) => void) {
          if (!wantsRows) return resolve({ data: null, error: null });
          if (table === 'teams') {
            const rows = (call.payload as { team_name: string }[]).map((t) => ({ team_id: nextId++, team_name: t.team_name }));
            return resolve({ data: rows, error: null });
          }
          return resolve({ data: { [idColumn[table]]: nextId++ }, error: null });
        },
      };
      return builder;
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

const EVENT: NormalizedEvent = {
  externalId: 'evt1',
  sportKey: 'americanfootball_nfl',
  sportName: 'American Football',
  leagueName: 'NFL',
  homeTeam: 'Kansas City Chiefs',
  awayTeam: 'Buffalo Bills',
  startTime: '2026-10-11T17:00:00Z',
  status: 'Upcoming',
  homeScore: null,
  awayScore: null,
  markets: [
    {
      type: 'moneyline',
      line: null,
      options: [
        { label: 'Kansas City Chiefs', winningCondition: 'Kansas City Chiefs win', team: 'home', decimalOdds: 1.667 },
        { label: 'Buffalo Bills', winningCondition: 'Buffalo Bills win', team: 'away', decimalOdds: 2.25 },
      ],
    },
  ],
};

describe('saveEvent', () => {
  it('upserts the sport, league, teams, event, markets, and options', async () => {
    const { client, calls } = fakeSupabase();

    const counts = await saveEvent(client, EVENT, { sportIds: new Map(), leagueIds: new Map() });

    expect(counts).toEqual({ markets: 1, options: 2 });
    expect(calls.map((c) => `${c.op} ${c.table}`)).toEqual([
      'upsert sports',
      'upsert leagues',
      'upsert teams',
      'upsert sports_events',
      'upsert betting_markets',
      'upsert betting_options',
      'update betting_markets',
    ]);

    // ids: sport=1, league=2, teams=3 (home) and 4 (away), event=5, market=6
    expect(calls[3].payload).toEqual({
      external_id: 'evt1',
      league_id: 2,
      home_team_id: 3,
      away_team_id: 4,
      start_time: '2026-10-11T17:00:00Z',
      status: 'Upcoming',
    });
    expect(calls[4].payload).toEqual({ event_id: 5, market_type_code: 'moneyline', line: null, is_open: true });
    expect(calls[5].payload).toEqual([
      { market_id: 6, option_label: 'Kansas City Chiefs', winning_condition: 'Kansas City Chiefs win', team_id: 3, decimal_odds: 1.667 },
      { market_id: 6, option_label: 'Buffalo Bills', winning_condition: 'Buffalo Bills win', team_id: 4, decimal_odds: 2.25 },
    ]);
    // Markets that weren't in this sync get closed.
    expect(calls[6].filters).toContainEqual(['not', 'market_id', 'in', '(6)']);
  });

  it('reuses cached sport and league ids', async () => {
    const { client, calls } = fakeSupabase();
    const ids = { sportIds: new Map([['American Football', 10]]), leagueIds: new Map([['americanfootball_nfl', 20]]) };

    await saveEvent(client, EVENT, ids);

    expect(calls.some((c) => c.table === 'sports' || c.table === 'leagues')).toBe(false);
  });

  it('closes every market once the event has started and keeps the score', async () => {
    const { client, calls } = fakeSupabase();
    const live: NormalizedEvent = { ...EVENT, status: 'In Progress', homeScore: 7, awayScore: 3 };

    await saveEvent(client, live, { sportIds: new Map(), leagueIds: new Map() });

    const eventCall = calls.find((c) => c.table === 'sports_events')!;
    expect(eventCall.payload).toMatchObject({ status: 'In Progress', home_score: 7, away_score: 3 });

    const marketUpsert = calls.find((c) => c.table === 'betting_markets' && c.op === 'upsert')!;
    expect(marketUpsert.payload).toMatchObject({ is_open: false });

    const close = calls.find((c) => c.table === 'betting_markets' && c.op === 'update')!;
    expect(close.filters.some((f) => f[0] === 'not')).toBe(false);
  });
});

describe('POST /api/sports/sync', () => {
  const request = (auth?: string) =>
    new Request('http://localhost/api/sports/sync', {
      method: 'POST',
      headers: auth ? { Authorization: auth } : {},
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SPORTS_SYNC_SECRET', 'secret');
    vi.stubEnv('CRON_SECRET', '');
    mocks.supabase = {};
    mocks.oddsApi = {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects requests without the sync secret', async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request('Bearer wrong'))).status).toBe(401);
    expect(mocks.syncSports).not.toHaveBeenCalled();
  });

  it('rejects everything when no secret is configured', async () => {
    vi.stubEnv('SPORTS_SYNC_SECRET', '');
    expect((await POST(request('Bearer '))).status).toBe(401);
  });

  it('returns 500 when the Odds API key is missing', async () => {
    mocks.oddsApi = null;
    const response = await POST(request('Bearer secret'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'ODDS_API_KEY is not configured.' });
  });

  it('returns the sync summary', async () => {
    const summary = { events: 4, markets: 12, options: 24, errors: [], quota: { remaining: 490, used: 10 } };
    mocks.syncSports.mockResolvedValue(summary);

    const response = await POST(request('Bearer secret'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
  });

  it('returns 207 when some events failed to save', async () => {
    mocks.syncSports.mockResolvedValue({ events: 1, markets: 0, options: 0, errors: ['boom'], quota: null });
    expect((await POST(request('Bearer secret'))).status).toBe(207);
  });

  it('returns 502 when the provider call fails outright', async () => {
    mocks.syncSports.mockRejectedValue(new Error('Usage quota has been reached'));
    const response = await POST(request('Bearer secret'));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Usage quota has been reached' });
  });
});
