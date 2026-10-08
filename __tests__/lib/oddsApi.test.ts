import { describe, expect, it, vi } from 'vitest';
import { createOddsApiClient, OddsApiError } from '../../lib/oddsApi';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('Odds API client', () => {
  it('requests decimal odds for moneyline, spreads, and totals', async () => {
    const fetchFn = vi.fn(async () => jsonResponse([], 200, { 'x-requests-remaining': '497', 'x-requests-used': '3' }));
    const client = createOddsApiClient('test-key', fetchFn as unknown as typeof fetch);

    const result = await client.getOdds('americanfootball_nfl');

    const url = new URL((fetchFn.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe('/v4/sports/americanfootball_nfl/odds');
    expect(url.searchParams.get('apiKey')).toBe('test-key');
    expect(url.searchParams.get('markets')).toBe('h2h,spreads,totals');
    expect(url.searchParams.get('oddsFormat')).toBe('decimal');
    expect(url.searchParams.get('regions')).toBe('us');
    expect(result.quota).toEqual({ remaining: 497, used: 3 });
  });

  it('passes daysFrom to the scores endpoint', async () => {
    const fetchFn = vi.fn(async () => jsonResponse([]));
    const client = createOddsApiClient('test-key', fetchFn as unknown as typeof fetch);

    await client.getScores('basketball_nba', 1);

    const url = new URL((fetchFn.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe('/v4/sports/basketball_nba/scores');
    expect(url.searchParams.get('daysFrom')).toBe('1');
  });

  it('throws OddsApiError with the API message on failure', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ message: 'Usage quota has been reached' }, 429));
    const client = createOddsApiClient('test-key', fetchFn as unknown as typeof fetch);

    await expect(client.listSports()).rejects.toMatchObject({
      name: 'OddsApiError',
      status: 429,
      message: 'Usage quota has been reached',
    });
    await expect(client.listSports()).rejects.toBeInstanceOf(OddsApiError);
  });
});
