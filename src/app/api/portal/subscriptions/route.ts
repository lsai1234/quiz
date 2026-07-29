import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { listActiveSubscriptions } from '@/lib/db/hub-data'
import { listChanges } from '@/lib/changes/repo'
import { sortByUrgency, summarise } from '@/lib/changes/health'
import { OPEN_STATUSES } from '@/lib/changes/types'

export const dynamic = 'force-dynamic'

/** GET — every member subscription, the ones needing attention first. */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subscriptions = await listActiveSubscriptions()
  const open = await listChanges({ status: OPEN_STATUSES })

  const byUser = new Map<string, typeof open>()
  for (const event of open) {
    byUser.set(event.userId, [...(byUser.get(event.userId) ?? []), event])
  }

  const summaries = sortByUrgency(
    subscriptions.map(({ userId, subscription }) => summarise(userId, subscription, byUser.get(userId) ?? [])),
  )

  return NextResponse.json({
    count: summaries.length,
    requiresAction: summaries.filter((s) => s.health === 'requires-action').length,
    monthlyRevenue: Math.round(summaries.reduce((sum, s) => sum + s.flatMonthly, 0) * 100) / 100,
    subscriptions: summaries,
  })
}
