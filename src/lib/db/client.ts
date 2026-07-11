/**
 * Backend database — SQLite via better-sqlite3.
 *
 * The durable store behind accounts, sessions, subscriptions, feedback and the
 * portal's key-value persistence. Zero-config: the file lives at
 * `.data/chrgd.db` (already gitignored alongside the legacy JSON snapshots),
 * override with `DATABASE_PATH` (tests use `:memory:`).
 *
 * This module is the single place that knows the storage engine. The
 * repositories (`users.ts`, `sessions.ts`, `hub-data.ts`, `kv.ts`) expose
 * async/narrow surfaces, so swapping to Postgres at deploy time means
 * re-implementing those files against a `pg` pool — no caller changes.
 *
 * Server-only (native module). Never import from client components or proxy.ts.
 */
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

const MIGRATIONS: string[] = [
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

function databasePath(): string {
  const configured = process.env.DATABASE_PATH
  if (configured) return configured
  const dir = path.join(process.cwd(), '.data')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'chrgd.db')
}

function open(): Database.Database {
  const db = new Database(databasePath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const version = db.pragma('user_version', { simple: true }) as number
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
  return db
}

// Cached on globalThis so Next dev-server HMR reuses one connection instead of
// leaking a handle per reload.
const globalForDb = globalThis as unknown as { __chrgdDb?: Database.Database }

export function getDb(): Database.Database {
  if (!globalForDb.__chrgdDb) globalForDb.__chrgdDb = open()
  return globalForDb.__chrgdDb
}

/** ISO timestamp used for all created_at / updated_at columns. */
export function now(): string {
  return new Date().toISOString()
}
