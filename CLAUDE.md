# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm run dev        # start dev server (http://localhost:3000)
npm run realtime   # start the poker realtime relay process (connects to Supabase Realtime), separate process
npm run build      # production build
npm test           # run all tests (vitest)
npx vitest run __tests__/api/auth.test.ts   # run a single test file
```

## Environment setup

Copy `.env.example` to `.env.local` and fill in your Supabase credentials before running the app. `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are read by `lib/supabase.ts` — either URL prefix works. Use the service-role key, not the anon key: none of the tables below have Row Level Security policies, and the auth routes read `players.password_hash` directly, so the anon key must not be relied on to protect that data. The browser, however, needs its own `NEXT_PUBLIC_SUPABASE_ANON_KEY` (distinct from the server-only `SUPABASE_ANON_KEY`) for the poker page's Realtime connection — only `NEXT_PUBLIC_`-prefixed vars reach the client bundle, and the anon key (never the service-role key) is the one meant to be shipped there.

## Architecture

This is a Next.js 14 App Router project with Tailwind CSS, backed directly by the Postgres schema in `supabase/schema.sql` (no Supabase Auth — see below). The poker room additionally runs its own Node process (`server/pokerRealtimeServer.ts`) that relays table state through a Supabase Realtime channel (Broadcast + Presence), separate from Next's HTTP server, matching `docs/architecture/C2.mmd`.

**Auth and profile data model:**
The schema (`supabase/schema.sql`) has no email column and no link to Supabase's built-in `auth.users` — it is entirely username/password based:
- `players` — one row per account: `player_id`, `first_name`, `last_name`, `birthday`, `password_hash`, `balance`, `bio`, `profile_photo` (BYTEA, PNG only), `account_status`.
- `usernames` — a player's username lives here, not as a column on `players`, so that a changed username can stay reserved for 24 hours (`is_current` / `reserved_until`).
- `player_sessions` — one row per player (`player_id` is UNIQUE), holding a hash of that player's current session token; a new login overwrites it, which is how a second login invalidates the first.

