import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { analyticsReport } from '@/lib/analytics/report-cache'
import { isRangeKey, parseFilter, type SegmentFilter } from '@/lib/analytics/report'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/analytics?range=30d&f=device:mobile&internal=1&fresh=1
 *
 * The hub's Analytics page, in one round trip. `range` is one of the presets
 * in `report.ts`; each `f` narrows every figure on the page to one segment
 * (several are ANDed); `internal=1` counts the founders' own visits, which are
 * left out by default; `fresh=1` skips the few minutes of caching. Founder-only.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const rangeParam = params.get('range')
  const range = isRangeKey(rangeParam) ? rangeParam : '30d'
  const filters = params
    .getAll('f')
    .slice(0, 6)
    .map(parseFilter)
    .filter((f): f is SegmentFilter => f !== null)

  return NextResponse.json(
    await analyticsReport({
      range,
      filters,
      includeInternal: params.get('internal') === '1',
      fresh: params.get('fresh') === '1',
    }),
  )
}
