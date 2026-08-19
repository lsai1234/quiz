import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { runSupplierDiagnostics, summarise } from '@/lib/supplier/diagnostics'
import { getSupplierSource } from '@/lib/supplier'

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
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The supplier switch is a runtime setting; read the current one, not the one
  // this server started with.
  await syncPortalRuntime()

  let body: { placeTestOrder?: unknown; confirmSandbox?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // No body is the read-only run, which is the common case.
  }

  const placeTestOrder = body.placeTestOrder === true

  /**
   * The write path needs two things, and neither is optional.
   *
   * The supplier has to actually be PowerBody — there is nothing to place an
   * order against otherwise — and the founder has to have confirmed, in this
   * request, that the account is a DEMO/sandbox one. There is no field in their
   * API that says so: their guide describes DEMO as a state the account is put
   * in, visible only as limited stock and orders that fail by themselves. So the
   * confirmation is a person's, and it is required per request rather than
   * remembered, because "is this still a sandbox?" is a question whose answer
   * changes exactly once and without warning.
   */
  if (placeTestOrder) {
    if (body.confirmSandbox !== true) {
      return NextResponse.json(
        { error: 'A test order needs the account confirmed as a PowerBody DEMO/sandbox account first.' },
        { status: 400 },
      )
    }
    if (getSupplierSource() !== 'powerbody') {
      return NextResponse.json(
        { error: 'The supplier is set to the sample feed, so there is no account to place a test order on.' },
        { status: 400 },
      )
    }
  }

  try {
    const report = await runSupplierDiagnostics(undefined, { placeTestOrder })
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
