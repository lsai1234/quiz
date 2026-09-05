import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { parseRosterCsv } from '@/lib/supplier/roster-csv'
import { rosterRowToProduct } from '@/lib/supplier/roster-import'
import { uniqueProductId } from '@/lib/supplier/mapping'
import { asPendingReview, sourcesForImport } from '@/lib/catalogue/review'
import { addImportedProducts, getImportedProducts, syncPortalRuntime } from '@/lib/portal/store'
import { indexedProductIds } from '@/lib/portal/supplier-index'

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

    /**
     * Resolve this slice against the crawled feed index FIRST.
     *
     * The index is a stored copy of PowerBody's own product list, so a SKU it
     * holds needs no paging and no searching — just one `getProductInfo` by id,
     * which is the call that cannot time out. Without it every row re-walks
     * their feed to rediscover a mapping that never changes, and any row past
     * the feed's ceiling cannot be resolved at all.
     *
     * Every FLAVOUR is looked up too, not just the row's main SKU: each is its
     * own product at PowerBody with its own stock, and that is what makes the
     * difference between offering four flavours and offering four flavours we
     * can actually ship.
     */
    const mainSkus = slice.map((r) => r.sku)
    const everySku = [...new Set(slice.flatMap((r) => [r.sku, ...r.variantSkus]))]
    const indexed = await indexedProductIds(everySku)

    const variantFacts = new Map<string, { qty: number; name?: string | null }>()
    for (const [sku, hit] of indexed) variantFacts.set(sku, { qty: hit.qty })

    let found: Awaited<ReturnType<typeof supplier.getProductsBySku>> = []
    let lookupError: string | null = null

    /*
      Detail for EVERY SKU we have an id for, flavours included — not just the
      row's main one.

      This used to fetch `mainIds` alone, which is where six-flavour products
      came in with one real name and five raw codes in the picker: the index
      gave every flavour its stock, so they were all orderable, but nothing
      ever asked PowerBody what any of them were CALLED. The names only exist
      on the detail call.

      It costs one more id-lookup per flavour, and an id-lookup needs no paging
      and cannot time out — the expensive half of a supplier call is finding
      the id, and the index already did that.
    */
    const everyId = everySku.map((sku) => indexed.get(sku)?.productId).filter((id): id is string => Boolean(id))
    if (everyId.length > 0) {
      try {
        const byId = await supplier.getProductsById(everyId)
        // Verified, not assumed: an index entry that now answers for a
        // different SKU has moved, and trusting it imports another brand's
        // product under our code.
        const verified = byId.filter((p) => everySku.includes(p.sku))
        for (const p of verified) {
          const held = variantFacts.get(p.sku)
          variantFacts.set(p.sku, { qty: held?.qty ?? p.stock ?? 0, name: p.name })
        }
        // The row-level lookup still only wants the MAIN skus: a flavour is a
        // variant of a product, not a product of its own on our side.
        found = verified.filter((p) => mainSkus.includes(p.sku))
      } catch (err) {
        lookupError = err instanceof Error ? err.message : 'PowerBody could not be reached.'
      }
    }

    // Only what the index could not answer for pays for the feed walk.
    const stillMissing = mainSkus.filter((sku) => !found.some((p) => p.sku === sku))
    if (stillMissing.length > 0) {
      try {
        found = [...found, ...(await supplier.getProductsBySku(stillMissing))]
      } catch (err) {
        // A supplier that will not answer must not stop the import: the rows still
        // carry everything the quiz reads. It costs the pictures, and it is said.
        lookupError = err instanceof Error ? err.message : 'PowerBody could not be reached.'
      }
    }
    const bySku = new Map(found.map((p) => [p.sku, p]))

    const taken = [...(await getImportedProducts())]
    const pending = []
    const results = []

    for (const row of slice) {
      const { product, enriched, notes } = rosterRowToProduct(row, bySku.get(row.sku) ?? null, indexed.size > 0 ? variantFacts : undefined)
      const id = uniqueProductId(product, taken)
      // Provenance is recorded honestly: the descriptive half came from the
      // supplier when it did, and from a spreadsheet when it did not.
      // The product id travels with the product. It is the expensive half of
      // every later call, and it never changes.
      const supplierProductId = bySku.get(row.sku)?.productId ?? indexed.get(row.sku)?.productId ?? null
      const stored = asPendingReview(
        { ...product, id, handle: id, ...(supplierProductId ? { supplierProductId: String(supplierProductId) } : {}) },
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
      // How many ROWS the index answered for without a feed walk. Counted over
      // the main SKUs only: the flavour lookups are a detail of those rows, not
      // rows of their own, and counting them would inflate this past the batch.
      fromIndex: mainSkus.filter((sku) => indexed.has(sku)).length,
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
