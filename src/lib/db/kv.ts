/**
 * JSON key-value table — the durable backing for the portal's persistence seam
 * (`src/lib/portal/persist.ts`). Synchronous by design: the portal store
 * hydrates at module load. A Postgres swap would make persist.ts hydrate
 * asynchronously behind the same readJson/writeJson call sites.
 */
import { getDb, now } from './client'

export function kvGet<T>(key: string): T | undefined {
  const row = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.value) as T
  } catch {
    return undefined
  }
}

export function kvSet<T>(key: string, value: T): void {
  getDb()
    .prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), now())
}

export function kvHas(key: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM kv WHERE key = ?').get(key)
}
