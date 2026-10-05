/**
 * Visits — the `analytics_sessions` table (migration v25).
 *
 * Every event that reaches `/api/analytics` is also folded into one row per
 * visit: when each funnel stage was first reached, the device and source
 * buckets, and the quiz's age band and sex. The analytics page reads these rows
 * rather than the events, which is what lets it show "all time" without pulling
 * a year of JSON across the database connection.
 *
 * ── One merge rule, two places ──────────────────────────────────────────────
 * A visit's row is built up event by event, in whatever order the beacons
 * arrive. `MERGE` says, per column, how a new event's value combines with what
 * is there — earliest wins for "when was this first reached", latest for "what
 * did they last tell us", and so on. The SQL upsert and the in-memory fold used
 * by the backfill are both generated from it, so they cannot disagree.
 *
 * Server-only. Writes are best-effort, like the events: analytics must never be
 * able to fail a request.
 */
import crypto from 'crypto'
import { getEngine, now } from '@/lib/db/engine'
import { kvGetRaw, kvSet } from '@/lib/db/kv'
import type { EventProps } from './events'
import type { DeviceInfo, VisitContext } from './visit'
import { classifySource } from './visit'

export interface SessionRow {
  session_id: string
  first_seen: string
  last_seen: string
  events: number
  internal: number
  landing_path: string | null
  source: string | null
  channel: string | null
  campaign: string | null
  device: string | null
  os: string | null
  browser: string | null
  country: string | null
  arm: string | null
  door: string | null
  landing_at: string | null
  shop_at: string | null
  quiz_start_at: string | null
  quiz_done_at: string | null
  results_at: string | null
  basket_at: string | null
  checkout_at: string | null
  purchase_at: string | null
  purchase_pence: number | null
  subscribed: number | null
  quiz_ms: number | null
  abandon_ms: number | null
  last_step: string | null
  steps_seen: number | null
  age_bracket: string | null
  gender: string | null
  track: string | null
  primary_goal: string | null
}

export type SessionPatch = Partial<Omit<SessionRow, 'session_id'>>

type Merge = 'min' | 'max' | 'sum' | 'first' | 'latest' | 'arm'

/** How each column combines a new event with what the row already holds. */
const MERGE: Record<keyof SessionPatch, Merge> = {
  first_seen: 'min',
  last_seen: 'max',
  events: 'sum',
  // Once a founder's browser, always — a visit is internal if any of it was.
  internal: 'max',
  // How the visit began: whichever beacon described it first.
  landing_path: 'first',
  source: 'first',
  channel: 'first',
  campaign: 'first',
  device: 'first',
  os: 'first',
  browser: 'first',
  country: 'first',
  // `v1` is what an event says before `/api/config` answers; `v2` is only ever
  // said deliberately. Same rule as `sessionArms` in funnel.ts.
  arm: 'arm',
  door: 'first',
  // When each stage was FIRST reached. A late beacon carrying an earlier time
  // still wins, so the order beacons arrive in does not matter.
  landing_at: 'min',
  shop_at: 'min',
  quiz_start_at: 'min',
  quiz_done_at: 'min',
  results_at: 'min',
  basket_at: 'min',
  checkout_at: 'min',
  purchase_at: 'min',
  // Two orders in one visit are two orders' worth of money.
  purchase_pence: 'sum',
  subscribed: 'max',
  // What they last told us.
  quiz_ms: 'latest',
  abandon_ms: 'latest',
  last_step: 'latest',
  steps_seen: 'max',
  age_bracket: 'latest',
  gender: 'latest',
  track: 'latest',
  primary_goal: 'latest',
}

const COLUMNS = Object.keys(MERGE) as (keyof SessionPatch)[]

const str = (v: unknown, n = 60): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null)

/**
 * What one event contributes to its visit's row.
 *
 * Pure. `device` and `country` describe the request the beacon came in on, and
 * are null for events replayed from history, which never recorded either.
 */
