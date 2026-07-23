/**
 * Stock-exceptions repository — the `stock_exceptions` table (migration v3).
 * Full doc in `data`; indexed columns for the queue and dedup.
 * Server-only, dialect-neutral `?` placeholders.
 */
import { getEngine, now } from '@/lib/db/engine'
import type { StockException, StockExceptionStatus } from './types'

interface Row { data: string }

function parse(row: Row | undefined): StockException | null {
  if (!row) return null
  try {
    return JSON.parse(row.data) as StockException
  } catch {
    return null
  }
}

export async function saveException(exc: StockException): Promise<void> {
  const db = await getEngine()
  await db.run(
    `INSERT INTO stock_exceptions
       (id, user_id, subscription_id, line_id, product_id, status, data, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       data = excluded.data,
       resolved_at = excluded.resolved_at`,
    [
      exc.id,
      exc.userId,
      exc.subscriptionId,
      exc.lineId,
      exc.productId,
      exc.status,
      JSON.stringify(exc),
      exc.createdAt,
      exc.resolvedAt ?? null,
    ],
  )
}

export async function getException(id: string): Promise<StockException | null> {
  const db = await getEngine()
  return parse(await db.get<Row>('SELECT data FROM stock_exceptions WHERE id = ?', [id]))
}

export async function listExceptions(status?: StockExceptionStatus): Promise<StockException[]> {
  const db = await getEngine()
  const rows = status
    ? await db.all<Row>('SELECT data FROM stock_exceptions WHERE status = ? ORDER BY created_at DESC', [status])
    : await db.all<Row>('SELECT data FROM stock_exceptions ORDER BY created_at DESC')
  return rows.map((r) => parse(r)).filter((e): e is StockException => e !== null)
}

export async function updateException(id: string, mutate: (e: StockException) => void): Promise<StockException | null> {
  const exc = await getException(id)
  if (!exc) return null
  mutate(exc)
  await saveException(exc)
  return exc
}

export { now }
