import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getLastSyncReport, syncImportedProducts } from '@/lib/supplier/sync'

export const dynamic = 'force-dynamic'
/** A refresh pages the whole supplier feed; give it room on a slow supplier. */
export const maxDuration = 300

/**
 * "Sync now" — refresh imported products' stock and cost from the supplier.
 *
 * The daily cron does this on its own schedule; this is the manual trigger for
 * when a founder wants today's numbers before working the queue. Read-only as
 * far as the supplier is concerned: it never places or changes an order, so it
 * is unaffected by the simulate/live ordering switch.
 */
export async function POST() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  try {
    return NextResponse.json({ ok: true, ...(await syncImportedProducts()) })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Supplier sync failed.' },
      { status: 502 },
    )
  }
}

/** The last run, without triggering a new one — what the hub shows on load. */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, report: await getLastSyncReport() })
}
