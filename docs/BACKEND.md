# Backend database & customer accounts

The durable production-storage pass from the Phase 6 spec ("swap the store impl
for KV/Postgres; real accounts"). Two engines behind one interface: zero-config
SQLite locally, Postgres on serverless — picked automatically, same code.

## The database

The engine is chosen once per process (`src/lib/db/engine.ts`):

- **Postgres** when `DATABASE_URL` (or Vercel's `POSTGRES_URL`) is a
  `postgres://…` string — the durable store on serverless (Vercel + Neon).
- **SQLite** otherwise — zero-config file at `.data/chrgd.db` (created on
  demand, gitignored). `DATABASE_PATH` overrides the location; tests use
  `:memory:` (set in `jest.setup.ts`).

> **Why this matters on Vercel:** serverless functions get an ephemeral
> filesystem, so a SQLite file would silently reset between deploys and
> invocations. Set `DATABASE_URL` to a hosted Postgres and the data persists.

Everything storage-related lives in **`src/lib/db/`**:

| File                 | Owns                                                     |
| -------------------- | -------------------------------------------------------- |
| `engine.ts`          | picks the engine, exposes the async `SqlEngine` surface  |
| `sqlite-engine.ts`   | better-sqlite3 impl (WAL, `PRAGMA user_version`)         |
| `postgres-engine.ts` | `pg` Pool impl (`?`→`$n`, advisory-locked migrations)    |
| `migrations.ts`      | versioned SQL, shared by both engines                    |
| `users.ts`           | customer accounts (password and/or Google identities)    |
| `sessions.ts`        | login sessions (hashed opaque tokens, 30-day TTL)        |
| `hub-data.ts`        | per-account subscription document + check-in feedback    |
| `kv.ts`              | JSON key-value store backing the portal's persistence    |

The repositories only ever talk to the `SqlEngine` interface (async
`get`/`all`/`run` with `?` placeholders). Statements are written in the dialect
intersection so they run unchanged on both engines; the Postgres engine
rewrites `?` to `$1…$n`. Adding another backend is one new `*-engine.ts` file.

### Schema (v1)

- **`users`** — `id`, `email` (unique), `name`, `password_hash` (null for
  Google-only accounts), `google_sub` (unique, null for password-only),
  `picture`, `created_at`.
- **`sessions`** — `token_hash` (SHA-256 of the cookie token, so a leaked DB
  can't be replayed), `user_id`, `created_at`, `expires_at`.
- **`subscriptions`** — one row per user: the full `MemberSubscription` JSON.
  The hub's mutation helpers are pure functions over that document, so the row
  is simply the latest result. When Recharge is connected this becomes a
  cache/mirror of the real contract.
- **`feedback`** — append-only check-ins (`FeedbackCheckIn` JSON per row).
- **`kv`** — the portal's persistence (`portal:products`, `portal:settings`,
  `portal:backlog`). `src/lib/portal/persist.ts` keeps its `readJson`/`writeJson`
  surface; legacy `.data/*.json` snapshots are migrated into the table on first
  read.

Migrations are plain SQL strings in `migrations.ts` (`MIGRATIONS`); append a new
entry to alter the schema. SQLite tracks the applied version in
`PRAGMA user_version`; Postgres tracks it in a `schema_migrations` table and
guards the run with an advisory lock so concurrent cold-starting lambdas can't
race applying DDL.

### Serverless-safe portal state

The portal's data-source toggle and pricing overrides feed **synchronous**
module state the whole app reads (`data-source.ts`, `stack-blueprint/pricing`).
On a single long-lived server that's set once; on serverless a different
instance may not have seen the latest portal edit. So the portal store persists
those settings to the `kv` table and `syncPortalRuntime()` hydrates the module
state from the DB at the start of the request paths that depend on it
(catalogue, config, cart, subscribe, portal writes), with a short TTL to keep
hot paths cheap. Product overrides/imports/removals and the backlog are read
straight from the DB per request.

## Customer accounts (hub)

The hub (`/hub`) now uses real accounts instead of the "any email" demo login.
Two ways in, both landing in the same `users` row:

- **Email + password** — `POST /api/auth/signup` / `POST /api/auth/login`.
  Passwords are scrypt-hashed (`src/lib/auth/password.ts`, node:crypto, no
  extra dependency), 8-character minimum.
- **Google OAuth** — `GET /api/auth/google` → Google consent →
  `GET /api/auth/google/callback`. Hand-rolled authorization-code flow
  (`src/lib/auth/google.ts`) with a CSRF state cookie. Enabled only when
  `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set — the hub hides the
  button otherwise (mock-first). A Google sign-in whose **verified** email
  matches an existing password account links to it rather than duplicating
  the person.

Sessions are database rows, not JWTs: the `hub_session` httpOnly cookie holds
a random token whose hash is stored in `sessions` — revocable server-side,
30-day expiry, `secure` in production. Request-side helpers live in
`src/lib/auth/session.ts` (`getHubUser()` is the guard for hub APIs).

The founders' portal keeps its own separate realm (`portal_session`,
env-configured founder accounts) — customers can never reach `/portal`.

### What persists per account

- **Subscription** — on first sign-in the server seeds the sample subscription
  (previous demo behaviour, now durable). Every hub action (swap, cadence,
  skip, pause, calendar edits…) still runs the pure local mutation, then
  writes the result through `PUT /api/hub/subscription`.
- **Check-in feedback** — each check-in (full form or inline tap) is appended
  via `POST /api/hub/feedback`, so onset-aware advice has history across
  devices and reloads.
- **Portal edits** — product overrides, imports, removals and the backlog now
  live in the `kv` table instead of loose JSON files.

### Setting up Google sign-in

1. Google Cloud console → APIs & Services → Credentials → Create OAuth client
   (type: Web application).
2. Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
   (plus the production origin's equivalent).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`.
4. Deployed behind a proxy/custom domain, set `APP_URL` to the public origin.

## Deploying on Vercel

The app already runs on Vercel as a serverless site. To make accounts and hub
state persist there, add a Postgres database — everything else is code that's
already in place.

1. **Create the database.** Vercel project → **Storage** → **Create Database**
   → **Neon (Postgres)** (free tier is fine) → **Connect** it to the project.
   Vercel injects `DATABASE_URL` / `POSTGRES_URL` automatically; the app detects
   it and uses Postgres. Migrations run on the first request after deploy.
2. **Set the founder login** so the portal isn't on the public demo password:
   `FOUNDER_1_EMAIL` / `FOUNDER_1_PASSWORD` (Settings → Environment Variables).
3. **(Optional) Google sign-in:** add `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, and `APP_URL=https://<your-domain>` — and register
   `https://<your-domain>/api/auth/google/callback` as the redirect URI.
4. **Redeploy.** New sign-ups, subscriptions, feedback and portal edits now
   persist across deploys and across serverless instances.

Without `DATABASE_URL` the deploy still works, but data lives in a per-instance
SQLite file that resets on redeploy — fine for a quick preview, not for real
accounts.
