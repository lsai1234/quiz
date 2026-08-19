import { kvGet, kvSet } from '@/lib/db/kv'
import { listEventsSince } from './repo'
import { buildQuizFunnel, type QuizFunnel } from './funnel'

/**
 * The quiz funnel, computed at most every few minutes.
 *
 * ── Why it is not computed per view ─────────────────────────────────────────
 * `buildQuizFunnel` is a pure function over the events themselves, which is the
 * right shape — the branching quiz has no fixed step ladder, so the steps have
 * to come from what the events report — but it means the dashboard was reading
 * every event in the window to draw a dozen numbers. The read is capped at
 * 20,000 rows, and a busy month reaches that cap: measured on an in-memory
 * database, the dashboard route pulled 20,000 rows and spent 190ms doing it,
 * and every one of those rows carries a JSON `props` column that crosses the
 * database connection and is parsed again on arrival. On a hosted Postgres that
 * is the single most expensive thing the Founders Hub does, it happens on the
 * hub's front page, and it gets slower every week the site is used — which is
 * exactly how it was described: everything, gradually, taking longer.
 *
 * ── Why a cache rather than SQL ─────────────────────────────────────────────
 * Aggregating this in the database would mean reaching into the `props` JSON,
 * and JSON access is where SQLite and Postgres stop agreeing — the engine's one
 * rule is that a statement is written once and both dialects run it (see
 * `db/engine.ts`). A three-minute cache buys most of the same win without
 * splitting the schema in two or touching the tested pure function.
 *
 * ── What it costs ───────────────────────────────────────────────────────────
 * A funnel up to `TTL_MS` old. That is a fair trade for a drop-off report and a
 * bad one for a number somebody is watching change, so the answer carries the
 * time it was computed and the dashboard prints it. `fresh` skips the cache for
 * a caller that has just made the events it wants to see.
 *
 * Server-only.
 */

/** How long a computed funnel stands. */
const TTL_MS = 3 * 60_000

const KEY = (days: number) => `analytics:funnel:${days}`

export interface CachedFunnel {
  /** When this was computed, ISO. Shown on the dashboard. */
  asOf: string
  funnel: QuizFunnel
}

export async function quizFunnel(days: number, options: { fresh?: boolean } = {}): Promise<CachedFunnel> {
  if (!options.fresh) {
    try {
      const hit = await kvGet<CachedFunnel>(KEY(days))
      if (hit?.asOf && Date.now() - Date.parse(hit.asOf) < TTL_MS) return hit
    } catch {
      /* unreachable database — fall through and compute it */
    }
  }

  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const computed: CachedFunnel = {
    asOf: new Date().toISOString(),
    funnel: buildQuizFunnel(await listEventsSince(since)),
  }

  try {
    await kvSet(KEY(days), computed)
  } catch {
    /* the funnel is still correct; it just costs the full read again next time */
  }

  return computed
}
