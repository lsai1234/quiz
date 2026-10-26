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
  // A unique stamp, not bare `now()`: two kvSet writes in one millisecond would
  // otherwise share a stamp, and a `kvCompareAndSet` holding the first would
  // pass and silently overwrite the second.
  await db.run(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), uniqueStamp()],
  )
}

/**
 * A value and the stamp of the write that put it there.
 *
 * The stamp is what makes a read-modify-write safe across serverless
 * instances: `kvCompareAndSet` only writes when the row still carries the stamp
 * the caller read, so two instances editing the same document cannot silently
 * drop one another's change. `null` raw means there is no row.
 */
export async function kvGetStamped(key: string): Promise<{ raw: string | null; stamp: string | null }> {
  const db = await getEngine()
  const row = await db.get<{ value: string; updated_at: string }>('SELECT value, updated_at FROM kv WHERE key = ?', [key])
  return row ? { raw: row.value, stamp: row.updated_at } : { raw: null, stamp: null }
}

/**
 * A stamp no other write can share.
 *
 * `now()` alone is millisecond ISO, and two writes in the same millisecond on
 * two instances would carry the same stamp — each would then pass the other's
 * check. The suffix keeps it unique while it still sorts by time, which is all
 * `kvListPrefix` asks of the column.
 */
function uniqueStamp(): string {
  return `${now()}~${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Write `value` only if the row still carries `expected` (null = only if there
 * is no row yet). Returns the new stamp, or null when somebody else wrote first.
 *
 * `RETURNING` is how both engines say whether the write happened without a
 * second query: SQLite has had it since 3.35 and Postgres always has.
 */
export async function kvCompareAndSet<T>(key: string, value: T, expected: string | null): Promise<string | null> {
  const db = await getEngine()
  const stamp = uniqueStamp()
  const text = JSON.stringify(value)
  const row = expected === null
    ? await db.get<{ key: string }>(
        'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING RETURNING key',
        [key, text, stamp],
      )
    : await db.get<{ key: string }>(
        'UPDATE kv SET value = ?, updated_at = ? WHERE key = ? AND updated_at = ? RETURNING key',
        [text, stamp, key, expected],
      )
  return row ? stamp : null
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

/**
 * Delete every row under `prefix` last written before `before` (ISO). Returns
 * how many went. For retention sweeps, where "hidden after thirty days" has to
 * become "gone after thirty days".
 */
export async function kvDeletePrefixOlderThan(prefix: string, before: string): Promise<number> {
  const db = await getEngine()
  const pattern = `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const doomed = await db.all<{ key: string }>(
    "SELECT key FROM kv WHERE key LIKE ? ESCAPE '\\' AND updated_at < ?",
    [pattern, before],
  )
  for (const { key } of doomed) await db.run('DELETE FROM kv WHERE key = ?', [key])
  return doomed.length
}
