/**
 * Analytics events repository — the `analytics_events` table (migration v8).
 *
 * The funnel sink used to be a `console.log`, which is enough to forward events
 * to a provider but leaves the Founders Hub unable to answer "where are people
 * dropping out of the quiz?". Keeping the events lets the dashboard compute that
 * from our own data, with no third party involved.
 *
 * Anonymous by construction: an event carries the per-visit session id the
 * client keeps in sessionStorage and nothing else — no user id, no IP, no
 * cookie. Nothing here can identify a person, and that is the point.
 *
 * Server-only. Writes are best-effort: analytics must never be able to fail a
 * request or, worse, break a checkout.
 */
import crypto from 'crypto'
import { getEngine, now } from '@/lib/db/engine'
import type { AnalyticsEvent, EventProps } from './events'

export interface StoredEvent {
  id: string
  sessionId: string | null
  event: AnalyticsEvent
  props: EventProps
  path: string | null
  createdAt: string
}

interface Row {
  id: string
  session_id: string | null
  event: string
  props: string
  path: string | null
  created_at: string
}

function parse(row: Row): StoredEvent {
  let props: EventProps = {}
  try {
    props = JSON.parse(row.props) as EventProps
  } catch {
    /* a malformed row is still a countable event — keep it, lose the props */
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    event: row.event as AnalyticsEvent,
    props,
    path: row.path,
    createdAt: row.created_at,
  }
}

/** Record one event. Never throws — the caller is a beacon, not a transaction. */
export async function recordEvent(input: {
  event: AnalyticsEvent
  props?: EventProps
  sessionId?: string | null
  path?: string | null
  at?: string
}): Promise<void> {
  try {
    const db = await getEngine()
    await db.run(
      `INSERT INTO analytics_events (id, session_id, event, props, path, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `ae_${crypto.randomBytes(9).toString('hex')}`,
        input.sessionId ?? null,
        input.event,
        JSON.stringify(input.props ?? {}),
        input.path ?? null,
        input.at ?? now(),
      ],
    )
  } catch {
    /* unreachable database — drop the event rather than fail the request */
  }
}

/**
 * Events since `sinceIso`, oldest first.
 *
 * Capped: the funnel is a shape, not a census, and an uncapped read on a busy
 * month would pull the whole table into memory to compute a handful of counts.
 */
export async function listEventsSince(sinceIso: string, limit = 20_000): Promise<StoredEvent[]> {
  try {
    const db = await getEngine()
    const rows = await db.all<Row>(
      `SELECT id, session_id, event, props, path, created_at
         FROM analytics_events
        WHERE created_at >= ?
        ORDER BY created_at ASC
        LIMIT ${Math.min(Math.max(1, limit), 50_000)}`,
      [sinceIso],
    )
    return rows.map(parse)
  } catch {
    return []
  }
}

/** Delete events older than `cutoffIso`. Housekeeping — nothing depends on it. */
export async function pruneEventsBefore(cutoffIso: string): Promise<void> {
  try {
    const db = await getEngine()
    await db.run('DELETE FROM analytics_events WHERE created_at < ?', [cutoffIso])
  } catch {
    /* best effort */
  }
}
