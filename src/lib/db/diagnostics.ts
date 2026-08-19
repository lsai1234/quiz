import { getEngine } from './engine'

/**
 * Where a request's time actually goes, measured on the deployment rather than
 * guessed at from a laptop.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * "Everything in the hub takes ages" is a real report and an unfalsifiable one:
 * locally every screen answers in single-digit milliseconds against SQLite, and
 * the deployed site is a different machine, in a different region, talking to a
 * different database over a network nobody can see from here. The difference
 * between "the queries are slow", "the database is a long way away" and "the
 * function had to start first" is three different fixes, and no amount of
 * reading the code decides between them.
 *
 * So this measures the three separately, from inside a real request:
 *
 *   • **ping** — the round trip to the database, timed on `SELECT 1` so the
 *     answer is latency and nothing else. This is the number that matters most.
 *     Same region is a millisecond or two; a function in Washington talking to a
 *     database in London is 80–100ms, *per query*, and every page here makes
 *     several.
 *   • **instance** — how old this server process is and how many requests it
 *     has served. A hub that always reports a brand-new instance is a hub
 *     paying cold-start cost on every screen, which no query tuning will fix.
 *   • **work** — a few of the reads the hub actually makes, timed end to end, so
 *     a slow query can be told apart from a slow connection.
 *
 * Read-only, and cheap enough to run whenever the question comes up.
 */

/**
 * When this server process started, and how much it has done since.
 *
 * Module scope on purpose: it is per instance, which is exactly the thing being
 * measured. On a warm instance the age climbs and the count rises; on a fleet of
 * cold ones every reading looks like the first.
 */
const STARTED_AT = Date.now()
let served = 0

/** Count a request against this instance. Called by the diagnostics route. */
export function countRequest(): void {
  served += 1
}

export interface Timing {
  label: string
  ms: number
  /** What was measured, in a sentence a founder can read. */
  detail: string
}

export interface DbDiagnostics {
  engine: 'sqlite' | 'postgres'
  /** Host only — never the credentials in the connection string. */
  host: string | null
  /** True when the URL is one of the pooled endpoints hosted Postgres offers. */
  pooled: boolean
  instance: {
    ageMs: number
    requestsServed: number
  }
  ping: {
    samples: number
    bestMs: number
    medianMs: number
    worstMs: number
  }
  work: Timing[]
  counts: Record<string, number>
  /** The reading, in a sentence, with the arithmetic behind it. */
  verdict: string
  ranAt: string
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** The host, without the password that is in the same string. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

async function time<T>(label: string, detail: string, fn: () => Promise<T>): Promise<Timing> {
  const at = Date.now()
  try {
    await fn()
  } catch {
    /* a read that fails is still a timing — the check above it reports the fault */
  }
  return { label, ms: Date.now() - at, detail }
}

async function count(table: string): Promise<number> {
  try {
    const db = await getEngine()
    const row = await db.get<{ n: number | string }>(`SELECT COUNT(*) AS n FROM ${table}`)
    return Number(row?.n ?? 0)
  } catch {
    return -1
  }
}

export async function runDbDiagnostics(): Promise<DbDiagnostics> {
  const db = await getEngine()
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL

  // Latency, on the cheapest question there is. Several samples because the
  // first one after an idle spell can include waking a database that scales to
  // zero — worth seeing, but not worth reporting as the typical trip.
  const pings: number[] = []
  for (let i = 0; i < 7; i += 1) {
    const at = Date.now()
    try {
      await db.get('SELECT 1 AS one')
    } catch {
      /* a failed ping still took time; the count below will show the fault */
    }
    pings.push(Date.now() - at)
  }

  const [catalogue, orders, funnel] = await Promise.all([
    time('Catalogue', 'What the quiz and every product screen read.', async () => {
      const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
      await getResolvedCatalogue()
    }),
    time('Recent orders', 'The read behind the dashboard and the orders list.', async () => {
      const { listOrders } = await import('@/lib/orders/repo')
      await listOrders({ limit: 500 })
    }),
    time('Quiz funnel', 'Every analytics event in the window, recounted from scratch.', async () => {
      const { quizFunnel } = await import('@/lib/analytics/funnel-cache')
      await quizFunnel(30, { fresh: true })
    }),
  ])

  const counts: Record<string, number> = {
    analytics_events: await count('analytics_events'),
    orders: await count('orders'),
    kv: await count('kv'),
  }

  const med = median(pings)
  const best = Math.min(...pings)

  return {
    engine: db.kind,
    host: hostOf(url),
    pooled: /-pooler|pgbouncer|pooler\./.test(url ?? ''),
    instance: { ageMs: Date.now() - STARTED_AT, requestsServed: served },
    ping: { samples: pings.length, bestMs: best, medianMs: med, worstMs: Math.max(...pings) },
    work: [catalogue, orders, funnel],
    counts,
    verdict: verdictFor(db.kind, med, best, Date.now() - STARTED_AT, served),
    ranAt: new Date().toISOString(),
  }
}

/**
 * The reading, said plainly.
 *
 * Thresholds rather than a score, and each one names what it implies, because
 * the useful output of a diagnostic is the next thing to do. 40ms is the line
 * where a round trip stops being same-region: within a region a query answers
 * in one or two milliseconds even on a small instance, and across an ocean it
 * cannot beat about 70.
 */
export function verdictFor(
  engine: 'sqlite' | 'postgres',
  medianPingMs: number,
  bestPingMs: number,
  instanceAgeMs: number,
  requestsServed: number,
): string {
  if (engine === 'sqlite') {
    return 'Running on SQLite, on this machine. There is no network between the app and its data, so nothing here reflects the deployed site.'
  }

  const fresh = instanceAgeMs < 5_000 && requestsServed <= 1

  if (medianPingMs >= 40) {
    return `Every query costs about ${Math.round(medianPingMs)}ms before it does anything, which is a database in a different region from the functions. A screen making six reads spends roughly ${(medianPingMs * 6 / 1000).toFixed(1)}s waiting on the network alone. Moving one to the other's region is the single biggest thing available here.`
  }

  if (bestPingMs >= 15) {
    return `Round trips are about ${Math.round(medianPingMs)}ms — same region, but not a short hop. Worth checking the connection string points at the pooled endpoint, which avoids a fresh handshake per cold start.`
  }

  if (fresh) {
    return `Round trips are fast (${Math.round(medianPingMs)}ms), and this server process is brand new — so what a slow screen is paying for is the function starting up and connecting, not the queries. Traffic that arrives in bursts hits that on almost every visit.`
  }

  return `Round trips are fast (${Math.round(medianPingMs)}ms) on a server process that has already served ${requestsServed} request${requestsServed === 1 ? '' : 's'}. The database is not what a slow screen is waiting for.`
}