export function patchFromEvent(input: {
  event: string
  props: EventProps
  path: string | null
  at: string
  ctx?: VisitContext
  device?: DeviceInfo | null
  country?: string | null
  internal?: boolean
}): SessionPatch {
  const { event, props, at } = input
  const patch: SessionPatch = {
    first_seen: at,
    last_seen: at,
    events: 1,
    internal: input.internal ? 1 : 0,
  }

  if (input.device) {
    patch.device = input.device.device
    patch.os = input.device.os
    patch.browser = input.device.browser
  }
  if (input.country) patch.country = input.country.toUpperCase().slice(0, 2)

  // Only a client that sent a context can say where the visit came from. An
  // older cached bundle sends none, and classifying that as "Direct" would fix
  // the wrong answer on the row for good.
  const ctx = input.ctx
  if (ctx && Object.keys(ctx).length > 0) {
    const source = classifySource(ctx, input.device?.browser ?? null)
    patch.landing_path = ctx.land ?? null
    patch.source = source.source
    patch.channel = source.channel
    patch.campaign = source.campaign
  }

  if (props.arm === 'v1' || props.arm === 'v2') patch.arm = props.arm
  const track = str(props.track)
  if (track) patch.track = track

  switch (event) {
    case 'page_view':
      if (input.path === '/') patch.landing_at = at
      break
    case 'shop_view':
      patch.shop_at = at
      break
    case 'quiz_start':
      patch.quiz_start_at = at
      patch.door = 'quiz'
      break
    case 'consult_start':
      patch.quiz_start_at = at
      patch.door = 'consult'
      break
    case 'quiz_step_view': {
      patch.last_step = str(props.stepId)
      const index = int(props.index)
      if (index !== null) patch.steps_seen = index + 1
      break
    }
    case 'consult_scene_view': {
      patch.last_step = str(props.sceneId)
      const index = int(props.index)
      if (index !== null) patch.steps_seen = index
      break
    }
    case 'quiz_profile':
      patch.age_bracket = str(props.ageBracket, 20)
      patch.gender = str(props.gender, 20)
      break
    case 'quiz_complete':
      patch.quiz_done_at = at
      patch.quiz_ms = int(props.msTotal)
      patch.primary_goal = str(props.primaryGoal)
      break
    case 'consult_complete':
      patch.quiz_done_at = at
      patch.quiz_ms = int(props.msTotal)
      break
    case 'quiz_abandon':
      patch.abandon_ms = int(props.msTotal)
      break
    case 'stack_reveal_view':
      patch.results_at = at
      break
    case 'add_to_basket':
      patch.basket_at = at
      break
    case 'checkout_start':
      patch.checkout_at = at
      break
    case 'purchase': {
      patch.purchase_at = at
      const value = typeof props.value === 'number' && Number.isFinite(props.value) ? props.value : null
      if (value !== null) patch.purchase_pence = Math.max(0, Math.round(value * 100))
      patch.subscribed = typeof props.journey_variant === 'string' && props.journey_variant.endsWith('_subscription') ? 1 : 0
      break
    }
  }

  return patch
}

/** One column's merge, in JS. The mirror of `mergeSql`. */
function mergeValue(kind: Merge, current: unknown, next: unknown): unknown {
  if (next === undefined) return current
  switch (kind) {
    case 'min':
      return next !== null && (current == null || (next as string | number) < (current as string | number)) ? next : current
    case 'max':
      return next !== null && (current == null || (next as string | number) > (current as string | number)) ? next : current
    case 'sum':
      if (next === null) return current
      return current == null ? next : (current as number) + (next as number)
    case 'first':
      return current ?? next
    case 'latest':
      return next ?? current
    case 'arm':
      return next === 'v2' ? 'v2' : current ?? next
  }
}

/** Fold a patch into a row. Pure; the backfill's in-memory equivalent of the upsert. */
export function applyPatch(row: SessionRow | undefined, sessionId: string, patch: SessionPatch): SessionRow {
  const out = (row ? { ...row } : { session_id: sessionId }) as Record<string, unknown>
  for (const col of COLUMNS) {
    if (!(col in patch)) {
      if (!row) out[col] = null
      continue
    }
    out[col] = row ? mergeValue(MERGE[col], out[col], patch[col]) : patch[col] ?? null
  }
  return out as unknown as SessionRow
}

/** One column's merge, in SQL both engines run. */
function mergeSql(col: string, kind: Merge): string {
  const cur = `analytics_sessions.${col}`
  const nxt = `excluded.${col}`
  switch (kind) {
    case 'min':
      return `CASE WHEN ${nxt} IS NOT NULL AND (${cur} IS NULL OR ${nxt} < ${cur}) THEN ${nxt} ELSE ${cur} END`
    case 'max':
      return `CASE WHEN ${nxt} IS NOT NULL AND (${cur} IS NULL OR ${nxt} > ${cur}) THEN ${nxt} ELSE ${cur} END`
    case 'sum':
      return `CASE WHEN ${nxt} IS NULL THEN ${cur} WHEN ${cur} IS NULL THEN ${nxt} ELSE ${cur} + ${nxt} END`
    case 'first':
      return `COALESCE(${cur}, ${nxt})`
    case 'latest':
      return `COALESCE(${nxt}, ${cur})`
    case 'arm':
      return `CASE WHEN ${nxt} = 'v2' THEN 'v2' ELSE COALESCE(${cur}, ${nxt}) END`
  }
}

