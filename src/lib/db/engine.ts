/**
 * Backend database engine — SQLite locally, Postgres when DATABASE_URL is set.
 *
 * The engine is picked once per process:
 *   - `DATABASE_URL` (or Vercel's `POSTGRES_URL`) starting `postgres://` →
 *     Postgres via `pg` — the durable store on serverless (Vercel + Neon).
 *   - otherwise → zero-config SQLite at `.data/chrgd.db` (`DATABASE_PATH`
 *     overrides; tests use `:memory:`).
 *
 * Statements are written once with `?` placeholders and a dialect-neutral
 * schema (see migrations.ts); each engine adapts them. Repositories only ever
 * talk to `SqlEngine`, so adding another backend means one new file here.
 *
 * Server-only. Never import from client components or proxy.ts.
 */

export interface SqlEngine {
  readonly kind: 'sqlite' | 'postgres'
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>
  all<T>(sql: string, params?: unknown[]): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<void>
}

function postgresUrl(): string | null {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  return url && /^postgres(ql)?:\/\//.test(url) ? url : null
}

// Cached on globalThis so Next dev-server HMR and route bundles share one
// connection (pool) per process instead of leaking one per reload.
const globalForDb = globalThis as unknown as { __chrgdEngine?: Promise<SqlEngine> }

/** The migrated, ready-to-query engine (creation + migrations run once). */
export function getEngine(): Promise<SqlEngine> {
  if (!globalForDb.__chrgdEngine) {
    const url = postgresUrl()
    globalForDb.__chrgdEngine = url
      ? import('./postgres-engine').then((m) => m.createPostgresEngine(url))
      : import('./sqlite-engine').then((m) => m.createSqliteEngine())
  }
  return globalForDb.__chrgdEngine
}

export { now } from './migrations'
