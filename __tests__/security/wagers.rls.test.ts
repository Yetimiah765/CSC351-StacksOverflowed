/**
 * Row Level Security attack tests for `wagers`, the sports betting table that
 * holds every bet: who placed it, how many coins, the odds, and what it paid.
 *
 * Modelled on brockenbrough/security-starter-rls-v1 (rls-suite.ts), changed
 * for this app. These tests talk to a REAL Supabase project, nothing mocked.
 * They act like an attacker who has only what every browser gets: the
 * project URL and the public anon key. Each test asserts the SECURE outcome,
 * so it fails (red) while the attack works and passes once RLS stops it.
 *
 * This app doesn't use Supabase Auth (players log in through our own
 * player_sessions tokens, and our API routes reach the database with the
 * service-role key, which bypasses RLS). But Supabase Auth is still switched
 * on for every project, and the public key can sign up to it, so an attacker
 * can reach the database in two ways, and both are tested:
 *   - a visitor who isn't logged in               (Postgres role `anon`)
 *   - a stranger who signed up to Supabase Auth   (Postgres role `authenticated`)
 * No real player is ever `authenticated`, so neither should see a single bet.
 *
 * Run with:  npm run test:security
 * By default it runs against the app's own project (SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). To run it
 * somewhere else, such as a scratch project built from supabase/schema.sql,
 * set RLS_TEST_SUPABASE_URL, RLS_TEST_SUPABASE_ANON_KEY and
 * RLS_TEST_SUPABASE_SERVICE_ROLE_KEY.
 *
 * Only the setup and the checks use the service-role key (it plays the
 * database administrator, as in the starter repo). Every attack uses the
 * anon key. The setup creates its own game, two players and one Supabase
 * Auth user, every attack aims only at those rows, and everything is deleted
 * at the end. The game is dated in 2000 and Canceled, so it never shows on
 * the sportsbook, in a Showdown or on the leaderboard while the tests run.
 * Tell the team before running it against the shared database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// --- Credentials from .env.local / .env (real values, not mocks) -----------
for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const URL = env.RLS_TEST_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = env.RLS_TEST_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = env.RLS_TEST_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';

const TABLE = 'wagers';
const PASSWORD = 'Rls-Test-Password-123!';
const STAKE = 500;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** The role a JWT-style Supabase key carries ('anon', 'service_role'), or null for other key formats. */
function keyRole(key: string): string | null {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role ?? null;
  } catch {
    return null;
  }
}

type Attacker = { name: string; role: string; client: () => Promise<SupabaseClient> };

