import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { cleanupDescriptions, scanDescriptions } from '@/lib/catalogue/description-cleanup'

export const dynamic = 'force-dynamic'
/** The AI pass is an API call per product; a batch of them needs room. */
export const maxDuration = 300

/** Never trust a client-supplied batch size to be sane. */
const MAX_BATCH = 25

/**
 * Descriptions imported before the import path cleaned them.
 *
 * GET reports what needs doing — free, no API calls, safe on every page load.
 * POST does it, for the ids it is given.
 *
 * The caller sends ids rather than "do the next N" because the AI pass is slow
 * enough to need batching, and a server that re-decided the set each time would
 * hand back the same products forever: a cleaned description no longer looks
 * like markup, so it would no longer be a candidate. See
 * `lib/catalogue/description-cleanup`.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  try {
    return NextResponse.json({ ok: true, ...(await scanDescriptions()) })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not read the catalogue.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()

  const body = await request.json().catch(() => ({}))
  const ai = body?.ai === true
  const ids: unknown = body?.ids

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to do — no products were sent.' }, { status: 400 })
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { ok: false, error: `Too many at once — send ${MAX_BATCH} or fewer per request.` },
      { status: 400 },
    )
  }
  // The AI pass needs a key. Without one every product would quietly fall back
  // to the plain strip, which looks like the rewrite ran and did nothing.
  if (ai && !process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'No OPENAI_API_KEY is set, so the rewrite has nothing to call. The markup clean works without it.' },
      { status: 400 },
    )
  }

  try {
    const result = await cleanupDescriptions({
      ids: ids.filter((id): id is string => typeof id === 'string'),
      ai,
      write: true,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Cleanup failed.' },
      { status: 500 },
    )
  }
}
