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
| `password-resets.ts` | one-time reset tokens (hashed, single-use, 60-min TTL)   |
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
- **`password_resets`** (v11) — `token_hash`, `user_id`, `expires_at`, `used_at`,
  `created_at`. Hashed for the same reason sessions are; separate from them
  because a reset token is single-use and short-lived, and mixing the two
  lifetimes in one table is how a spent token stays alive. `used_at` holds a
  per-call stamp so two simultaneous callers can tell which of them burnt it.
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

**Forgotten passwords** (`src/lib/auth/reset.ts`) mint a random token, store only
its hash, and burn it in SQL before writing anything — so a link opened twice,
forwarded or replayed can set a password once. Spending one drops every session
the account had, because the reason to reset a password is that somebody else may
know the old one and may already be signed in with it. Every request for a link
answers identically whatever happened; a form that distinguishes an unknown
address from a known one is a way of asking this site whether a given person is a
customer. The partner realm has the same flow over `partner_invites`
(`requestPartnerPasswordReset`), and the Founders Hub — whose accounts come from
environment variables rather than a table — has none, because there is nothing
stored to reset.

The reset email is the one email that never goes through the outbox with its
contents intact: see `src/lib/notify/account.ts`.

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

- **Subscription** — on first sign-in the server seeds the sample subscription,
  **but only where payments resolve to mock** (`seedsDemoSubscription`, override
  `HUB_DEMO_SUBSCRIPTION=off`). That keeps `npm run dev` demoable with no
  credentials without ever showing a real customer a stack, a monthly price and
  delivery dates that were invented for them and then saved to their account.
  Where it doesn't seed, `GET /api/hub/subscription` returns
  `subscription: null` and the hub renders `NoSubscription` — a real state with
  a real screen, not an error. Every hub action (swap, cadence, skip, pause,
  calendar edits…) still runs the pure local mutation, then writes the result
  through `PUT /api/hub/subscription`.
- **Check-in feedback** — each check-in (full form or inline tap) is appended
  via `POST /api/hub/feedback`, so onset-aware advice has history across
  devices and reloads.
- **Portal edits** — product overrides, imports, removals and the backlog now
  live in the `kv` table instead of loose JSON files.

### Setting up social sign-in

> Doing this from the Vercel dashboard rather than reading code? There's a
> click-by-click walkthrough of every provider's console in
> [`docs/SOCIAL_LOGIN_SETUP.md`](SOCIAL_LOGIN_SETUP.md).

Each provider's redirect URI is `<origin>/api/auth/<provider>/callback`
(provider = `google` | `apple` | `facebook` | `microsoft` | `amazon` |
`twitter` | `discord` | `linkedin` | `github`). Set `APP_URL` to your public
origin when deployed behind a proxy/custom domain. All keys go in `.env.local`
(local) or the Vercel env vars (deployed); see `.env.example`.

Every provider below is **free to set up** except Apple, which is the only one
that costs money. Turn them on in whatever order suits — nothing here depends
on anything else.

- **Google** — Google Cloud console → Credentials → OAuth client (Web
  application). Redirect URI `<origin>/api/auth/google/callback`. Set
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **Facebook** — developers.facebook.com → Facebook Login. Set
  `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. The `email` permission needs
  Facebook **app review** before it works for the public.
- **Microsoft** — portal.azure.com → Entra ID → App registrations. Choose
  *"Accounts in any organizational directory and personal Microsoft accounts"*
  so Outlook/Hotmail addresses sign in too. Set `MICROSOFT_CLIENT_ID`,
  `MICROSOFT_CLIENT_SECRET`. A personal account's address is trusted for
  linking; a **work/school** address is only trusted when the tenant proves the
  domain (the `xms_edov` optional claim), because a tenant admin can otherwise
  put any address on a user — including one they don't own.
- **Amazon** — developer.amazon.com → Login with Amazon → Security Profile, then
  add the return URL under Web Settings. Set `AMAZON_CLIENT_ID`,
  `AMAZON_CLIENT_SECRET`.
- **X / Twitter** — developer.x.com → OAuth 2.0 (Confidential client, PKCE). Set
  `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`. X returns **no email** (see
  above).
- **Discord** — discord.com/developers → New Application → OAuth2. Set
  `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`. No review step.
- **LinkedIn** — linkedin.com/developers → your app → Products → *"Sign In with
  LinkedIn using OpenID Connect"*. Set `LINKEDIN_CLIENT_ID`,
  `LINKEDIN_CLIENT_SECRET`. The scopes fail until that product is added.
- **GitHub** — github.com/settings/developers → OAuth Apps. Set
  `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. The account's email comes from a
  second call to `/user/emails`, and only a **primary verified** address is used.
- **Apple** — the one that isn't free: needs a **paid Apple Developer account**
  ($99/yr) and works only over **HTTPS** (your live domain, not localhost).
  Create a Services ID + a Sign in with Apple key (.p8). Set `APPLE_CLIENT_ID`
  (the Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the
  .p8 contents; `\n` for newlines is fine).

Only the providers you configure appear as buttons — the rest stay hidden, so
you can turn them on one at a time as you get each set of credentials. Both
sign-in surfaces (the hub login and the checkout account gate) show the same
list, in the order set by `PROVIDERS` in `src/lib/auth/providers/index.ts`; past
four configured providers the list folds, keeping the first three on screen with
the rest behind "More ways to sign in".

A provider round-trip that fails comes back as `?auth_error=<provider>` and the
hub login says so by name — including when it failed mid-checkout, where the
member lands on the hub signed out.

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

### The functions and the database go in the same region

`vercel.json` pins the functions to `lhr1` (London) because the Neon database is
in `eu-west-2` (London). This is not a preference. Vercel's default region is
`iad1` (Washington DC), and with the database in London that put an ocean
between the app and its data:

| | Functions in `iad1` | Functions in `lhr1` |
|---|---|---|
| One query, before it does anything | **79ms** | ~1–2ms |
| The catalogue read behind every product screen | **661ms** | tens of ms |
| Recounting the quiz funnel (746 events) | **427ms** | tens of ms |

Those are measured numbers from the live site, not estimates — Founders Hub →
Settings → Speed reports them, and it names both regions so a mismatch says so
outright rather than leaving the arithmetic to whoever reads it.

Worse than the per-query cost: opening a Postgres connection is a TCP handshake,
then TLS, then authentication — five or six round trips before the first query,
paid again by every cold-started instance. At 79ms that is most of half a second
of a request that has not started work yet, which is why a hub used in bursts
felt slow on *every* screen rather than on the heavy ones.

**If either side moves, move the other.** A database in `us-east-1` wants
`iad1`; the region here is a pair, and splitting it is invisible in code and
expensive in every request. On a Vercel Hobby plan only one region may be set —
if the `regions` key is ever rejected at build time, the same setting lives in
Project Settings → Functions → Function Region, and a redeploy is needed either
way for it to take effect.
