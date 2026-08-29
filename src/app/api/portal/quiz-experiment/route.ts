import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getQuizExperiment, setQuizExperiment } from '@/lib/portal/store'
import { normaliseExperiment } from '@/lib/experiments/assignment'
import { listEventsSince } from '@/lib/analytics/repo'
import { buildQuizFunnel } from '@/lib/analytics/funnel'

/**
 * Which quiz customers get, and how the two arms are actually doing.
 *
 * One route because these are one screen's worth of operations on one object:
 * read the setting with both funnels beside it, or write the setting.
 *
 * There is no refusal here, unlike the competition route. Every reachable state
 * of this setting is a legitimate one — including "everyone gets the new quiz",
 * which is the point of running the experiment at all. `normaliseExperiment`
 * clamps rather than rejects, so a slider that sends 101 lands on 100 instead
 * of erroring at a founder who did nothing wrong.
 */
export const dynamic = 'force-dynamic'

/** How far back the arm comparison looks. Long enough to accumulate the ~5k
 *  sessions per arm a conversion read needs; the events table is pruned well
 *  before this matters. */
const WINDOW_DAYS = 60

async function payload() {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const events = await listEventsSince(since)
  return {
    config: await getQuizExperiment(),
    windowDays: WINDOW_DAYS,
    arms: {
      v1: buildQuizFunnel(events, 'v1'),
      v2: buildQuizFunnel(events, 'v2'),
    },
    steer: steerHealth(events),
  }
}

/**
 * Is the AI steer earning its keep?
 *
 * `used` over `attempts` is the headline: a steer that lands after the question
 * it was for has already been answered is discarded, and a low ratio means the
 * prefetch is firing too late rather than that the model is slow. p95 is here
 * because the mean hides exactly the tail that would have been visible if
 * anything on screen waited for it — and nothing does.
 */
function steerHealth(events: Awaited<ReturnType<typeof listEventsSince>>) {
  const attempts = events.filter((e) => e.event === 'quiz_ai_steer')
  const latencies = attempts
    .map((e) => (typeof e.props.latencyMs === 'number' ? e.props.latencyMs : null))
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b)
  const used = attempts.filter((e) => e.props.used === true).length
  const reasons: Record<string, number> = {}
  for (const e of attempts) {
    const r = typeof e.props.reason === 'string' ? e.props.reason : 'unknown'
    reasons[r] = (reasons[r] ?? 0) + 1
  }
  const at = (q: number) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))] : null)
  return {
    attempts: attempts.length,
    used,
    usedPct: attempts.length ? Math.round((used / attempts.length) * 1000) / 1000 : 0,
    p50: at(0.5),
    p95: at(0.95),
    reasons,
  }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await payload())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const config = body.config
  if (!config || typeof config !== 'object') {
    return NextResponse.json({ error: 'config required' }, { status: 400 })
  }
  // Merge onto what is stored so the screen can send one changed field without
  // silently resetting the other three to their defaults.
  await setQuizExperiment(normaliseExperiment({ ...(await getQuizExperiment()), ...config }))
  return NextResponse.json(await payload())
}
