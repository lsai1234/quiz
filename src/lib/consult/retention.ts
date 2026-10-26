/**
 * The consult's retention, enforced rather than only read (plan Phase 1, 7).
 *
 * Saved handoff payloads (`consult:{id}`, written by `/api/consult`) are
 * health-derived — an excluded fish oil says something — and are kept for
 * thirty days. `/api/consult` already refuses to read one past that and the
 * hub stops listing it, but until this ran nothing removed the row, so
 * "thirty days" was a display rule rather than a retention period. The daily
 * job now deletes them.
 *
 * The same sweep rewrites any `consult_stop` analytics row still naming
 * pregnancy or a kidney or liver condition, from before stops were recorded by
 * gate (`analytics/consult.ts`), to `circuit`. Idempotent: after the first run
 * there is nothing for it to find.
 *
 * Server-only.
 */
import { getEngine } from '@/lib/db/engine'
import { kvDeletePrefixOlderThan } from '@/lib/db/kv'

export const CONSULT_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export interface ConsultSweep {
  /** Saved consults deleted for being past the retention period. */
  consultsDeleted: number
  /** Old stop events whose health-derived reason was rewritten to `circuit`. */
  stopReasonsScrubbed: number
}

export async function sweepConsultData(now = new Date()): Promise<ConsultSweep> {
  const before = new Date(now.getTime() - CONSULT_RETENTION_DAYS * DAY_MS).toISOString()
  const consultsDeleted = await kvDeletePrefixOlderThan('consult:', before)

  const db = await getEngine()
  const rows = await db.all<{ id: string; props: string }>(
    "SELECT id, props FROM analytics_events WHERE event = 'consult_stop' AND (props LIKE ? OR props LIKE ?)",
    ['%"pregnancy"%', '%"kidney-liver"%'],
  )
  let stopReasonsScrubbed = 0
  for (const row of rows) {
    let props: Record<string, unknown>
    try {
      props = JSON.parse(row.props) as Record<string, unknown>
    } catch {
      props = {}
    }
    if (props.reason !== 'pregnancy' && props.reason !== 'kidney-liver') continue
    await db.run('UPDATE analytics_events SET props = ? WHERE id = ?', [JSON.stringify({ ...props, reason: 'circuit' }), row.id])
    stopReasonsScrubbed++
  }
  return { consultsDeleted, stopReasonsScrubbed }
}
