import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
    // Next 14 caches every server-side fetch() in its Data Cache by default,
    // and supabase-js queries are fetch() calls — so a route Next considers
    // static (e.g. GET /api/players/[playerId]/avatar, which never reads the
    // request) would keep serving its first query result forever. Database
    // reads must always be live. Plain Node (npm run realtime) ignores this.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}

// Browser-safe client for the poker page's Realtime channel. Only
// NEXT_PUBLIC_-prefixed vars reach the client bundle, and the anon key (never
// the service-role key) is the one meant to be shipped to a browser.
//
// Cached as a module-level singleton: createClient() spins up its own
// GoTrueClient/Realtime socket, and React's Strict Mode double-invokes
// effects in dev, so a fresh call per effect run produces multiple
// concurrent clients/sockets fighting over the same channel. One client for
// the lifetime of the page avoids that.
let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  browserClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
  });
  return browserClient;
}
