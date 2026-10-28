import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { listEventsSince } from '@/lib/analytics/repo'
import { PERF_EVENTS } from '@/lib/analytics/events'
import { AREAS, vitalsReport } from '@/lib/analytics/vitals'

/** Four weeks: enough page loads to read a p75 by device, recent enough to show a regression. */
const WINDOW_DAYS = 28

/**
 * GET /api/portal/vitals — speed on real devices, by device type, for each
 * part of the site (plan Phase 7.1). Founder-only. Founder sessions are left
 * out unless `?founders=1` (the consult is founders-only until rollout, so
 * until then its figures are all theirs).
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const founders = new URL(req.url).searchParams.get('founders') === '1'
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const events = await listEventsSince(since, 50_000, { events: PERF_EVENTS, excludeInternal: !founders })
  return NextResponse.json({
    windowDays: WINDOW_DAYS,
    founders,
    areas: Object.fromEntries(AREAS.map((a) => [a, vitalsReport(events, a)])),
  })
}
