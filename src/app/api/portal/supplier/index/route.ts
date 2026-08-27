import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { syncPortalRuntime } from '@/lib/portal/store'
import { readSupplierIndex, mergeIntoIndex, clearSupplierIndex } from '@/lib/portal/supplier-index'

export const dynamic = 'force-dynamic'

/**
 * Paging the feed is many throttled calls. It is the CHEAP call — no per-product
 * detail — so the cost is the paging rather than the products, but it still
 * needs the long budget.
 */
export const maxDuration = 60

/**
 * How many pages one pass may read.
 *
 * Not a ceiling on the crawl — a pause in it. A single request cannot read an
 * arbitrarily long feed: it has a platform timeout and the supplier is rate
 * limited. So each pass reads what fits, says where it got to, and the caller
 * comes back for the rest. Sized so a pass finishes well inside `maxDuration`
 * even when PowerBody are slow.
 */
const PAGES_PER_PASS = 15

/**
 * Wall clock one pass may spend before handing back what it has.
 *
 * The page budget alone is not a bound: PowerBody's replies slow right down
 * while they are throttling, so 40 pages that normally take six seconds can
 * take a minute. Without a clock the pass ran past the platform's 60s ceiling
 * and was killed — losing every page it had read, because the index is only
 * written when the route returns.
 *
 * Set well inside `maxDuration` so the pass always gets to save and report
 * where it reached.
 */
const PASS_DEADLINE_MS = 35_000

/** GET → what the stored index currently holds. */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const index = await readSupplierIndex()
  return NextResponse.json({
    products: Object.keys(index.bySku).length,
    pagesRead: index.pagesRead,
    complete: index.complete,
    updatedAt: index.updatedAt,
    sweptIds: index.sweptIds,
    sweptFound: index.sweptFound,
    sweptTo: index.sweptTo,
    sweepComplete: index.sweepComplete,
    measured: index.measured ?? null,
  })
}

/**
 * POST → read another pass of PowerBody's product list into the stored index.
 *
 * Body: `{ fromPage?: number, reset?: boolean }`. The reply carries `nextPage`,
 * which is null once the feed has genuinely ended; the caller loops until then.
 *
 * WHAT THIS BUYS
 * ──────────────
 * Every SKU it reaches resolves to a product id from then on with no paging, no
 * searching and no rate limit — which is the difference between importing a
 * hundred products in a minute and spending tens of throttled requests per
 * product rediscovering a mapping that never changes.
 *
 * WHAT IT CANNOT REACH
 * ────────────────────
 * Whatever their feed refuses to hand over. On this account it has stopped at
 * 3,000 products against a catalogue of 8,000+, with no parameter to raise it.
 * The crawl does not assume that number — it pages until the feed itself ends
 * and reports where that was — so if PowerBody ever lift the cap this simply
 * reads more. What it must never do is let a stopped crawl look like a finished
 * one, which is what `complete` is for: absence only means anything once the
 * feed has actually ended.
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { fromPage?: number; reset?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    // An empty body means "start from the beginning", which is the common case.
  }
  await syncPortalRuntime()

  if (body.reset) await clearSupplierIndex()
  const fromPage = Math.max(1, Math.floor(body.fromPage ?? 1))
  const startedAt = Date.now()

  try {
    const supplier = await getSupplier()
    const feed = await supplier.getFeed({
      fromPage,
      pageBudget: PAGES_PER_PASS,
      deadlineMs: PASS_DEADLINE_MS,
    })
    const before = Object.keys((await readSupplierIndex()).bySku).length
    const index = await mergeIntoIndex(feed.levels, {
      pagesRead: feed.pages,
      complete: feed.complete,
      reset: body.reset && fromPage === 1,
    })
    const total = Object.keys(index.bySku).length

    // Asked rather than inferred. Our own deadline and page budget also stop a
    // pass short, and resuming from those should be immediate — waiting on them
    // would add a minute of nothing to every single pass of a healthy crawl.
    const throttled = feed.stoppedBy === 'refused'

    return NextResponse.json({
      ok: true,
      // Rows read this pass, and how many of them were codes we had never seen.
      read: feed.levels.length,
      added: total - before,
      total,
      pagesRead: index.pagesRead,
      // The page range this pass actually covered, so the screen can say where
      // it is rather than only how much it has.
      fromPage,
      toPage: fromPage + feed.pages - 1,
      measured: index.measured ?? null,
      // Null once the feed ended. Anything else is a pause the caller resumes.
      nextPage: feed.complete ? null : feed.nextPage,
      complete: feed.complete,
      throttled,
      stoppedBy: feed.stoppedBy,
    })
  } catch (err) {
    // Name the stage and the elapsed time. "Could not be reached" after 59
    // seconds is a timeout wearing a network error's clothes, and the two need
    // completely different responses from whoever reads it.
    const seconds = Math.round((Date.now() - startedAt) / 1000)
    const reason = err instanceof Error ? err.message : 'PowerBody could not be reached.'
    return NextResponse.json(
      {
        error:
          `Reading pages ${fromPage}–${fromPage + PAGES_PER_PASS - 1} failed after ${seconds}s: ${reason}` +
          (seconds >= 30 ? ' That is long enough to be a timeout rather than a refusal — press Build again to carry on from here.' : ''),
      },
      { status: 502 },
    )
  }
}
