// Pulls the latest odds and scores from The Odds API into Supabase, then
// settles and pays out any wagers whose games are now decided (SRS-209,
// SRS-210). The same work as POST /api/sports/sync, but without needing the
// Next.js server running. GitHub Actions runs this on a schedule
// (.github/workflows/sports-sync.yml), and it can be run by hand too.
//
// Run with: npm run sync:sports
//   Add `-- --odds-only` to skip fetching scores (saves 2 credits per sport).

import { config as loadEnv } from 'dotenv';
import { getSupabaseClient } from '../lib/supabase';
import { getOddsApiClient } from '../lib/oddsApi';
import { configuredSportKeys, syncSports } from '../lib/sports/sync';
import { settleWagers } from '../lib/sports/settle';

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
  const includeScores = !process.argv.includes('--odds-only');
  console.log(`Syncing ${includeScores ? 'odds and scores' : 'odds only'} for ${sports.join(', ')}...`);

  const summary = await syncSports(supabase, oddsApi, sports, new Date(), { includeScores });
  console.log(`Saved ${summary.events} events, ${summary.markets} markets, ${summary.options} options.`);
  if (summary.skipped.length > 0) console.log(`Skipped (not in season): ${summary.skipped.join(', ')}`);
  if (summary.quota) console.log(`Odds API credits left this month: ${summary.quota.remaining}`);

  // Settle even if part of the sync failed: scores saved earlier still count.
  const settled = await settleWagers(supabase);
  console.log(
    `Settled ${settled.settled} wager(s): ${settled.won} won, ${settled.lost} lost, ${settled.refunded} refunded.`,
  );

  const errors = [...summary.errors, ...settled.errors];
  if (errors.length > 0) {
    console.error(`${errors.length} error(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    // A non-zero exit marks the GitHub Actions run as failed so it's noticed.
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