const UPSERT_SET = COLUMNS.map((c) => `${c} = ${mergeSql(c, MERGE[c])}`).join(',\n       ')

/**
 * Upsert rows, merging each into whatever is already there. Several rows per
 * statement, for the backfill; each session id may appear only once per call
 * (Postgres refuses to update one row twice in a statement), which the callers
 * guarantee by folding first.
 */
async function upsertRows(rows: SessionRow[]): Promise<void> {
  if (rows.length === 0) return
  const db = await getEngine()
  const cols = ['session_id', ...COLUMNS]
  const placeholders = `(${cols.map(() => '?').join(', ')})`
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    await db.run(
      `INSERT INTO analytics_sessions (${cols.join(', ')})
       VALUES ${batch.map(() => placeholders).join(', ')}
       ON CONFLICT(session_id) DO UPDATE SET
       ${UPSERT_SET}`,
      batch.flatMap((r) => cols.map((c) => (r as unknown as Record<string, unknown>)[c] ?? null)),
    )
  }
}

/**
 * Fold one live event into its visit. Never throws — the caller is a beacon.
 *
 * A column the event says nothing about is sent as NULL, and every merge rule
 * treats NULL as "no news", so an event only ever moves the columns it is about.
 */
export async function recordSessionEvent(sessionId: string, patch: SessionPatch): Promise<void> {
  try {
    await upsertRows([applyPatch(undefined, sessionId, patch)])
  } catch {
    /* unreachable database — the event row is still the record */
  }
}

/**
 * Visits that began in `[fromIso, toIso)`, newest first.
 *
 * Capped well above anything this business will see in a window, so the cap
 * is a guard against a runaway read rather than a sample; the report says so
 * if it is ever reached.
 */
export const SESSION_CAP = 250_000

export async function listSessions(fromIso: string | null, toIso: string): Promise<SessionRow[]> {
  try {
    const db = await getEngine()
    const where = fromIso ? 'first_seen >= ? AND first_seen < ?' : 'first_seen < ?'
    return await db.all<SessionRow>(
      `SELECT * FROM analytics_sessions WHERE ${where} ORDER BY first_seen DESC LIMIT ${SESSION_CAP}`,
      fromIso ? [fromIso, toIso] : [toIso],
    )
  } catch {
    return []
  }
}

/** The first visit on record, for labelling "all time". */
export async function earliestSession(): Promise<string | null> {
  try {
    const db = await getEngine()
    const row = await db.get<{ first: string | null }>('SELECT MIN(first_seen) AS first FROM analytics_sessions')
    return row?.first ?? null
  } catch {
    return null
  }
}

/**
 * The first visit whose device was recorded — when page views and the visit
 * context began. Visits before it were rebuilt from quiz and shop events alone,
 * so they have no landing-page view and no device or source.
 */
export async function contextRecordedSince(): Promise<string | null> {
  try {
    const db = await getEngine()
    // Walks the `first_seen` index and stops at the first match, rather than
    // scanning every visit for a minimum.
    const row = await db.get<{ first_seen: string }>(
      'SELECT first_seen FROM analytics_sessions WHERE device IS NOT NULL ORDER BY first_seen ASC LIMIT 1',
    )
    return row?.first_seen ?? null
  } catch {
    return null
  }
}

// ─── History ────────────────────────────────────────────────────────────────

const BACKFILL_KEY = 'analytics:sessions:backfill'

interface BackfillState {
  /** Events before this were not folded live, so they are the backfill's job. */
  cutoff: string
  /** Keyset cursor: the last event folded. */
  after: { at: string; id: string } | null
  done: boolean
  /** Who is running it, and until when. See `claim`. */
  lease?: { token: string; until: number } | null
}

/**
 * Take the backfill for this run, or learn somebody else has it.
 *
 * Two runs folding the same page would add each visit's events up twice, and
 * two hub tabs opened together on a cold deploy is exactly when that happens —
 * on different serverless instances, where an in-memory lock sees nothing. So
 * the claim is a compare-and-set on the stored state: update it only if it is
 * still the text we read, then read it back to see whose token won.
 */
