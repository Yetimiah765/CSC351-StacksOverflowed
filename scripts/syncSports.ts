// Pulls the latest odds and scores from The Odds API into Supabase, the same
// work as POST /api/sports/sync but without needing the Next.js server
// running. GitHub Actions runs this on a schedule
// (.github/workflows/sports-sync.yml), and it can be run by hand too.
//
// Run with: npm run sync:sports

import { config as loadEnv } from 'dotenv';
import { getSupabaseClient } from '../lib/supabase';
import { getOddsApiClient } from '../lib/oddsApi';
import { configuredSportKeys, syncSports } from '../lib/sports/sync';

// A standalone Node process doesn't auto-load .env files the way Next does.
// .env.local takes precedence, matching Next's own env-loading order. In
// GitHub Actions there are no env files; the values come from repo secrets.
loadEnv();
loadEnv({ path: '.env.local', override: true });

async function main() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase credentials are not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).');

  const oddsApi = getOddsApiClient();
  if (!oddsApi) throw new Error('ODDS_API_KEY is not configured.');

  const sports = configuredSportKeys();
  console.log(`Syncing ${sports.join(', ')}...`);

  const summary = await syncSports(supabase, oddsApi, sports);
  console.log(`Saved ${summary.events} events, ${summary.markets} markets, ${summary.options} options.`);
  if (summary.quota) console.log(`Odds API credits left this month: ${summary.quota.remaining}`);

  if (summary.errors.length > 0) {
    console.error(`${summary.errors.length} error(s):`);
    for (const error of summary.errors) console.error(`  - ${error}`);
    // A non-zero exit marks the GitHub Actions run as failed so it's noticed.
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
