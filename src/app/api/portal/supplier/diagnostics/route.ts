import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { runSupplierDiagnostics, summarise } from '@/lib/supplier/diagnostics'

export const dynamic = 'force-dynamic'

/**
 * Paging the list feed and then making a detail call per product is throttled at
 * their end, so this needs the same room a lookup gets.
 */
export const maxDuration = 60

/**
 * POST /api/portal/supplier/diagnostics → { report, summary }
 *
 * Runs every read-only supplier capability and reports each separately, so a
 * failure names the call rather than the screen. See `lib/supplier/diagnostics`
 * for what is checked and why placing an order is not among it.
 *
 * POST rather than GET because it makes a series of real, rate-limited calls to
 * a third party — not something a link preview or a browser prefetch should be
 * able to set off.
 */
export async function POST() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The supplier switch is a runtime setting; read the current one, not the one
  // this server started with.
  await syncPortalRuntime()

  try {
    const report = await runSupplierDiagnostics()
    return NextResponse.json({ report, summary: summarise(report) })
  } catch (err) {
    // A throw here means the provider could not even be constructed — bad
    // credentials, an unreachable endpoint. That is a result, not a 500.
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `The supplier could not be reached at all: ${message}` },
      { status: 502 },
    )
  }
}
