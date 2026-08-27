import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Pages to look at when nobody names any. Spread either side of page 200 —
 *  which is where our own former page guard stopped, and therefore where a
 *  supposed 3,000-product ceiling would appear if it were real. */
const DEFAULT_PAGES = [1, 100, 200, 201, 250, 400, 600, 800, 1200]

/**
 * GET — ask PowerBody for specific pages of the product list and report exactly
 * what came back.
 *
 * WHY THIS EXISTS
 * ───────────────
 * "Their feed caps at 3,000 products" was asserted here for a long time on the
 * strength of an export that produced exactly 3,000 rows. That number was ours:
 * `MAX_PAGES` was 200, fifteen rows a page, and a pager that stops on its own
 * budget looks identical to a feed that ended — the last page is FULL either
 * way, which is the tell nobody read.
 *
 * A cap that is really theirs and a cap that is really ours need completely
 * different fixes, and the difference is one request to page 201. So rather
 * than reasoning about it, this asks — and prints the answer.
 *
 * Each page reports its row count and the first and last code and id on it, so
 * three things are distinguishable at a glance:
 *   - rows keep coming past page 200 → the ceiling was ours, and is now gone;
 *   - page 201 is empty while page 200 is full → the ceiling is theirs;
 *   - every page returns the SAME codes → paging is being ignored, and the
 *     "3,000 products" were 200 copies of the same 15.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()

  const asked = new URL(req.url).searchParams.get('pages')
  const pages = (
    asked
      ? asked.split(',').map((p) => Number(p.trim())).filter((p) => Number.isFinite(p) && p >= 1)
      : DEFAULT_PAGES
  ).slice(0, 24)

  try {
    const supplier = await getSupplier()
    const results = []

    for (const page of pages) {
      try {
        const feed = await supplier.getFeed({ fromPage: page, pageBudget: 1 })
        const rows = feed.levels
        results.push({
          page,
          rows: rows.length,
          firstSku: rows[0]?.sku ?? null,
          lastSku: rows[rows.length - 1]?.sku ?? null,
          firstId: rows[0]?.productId ?? null,
          lastId: rows[rows.length - 1]?.productId ?? null,
        })
      } catch (err) {
        results.push({ page, rows: 0, error: err instanceof Error ? err.message : String(err) })
      }
    }

    // The reading, done here rather than left to the eye. Each of these is a
    // different conclusion with a different fix, and saying which one the data
    // supports is the whole point of the probe.
    const withRows = results.filter((r) => r.rows > 0)
    const deepest = withRows.length > 0 ? Math.max(...withRows.map((r) => r.page)) : 0
    const distinctFirsts = new Set(withRows.map((r) => r.firstSku)).size
    const verdict =
      withRows.length === 0
        ? 'Their product list returned nothing at all — this is an access or rate-limit problem, not a ceiling.'
        : distinctFirsts === 1 && withRows.length > 1
          ? 'Every page came back with the SAME first code, so the page parameter is being ignored. Any "total" read from paging this is one page repeated.'
          : deepest > 200
            ? `Rows are still coming at page ${deepest} — that is past 3,000 products, so there is no 3,000 ceiling. The old limit was ours.`
            : `Nothing came back past page ${deepest}. On this evidence their list really does stop there (${deepest * 15} products).`

    return NextResponse.json({ ok: true, pages: results, deepestPageWithRows: deepest, verdict })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PowerBody could not be reached.' },
      { status: 502 },
    )
  }
}
