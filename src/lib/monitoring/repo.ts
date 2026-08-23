/**
 * The error log's repository — `error_events` and `error_groups` (migration v14).
 *
 * Two rules govern everything here:
 *
 *  1. **A write must never be able to fail the request that produced it.** This
 *     is an error log; if it throws, it takes down the very code path it exists
 *     to observe, and it does so at exactly the moment that path is already in
 *     trouble. Every write is wrapped and swallowed.
 *  2. **Reads collapse to groups.** Nothing in the hub lists raw occurrences
 *     except the sample on a group's own page — see `fingerprint.ts` for why.
 *
 * Server-only.
 */
import { getEngine, now } from '@/lib/db/engine'
import { fingerprint } from './fingerprint'
import {
  LIMITS,
  isSurface,
  type ErrorContext,
  type ErrorGroup,
  type ErrorKind,
  type ErrorOccurrence,
  type GroupState,
  type Severity,
  type Surface,
} from './types'

interface EventRow {
  id: string
  fingerprint: string
  surface: string
  severity: string
  kind: string
  message: string
  stack: string | null
  path: string | null
  session_id: string | null
  user_id: string | null
  context: string
  created_at: string
}

function truncate(v: string, max: number): string {
  return v.length > max ? `${v.slice(0, max - 1)}…` : v
}

/** Bound the context: a hostile or buggy client must not be able to store a novel. */
function cleanContext(context: ErrorContext | undefined): ErrorContext {
  if (!context) return {}
  const out: ErrorContext = {}
  for (const [k, v] of Object.entries(context).slice(0, LIMITS.contextKeys)) {
    if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string') out[k] = truncate(v, LIMITS.contextValue)
  }
  return out
}

function parseEvent(row: EventRow): ErrorOccurrence {
  let context: ErrorContext = {}
  try {
    context = JSON.parse(row.context) as ErrorContext
  } catch {
    /* a malformed context is still a countable occurrence — keep it, lose the detail */
  }
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    surface: (isSurface(row.surface) ? row.surface : 'unknown') as Surface,
    severity: row.severity as Severity,
    kind: row.kind as ErrorKind,
    message: row.message,
    stack: row.stack,
    path: row.path,
    sessionId: row.session_id,
    userId: row.user_id,
    context,
    createdAt: row.created_at,
  }
}

export interface RecordErrorInput {
  surface: Surface
  severity: Severity
  kind: ErrorKind
  message: string
  stack?: string | null
  path?: string | null
  sessionId?: string | null
  userId?: string | null
  context?: ErrorContext
}

/**
 * Store one occurrence and return its fingerprint (or null if the write failed).
 *
 * Creating the group row is deliberately *not* an upsert of the group's own
 * state: a group that a founder has resolved stays resolved when it recurs, and
 * the recurrence is visible as a rising count and a newer `lastSeen`. Silently
 * reopening it would mean "resolved" never sticks on a fault with a long tail of
 * cached clients still hitting it.
 */
