import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { syncPortalRuntime } from '@/lib/portal/store'
import { toFeedCsv } from '@/lib/supplier/export'

export const dynamic = 'force-dynamic'

/**
 * Paging the whole list feed is many throttled calls, so this needs the same
 * room a lookup gets. It is the cheap call — no per-product detail — so the
 * cost is the paging, not the products.
 */
export const maxDuration = 60

/**
 * POST /api/portal/supplier/export → the whole list feed as a CSV download.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The SKU → product id mapping lives in exactly one place: PowerBody's list
 * feed. Every other screen rediscovers it a product at a time, by paging that
 * feed until the row turns up — which is fine for a code that is in there and
 * pathological for one that is not, because nothing stops the walk early and it
 * runs to the end of the catalogue.
 *
 * Checking a hundred codes that way is a hundred of those walks. Reading the
 * feed ONCE and handing over the whole mapping answers the same question for
 * every code at the same time, offline, in a spreadsheet: which of my SKUs does
 * this account actually carry, and what is each one's product id. A SKU that is
 * absent from this file is absent from the account — which is the answer a
 * timeout could never give.
 *
 * It is deliberately the CHEAP half of the feed. There are no names, brands or
 * images here, because those come from `getProductInfo` — one throttled call per
 * product, thousands of requests for a catalogue. This is what can be had for a
 * few pages, and it is the half that identifies a product rather than describes
 * it.
 *
 * POST, not GET, for the same reason the diagnostics run is: it makes a series
 * of real, rate-limited calls to a third party, which is not something a link
 * preview or a browser prefetch should be able to set off.
 */
export async function POST() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await syncPortalRuntime()
    const supplier = await getSupplier()
    // `getFeed`, not `getStockLevels`: this needs the pager's verdict on whether
    // it reached the end. A truncated export is not a smaller answer to "what
    // does this account carry?" — it is a WRONG answer to "what does it not
    // carry?", because every SKU on the pages we never read looks absent. That
    // is the answer people act on, so it cannot be guessed at.
    const { levels, complete, pages } = await supplier.getFeed()

    const csv = toFeedCsv(levels)
    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="powerbody-feed-${supplier.name}-${stamp}.csv"`,
        // A stock and price snapshot is stale the moment it is written.
        'Cache-Control': 'no-store',
        // Read before the file is opened, so a run that came back suspiciously
        // small can be spotted without counting rows by hand.
        'X-Row-Count': String(levels.length),
        // The load-bearing one. False means absences in this file prove nothing.
        'X-Feed-Complete': complete ? 'yes' : 'no',
        'X-Feed-Pages': String(pages),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not read the supplier feed.' },
      { status: 502 },
    )
  }
}
