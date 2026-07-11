/**
 * Versioned schema migrations, shared by both engines. The DDL is written in
 * the dialect intersection (TEXT columns, ISO-8601 timestamps supplied by the
 * app) so each statement runs unchanged on SQLite and Postgres. Append a new
 * entry to alter the schema — never edit an applied one.
 */
export const MIGRATIONS: string[] = [
  // v1 — accounts, sessions, hub state, portal key-value store
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT,
    google_sub    TEXT UNIQUE,
    picture       TEXT,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user_id ON sessions(user_id);

  CREATE TABLE subscriptions (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE feedback (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    payload    TEXT NOT NULL
  );
  CREATE INDEX feedback_user_id ON feedback(user_id);

  CREATE TABLE kv (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  // v2 — multiple linked sign-in identities per user; quiz answers on the
  // subscription. `identities` supersedes the single `users.google_sub` column
  // (kept for back-compat but no longer read); one person can link Google,
  // Apple, Facebook, X, etc. All DDL is dialect-neutral (runs on both engines).
  `
  CREATE TABLE identities (
    provider         TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at       TEXT NOT NULL,
    PRIMARY KEY (provider, provider_user_id)
  );
  CREATE INDEX identities_user_id ON identities(user_id);

  INSERT INTO identities (provider, provider_user_id, user_id, created_at)
    SELECT 'google', google_sub, id, created_at FROM users WHERE google_sub IS NOT NULL;

  ALTER TABLE subscriptions ADD COLUMN quiz TEXT;
  `,
]

/**
 * Domain used for the synthetic email of accounts created via a provider that
 * doesn't return one (X / Twitter). `.invalid` is reserved and non-routable, so
 * it can never collide with or be mistaken for a real address. `hasRealEmail`
 * detects it so the UI shows "no email on file" rather than the placeholder.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = 'placeholder.invalid'

export function hasRealEmail(email: string | null | undefined): boolean {
  return !!email && !email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)
}

/** ISO timestamp used for all created_at / updated_at columns. */
export function now(): string {
  return new Date().toISOString()
}