describe(`RLS on "${TABLE}": nobody outside our server can see or touch a bet`, () => {
  const runId = Math.random().toString(36).slice(2, 8);
  let admin: SupabaseClient; // service role: bypasses RLS; sets up and checks the real data
  let strangerAuthId: string | null = null;
  let strangerClient: SupabaseClient | null = null;

  // What the test creates, so afterAll can remove exactly that.
  let sportId: number, leagueId: number, eventId: number, optionId: number;
  let aliceId: number; // the victim, with an open bet
  let bobId: number; // the player an attacker tries to bet as
  let aliceWagerId: number;

  const anon = () => createClient(URL, ANON_KEY, noSession);

  // The untyped client gives rows no shape, so the ids are read off `any`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function inserted(query: PromiseLike<{ data: any; error: { message: string } | null }>, what: string): Promise<any> {
    const { data, error } = await query;
    if (error || data === null) {
      throw new Error(`Could not create ${what}: ${error?.message}`);
    }
    return data;
  }

  async function aliceWager() {
    const { data } = await admin.from(TABLE).select('*').eq('wager_id', aliceWagerId).maybeSingle();
    return data;
  }

  beforeAll(async () => {
    if (!URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
      throw new Error(
        'Missing Supabase credentials. Set SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and ' +
          'SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example).',
      );
    }
    // The attacks must use the public key. With the service-role key they'd
    // skip RLS and prove nothing.
    if (keyRole(ANON_KEY) === 'service_role' || ANON_KEY.startsWith('sb_secret_')) {
      throw new Error('The key the attacks use is a service-role key. They must use the public anon key.');
    }
    admin = createClient(URL, SERVICE_ROLE_KEY, noSession);

    // A game with one moneyline option to bet on.
    sportId = (await inserted(admin.from('sports').insert({ sport_name: `RLS Sport ${runId}` }).select('sport_id').single(), 'a sport')).sport_id;
    leagueId = (await inserted(admin.from('leagues').insert({ sport_id: sportId, league_name: `RLS League ${runId}` }).select('league_id').single(), 'a league')).league_id;
    const teams = await inserted(
      admin.from('teams').insert([
        { league_id: leagueId, team_name: `RLS Home ${runId}` },
        { league_id: leagueId, team_name: `RLS Away ${runId}` },
      ]).select('team_id').order('team_id'),
      'two teams',
    );
    eventId = (await inserted(
      admin.from('sports_events').insert({
        league_id: leagueId,
        home_team_id: teams[0].team_id,
        away_team_id: teams[1].team_id,
        // Long past and called off: off the sportsbook, Showdowns and leaderboard.
        start_time: '2000-01-01T00:00:00Z',
        status: 'Canceled',
      }).select('event_id').single(),
      'a game',
    )).event_id;
    const marketId = (await inserted(
      admin.from('betting_markets').insert({ event_id: eventId, market_type_code: 'moneyline' }).select('market_id').single(),
      'a betting market',
    )).market_id;
    optionId = (await inserted(
      admin.from('betting_options').insert({
        market_id: marketId,
        option_label: `RLS Home ${runId}`,
        winning_condition: 'Home team wins',
        team_id: teams[0].team_id,
        decimal_odds: 2.5,
      }).select('option_id').single(),
      'a betting option',
    )).option_id;

    // Two players. Our players aren't Supabase Auth users, just rows.
    const player = (first: string) => ({ first_name: first, last_name: 'Rlstest', birthday: '1990-01-01', password_hash: 'not-a-real-hash' });
    aliceId = (await inserted(admin.from('players').insert(player('Alice')).select('player_id').single(), 'Alice')).player_id;
    bobId = (await inserted(admin.from('players').insert(player('Bob')).select('player_id').single(), 'Bob')).player_id;

    // The stranger: anyone can sign up to the project's Supabase Auth with
    // the public key. (Created confirmed here, as their own inbox would.)
    const email = `rls-stranger-${runId}@example.com`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`Could not create the stranger: ${created.error?.message}`);
    strangerAuthId = created.data.user.id;
    const signedIn = await anon().auth.signInWithPassword({ email, password: PASSWORD });
    if (signedIn.error || !signedIn.data.session) throw new Error(`Could not sign the stranger in: ${signedIn.error?.message}`);
    strangerClient = createClient(URL, ANON_KEY, {
      ...noSession,
      global: { headers: { Authorization: `Bearer ${signedIn.data.session.access_token}` } },
    });
  });

  // Every test starts from the same state: Alice has one open bet and Bob has
  // none, so an attack that worked in one test can't make a later one pass.
  beforeEach(async () => {
    await admin.from(TABLE).delete().in('player_id', [aliceId, bobId]);
    aliceWagerId = (await inserted(
      admin.from(TABLE).insert({ player_id: aliceId, option_id: optionId, amount: STAKE, odds_at_placement: 2.5 }).select('wager_id').single(),
      "Alice's bet",
    )).wager_id;
  });

  afterAll(async () => {
    if (!admin) return;
    if (aliceId || bobId) await admin.from('players').delete().in('player_id', [aliceId, bobId].filter(Boolean)); // cascades to their bets
    if (eventId) await admin.from('sports_events').delete().eq('event_id', eventId); // cascades to markets and options
    if (leagueId) await admin.from('teams').delete().eq('league_id', leagueId);
    if (leagueId) await admin.from('leagues').delete().eq('league_id', leagueId);
    if (sportId) await admin.from('sports').delete().eq('sport_id', sportId);
    if (strangerAuthId) await admin.auth.admin.deleteUser(strangerAuthId);
  });

  const attackers: Attacker[] = [
    { name: 'a visitor who is not logged in', role: 'anon', client: async () => anon() },
    { name: 'a stranger signed up to Supabase Auth', role: 'authenticated', client: async () => strangerClient! },
  ];

  for (const attacker of attackers) {
    describe(`as ${attacker.name} (${attacker.role})`, () => {
      it('cannot list bets', async () => {
        const { data } = await (await attacker.client()).from(TABLE).select('*').in('player_id', [aliceId, bobId]);
        expect(
          data ?? [],
          `LEAK: ${attacker.name}, holding only the public key, read ${data?.length} bet(s) from ${TABLE}.`,
        ).toHaveLength(0);
      });

      it("cannot read Alice's bet", async () => {
        const { data } = await (await attacker.client()).from(TABLE).select('amount, payout, odds_at_placement').eq('wager_id', aliceWagerId);
        expect(data ?? [], `LEAK: ${attacker.name} read Alice's bet: ${JSON.stringify(data?.[0])}`).toHaveLength(0);
      });

      it("cannot turn Alice's open bet into a big win", async () => {
        await (await attacker.client())
          .from(TABLE)
          .update({ result: 'Won', payout: STAKE * 1000, settled_at: new Date().toISOString() })
          .eq('wager_id', aliceWagerId);
        const after = await aliceWager();
        expect(after?.result ?? null, `TAMPERING: ${attacker.name} settled Alice's bet as a win paying ${after?.payout}.`).toBeNull();
      });

      it("cannot place a free bet in Bob's name", async () => {
        await (await attacker.client())
          .from(TABLE)
          .insert({ player_id: bobId, option_id: optionId, amount: 100000, odds_at_placement: 50 });
        const { data } = await admin.from(TABLE).select('wager_id').eq('player_id', bobId);
        expect(data ?? [], `IMPERSONATION: ${attacker.name} placed a bet as Bob without his coins being taken.`).toHaveLength(0);
      });

      it("cannot delete Alice's bet", async () => {
        await (await attacker.client()).from(TABLE).delete().eq('wager_id', aliceWagerId);
        expect(await aliceWager(), `DESTRUCTION: ${attacker.name} deleted Alice's bet.`).not.toBeNull();
      });
    });
  }
});
