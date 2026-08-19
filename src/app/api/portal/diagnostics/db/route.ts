import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { countRequest, runDbDiagnostics } from '@/lib/db/diagnostics'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/diagnostics/db
 *
 * Where a request's time goes, measured from inside a real one on the machine
 * that is actually serving the site. See `lib/db/diagnostics.ts` for what is
 * timed and why those three things and not others.
 *
 * A GET rather than a POST, unlike the supplier check next door: this one talks
 * only to our own database, reads nothing it does not already serve, and costs
 * about as much as loading any other hub screen. Nothing here writes.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Counted before the work, so the instance's own reading includes this
  // request — the first call on a fresh function should say "1", not "0".
  countRequest()

  // Timed from inside the handler, so the browser can subtract it from what it
  // waited and see what was spent before this code ran at all: the function
  // starting, the framework booting, the network. On a hub that feels slow
  // while every query is fast, that difference is the whole answer.
  const at = Date.now()
  const report = await runDbDiagnostics()

  return NextResponse.json({ ...report, serverMs: Date.now() - at }, {
    // The whole point is the state of *this* instance right now.
    headers: { 'Cache-Control': 'no-store' },
  })
}