async function claim(raw: string | null, state: BackfillState, ms: number): Promise<BackfillState | null> {
  if (state.lease && state.lease.until > Date.now()) return null
  const db = await getEngine()
  const mine: BackfillState = { ...state, lease: { token: crypto.randomBytes(8).toString('hex'), until: Date.now() + ms } }
  const text = JSON.stringify(mine)
  if (raw === null) {
    await db.run('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING', [BACKFILL_KEY, text, now()])
  } else {
    await db.run('UPDATE kv SET value = ?, updated_at = ? WHERE key = ? AND value = ?', [text, now(), BACKFILL_KEY, raw])
  }
  return (await kvGetRaw(BACKFILL_KEY)) === text ? mine : null
}

interface EventRow {
  id: string
  session_id: string | null
  event: string
  props: string
  path: string | null
  created_at: string
}

/**
 * Build visit rows for the events that were recorded before visits were.
 *
 * The table arrived after the events did, so without this the analytics page
 * would start empty and "all time" would mean "since this shipped". The funnel
 * stages, the quiz's answers and the timings can all be recovered from the
 * events; the device, country and source never were recorded, and those
 * visits show as "Not recorded" rather than being guessed at.
 *
 * ── The cutoff, and why nothing is counted twice ────────────────────────────
 * Live events are folded as they arrive, so the backfill takes only events
 * older than the earliest visit the live path has written — every event is
 * folded by exactly one of the two. The cutoff is fixed on the first run and
 * kept, so a later run cannot move it.
 *
 * ── Resumable ───────────────────────────────────────────────────────────────
 * Works in pages within a time budget and remembers where it stopped, so a big
 * history spreads across a few page loads instead of timing out a serverless
 * function. Each page is folded in memory and merged into the table with the
 * same rule as live events, so a visit split across two pages still adds up.
 */
export async function backfillSessions(options: { budgetMs?: number; pageSize?: number } = {}): Promise<{ done: boolean; folded: number }> {
  const budget = options.budgetMs ?? 6_000
  const pageSize = options.pageSize ?? 5_000
  const started = Date.now()
  let folded = 0

  try {
    const raw = await kvGetRaw(BACKFILL_KEY)
    let state: BackfillState | null = null
    try {
      state = raw ? (JSON.parse(raw) as BackfillState) : null
    } catch {
      state = null
    }
    if (state?.done) return { done: true, folded: 0 }

    const db = await getEngine()
    if (!state) {
      const live = await db.get<{ first: string | null }>('SELECT MIN(first_seen) AS first FROM analytics_sessions')
      state = { cutoff: live?.first ?? new Date().toISOString(), after: null, done: false }
    }

    // Held for well past the budget, so a slow last page cannot overlap the
    // next run — and released at the end, so the next run need not wait it out.
    const claimed = await claim(raw, state, budget + 60_000)
    if (!claimed) return { done: false, folded: 0 }
    let current: BackfillState = claimed

    // At least one page per run, however tight the budget: a run that can
    // make no progress would leave history importing forever.
    for (;;) {
      const after = current.after
      const rows = await db.all<EventRow>(
        `SELECT id, session_id, event, props, path, created_at
           FROM analytics_events
          WHERE created_at < ?
            ${after ? 'AND (created_at > ? OR (created_at = ? AND id > ?))' : ''}
          ORDER BY created_at ASC, id ASC
          LIMIT ${Math.max(1, pageSize)}`,
        after ? [current.cutoff, after.at, after.at, after.id] : [current.cutoff],
      )

      const visits = new Map<string, SessionRow>()
      for (const r of rows) {
        if (!r.session_id) continue
        let props: EventProps = {}
        try {
          props = JSON.parse(r.props) as EventProps
        } catch {
          /* still a countable event */
        }
        const patch = patchFromEvent({ event: r.event, props, path: r.path, at: r.created_at })
        visits.set(r.session_id, applyPatch(visits.get(r.session_id), r.session_id, patch))
      }
      await upsertRows([...visits.values()])
      folded += rows.length

      const last = rows[rows.length - 1]
      current = {
        ...current,
        after: last ? { at: last.created_at, id: last.id } : current.after,
        done: rows.length < pageSize,
      }
      await kvSet(BACKFILL_KEY, current)
      if (current.done || Date.now() - started >= budget) break
    }

    await kvSet(BACKFILL_KEY, { ...current, lease: null })
    return { done: current.done, folded }
  } catch {
    // Not done, and it will try again next time; the page shows what it has.
    return { done: false, folded }
  }
}
