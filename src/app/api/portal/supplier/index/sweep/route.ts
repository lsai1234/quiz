import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { syncPortalRuntime } from '@/lib/portal/store'
import { readSupplierIndex, mergeSweep, highestIndexedId } from '@/lib/portal/supplier-index'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Ids asked about in one supplier call. The transport throttles to a request
 *  every 150ms regardless, so this is about round trips, not parallelism. */
const BATCH = 30

/** How long one pass may spend before handing back. A pause, not a ceiling. */
const PASS_BUDGET_MS = 45_000

/**
 * How many consecutive empty ids mean the catalogue has ended.
 *
 * Ids are sparse, so empty runs are normal — near the top of this catalogue the
 * median gap between products is 3, but gaps of tens happen. This has to be far
 * larger than any real gap and small enough to stop eventually. Getting it
 * wrong in one direction wastes requests; in the other it declares the sweep
 * finished while products remain, which is why the number it stopped on is
 * reported rather than kept quiet.
 */
const EMPTY_RUN_TO_STOP = 1_500

/**
 * POST — sweep PowerBody's product ids for everything their list feed will not
 * hand over.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `getProductList` is capped server-side at 3,000 products on this account,
 * against a catalogue of 8,000+, and no parameter raises it. That is a cap on
 * the LIST call only. `getProductInfo` takes a product id and answers for any
 * product, and its reply carries the SKU — so walking ids reaches the other
 * 5,000. It is the only route to them through the API.
 *
 * WHAT IT COSTS
 * ─────────────
 * One throttled request per id, at a request every 150ms. Near the top of the
 * range products sit about three ids apart, so the remaining catalogue is on
 * the order of fifteen thousand ids — roughly forty minutes of calls, once,
 * ever. It runs in passes and remembers where it got to, so it survives a
 * closed tab.
 *
 * HOW IT AVOIDS LYING
 * ───────────────────
 * A sweep reads meaning into SILENCE — "nothing at this id" — which is exactly
 * what a broken account also produces. So each pass first probes an id the feed
 * already told us exists. If that comes back empty, the account or the detail
 * call is the problem and the pass says so instead of recording five hundred
 * ids as empty.
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { fromId?: number } = {}
  try {
    body = await req.json()
  } catch {
    /* an empty body means "carry on from wherever the sweep got to" */
  }
  await syncPortalRuntime()

  const index = await readSupplierIndex()
  if (Object.keys(index.bySku).length === 0) {
    return NextResponse.json(
      { error: 'Build the product index first — the sweep starts where their list feed stops, and needs to know where that is.' },
      { status: 400 },
    )
  }

  try {
    const supplier = await getSupplier()
    if (!supplier.probeProductIds) {
      return NextResponse.json(
        { error: 'This supplier has no id sweep. Switch the supplier mode to live PowerBody.' },
        { status: 400 },
      )
    }

    const ceiling = await highestIndexedId()
    const startAt = Math.max(1, Math.floor(body.fromId ?? index.sweptTo ?? ceiling + 1))

    // The canary: an id the feed already named. If the detail call cannot
    // answer for a product we KNOW exists, every empty answer after it is
    // evidence about the account, not about the catalogue.
    const known = Object.values(index.bySku).find((p) => p.productId)
    if (known) {
      const [alive] = await supplier.probeProductIds([known.productId])
      if (!alive) {
        return NextResponse.json(
          {
            error:
              `PowerBody's product list names product ${known.productId}, but their detail call returns nothing for it. ` +
              'Nothing swept would mean anything, so the sweep has not run. getProductInfo may not be enabled on this account, or they are rate-limiting us.',
          },
          { status: 502 },
        )
      }
    }

    const deadline = Date.now() + PASS_BUDGET_MS
    const found: Awaited<ReturnType<NonNullable<typeof supplier.probeProductIds>>> = []
    let cursor = startAt
    let visited = 0
    // Carried across passes. A run that reset at every pass boundary could
    // never reach the stop threshold, and the sweep would walk to infinity one
    // request at a time. Restarting from an explicit `fromId` is a fresh start,
    // so the run resets only then.
    let emptyRun = body.fromId !== undefined ? 0 : index.sweptEmptyRun

    while (Date.now() < deadline && emptyRun < EMPTY_RUN_TO_STOP) {
      const ids = Array.from({ length: BATCH }, (_, i) => String(cursor + i))
      const hits = await supplier.probeProductIds(ids)
      found.push(...hits)
      visited += BATCH
      cursor += BATCH
      emptyRun = hits.length > 0 ? 0 : emptyRun + BATCH
    }

    const sweepComplete = emptyRun >= EMPTY_RUN_TO_STOP
    const next = await mergeSweep(found, { sweptTo: cursor, idsVisited: visited, sweepComplete, emptyRun })

    return NextResponse.json({
      ok: true,
      from: startAt,
      to: cursor - 1,
      visited,
      found: found.length,
      total: Object.keys(next.bySku).length,
      sweptIds: next.sweptIds,
      sweptFound: next.sweptFound,
      // Null once the sweep has concluded; anything else is where to resume.
      nextId: sweepComplete ? null : cursor,
      complete: sweepComplete,
      // Said out loud, because "we stopped seeing products" is a judgement and
      // the reader deserves to know which judgement was made.
      ...(sweepComplete ? { stoppedAfter: EMPTY_RUN_TO_STOP } : {}),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PowerBody could not be reached.' },
      { status: 502 },
    )
  }
}
