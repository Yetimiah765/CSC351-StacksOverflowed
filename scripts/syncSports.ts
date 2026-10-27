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
import { getOddsApiClient, getSecondOddsApiClient } from '../lib/oddsApi';
import { configuredSportKeys, mergeSyncSummaries, secondSportKeys, syncSports, type SyncSummary } from '../lib/sports/sync';
import { settleWagers } from '../lib/sports/settle';
import { selectShowdowns, settleShowdowns } from '../lib/sports/showdown';
import { notifyShowdownChanged } from '../lib/sports/showdownRealtime';

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

  const includeScores = !process.argv.includes('--odds-only');
  // Each key syncs its own sports on its own credits; the second is optional.
  const feeds = [{ name: 'ODDS_API_KEY', client: oddsApi, sports: configuredSportKeys() }];
  const second = getSecondOddsApiClient();
  if (second) feeds.push({ name: 'ODDS_API_KEY_2', client: second, sports: secondSportKeys() });

  let summary: SyncSummary | null = null;
  for (const feed of feeds) {
    console.log(`Syncing ${includeScores ? 'odds and scores' : 'odds only'} for ${feed.sports.join(', ')}...`);
    const result = await syncSports(supabase, feed.client, feed.sports, new Date(), { includeScores });
    console.log(`Saved ${result.events} events, ${result.markets} markets, ${result.options} options.`);
    if (result.skipped.length > 0) console.log(`Skipped (not in season): ${result.skipped.join(', ')}`);
    if (result.quota) console.log(`${feed.name} credits left this month: ${result.quota.remaining}`);
    summary = summary ? mergeSyncSummaries(summary, result) : result;
  }
  if (!summary) return;

  // Settle even if part of the sync failed: scores saved earlier still count.
  const settled = await settleWagers(supabase);
  console.log(
    `Settled ${settled.settled} wager(s): ${settled.won} won, ${settled.lost} lost, ${settled.refunded} refunded.`,
  );

  // The Showdown (SRS-212 - SRS-214): pay out finished ones, then give each
  // sport a new one once its last game has started.
  const showdowns = await settleShowdowns(supabase);
  console.log(`Settled ${showdowns.settled} Showdown(s), refunded ${showdowns.refunded}.`);
  const picked = await selectShowdowns(supabase);
  for (const pick of picked.picked) console.log(`New ${pick.sport} Showdown: event ${pick.eventId}`);
  // Live update for anyone on the Showdown page.
  if (showdowns.settled + showdowns.refunded > 0 || picked.picked.length > 0) {
    await notifyShowdownChanged(supabase, {
      showdownId: null,
      reason: showdowns.settled + showdowns.refunded > 0 ? 'settled' : 'picked',
    });
  }

  const errors = [...summary.errors, ...settled.errors, ...showdowns.errors, ...picked.errors];
  if (errors.length > 0) {
    console.error(`${errors.length} error(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    // A non-zero exit marks the GitHub Actions run as failed so it's noticed.
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  // Exit once the work is done: an idle HTTPS connection left open by the
  // Realtime ping would otherwise keep Node running for another minute. The
  // short wait lets closing connections finish first, since exiting mid-close
  // crashes Node on Windows.
  .finally(() => setTimeout(() => process.exit(), 250));