**Request flow for auth:**
1. `app/register/page.tsx` and `app/login/page.tsx` are `'use client'` forms that POST to the API routes via `fetch`.
2. `app/api/auth/register/route.ts` validates the SRS-101/102 field rules (names, username shape, password shape, minimum age — see `lib/auth.ts`), hashes the password with bcrypt, inserts into `players`, then inserts the username into `usernames`. If the username insert fails (lost a uniqueness race), the route deletes the just-created `players` row by hand, since two separate PostgREST calls can't share a transaction.
3. `app/api/auth/login/route.ts` looks up the current username (case-insensitively) in `usernames`, verifies the password against `players.password_hash` with bcrypt, rejects a `Pending Deletion` account, then generates a random session token, stores its SHA-256 hash in `player_sessions` (upsert on `player_id`, so logging in elsewhere invalidates the old session), and returns the raw token to the client.
4. The client stores that token in `localStorage` under `player_token` and sends it as `Authorization: Bearer <token>` on `/api/profile`, `/api/profile/avatar`, and `/api/profile/balance`. Those routes resolve it back to a `player_id` via `getPlayerIdForToken()` in `lib/auth.ts`, which hashes the token and looks it up in `player_sessions`. `POST /api/auth/logout` (the profile page's Log out button, SRS-105.1) deletes the `player_sessions` row matching the token's hash, and the client then clears `player_token`.
5. `lib/supabase.ts` — `getSupabaseClient()` returns `null` when env vars are missing; every route guards against this and returns a 500.

**Profile:**
- `GET`/`PATCH /api/profile` read and update `players` + the current row in `usernames`. There is no "create profile" step — registration already creates the full `players` row, so `PATCH` only edits `bio` for now (SRS-114.1/114.2: optional, 50 words max, empty stored as `NULL`).
- `POST /api/profile/avatar` validates the upload is a PNG by file signature (not filename) and ≤5MB (SRS-115.1/115.3), then writes it straight into `players.profile_photo` as a Postgres hex-encoded bytea string. Both this route and `GET /api/profile` convert that column to a `data:image/png;base64,...` URL for the client — there is no Supabase Storage bucket.

**Home page and nav bar:**
- `lib/games.ts` is the single list of games on the home page (SRS-107.1), rendered by `components/GameGrid.tsx`. A game with `href: null` shows a disabled "Coming soon" button; setting `href` to the game's route turns it into a Play button, which sends guests to `/login` instead (SRS-108.3).
- `components/NavBar.tsx` is rendered on every page by `app/layout.tsx`: Home and a cart (linking to the `/shop` placeholder) on the left, the balance and a profile icon on the right. It re-reads `player_token` on every navigation and fetches `GET /api/profile/balance`, which returns only `{ balance }` because the full profile's photo can be several MB. Guests see 0 coins (SRS-109.4) and the profile icon links to `/login`; a 401 clears the stale token.
- The nav bar is `h-14`, so pages use `min-h-page` (defined in `tailwind.config.js` as the window height minus 3.5rem) instead of `min-h-screen`.

**Poker (sprint 1 — join/leave only):**
- `lib/pokerTable.ts` is a pure, DB-free `PokerTable` class: join an open seat, leave a seat, enforce the seat cap. Seats are keyed by `player_id` (a string), not a transport-level connection id. It does **not** persist to `poker_tables`/`poker_seats` yet — that's deferred to a later sprint (buy-ins, chip stacks, and hand logic live in those tables and are out of scope for the simple join/leave demo).
- `lib/pokerRealtime.ts` holds the Supabase Realtime wire contract shared by the server and the client: the channel name (`poker:table-1`), event names, and the `PokerActionPayload`/`PokerAckPayload` types.
- `server/pokerRealtimeServer.ts` wraps one in-memory `PokerTable` in a standalone Node process (`npm run realtime`) that subscribes to that channel — no HTTP server, no port, since all traffic is an outbound connection to Supabase's hosted Realtime relay (this is what lets players on different laptops/networks join without any inbound port-forwarding). Unlike Next, this process doesn't auto-load env files, so it calls `dotenv`'s `config()` for `.env` and `.env.local` itself before reading `SUPABASE_*`. Clients send a broadcast event named `action` with `{ requestId, action: 'join' | 'leave' | 'sync', connectionId, token? }`. Joining is gated on a real session exactly as before: the server resolves `token` to a `player_id` via `getPlayerIdForToken()`, then looks up that player's own username via `getPlayerUsername()` (`lib/playerDisplay.ts`) rather than trusting anything the client claims about itself, and replies with an `ack` broadcast `{ requestId, ok, error?, seatNumber? }` that the client correlates by `requestId` (Realtime broadcast has no request/reply primitive, so this emulates one). A `Map<connectionId, playerId>` — populated only from a server-validated `join`, never from anything the client asserts directly — replaces the old per-socket map; Realtime Presence `leave` events (keyed by that same `connectionId`, which the client starts tracking only after a successful join) free the seat the same way a dropped Socket.io connection used to. `state` (full `table.getState()`) is broadcast to everyone after every successful join/leave, and also re-broadcast whenever any client sends a `sync` action — since broadcast has no "send to just this one late-joining client" primitive, a freshly-subscribed client requests its own snapshot instead of the server pushing one unprompted. Seats carry only a username, never a profile photo: Realtime broadcast has a payload size limit a multi-MB photo can blow past, which silently drops the whole `state` message for everyone — see `GET /api/players/[playerId]/avatar` below.
- `app/poker/page.tsx` requires a signed-in player before showing the table at all (same "must be logged in" gate as `app/profile/page.tsx`): it loads the player's own profile via `GET /api/profile`, then subscribes to the same Realtime channel via `getSupabaseBrowserClient()` (`lib/supabase.ts`, a module-level singleton — `createClient()` isn't memoized by Supabase itself, and React Strict Mode's double-invoked effects in dev would otherwise spin up multiple concurrent Realtime sockets) and sends the player's `player_token` — never a free-typed username — on a `join` action. As seats appear in `table:state`, the page separately fetches each occupant's avatar via `GET /api/players/[playerId]/avatar` and caches it client-side by `player_id`, rendering it once it arrives (or an initial-letter fallback until then / if there is none), matching SRS-8.1/8.2.
- `GET /api/players/[playerId]/avatar` returns `{ avatarUrl }` for any player_id, unauthenticated — a seated player's avatar is public to anyone viewing the table, the same as their username (SRS-8.1). This is how the poker page gets avatars now that they're no longer carried through the Realtime broadcast.
- `lib/playerDisplay.ts` holds `photoToDataUrl()` (bytea → `data:image/png;base64,...`), `getPlayerDisplay()` (username + photo, used by `app/api/profile/route.ts` and the avatar route), and `getPlayerUsername()` (username only, used by the poker realtime server's join handler so it never pulls the photo column into a hot path).

**Tests (`__tests__/`):**
- Vitest with `environment: 'node'`.
- `lib/supabase` is mocked via `vi.mock` in the API route tests; `lib/auth.ts` is left unmocked so real bcrypt hashing/verification and session-token hashing are exercised. Tests import route handler functions directly and call them with `new Request(...)`.
- The Supabase mock in each test file is a small fake query builder (per-table, chainable, thenable) rather than a single fixed response — see the comment at the top of `__tests__/api/auth.test.ts` for the shape, since several routes chain `.select()/.eq()/.ilike()/.maybeSingle()` or await an `.insert()/.update()/.upsert()` directly without `.select()`.
- `lib/pokerTable.ts` is pure and unit-tested directly with no mocking.
- Tests live in `__tests__/` and are matched by the glob `__tests__/**/*.test.ts`.
