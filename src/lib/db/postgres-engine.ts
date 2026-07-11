/**
 * Postgres engine — `pg` Pool behind the async SqlEngine surface. The durable
 * store for serverless deploys (Vercel + Neon/Supabase/any DATABASE_URL).
 *
 * `?` placeholders are rewritten to $1…$n. Migrations are tracked in a
 * `schema_migrations` table and guarded by an advisory lock so concurrent
 * cold-starting lambdas can't race each other applying DDL.
 */
import { Pool } from 'pg'
import { MIGRATIONS } from './migrations'
import type { SqlEngine } from './engine'

const MIGRATION_LOCK_KEY = 727274 // arbitrary app-wide advisory lock id

function toPgPlaceholders(sql: string): string {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`)
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
    )
    const res = await client.query('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
    const applied = Number(res.rows[0].version)
    for (let v = applied; v < MIGRATIONS.length; v++) {
      await client.query('BEGIN')
      try {
        await client.query(MIGRATIONS[v])
        await client.query('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [
          v + 1,
          new Date().toISOString(),
        ])
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }
  } finally {
    await client.query(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`).catch(() => {})
    client.release()
  }
}

export async function createPostgresEngine(url: string): Promise<SqlEngine> {
  const local = /localhost|127\.0\.0\.1/.test(url)
  const pool = new Pool({
    connectionString: url,
    // Hosted Postgres (Neon/Supabase/…) requires TLS; local dev doesn't offer it.
    ssl: local ? undefined : { rejectUnauthorized: false },
    // Serverless: keep the per-instance pool tiny; provider poolers do the rest.
    max: 3,
  })

  await migrate(pool)

  return {
    kind: 'postgres',
    async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      const res = await pool.query(toPgPlaceholders(sql), params)
      return res.rows[0] as T | undefined
    },
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const res = await pool.query(toPgPlaceholders(sql), params)
      return res.rows as T[]
    },
    async run(sql: string, params: unknown[] = []): Promise<void> {
      await pool.query(toPgPlaceholders(sql), params)
    },
  }
}
