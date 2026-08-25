import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { parseRosterCsv } from '@/lib/supplier/roster-csv'
import { rosterRowToProduct } from '@/lib/supplier/roster-import'
import { uniqueProductId } from '@/lib/supplier/mapping'
import { asPendingReview, sourcesForImport } from '@/lib/catalogue/review'
import { addImportedProducts, getImportedProducts, syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/** Enriching a batch is one throttled supplier call per product, so this needs
 *  the same room a lookup gets. */
export const maxDuration = 60

/**
 * How many rows one request handles.
 *
 * Each row costs a `getProductInfo` against a rate-limited API, so a hundred of
 * them cannot fit in one request. The screen sends slices and stitches the
 * results, the same way the feed export is read — small enough that a slow batch
 * still lands, large enough that a hundred products is a handful of round trips.
 */
const ROWS_PER_BATCH = 12

/**
 * POST — import a slice of a curated roster CSV, enriched from the supplier.
 *
 * WHY BOTH SOURCES
 * ────────────────
 * The CSV carries the decisions PowerBody cannot make for us — swap group,
 * actives, contraindications, servings, which SKUs are flavours of one product —
 * and those are almost the only fields the quiz reads. PowerBody carry the
 * description: picture, category, blurb, and today's cost and stock.
 *
 * Neither is enough alone, so every row is looked up as it imports and the two
 * are merged. A SKU the supplier cannot answer for still imports — it is
 * orderable, because `createOrder` takes a SKU and we already send `product_id`
 * empty — it simply arrives without a picture, and says so.
 *
 * Everything lands as `pending`, invisible to the shop and the quiz until a
 * founder approves it. Nothing here can put a product on sale.
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { csv?: unknown; offset?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (typeof body.csv !== 'string' || body.csv.trim() === '') {
    return NextResponse.json({ error: 'Send the CSV text as `csv`.' }, { status: 400 })
  }
  const rawOffset = Number(body.offset)
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0

  const { rows, warnings } = parseRosterCsv(body.csv)
  if (rows.length === 0) {
    return NextResponse.json({ error: warnings[0] ?? 'No rows found in that file.' }, { status: 400 })
  }

  const slice = rows.slice(offset, offset + ROWS_PER_BATCH)
  if (slice.length === 0) {
    return NextResponse.json({ ok: true, total: rows.length, offset, imported: 0, nextOffset: null, results: [] })
  }

  try {
    await syncPortalRuntime()
    const supplier = await getSupplier()

    // One lookup for the whole slice. `getProductsBySku` checks the committed
    // id map first, so a SKU past the feed's ceiling still resolves when its id
    // has been backfilled — and simply comes back unenriched when it has not.
    let found: Awaited<ReturnType<typeof supplier.getProductsBySku>> = []
    let lookupError: string | null = null
    try {
      found = await supplier.getProductsBySku(slice.map((r) => r.sku))
    } catch (err) {
      // A supplier that will not answer must not stop the import: the rows still
      // carry everything the quiz reads. It costs the pictures, and it is said.
      lookupError = err instanceof Error ? err.message : 'PowerBody could not be reached.'
    }
    const bySku = new Map(found.map((p) => [p.sku, p]))

    const taken = [...(await getImportedProducts())]
    const pending = []
    const results = []

    for (const row of slice) {
      const { product, enriched, notes } = rosterRowToProduct(row, bySku.get(row.sku) ?? null)
      const id = uniqueProductId(product, taken)
      // Provenance is recorded honestly: the descriptive half came from the
      // supplier when it did, and from a spreadsheet when it did not.
      const stored = asPendingReview(
        { ...product, id, handle: id },
        sourcesForImport(enriched ? [] : ['imageUrl', 'description', 'category'], false),
      )
      taken.push(stored)
      pending.push(stored)
      results.push({ sku: row.sku, id, title: product.title, enriched, notes })
    }

    await addImportedProducts(pending)

    const nextOffset = offset + slice.length < rows.length ? offset + slice.length : null
    return NextResponse.json({
      ok: true,
      total: rows.length,
      offset,
      imported: pending.length,
      nextOffset,
      enriched: results.filter((r) => r.enriched).length,
      results,
      // Parse warnings belong to the whole file, so they are sent once with the
      // first slice rather than repeated on every batch.
      warnings: offset === 0 ? warnings : [],
      ...(lookupError ? { lookupError } : {}),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed.' },
      { status: 502 },
    )
  }
}
