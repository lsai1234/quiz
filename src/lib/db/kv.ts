/**
 * JSON key-value table — the durable backing for the portal's persistence seam
 * (`src/lib/portal/persist.ts`): product overrides, imports/removals, backlog,
 * runtime settings.
 */
import { getEngine, now } from './engine'

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await getEngine()
  const row = await db.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key])
  if (!row) return undefined
  try {
    return JSON.parse(row.value) as T
  } catch {
    return undefined
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const db = await getEngine()
  await db.run(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), now()],
  )
}

export async function kvHas(key: string): Promise<boolean> {
  const db = await getEngine()
  return !!(await db.get('SELECT 1 AS one FROM kv WHERE key = ?', [key]))
}

export async function kvDelete(key: string): Promise<void> {
  const db = await getEngine()
  await db.run('DELETE FROM kv WHERE key = ?', [key])
}