export async function recordError(input: RecordErrorInput): Promise<string | null> {
  try {
    const message = truncate(String(input.message || 'Unknown error'), LIMITS.message)
    const stack = input.stack ? truncate(String(input.stack), LIMITS.stack) : null
    const fp = fingerprint({ surface: input.surface, message, stack })
    const db = await getEngine()
    const at = now()

    await db.run(
      `INSERT INTO error_events
         (id, fingerprint, surface, severity, kind, message, stack, path, session_id, user_id, context, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        // The global WebCrypto, not `node:crypto` — this module is reachable
        // from `instrumentation.ts`, which is compiled for the Edge runtime too
        // where the Node builtin does not exist. `globalThis.crypto` is present
        // on both, and on Node from 19 (this project requires 20.9).
        globalThis.crypto.randomUUID(),
        fp,
        input.surface,
        input.severity,
        input.kind,
        message,
        stack,
        input.path ? truncate(input.path, LIMITS.path) : null,
        input.sessionId ? truncate(input.sessionId, LIMITS.sessionId) : null,
        input.userId ?? null,
        JSON.stringify(cleanContext(input.context)),
        at,
      ],
    )

    // Open the group the first time we see this shape; leave an existing row's
    // state alone.
    await db.run(
      `INSERT INTO error_groups (fingerprint, state, note, updated_at)
       VALUES (?, 'open', NULL, ?)
       ON CONFLICT(fingerprint) DO NOTHING`,
      [fp, at],
    )

    return fp
  } catch {
    return null
  }
}

function sinceIso(windowDays: number): string {
  return new Date(Date.now() - windowDays * 86_400_000).toISOString()
}

export interface ListGroupsOptions {
  windowDays?: number
  /** Omit for every state; the hub defaults to `open`. */
  state?: GroupState
  surface?: Surface
  limit?: number
}

/**
 * Groups in a window, worst first.
 *
 * Ordered by severity then recency rather than by count: a critical fault that
 * happened twice this morning matters more than a warning that happened four
 * hundred times last week, and sorting by volume buries exactly the thing you
 * opened this page to find.
 */
export async function listGroups(options: ListGroupsOptions = {}): Promise<ErrorGroup[]> {
  const { windowDays = 7, state, surface, limit = 100 } = options
  const db = await getEngine()
  const params: unknown[] = [sinceIso(windowDays)]

  let where = 'e.created_at >= ?'
  if (surface) {
    where += ' AND e.surface = ?'
    params.push(surface)
  }

  const rows = await db.all<{
    fingerprint: string
    count: number
    sessions: number
    first_seen: string
    last_seen: string
    state: string | null
    note: string | null
  }>(
    `SELECT e.fingerprint            AS fingerprint,
            COUNT(*)                 AS count,
            COUNT(DISTINCT e.session_id) AS sessions,
            MIN(e.created_at)        AS first_seen,
            MAX(e.created_at)        AS last_seen,
            MAX(g.state)             AS state,
            MAX(g.note)              AS note
       FROM error_events e
       LEFT JOIN error_groups g ON g.fingerprint = e.fingerprint
      WHERE ${where}
      GROUP BY e.fingerprint`,
    params,
  )

  const wanted = state ? rows.filter((r) => (r.state ?? 'open') === state) : rows
  if (wanted.length === 0) return []

  // One query for every sample rather than one per group: at a hundred groups
  // the N+1 version is a hundred round trips to a database in another region.
  const samples = await latestSamples(wanted.map((r) => r.fingerprint))

  const groups: ErrorGroup[] = wanted.map((r) => {
    const sample = samples.get(r.fingerprint) ?? null
    return {
      fingerprint: r.fingerprint,
      surface: sample?.surface ?? 'unknown',
      severity: sample?.severity ?? 'error',
      kind: sample?.kind ?? 'server',
      message: sample?.message ?? '(no sample)',
      count: Number(r.count),
      sessions: Number(r.sessions),
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      state: (r.state ?? 'open') as GroupState,
      note: r.note,
      sample,
    }
  })

  const rank: Record<Severity, number> = { critical: 0, error: 1, warning: 2 }
  groups.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.lastSeen.localeCompare(a.lastSeen),
  )
  return groups.slice(0, limit)
}

/** The most recent occurrence of each fingerprint, in one round trip. */
async function latestSamples(fingerprints: string[]): Promise<Map<string, ErrorOccurrence>> {
  const out = new Map<string, ErrorOccurrence>()
  if (fingerprints.length === 0) return out
  const db = await getEngine()
  const placeholders = fingerprints.map(() => '?').join(', ')
  // Read newest-first and keep the first of each fingerprint. Simpler and
  // faster on both engines than a correlated subquery or a window function,
  // and the row cap is bounded by the group count above.
  const rows = await db.all<EventRow>(
    `SELECT * FROM error_events
      WHERE fingerprint IN (${placeholders})
      ORDER BY created_at DESC
      LIMIT ?`,
    [...fingerprints, fingerprints.length * 20],
  )
  for (const row of rows) {
    if (!out.has(row.fingerprint)) out.set(row.fingerprint, parseEvent(row))
  }
  return out
}

/** One group with its recent occurrences, for the detail view. */
export async function getGroup(
  fp: string,
  windowDays = 30,
): Promise<{ group: ErrorGroup; recent: ErrorOccurrence[] } | null> {
  const db = await getEngine()
  const rows = await db.all<EventRow>(
    `SELECT * FROM error_events
      WHERE fingerprint = ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 50`,
    [fp, sinceIso(windowDays)],
  )
  if (rows.length === 0) return null

  const recent = rows.map(parseEvent)
  const stateRow = await db.get<{ state: string; note: string | null }>(
    'SELECT state, note FROM error_groups WHERE fingerprint = ?',
    [fp],
  )
  const totals = await db.get<{ count: number; sessions: number; first_seen: string; last_seen: string }>(
    `SELECT COUNT(*) AS count, COUNT(DISTINCT session_id) AS sessions,
            MIN(created_at) AS first_seen, MAX(created_at) AS last_seen
       FROM error_events WHERE fingerprint = ? AND created_at >= ?`,
    [fp, sinceIso(windowDays)],
  )

  const sample = recent[0]
  return {
    group: {
      fingerprint: fp,
      surface: sample.surface,
      severity: sample.severity,
      kind: sample.kind,
      message: sample.message,
      count: Number(totals?.count ?? recent.length),
      sessions: Number(totals?.sessions ?? 0),
      firstSeen: totals?.first_seen ?? sample.createdAt,
      lastSeen: totals?.last_seen ?? sample.createdAt,
      state: (stateRow?.state ?? 'open') as GroupState,
      note: stateRow?.note ?? null,
      sample,
    },
    recent,
  }
}

/** Triage: mark a group resolved, muted, or open again. */
export async function setGroupState(
  fp: string,
  state: GroupState,
  note?: string | null,
): Promise<void> {
  const db = await getEngine()
  await db.run(
    `INSERT INTO error_groups (fingerprint, state, note, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(fingerprint) DO UPDATE SET
       state = excluded.state, note = excluded.note, updated_at = excluded.updated_at`,
    [fp, state, note ?? null, now()],
  )
}

/**
 * How many un-muted criticals have happened recently.
 *
 * This is the one number the hub dashboard reads on every load, so it is a
 * single indexed count and nothing more. Muted groups are excluded: muting is
 * how a founder says "I know, it is noise", and a banner that ignores that is a
 * banner they will learn to ignore.
 */
export async function criticalCountSince(hours = 24): Promise<number> {
  try {
    const db = await getEngine()
    const row = await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count
         FROM error_events e
         LEFT JOIN error_groups g ON g.fingerprint = e.fingerprint
        WHERE e.severity = 'critical'
          AND e.created_at >= ?
          AND COALESCE(g.state, 'open') = 'open'`,
      [new Date(Date.now() - hours * 3_600_000).toISOString()],
    )
    return Number(row?.count ?? 0)
  } catch {
    return 0
  }
}

/** Occurrences per day for the window, for the sparkline on the monitoring page. */
export async function dailyCounts(windowDays = 14): Promise<{ day: string; count: number }[]> {
  const db = await getEngine()
  const rows = await db.all<{ created_at: string }>(
    'SELECT created_at FROM error_events WHERE created_at >= ?',
    [sinceIso(windowDays)],
  )
  // Bucketed in JS rather than SQL: the date functions differ between SQLite and
  // Postgres, and the row count here is bounded by the retention window.
  const buckets = new Map<string, number>()
  for (let i = windowDays - 1; i >= 0; i--) {
    buckets.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), 0)
  }
  for (const r of rows) {
    const day = r.created_at.slice(0, 10)
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1)
  }
  return [...buckets.entries()].map(([day, count]) => ({ day, count }))
}

/**
 * Drop occurrences older than the retention window.
 *
 * Group rows are deliberately left behind: they are tiny, and they carry the
 * triage state that must outlive the evidence. Called from the daily cron.
 */
export async function pruneOldEvents(retainDays = 30): Promise<number> {
  try {
    const db = await getEngine()
    const cutoff = sinceIso(retainDays)
    const row = await db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM error_events WHERE created_at < ?',
      [cutoff],
    )
    await db.run('DELETE FROM error_events WHERE created_at < ?', [cutoff])
    return Number(row?.count ?? 0)
  } catch {
    return 0
  }
}
