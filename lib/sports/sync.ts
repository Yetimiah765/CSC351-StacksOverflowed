// Pulls odds and scores from The Odds API and upserts them into the sports
// tables. Run on a schedule via app/api/sports/sync/route.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OddsApiClient, OddsApiQuota, OddsApiSport } from '../oddsApi';
import { normalizeEvents, type NormalizedEvent } from './normalize';

export const DEFAULT_SPORT_KEYS = ['americanfootball_nfl'];

export type SyncSummary = {
  events: number;
  markets: number;
  options: number;
  errors: string[];
  quota: OddsApiQuota | null;
};

export function configuredSportKeys(): string[] {
  const raw = process.env.ODDS_API_SPORTS || '';
  const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);
  return keys.length > 0 ? keys : DEFAULT_SPORT_KEYS;
}

async function expectRow<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await query;
  if (error || !data) throw new Error(`Failed to save ${what}: ${error?.message ?? 'no row returned'}`);
  return data;
}

async function expectOk(query: PromiseLike<{ error: { message: string } | null }>, what: string): Promise<void> {
  const { error } = await query;
  if (error) throw new Error(`Failed to save ${what}: ${error.message}`);
}

export async function saveEvent(
  supabase: SupabaseClient,
  event: NormalizedEvent,
  ids: { sportIds: Map<string, number>; leagueIds: Map<string, number> },
): Promise<{ markets: number; options: number }> {
  let sportId = ids.sportIds.get(event.sportName);
  if (sportId === undefined) {
    const row = await expectRow(
      supabase.from('sports').upsert({ sport_name: event.sportName }, { onConflict: 'sport_name' }).select('sport_id').single(),
      `sport ${event.sportName}`,
    );
    sportId = row.sport_id as number;
    ids.sportIds.set(event.sportName, sportId);
  }

  let leagueId = ids.leagueIds.get(event.sportKey);
  if (leagueId === undefined) {
    const row = await expectRow(
      supabase
        .from('leagues')
        .upsert({ sport_id: sportId, league_name: event.leagueName, odds_api_key: event.sportKey }, { onConflict: 'odds_api_key' })
        .select('league_id')
        .single(),
      `league ${event.leagueName}`,
    );
    leagueId = row.league_id as number;
    ids.leagueIds.set(event.sportKey, leagueId);
  }

  const teams = await expectRow(
    supabase
      .from('teams')
      .upsert(
        [
          { league_id: leagueId, team_name: event.homeTeam },
          { league_id: leagueId, team_name: event.awayTeam },
        ],
        { onConflict: 'league_id,team_name' },
      )
      .select('team_id, team_name'),
    `teams for ${event.externalId}`,
  );
  const teamId = (name: string) => (teams as { team_id: number; team_name: string }[]).find((t) => t.team_name === name)!.team_id;

  const eventRow: Record<string, unknown> = {
    external_id: event.externalId,
    league_id: leagueId,
    home_team_id: teamId(event.homeTeam),
    away_team_id: teamId(event.awayTeam),
    start_time: event.startTime,
    status: event.status,
  };
  // Leave stored scores alone when this response has none.
  if (event.homeScore !== null) eventRow.home_score = event.homeScore;
  if (event.awayScore !== null) eventRow.away_score = event.awayScore;

  const saved = await expectRow(
    supabase.from('sports_events').upsert(eventRow, { onConflict: 'external_id' }).select('event_id').single(),
    `event ${event.externalId}`,
  );
  const eventId = saved.event_id as number;

  // SRS-205.5: wagers are only accepted before the event starts.
  const isOpen = event.status === 'Upcoming';
  const openMarketIds: number[] = [];
  let optionCount = 0;

  for (const market of event.markets) {
    const marketRow = await expectRow(
      supabase
        .from('betting_markets')
        .upsert(
          { event_id: eventId, market_type_code: market.type, line: market.line, is_open: isOpen },
          { onConflict: 'event_id,market_type_code,line' },
        )
        .select('market_id')
        .single(),
      `${market.type} market for ${event.externalId}`,
    );
    const marketId = marketRow.market_id as number;
    if (isOpen) openMarketIds.push(marketId);

    await expectOk(
      supabase.from('betting_options').upsert(
        market.options.map((option) => ({
          market_id: marketId,
          option_label: option.label,
          winning_condition: option.winningCondition,
          team_id: option.team === 'home' ? teamId(event.homeTeam) : option.team === 'away' ? teamId(event.awayTeam) : null,
          decimal_odds: option.decimalOdds,
        })),
        { onConflict: 'market_id,option_label' },
      ),
      `options for ${market.type} market on ${event.externalId}`,
    );
    optionCount += market.options.length;
  }

  // Close every market the bookmaker no longer offers (for example, a spread
  // whose line moved), and all markets once the event has started. Existing
  // wagers keep pointing at the closed market, so nothing is deleted.
  let closeQuery = supabase.from('betting_markets').update({ is_open: false }).eq('event_id', eventId).eq('is_open', true);
  if (openMarketIds.length > 0) closeQuery = closeQuery.not('market_id', 'in', `(${openMarketIds.join(',')})`);
  await expectOk(closeQuery, `closed markets for ${event.externalId}`);

  return { markets: event.markets.length, options: optionCount };
}

export async function syncSports(
  supabase: SupabaseClient,
  oddsApi: OddsApiClient,
  sportKeys: string[] = configuredSportKeys(),
  now: Date = new Date(),
): Promise<SyncSummary> {
  const summary: SyncSummary = { events: 0, markets: 0, options: 0, errors: [], quota: null };

  const { data: allSports } = await oddsApi.listSports();
  const ids = { sportIds: new Map<string, number>(), leagueIds: new Map<string, number>() };

  for (const key of sportKeys) {
    const sport: OddsApiSport | undefined = allSports.find((s) => s.key === key);
    if (!sport) {
      summary.errors.push(`Unknown sport key: ${key}`);
      continue;
    }

    try {
      const odds = await oddsApi.getOdds(key);
      // daysFrom=1 brings back games finished in the last day so their final
      // scores get recorded; run the sync at least once a day.
      const scores = await oddsApi.getScores(key, 1);
      summary.quota = scores.quota;

      for (const event of normalizeEvents(sport, odds.data, scores.data, now)) {
        try {
          const counts = await saveEvent(supabase, event, ids);
          summary.events += 1;
          summary.markets += counts.markets;
          summary.options += counts.options;
        } catch (error) {
          summary.errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      summary.errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return summary;
}
