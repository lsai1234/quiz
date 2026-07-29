/**
 * Supplier snapshot persistence — the `supplier_snapshots` table (migration v6).
 *
 * One row per SKU, overwritten every sync. Server-only, dialect-neutral `?`
 * placeholders.
 */
import { getEngine, now } from '@/lib/db/engine'
import type { SupplierSnapshot } from './detect'

interface Row {
  data: string
}

function parse(row: Row): SupplierSnapshot | null {
  try {
    return JSON.parse(row.data) as SupplierSnapshot
  } catch {
    return null
  }
}

export async function listSnapshots(): Promise<SupplierSnapshot[]> {
  const db = await getEngine()
  const rows = await db.all<Row>('SELECT data FROM supplier_snapshots')
  return rows.map(parse).filter((s): s is SupplierSnapshot => s !== null)
}

export async function getSnapshot(sku: string): Promise<SupplierSnapshot | null> {
  const db = await getEngine()
  const row = await db.get<Row>('SELECT data FROM supplier_snapshots WHERE sku = ?', [sku])
  return row ? parse(row) : null
}

/**
 * Write the post-diff state. Rows are upserted one at a time rather than
 * batched: the engine interface is deliberately small (get/all/run), and a
 * catalogue of a few thousand SKUs syncing once a day doesn't justify widening
 * it. Revisit if the feed grows an order of magnitude.
 */
export async function saveSnapshots(snapshots: SupplierSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return
  const db = await getEngine()
  const at = now()
  for (const snapshot of snapshots) {
    await db.run(
      `INSERT INTO supplier_snapshots (sku, missed_syncs, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(sku) DO UPDATE SET
         missed_syncs = excluded.missed_syncs,
         data         = excluded.data,
         updated_at   = excluded.updated_at`,
      [snapshot.sku, String(snapshot.missedSyncs), JSON.stringify(snapshot), snapshot.updatedAt || at],
    )
  }
}

/** Whether any sync has run yet. The first one is a baseline, not a change. */
export async function hasSnapshots(): Promise<boolean> {
  const db = await getEngine()
  const row = await db.get<{ sku: string }>('SELECT sku FROM supplier_snapshots LIMIT 1')
  return row !== undefined
}
