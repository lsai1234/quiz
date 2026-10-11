import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { supplierProductToCatalogue } from '@/lib/supplier/mapping'
import { asPendingReview, sourcesForImport, withoutSupplierOwned } from '@/lib/catalogue/review'
import { canMerge, mergeProducts } from '@/lib/catalogue/merge'
import { autopopulateProduct } from '@/lib/supplier/autopopulate'
import { importProducts, restructureProducts, syncPortalRuntime, type ImportOutcome } from '@/lib/portal/store'
import { mergeInto } from '@/lib/catalogue/merge'
import { PersistError } from '@/lib/portal/persist'

export const dynamic = 'force-dynamic'

/**
 * Resolving named SKUs pages the (rate-limited) list feed and then makes one
 * detail call per product, so give it room — the platform default would cut it
 * off and answer with an error page the browser cannot read.
 */
export const maxDuration = 60

/**
 * POST { skus?, productIds?, combine?, title?, autopopulate? } — map the chosen
 * supplier products, AI-fill the CHRGD attributes PowerBody doesn't send
 * (claim-safe), and add them for review. One of `skus` / `productIds` is
 * required.
 *
 * `combine` turns them into ONE product with a variant each, which is how a
 * product that PowerBody sell as four flavours becomes one thing in the shop
 * with a flavour picker. Every variant keeps its own SKU, so it stays orderable.
 *
 * PREFER `productIds` WHEN THE CALLER HAS THEM. Adding by SKU pages the list
 * feed to rediscover the product id — the same walk the lookup just paid for,
 * repeated, with the same chance of running out of the deadline on the way. The
 * lookup hands its resolved ids back on every row for exactly this reason, so
 * the screen can add without searching twice.
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: {
    skus?: unknown
    productIds?: unknown
    autopopulate?: boolean
    combine?: boolean
    title?: string
    /** Add them as more flavours of this existing product instead. */
    into?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const asList = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])
  const skus = asList(body.skus)
  const productIds = asList(body.productIds)
  if (skus.length === 0 && productIds.length === 0) {
    return NextResponse.json({ error: 'skus or productIds must be a non-empty array' }, { status: 400 })
  }
  // Flavours joining an existing product take its tags; classifying them is wasted calls.
  const autopopulate = body.autopopulate !== false && !body.into

  try {
    await syncPortalRuntime()
    const supplier = await getSupplier()
    // Fetches full detail for exactly what was asked for — so what lands in the
    // catalogue is a whole product, never a half-populated row. Ids go straight
    // to the detail call; SKUs are searched for first.
    const [byId, bySku] = await Promise.all([
      productIds.length > 0 ? supplier.getProductsById(productIds) : Promise.resolve([]),
      skus.length > 0 ? supplier.getProductsBySku(skus) : Promise.resolve([]),
    ])
    // De-duped on SKU: the same product asked for both ways is one product, and
    // adding it twice would create two catalogue entries for one thing.
    const seenSku = new Set<string>()
    const toAdd = [...byId, ...bySku].filter((p) => {
      if (p.sku && seenSku.has(p.sku)) return false
      if (p.sku) seenSku.add(p.sku)
      return true
    })
    if (toAdd.length === 0) {
      return NextResponse.json({ error: 'None of the given products were found in the supplier feed.' }, { status: 404 })
    }
    const foundIds = new Set(byId.map((p) => p.productId).filter(Boolean))
    const notFound = [
      ...skus.filter((sku) => !seenSku.has(sku)),
      ...productIds.filter((id) => !foundIds.has(id)),
    ]

    let aiUsed = false
    const mapped: import('@/lib/catalogue/types').CatalogueProduct[] = []
    const sourcesById = new Map<string, ReturnType<typeof sourcesForImport>>()
    for (const sp of toAdd) {
      let product = supplierProductToCatalogue(sp)
      let aiFields: string[] = []
      if (autopopulate) {
        // Enrich the CHRGD-only attributes (claim-safe). Nothing here is trusted
        // blindly: the product lands as `pending` and a founder walks the fields
        // a rule or a model decided before it can be sold.
        const { patch, source } = await autopopulateProduct(product)
        if (source === 'ai') aiUsed = true
        // Only the gaps. The classifier estimates a cost and a serving count for
        // products that have neither, and applying that here overwrote what
        // PowerBody actually charge us with a guess — which then flowed into
        // every margin figure in the hub.
        const enrichment = withoutSupplierOwned(patch)
        aiFields = Object.keys(enrichment)
        product = { ...product, ...enrichment }
      }
      mapped.push(product)
      sourcesById.set(product.id, sourcesForImport(aiFields, aiUsed))
    }

    /*
      Flavours of a product already in the catalogue. The SKUs join it; nothing
      new is created. Checked against the product as it is at write time, and
      refused (not half-done) if the sizes do not match.
    */
    if (typeof body.into === 'string' && body.into) {
      const into = body.into
      const result = await restructureProducts((bench) => {
        const target = bench.get(into)
        if (!target) return { error: 'That product no longer exists.', status: 404 } as const
        const skusHere = mapped.flatMap((p) => p.variants.map((v) => v.sku).filter((s): s is string => Boolean(s)))
        const holder = bench.holderOf(skusHere, into)
        if (holder) {
          return { error: `${holder.product.title} already sells one of these SKUs.`, status: 409, holder: holder.product.id } as const
        }
        const check = canMerge([target, ...mapped])
        if (!check.ok) return { error: check.reason, status: 400 } as const
        const merged = mergeInto(target, mapped)
        bench.put(merged)
        return { added: merged.variants.length - target.variants.length, id: into } as const
      })
      if ('error' in result) return NextResponse.json(result, { status: result.status })
      return NextResponse.json({
        ok: true,
        added: 0,
        into: result.id,
        flavoursAdded: result.added,
        ids: [result.id],
        outcomes: [],
        notFound,
      })
    }

    let toStore = mapped
    if (body.combine) {
      const check = canMerge(mapped)
      if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 })
      toStore = [mergeProducts(mapped, { title: body.title })]
    }

    // Held out of the shop and quiz until reviewed, carrying a record of which
    // fields came from PowerBody, which from our rules, and which from a model.
    const pending = toStore.map((product) =>
      asPendingReview(product, sourcesById.get(product.id) ?? sourcesForImport([], aiUsed)),
    )
    // Never a duplicate and never an un-publish: a SKU already on a product is
    // reported (with where it is) instead of being added a second time.
    const outcomes: ImportOutcome[] = await importProducts(pending)
    const added = outcomes.filter((o) => o.status === 'added')
    return NextResponse.json({
      ok: true,
      added: added.length,
      combined: Boolean(body.combine),
      skusAdded: mapped.length,
      autopopulated: autopopulate,
      aiUsed,
      /** Nothing is sellable yet — the hub sends the founder to Review next. */
      pendingReview: added.length,
      ids: added.map((o) => o.id),
      outcomes,
      // Named explicitly so a typo'd SKU is reported rather than silently
      // dropped from a bulk paste.
      notFound,
    })
  } catch (err) {
    if (err instanceof PersistError) {
      return NextResponse.json({ error: `Not added — ${err.message}` }, { status: 503 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add products.' },
      { status: 502 },
    )
  }
}
