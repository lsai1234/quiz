/**
 * Change-event repository — the `subscription_changes` table (migration v4).
 *
 * Full event document in `data`; indexed columns for the founder queue, the
 * per-member view and the auto-apply sweep. Server-only, dialect-neutral `?`
 * placeholders (see `db/engine.ts`).
 */
import { getEngine, now } from '@/lib/db/engine'
import { OPEN_STATUSES, type ChangeEvent, type ChangeQuery, type ChangeStatus } from './types'

interface Row {
  data: string
}

function parse(row: Row | undefined): ChangeEvent | null {
  if (!row) return null
  try {
    return JSON.parse(row.data) as ChangeEvent
  } catch {
    return null
  }
}

function parseAll(rows: Row[]): ChangeEvent[] {
  return rows.map(parse).filter((e): e is ChangeEvent => e !== null)
}

export async function saveChange(event: ChangeEvent): Promise<void> {
  const db = await getEngine()
  await db.run(
    `INSERT INTO subscription_changes
       (id, user_id, subscription_id, line_id, product_id, sku, kind, status, data,
        auto_apply_at, created_at, updated_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status        = excluded.status,
       data          = excluded.data,
       auto_apply_at = excluded.auto_apply_at,
       updated_at    = excluded.updated_at,
       resolved_at   = excluded.resolved_at`,
    [
      event.id,
      event.userId,
      event.subscriptionId,
      event.lineId,
      event.productId,
      event.sku ?? null,
      event.kind,
      event.status,
      JSON.stringify(event),
      event.autoApplyAt ?? null,
      event.createdAt,
      event.updatedAt,
      event.resolvedAt ?? null,
    ],
  )
}

export async function getChange(id: string): Promise<ChangeEvent | null> {
  const db = await getEngine()
  return parse(await db.get<Row>('SELECT data FROM subscription_changes WHERE id = ?', [id]))
}

/** Build a WHERE clause from a query, as `?`-placeholder SQL plus its params. */
function where(query: ChangeQuery): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  const push = (column: string, value: string | string[] | undefined) => {
    if (!value) return
    const values = Array.isArray(value) ? value : [value]
    if (values.length === 0) return
    clauses.push(`${column} IN (${values.map(() => '?').join(', ')})`)
    params.push(...values)
  }

  push('status', query.status)
  push('kind', query.kind)
  if (query.userId) {
    clauses.push('user_id = ?')
    params.push(query.userId)
  }

  return { sql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '', params }
}

export async function listChanges(query: ChangeQuery = {}): Promise<ChangeEvent[]> {
  const db = await getEngine()
  const { sql, params } = where(query)
  return parseAll(
    await db.all<Row>(
      `SELECT data FROM subscription_changes${sql} ORDER BY created_at DESC`,
      params,
    ),
  )
}

/** Everything still in flight — the hub's default view. */
export async function listOpenChanges(): Promise<ChangeEvent[]> {
  return listChanges({ status: OPEN_STATUSES })
}

/**
 * Events whose review window has elapsed and whose intended action should now
 * be applied. Ordered oldest-first so a backlog drains in the order it built up.
 */
export async function listDueForAutoApply(at: string = now()): Promise<ChangeEvent[]> {
  const db = await getEngine()
  const statuses: ChangeStatus[] = ['requires-action', 'auto-resolved', 'scheduled']
  return parseAll(
    await db.all<Row>(
      `SELECT data FROM subscription_changes
        WHERE status IN (${statuses.map(() => '?').join(', ')})
          AND auto_apply_at IS NOT NULL
          AND auto_apply_at <= ?
        ORDER BY auto_apply_at ASC`,
      [...statuses, at],
    ),
  )
}

/** Read-modify-write one event. Returns null when it doesn't exist. */
export async function updateChange(
  id: string,
  mutate: (e: ChangeEvent) => void,
): Promise<ChangeEvent | null> {
  const event = await getChange(id)
  if (!event) return null
  mutate(event)
  event.updatedAt = now()
  await saveChange(event)
  return event
}

/** Count of open events per kind — the hub's nav badge. */
export async function openChangeCounts(): Promise<Record<string, number>> {
  const open = await listOpenChanges()
  return open.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1
    return acc
  }, {})
}

export { now }
