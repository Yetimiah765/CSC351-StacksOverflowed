# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm run dev        # start dev server (http://localhost:3000)
npm run socket     # start the poker Socket.io server (http://localhost:4001), separate process
npm run build      # production build
npm test           # run all tests (vitest)
npx vitest run __tests__/api/auth.test.ts   # run a single test file
```

## Environment setup

Copy `.env.example` to `.env.local` and fill in your Supabase credentials before running the app. `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are read by `lib/supabase.ts` — either URL prefix works. Use the service-role key, not the anon key: none of the tables below have Row Level Security policies, and the auth routes read `players.password_hash` directly, so the anon key must not be relied on to protect that data.

## Architecture

This is a Next.js 14 App Router project with Tailwind CSS, backed directly by the Postgres schema in `supabase/schema.sql` (no Supabase Auth — see below). The poker room additionally runs its own Socket.io process (`server/pokerSocketServer.ts`), separate from Next's HTTP server, matching `docs/architecture/C2.mmd`.

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
- `lib/pokerTable.ts` is a pure, DB-free `PokerTable` class: join an open seat, leave a seat, enforce the seat cap. It does **not** persist to `poker_tables`/`poker_seats` yet — that's deferred to a later sprint (buy-ins, chip stacks, and hand logic live in those tables and are out of scope for the simple join/leave demo).
- `server/pokerSocketServer.ts` wraps one in-memory `PokerTable` in a standalone Socket.io server (`npm run socket`), broadcasting `table:state` to every connected client on `table:join`/`table:leave`/`disconnect`.
- `app/poker/page.tsx` is the client UI, connecting via `socket.io-client` to `NEXT_PUBLIC_POKER_SOCKET_URL`.

**Tests (`__tests__/`):**
- Vitest with `environment: 'node'`.
- `lib/supabase` is mocked via `vi.mock` in the API route tests; `lib/auth.ts` is left unmocked so real bcrypt hashing/verification and session-token hashing are exercised. Tests import route handler functions directly and call them with `new Request(...)`.
- The Supabase mock in each test file is a small fake query builder (per-table, chainable, thenable) rather than a single fixed response — see the comment at the top of `__tests__/api/auth.test.ts` for the shape, since several routes chain `.select()/.eq()/.ilike()/.maybeSingle()` or await an `.insert()/.update()/.upsert()` directly without `.select()`.
- `lib/pokerTable.ts` is pure and unit-tested directly with no mocking.
- Tests live in `__tests__/` and are matched by the glob `__tests__/**/*.test.ts`.
