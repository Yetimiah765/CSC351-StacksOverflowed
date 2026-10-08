// Thin client for The Odds API v4 (https://the-odds-api.com/liveapi/guides/v4/).
// Every call except listSports() costs quota credits, so callers should only
// request the sports they actually show.

const BASE_URL = 'https://api.the-odds-api.com/v4';

export type OddsApiSport = {
  key: string; // e.g. 'americanfootball_nfl'
  group: string; // e.g. 'American Football'
  title: string; // e.g. 'NFL'
  description: string;
  active: boolean;
  has_outrights: boolean;
};

export type OddsApiOutcome = {
  name: string; // team name, 'Draw', 'Over', or 'Under'
  price: number; // decimal odds (we always request oddsFormat=decimal)
  point?: number; // spread or total line
};

export type OddsApiMarketKey = 'h2h' | 'spreads' | 'totals';

export type OddsApiMarket = {
  key: OddsApiMarketKey;
  last_update: string;
  outcomes: OddsApiOutcome[];
};

export type OddsApiBookmaker = {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
};

export type OddsApiEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
};

export type OddsApiScoreEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
  last_update: string | null;
};

export type OddsApiQuota = {
  remaining: number | null;
  used: number | null;
};

export type OddsApiResult<T> = { data: T; quota: OddsApiQuota };

export class OddsApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'OddsApiError';
  }
}

type FetchFn = typeof fetch;

function readQuota(headers: Headers): OddsApiQuota {
  const toNumber = (value: string | null) => (value === null ? null : Number(value));
  return {
    remaining: toNumber(headers.get('x-requests-remaining')),
    used: toNumber(headers.get('x-requests-used')),
  };
}

export function createOddsApiClient(apiKey: string, fetchFn: FetchFn = fetch) {
  async function get<T>(path: string, params: Record<string, string> = {}): Promise<OddsApiResult<T>> {
    const query = new URLSearchParams({ ...params, apiKey });
    const response = await fetchFn(`${BASE_URL}${path}?${query}`, { cache: 'no-store' });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new OddsApiError(body?.message ?? `Odds API request failed (${response.status})`, response.status);
    }

    return { data: (await response.json()) as T, quota: readQuota(response.headers) };
  }

  return {
    // Free: does not use quota.
    listSports() {
      return get<OddsApiSport[]>('/sports');
    },

    // Costs 1 credit per market per region (3 with the default markets).
    getOdds(sportKey: string, markets: OddsApiMarketKey[] = ['h2h', 'spreads', 'totals']) {
      return get<OddsApiEvent[]>(`/sports/${encodeURIComponent(sportKey)}/odds`, {
        regions: 'us',
        markets: markets.join(','),
        oddsFormat: 'decimal',
        dateFormat: 'iso',
      });
    },

    // Costs 2 credits when daysFrom is set (needed to see completed games), 1 otherwise.
    getScores(sportKey: string, daysFrom?: 1 | 2 | 3) {
      const params: Record<string, string> = { dateFormat: 'iso' };
      if (daysFrom) params.daysFrom = String(daysFrom);
      return get<OddsApiScoreEvent[]>(`/sports/${encodeURIComponent(sportKey)}/scores`, params);
    },
  };
}

export type OddsApiClient = ReturnType<typeof createOddsApiClient>;

export function getOddsApiClient(): OddsApiClient | null {
  const apiKey = process.env.ODDS_API_KEY || '';
  return apiKey ? createOddsApiClient(apiKey) : null;
}
