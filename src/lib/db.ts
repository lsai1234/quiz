/**
 * Postgres (Neon) connection + the `kv` key→JSON table.
 *
 * The app's durable store is one serverless Postgres database (Neon, typically
 * created from Vercel's Storage tab). Setting `DATABASE_URL` (or
 * `POSTGRES_URL`, which some integrations write instead) switches it on;
 * without it the app falls back to JSON files under `.data/` — see
 * `src/lib/portal/persist.ts` — so local dev and mock mode need no database.
 *
 * The `kv` table is bootstrapped on first use (CREATE TABLE IF NOT EXISTS), so
 * connecting a fresh database needs no migration step. Relational tables
 * (quiz sessions, subscribers, events — docs/STORAGE.md §4) arrive with later
 * milestones and will bring proper migrations with them.
 *
 * Server-only.
 */
// Type-only import: the driver module is loaded lazily inside sql() so that
// fs-mode processes (and the jsdom test environment) never execute it.
import type { neon } from '@neondatabase/serverless'

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL
}

/** True when a database is configured (else callers use the fs fallback). */
export function hasDatabase(): boolean {
  return Boolean(databaseUrl())
}

type Sql = ReturnType<typeof neon>

let client: Sql | null = null
let schemaReady: Promise<unknown> | null = null

async function sql(): Promise<Sql> {
  if (!client) {
    const { neon } = await import('@neondatabase/serverless')
    client = neon(databaseUrl()!)
  }
  return client
}

async function ensureSchema(): Promise<Sql> {
  const s = await sql()
  if (!schemaReady) {
    schemaReady = s`
      CREATE TABLE IF NOT EXISTS kv (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `.catch((err: unknown) => {
      // Don't cache a failure — let the next call retry the bootstrap.
      schemaReady = null
      throw err
    })
  }
  await schemaReady
  return s
}

/** Read one kv document. `undefined` when the key has never been written. */
export async function kvGet<T>(key: string): Promise<T | undefined> {
  const s = await ensureSchema()
  const rows = (await s`SELECT value FROM kv WHERE key = ${key}`) as { value: T }[]
  return rows.length === 0 ? undefined : rows[0].value
}

/** Upsert one kv document. */
export async function kvSet<T>(key: string, value: T): Promise<void> {
  const s = await ensureSchema()
  await s`
    INSERT INTO kv (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()
  `
}
