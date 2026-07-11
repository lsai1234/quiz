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
]

/** ISO timestamp used for all created_at / updated_at columns. */
export function now(): string {
  return new Date().toISOString()
}
