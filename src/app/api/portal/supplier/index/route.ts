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
const PAGES_PER_PASS = 12

/**
 * Wait between page requests.
 *
 * The transport's 150ms floor is right for a handful of calls and far too fast
 * for a catalogue: at that pace PowerBody start answering empty arrays, then
 * HTTP 503, and every retry against a shedding server digs the hole deeper. A
 * 195-second run once bought 400 products that way.
 *
 * A one-time index build has no reason to be quick. Eighty pages at two seconds
 * is under three minutes, and it finishes — which the fast version never did.
 */
const PACING_MS = 2_000

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
const PASS_DEADLINE_MS = 40_000

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
    resumeFrom: index.resumeFrom ?? null,
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

  /**
   * Where to start: what the caller asked for, else where the last pass got to.
   *
   * Defaulting to page 1 was fatal rather than merely wasteful. Their list has
   * a per-session row allowance of about 3,000, so a crawl that restarts at
   * page 1 spends the whole allowance re-reading the first thirty pages, goes
   * quiet at page 31, and can never reach page 32 however many times it is
   * pressed. The log showed it as "1500 rows, 0 new" twice over.
   */
  const stored = await readSupplierIndex()
  const fromPage = Math.max(1, Math.floor(body.fromPage ?? (body.reset ? 1 : stored.resumeFrom ?? 1)))
  const startedAt = Date.now()

  try {
    const supplier = await getSupplier()
    /**
     * A fresh session for every pass.
     *
     * PowerBody stop answering `getProductList` after roughly 3,000 rows read
     * in one session — page 31 and everything after it returns an empty array,
     * which is indistinguishable from the end of the feed. That is exactly what
     * made a crawl report "3,000 products, their feed ended here" against a
     * feed measured at 7,943.
     *
     * A pass is 15 pages (1,500 rows), so starting each one on a new session
     * keeps every pass comfortably inside the allowance instead of trying to
     * read eight thousand products through a single login.
     */
    await supplier.resetSession?.().catch(() => {
      // Best effort. A session we could not close expires on its own, and
      // failing to close it must not fail the read that follows.
    })

    const feed = await supplier.getFeed({
      fromPage,
      pageBudget: PAGES_PER_PASS,
      deadlineMs: PASS_DEADLINE_MS,
      pacingMs: PACING_MS,
      // Turns an empty page from a puzzle into a fact: below the measured last
      // page it can only be a refusal, so the pass stops at once instead of
      // spending four more requests proving what we already know.
      ...(stored.measured ? { knownLastPage: stored.measured.lastPage } : {}),
    })
    const before = Object.keys((await readSupplierIndex()).bySku).length

    // Asked rather than inferred. Our own deadline and page budget also stop a
    // pass short, and resuming from those should be immediate — waiting on them
    // would add a minute of nothing to every single pass of a healthy crawl.
    let throttled = feed.stoppedBy === 'refused'
    let complete = feed.complete
    let nextPage = feed.complete ? null : feed.nextPage
    // The highest page actually asked for. `feed.pages` counts REQUESTS —
    // retries included — so using it as a page range labelled a pass that read
    // pages 1, 1, 6 and 21 as "pages 1–4".
    const lastRead = feed.reachedPage

    /**
     * Refuse to call it the end before the page the probe actually measured.
     *
     * This is the backstop that the look-ahead cannot be. Their cut-off is not
     * per page — it silences the WHOLE session — so a page five or twenty on
     * comes back just as empty, and no amount of looking ahead within the dead
     * window can tell a refusal from the end of the feed.
     *
     * A measurement taken while the session was healthy can. If the probe saw
     * 80 pages and the crawl went quiet at 31, that is a refusal, full stop.
     */
    const measured = stored.measured
    if (complete && measured && lastRead < measured.lastPage) {
      complete = false
      throttled = true
      nextPage = lastRead + 1
    }

    // Written only once the honest completeness is known: `complete` is what
    // later tells a caller whether a missing code proves anything.
    const index = await mergeIntoIndex(feed.levels, {
      pagesRead: feed.pages,
      complete,
      reset: body.reset && fromPage === 1,
      // Remembered on the server, so a closed tab or a fresh press picks up
      // here rather than starting the whole allowance over.
      resumeFrom: nextPage,
    })
    const total = Object.keys(index.bySku).length

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
      toPage: lastRead,
      measured: index.measured ?? null,
      resumeFrom: index.resumeFrom ?? null,
      // Null once the feed ended. Anything else is a pause the caller resumes.
      nextPage,
      complete,
      throttled,
      stoppedBy: feed.stoppedBy,
      // True when the pager said "end" and the measurement overruled it.
      overruled: feed.complete && !complete,
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
