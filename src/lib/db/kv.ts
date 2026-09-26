/**
 * JSON key-value table — the durable backing for the portal's persistence seam
 * (`src/lib/portal/persist.ts`): product overrides, imports/removals,
 * runtime settings.
 */
import { getEngine, now } from './engine'

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const raw = await kvGetRaw(key)
  if (raw === null) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

/**
 * The stored JSON as text, or `null` when there is no row.
 *
 * One query answers both "is it there" and "what is it", which `kvGet` alone
 * cannot: it returns `undefined` for a missing row and for an unparseable one
 * alike, so a caller that needs to tell them apart had to ask twice — and the
 * portal's persistence seam did exactly that, doubling the round trips on the
 * hottest reads in the hub. Text rather than a parsed object so a caller can
 * cache the bytes without handing two callers the same mutable object.
 */
export async function kvGetRaw(key: string): Promise<string | null> {
  const db = await getEngine()
  const row = await db.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key])
  return row ? row.value : null
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

/**
 * Every row whose key starts with `prefix`, parsed, newest first. For small,
 * bounded sets only (the consult viewer's thirty days of payloads), not a
 * general query tool.
 */
export async function kvListPrefix<T>(prefix: string, limit = 500): Promise<{ key: string; value: T }[]> {
  const db = await getEngine()
  // Escape LIKE's wildcards so the prefix is taken literally.
  const pattern = `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const rows = await db.all<{ key: string; value: string }>(
    "SELECT key, value FROM kv WHERE key LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?",
    [pattern, limit],
  )
  const out: { key: string; value: T }[] = []
  for (const r of rows) {
    try {
      out.push({ key: r.key, value: JSON.parse(r.value) as T })
    } catch {
      // Skip a row that no longer parses.
    }
  }
  return out
}
