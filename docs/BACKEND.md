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

## Customer accounts (hub + checkout)

Accounts use real credentials instead of the old "any email" demo login. A
person can have several sign-in methods linked to one account (the `identities`
table, `provider` + `provider_user_id` → `user_id`):

- **Email + password** — `POST /api/auth/signup` / `POST /api/auth/login`.
  Passwords are scrypt-hashed (`src/lib/auth/password.ts`, node:crypto, no
  extra dependency), 8-character minimum.
- **Social sign-in** — Google, Apple, Facebook and X. All four go through one
  generic pair of routes, `GET /api/auth/<provider>` →
  `GET|POST /api/auth/<provider>/callback`, driven by a small provider registry
  (`src/lib/auth/providers/`). Each provider is **env-gated** — it only appears
  (on the hub and the checkout gate) once its credentials are set, so the app
  stays mock-first. State cookies guard CSRF; X adds PKCE; Apple returns via
  `form_post` (POST) and its client secret is an ES256 JWT built on the fly.

**Account linking & email.** A social sign-in whose **verified** email matches
an existing account links to it rather than duplicating the person
(`upsertOAuthUser`). X returns no email, so those accounts get a non-routable
`…@placeholder.invalid` address (surfaced as `null`, never shown) and can't be
matched to another provider by email.

**Adding a provider** is a config change: drop a module in
`src/lib/auth/providers/`, register it in `index.ts`, add its env vars. The
routes and the sign-in UI (`ProviderButtons`) pick it up automatically.

Sessions are database rows, not JWTs: the `hub_session` httpOnly cookie holds
a random token whose hash is stored in `sessions` — revocable server-side,
30-day expiry, `secure` in production. Request-side helpers live in
`src/lib/auth/session.ts` (`getHubUser()` is the guard for hub APIs).

The founders' portal keeps its own separate realm (`portal_session`,
env-configured founder accounts) — customers can never reach `/founderhub`.

**The demo founders are development-only, and that is enforced.** With no
`FOUNDER_*` (or `ADMIN_PASSWORD`) configured, `npm run dev` accepts
`founder1@chrgd.dev` / `chrgd-founder-1` so the hub works out of the box. A
production build refuses them: their passwords are in this repo and printed on
the sign-in screen, so honouring them would leave the whole business — the
fulfilment queue, the subscriber list, the switch that arms real supplier
ordering — open to anyone who loaded the page. An unconfigured production deploy
therefore admits *nobody*, and the sign-in screen says so instead of answering a
missing environment variable with "Incorrect email or password".
`founderAuthMode()` is the single source of that state.

### Account gate before subscription checkout

Subscribing requires an account, so the bundle can be saved and managed. When a
signed-out member starts a **subscription** checkout (one-off stays guest), the
stack page shows the `AccountGate`:

- **Email/password** signs in inline (no redirect), then `POST /api/checkout/finalize`
  saves the member's bundle + quiz answers to their account and returns the
  payment URL.
- **Social** can't survive the OAuth redirect with client state, so the order is
  stashed server-side first (`POST /api/checkout/pending`, keyed by a cookie
  token in the `kv` table), the provider round-trip returns to
  `GET /api/checkout/continue`, which finalizes the same way and redirects on to
  Shopify (live) or the hub (mock).

What's stored per subscription: the member's real bundle as a `MemberSubscription`
(built from *their* stack via `buildMemberSubscription`, not the demo blueprint)
plus their quiz answers in the `subscriptions.quiz` column. On next sign-in the
hub loads that real bundle (no demo seed), so they see and manage exactly what
they bought. The live charge still goes through Shopify from server-validated
lines; the stored document is the hub's management view (a Recharge mirror once
that's connected).

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

### Setting up social sign-in

Each provider's redirect URI is `<origin>/api/auth/<provider>/callback`
(provider = `google` | `apple` | `facebook` | `twitter`). Set `APP_URL` to your
public origin when deployed behind a proxy/custom domain. All keys go in
`.env.local` (local) or the Vercel env vars (deployed); see `.env.example`.

- **Google** — Google Cloud console → Credentials → OAuth client (Web
  application). Redirect URI `<origin>/api/auth/google/callback`. Set
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **Facebook** — developers.facebook.com → Facebook Login. Set
  `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. The `email` permission needs
  Facebook **app review** before it works for the public.
- **X / Twitter** — developer.x.com → OAuth 2.0 (Confidential client, PKCE). Set
  `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`. X returns **no email** (see
  above).
- **Apple** — needs a **paid Apple Developer account** and works only over
  **HTTPS** (your live domain, not localhost). Create a Services ID + a Sign in
  with Apple key (.p8). Set `APPLE_CLIENT_ID` (the Services ID), `APPLE_TEAM_ID`,
  `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the .p8 contents; `\n` for newlines is
  fine).

Only the providers you configure appear as buttons — the rest stay hidden, so
you can turn them on one at a time as you get each set of credentials.

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
3. **Set `APP_URL`** to `https://getchrgd.co.uk` — Stripe return URLs, OAuth
   redirects and email links are all built from it (see `docs/DOMAIN_SETUP.md`).
4. **(Optional) Social sign-in:** add the credentials for whichever providers
   you want (see "Setting up social sign-in" above), registering
   `https://getchrgd.co.uk/api/auth/<provider>/callback` as each provider's
   redirect URI. Buttons appear only for configured providers.
5. **Redeploy.** New sign-ups, subscriptions, feedback and portal edits now
   persist across deploys and across serverless instances.

Without `DATABASE_URL` the deploy still works, but data lives in a per-instance
SQLite file that resets on redeploy — fine for a quick preview, not for real
accounts.
