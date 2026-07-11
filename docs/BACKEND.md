# Backend database & customer accounts

The durable production-storage pass from the Phase 6 spec ("swap the store impl
for KV/Postgres; real accounts") — implemented mock-first: everything works
locally with zero configuration, and the deploy-time upgrades are single seams.

## The database

SQLite via `better-sqlite3`, file at `.data/chrgd.db` (created on demand,
gitignored — same directory the legacy JSON snapshots used). Override the
location with `DATABASE_PATH`; tests run against `:memory:`
(set in `jest.setup.ts`).

Everything storage-related lives in **`src/lib/db/`**:

| File          | Owns                                                        |
| ------------- | ----------------------------------------------------------- |
| `client.ts`   | connection, WAL mode, versioned migrations (`user_version`) |
| `users.ts`    | customer accounts (password and/or Google identities)       |
| `sessions.ts` | login sessions (hashed opaque tokens, 30-day TTL)           |
| `hub-data.ts` | per-account subscription document + check-in feedback       |
| `kv.ts`       | JSON key-value store backing the portal's persistence       |

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
- **`kv`** — the portal's persistence (`portal:products`, `portal:backlog`, …).
  `src/lib/portal/persist.ts` keeps its `readJson`/`writeJson` surface; legacy
  `.data/*.json` snapshots are migrated into the table on first read.

Migrations are plain SQL strings in `client.ts` (`MIGRATIONS`); append a new
entry to alter the schema — each opens in a transaction and bumps
`PRAGMA user_version`.

### Postgres upgrade path

`src/lib/db/` is the only place that knows the engine. The repositories already
have async signatures, so the swap is re-implementing those five files against
a `pg` pool / Neon / Supabase `DATABASE_URL` — no caller changes. One nuance:
`kv.ts` is synchronous because the portal store hydrates at module load; on
Postgres, make `persist.ts` hydrate asynchronously behind the same call sites.

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
