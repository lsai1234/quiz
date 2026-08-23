import { NextResponse } from 'next/server'
import { dailyCounts, getGroup, listGroups, setGroupState } from '@/lib/monitoring/repo'
import { isGroupState, isSurface, type Surface } from '@/lib/monitoring/types'
import { overallStatus, runHealthChecks } from '@/lib/monitoring/health'
import { isPortalAuthed } from '@/lib/portal/guard'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/portal/monitoring — health checks plus grouped errors.
 * POST /api/portal/monitoring — triage one group (resolve / mute / reopen).
 *
 * Both behind the portal session. The public `/api/errors` sink writes; only
 * this reads, because the error log carries stack traces and internal paths.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const fingerprint = url.searchParams.get('fingerprint')

  // The dashboard banner asks this on every hub load, so it gets the cheap
  // answer: the health verdict and a count, with no group listing and no
  // fourteen days of events bucketed to draw a chart nobody is looking at.
  if (url.searchParams.get('summary') === '1') {
    const checks = await runHealthChecks()
    return NextResponse.json({
      status: overallStatus(checks),
      failing: checks.filter((c) => c.status === 'fail').map((c) => c.title),
      warning: checks.filter((c) => c.status === 'warn').map((c) => c.title),
    })
  }

  // The detail view for one fault, with its recent occurrences.
  if (fingerprint) {
    const detail = await getGroup(fingerprint)
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(detail)
  }

  const windowDays = Math.min(Math.max(Number(url.searchParams.get('days')) || 7, 1), 90)
  const stateParam = url.searchParams.get('state')
  const surfaceParam = url.searchParams.get('surface')

  const [checks, groups, daily] = await Promise.all([
    runHealthChecks(),
    listGroups({
      windowDays,
      state: isGroupState(stateParam) ? stateParam : undefined,
      surface: isSurface(surfaceParam) ? (surfaceParam as Surface) : undefined,
    }),
    dailyCounts(Math.min(windowDays, 30)),
  ])

  return NextResponse.json({
    windowDays,
    health: { checks, status: overallStatus(checks) },
    groups,
    daily,
  })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { fingerprint?: string; state?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!body.fingerprint || !isGroupState(body.state)) {
    return NextResponse.json({ error: 'fingerprint and state (open|resolved|muted) are required' }, { status: 400 })
  }

  await setGroupState(body.fingerprint, body.state, body.note ?? null)
  return NextResponse.json({ ok: true, fingerprint: body.fingerprint, state: body.state })
}
