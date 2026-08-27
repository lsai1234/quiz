import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { syncPortalRuntime } from '@/lib/portal/store'
import type { SupplierStockLevel } from '@/lib/supplier/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Where to stop doubling. 8,192 pages is far past any real catalogue. */
const MAX_PAGE = 8_192

/**
 * GET — find out how deep PowerBody's product list actually goes, and what the
 * rows in it look like.
 *
 * WHY IT IS A SEARCH AND NOT A LIST OF GUESSES
 * ────────────────────────────────────────────
 * The first version of this asked a fixed list of pages — 1, 100, 200, 201,
 * 250, 400 — and reported "nothing came back past page 1" when page 1 answered
 * and page 100 did not. Every page between them was never asked about, so the
 * answer was consistent with the feed ending at page 2 or at page 99, and it
 * confidently printed neither. It also assumed fifteen rows a page while page
 * one was returning a hundred, so the product count it quoted was wrong by
 * nearly seven times.
 *
 * So it measures instead: read page one for the real page size, double until a
 * page comes back empty, then bisect for the exact edge. A dozen cheap calls,
 * and the answer is the actual number rather than the nearest number that was
 * guessed at.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()

  try {
    const supplier = await getSupplier()
    const probed: Array<{ page: number; rows: number; firstSku: string | null; lastSku: string | null }> = []

    const read = async (page: number): Promise<SupplierStockLevel[]> => {
      const feed = await supplier.getFeed({ fromPage: page, pageBudget: 1 })
      const rows = feed.levels
      probed.push({
        page,
        rows: rows.length,
        firstSku: rows[0]?.sku ?? null,
        lastSku: rows[rows.length - 1]?.sku ?? null,
      })
      return rows
    }

    const first = await read(1)
    if (first.length === 0) {
      return NextResponse.json({
        ok: true, pageSize: 0, lastPage: 0, totalProducts: 0, probed,
        verdict: 'Their product list returned nothing at all, even on page one. That is an access or rate-limit problem, not a ceiling.',
      })
    }

    const pageSize = first.length

    // Double until a page is empty, so the search brackets the edge instead of
    // assuming where it is.
    let populated = 1
    let empty = 0
    for (let page = 2; page <= MAX_PAGE; page *= 2) {
      if ((await read(page)).length > 0) populated = page
      else { empty = page; break }
    }

    // Bisect for the exact last page that still returns rows.
    if (empty > 0) {
      while (empty - populated > 1) {
        const mid = Math.floor((populated + empty) / 2)
        if ((await read(mid)).length > 0) populated = mid
        else empty = mid
      }
    }

    // The last page is usually short — that is what makes it the last page.
    const lastRows = probed.find((p) => p.page === populated)?.rows ?? pageSize
    const total = (populated - 1) * pageSize + lastRows

    /**
     * Does this look like their DEMO sandbox rather than the real catalogue?
     *
     * Their guide describes it as placeholder products with uniform prices and
     * stock of 10 or 100. Worth flagging loudly: a sandbox answers every call
     * successfully and looks exactly like a small catalogue, so "we only have
     * 3,000 products" and "we are not looking at the real account" are the same
     * screen. Reported as a suspicion with its reasons, never as a fact.
     */
    const prices = new Set(first.map((r) => r.wholesalePrice))
    const stocks = new Set(first.map((r) => r.stock))
    const sandboxSigns: string[] = []
    if (prices.size <= 2) sandboxSigns.push(`every product on page one has one of ${prices.size} price(s)`)
    if (stocks.size <= 2 && [...stocks].every((q) => q === 10 || q === 100)) {
      sandboxSigns.push('stock is only ever 10 or 100')
    }
    if (first[0]?.sku === 'P64') sandboxSigns.push('the first code is P64, the placeholder their guide names')

    const verdict =
      `Their list is ${pageSize} rows a page and ends at page ${populated} — about ${total.toLocaleString()} products.` +
      (total > 3_000
        ? ' That is past 3,000, so there was never a 3,000-product ceiling.'
        : ' So the catalogue reachable on this account really is about that size.')

    return NextResponse.json({
      ok: true,
      pageSize,
      lastPage: populated,
      totalProducts: total,
      probed: probed.sort((a, b) => a.page - b.page),
      verdict,
      ...(sandboxSigns.length >= 2
        ? {
            warning:
              'This looks like PowerBody\'s DEMO sandbox rather than the real catalogue — ' +
              `${sandboxSigns.join(', ')}. A sandbox answers every call successfully, so a small catalogue and the ` +
              'wrong account look identical. Worth checking with your account manager that API access is enabled on the live account.',
          }
        : {}),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PowerBody could not be reached.' },
      { status: 502 },
    )
  }
}
