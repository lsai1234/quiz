import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/** Paging the list feed is throttled, so give it the same room a lookup gets. */
export const maxDuration = 60

const DEFAULT_LIMIT = 40
const MAX_LIMIT = 200

/**
 * GET ?limit=n — some SKUs that exist in the supplier feed.
 *
 * Codes only. This is not the browse list coming back: no product detail is
 * fetched, nothing is named, and it stops as soon as it has enough. It exists
 * because importing goes by SKU, and on a feed you cannot otherwise see — a
 * sandbox account's products exist only in the API — there is nowhere to get a
 * code from to try it with.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = Number(new URL(req.url).searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isFinite(raw) ? Math.max(1, Math.min(raw, MAX_LIMIT)) : DEFAULT_LIMIT

  try {
    await syncPortalRuntime()
    const supplier = await getSupplier()
    const skus = await supplier.sampleSkus(limit)
    return NextResponse.json({ source: supplier.name, skus, count: skus.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not read the supplier feed.' },
      { status: 502 },
    )
  }
}
