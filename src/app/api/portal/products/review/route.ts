import { NextResponse } from 'next/server'
import { isPortalAuthed, getFounder } from '@/lib/portal/guard'
import {
  getImportedProducts,
  getPendingReviewProducts,
  saveImportedProduct,
  discardImportedProduct,
  syncPortalRuntime,
} from '@/lib/portal/store'
import { approved, isReviewComplete, fieldsNeedingReview, withConfirmed, withoutSupplierOwned, isBlankValue } from '@/lib/catalogue/review'
import { canMerge, mergeProducts } from '@/lib/catalogue/merge'
import { uniqueProductId } from '@/lib/supplier/mapping'
import { getSupplier } from '@/lib/supplier'
import { autopopulateProduct } from '@/lib/supplier/autopopulate'
import { resolveProductIdForSku } from '@/lib/supplier/resolve-sku'
import { listPriceFor } from '@/lib/pricing/list-price'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { SupplierProduct } from '@/lib/supplier/types'

export const dynamic = 'force-dynamic'
// The SKU search is tens of throttled requests, so this route needs the long
// budget. `resolveProductIdForSku` keeps its own clock well inside it.
export const maxDuration = 60

/**
 * The import review queue.
 *
 * Products added from PowerBody land here rather than in the shop. Everything a
 * rule or a model decided has to be confirmed — or corrected — before the
 * product can be sold, because the fields nobody looks at are exactly the ones
 * that decide who the quiz recommends it to.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  const pending = await getPendingReviewProducts()
  return NextResponse.json({
    products: pending.map((product) => ({
      product,
      remaining: fieldsNeedingReview(product).map((f) => f.key),
      complete: isReviewComplete(product),
    })),
    count: pending.length,
  })
}

interface ReviewBody {
  id?: string
  /** Field edits to apply before confirming. */
  patch?: Partial<CatalogueProduct>
  /** Fields being ticked off as checked. */
  confirm?: string[]
  action?: 'save' | 'approve' | 'discard' | 'combine' | 'enrich' | 'ai-fill'
  /** For `combine`: the products to fold into one. */
  ids?: string[]
  /** For `combine`: what to call the result. Defaults to what the titles share. */
  title?: string
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: ReviewBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  await syncPortalRuntime()

  if (body.action === 'combine') {
    const ids = (body.ids ?? []).filter((id): id is string => typeof id === 'string')
    const pending = await getPendingReviewProducts()
    const chosen = ids.map((id) => pending.find((p) => p.id === id)).filter((p): p is CatalogueProduct => Boolean(p))
    if (chosen.length !== ids.length) {
      return NextResponse.json({ error: 'Some of those products are not waiting for review.' }, { status: 404 })
    }

    // Refused rather than half-supported when the variant model cannot carry the
    // difference — see `canMerge`.
    const check = canMerge(chosen)
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 })

    const merged = mergeProducts(chosen, { title: body.title })
    // The merged name can slug to something another product already owns —
    // combining two products called "Product 20"/"Product 21" yields "product".
    // Checked against everything EXCEPT the ones being replaced, which are about
    // to stop existing.
    const others = (await getImportedProducts()).filter((p) => !ids.includes(p.id))
    const id = uniqueProductId(merged, others)
    // Whatever any of them still needed checking, the combined product needs:
    // its review starts from the primary's.
    const combined: CatalogueProduct = {
      ...merged,
      id,
      handle: id,
      review: chosen[0].review,
    }

    // Replace the sources with the combined product: discarding first means a
    // failure part-way cannot leave the originals gone and nothing in their place.
    await saveImportedProduct(combined, { replacing: ids })
    return NextResponse.json({ ok: true, id: combined.id, variants: combined.variants.length })
  }

  /**
   * Discard several at once.
   *
   * Checked BEFORE the single-id guard, because a bulk discard has ids and no
   * id. Worth having as its own path rather than looping in the browser: a
   * hundred sequential requests is a hundred chances to half-finish, and
   * clearing a queue you are about to re-import has to either happen or not.
   */
  if (body.action === 'discard' && Array.isArray(body.ids)) {
    const ids = body.ids.filter((v): v is string => typeof v === 'string' && v !== '')
    if (ids.length === 0) return NextResponse.json({ error: 'No products selected.' }, { status: 400 })
    for (const id of ids) await discardImportedProduct(id)
    return NextResponse.json({ ok: true, discarded: ids.length })
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (body.action === 'discard') {
    await discardImportedProduct(body.id)
    return NextResponse.json({ ok: true, discarded: body.id })
  }

  const pendingForAction = await getPendingReviewProducts()

  /**
   * Pull the descriptive half from PowerBody for ONE product, on demand.
   *
   * Doing this during a bulk import means a hundred throttled calls in a row,
   * which is exactly when their rate limiter starts refusing and every product
   * arrives pictureless. Doing it here costs one call at the moment somebody is
   * actually looking at the product, which is both far kinder to the limit and
   * the point at which a missing picture is worth noticing.
   *
   * Only the descriptive fields and the cost are taken. The roster's judgement —
   * swap group, actives, contraindications, servings — is never overwritten:
   * that is the half PowerBody cannot answer, and a founder decided it.
   */
  if (body.action === 'enrich') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const target = pendingForAction.find((p) => p.id === body.id)
    if (!target) return NextResponse.json({ error: 'That product is not waiting for review.' }, { status: 404 })

    const sku = target.variants.find((v) => v.sku)?.sku
    if (!sku) {
      return NextResponse.json(
        { error: 'This product has no supplier SKU, so there is nothing to look up.' },
        { status: 400 },
      )
    }

    try {
      const supplier = await getSupplier()

      /**
       * Three routes to the same product, cheapest first.
       *
       * 1. A product id we already hold — one request, no paging, cannot time out.
       * 2. The SKU, via the list feed. Free when the SKU is inside the feed's
       *    3,000-product ceiling.
       * 3. A binary search over `getProductInfo`, for a SKU above that ceiling.
       *    The feed cannot reach those AT ALL — no parameter raises the cap — so
       *    without this a quarter of the roster is permanently unimportable.
       *    It costs tens of throttled requests, which is why it is last and why
       *    the id it finds is written back to the product.
       */
      let found: SupplierProduct | undefined
      let resolvedId: string | null = null
      let via: 'id' | 'feed' | 'search' = 'feed'
      let probes = 0

      if (target.supplierProductId) {
        const [byId] = await supplier.getProductsById([target.supplierProductId])
        // Verified, never assumed: an id that now answers with a different SKU
        // has moved, and trusting it would import somebody else's product.
        if (byId?.sku === sku) { found = byId; via = 'id' }
      }

      if (!found) {
        // A SKU past the ceiling makes this walk the whole feed and run out of
        // its build deadline, which arrives as a throw. That is not a supplier
        // outage and must not end the attempt — it is the exact case the search
        // below exists for.
        found = await supplier.getProductsBySku([sku]).then((r) => r[0]).catch(() => undefined)
      }

      if (!found) {
        const outcome = await resolveProductIdForSku(sku, supplier)
        probes = outcome.probes
        via = 'search'
        if (outcome.productId === null) {
          // Each reason is a different instruction to the person reading it, so
          // they are never collapsed into one message. A clock that ran out is
          // "try again"; an exhausted range is "this is not on the account".
          const why: Record<string, string> = {
            deadline: `Searched ${outcome.probes} product ids for ${sku} without finding it before running out of time. Press again to carry on from a fresh budget.`,
            'probe-budget': `Searched ${outcome.probes} product ids for ${sku} without finding it. Press again to search further.`,
            'not-found': `${sku} is not on this PowerBody account — searched their product ids either side of where this code should sit and it is not there. Check the code.`,
            'no-anchors': 'Could not read any of PowerBody\'s product list, so there is nothing to work out where this code sits from. Check the supplier credentials.',
            'unusable-sku': `${sku} has no number in it, so there is no way to work out where it sits in their catalogue. Use the product ID box instead.`,
          }
          return NextResponse.json({ error: why[outcome.reason] ?? `Could not resolve ${sku}.` }, { status: 404 })
        }
        resolvedId = String(outcome.productId)
        const [byId] = await supplier.getProductsById([resolvedId])
        if (byId?.sku !== sku) {
          return NextResponse.json({ error: `Found a product id for ${sku} but it answered for ${byId?.sku ?? 'nothing'}. Not importing it.` }, { status: 502 })
        }
        found = byId
      }

      // Cost is theirs, and the shelf price is our rule applied to it — the same
      // way the importer does it, so a product enriched here and one enriched at
      // import cannot end up priced differently.
      const cost = found.wholesalePrice > 0 ? found.wholesalePrice : target.cost
      const patch: Partial<CatalogueProduct> = {
        ...(found.imageUrl ? { imageUrl: found.imageUrl } : {}),
        ...(found.description ? { description: found.description } : {}),
        ...(found.category ? { category: found.category } : {}),
        ...(found.weightGrams != null ? { weightGrams: found.weightGrams } : {}),
        ...(found.vatRate != null ? { vatRate: found.vatRate } : {}),
        ...(found.rrp > 0 ? { compareAtPrice: found.rrp, supplierRrp: found.rrp } : {}),
        ...(cost != null && cost > 0 ? { cost, basePrice: listPriceFor(cost) } : {}),
      }
      // The id is the expensive half. Written back so no later pull, price
      // refresh or stock check ever pays for the search again.
      const supplierProductId = resolvedId ?? found.productId ?? target.supplierProductId ?? null
      if (supplierProductId) patch.supplierProductId = String(supplierProductId)
      const next: CatalogueProduct = { ...target, ...patch }
      // Variant prices follow the product's, or the shop would ring up the old one.
      if (patch.basePrice != null) {
        next.variants = next.variants.map((v) => ({ ...v, price: patch.basePrice as number }))
      }
      // Fields PowerBody answered for are confirmed BY them — nobody needs to
      // re-check a picture that came straight from the supplier.
      await saveImportedProduct(withConfirmed(next, Object.keys(patch), []))

      return NextResponse.json({
        ok: true,
        id: target.id,
        filled: Object.keys(patch),
        gotImage: Boolean(found.imageUrl),
        via,
        probes,
      })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'PowerBody could not be reached.' },
        { status: 502 },
      )
    }
  }

  /**
   * Fill the BLANKS with the classifier, and nothing else.
   *
   * "Blank" is the whole contract. A field somebody has already filled — from
   * the roster, from PowerBody, or by hand in this screen — is a decision, and
   * a model overwriting a decision is the single worst thing this could do. So
   * every candidate is checked against the product as it stands and dropped if
   * that field already holds anything.
   *
   * WHAT IT MAY NOT TOUCH
   * `withoutSupplierOwned` strips the fields PowerBody own and the ones our own
   * pricing rule computes. A model guessing a cost or a shelf price would put a
   * fabricated number straight into the margin model.
   *
   * WHAT IT LEAVES UNDONE, ON PURPOSE
   * Filled fields are recorded as `ai` (or `heuristic`) and are deliberately NOT
   * marked confirmed. That is the difference between this and the PowerBody
   * pull: a picture from the supplier is a fact and needs no second opinion,
   * whereas a model's answer to "what is this product for" is a suggestion and
   * must still be ticked by a person before the product can be approved. The
   * queue's "N fields left to check" counter therefore does not fall.
   *
   * Claim safety is hard-gated upstream in `autopopulateProduct`: generated card
   * copy has to be grounded in `APPROVED_CLAIMS` for the product's swap group or
   * it is replaced, so no new health claim can be invented here.
   */
  if (body.action === 'ai-fill') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const target = pendingForAction.find((p) => p.id === body.id)
    if (!target) return NextResponse.json({ error: 'That product is not waiting for review.' }, { status: 404 })

    try {
      const { patch, source } = await autopopulateProduct(target)
      const candidate = withoutSupplierOwned(patch)

      const filled: Partial<CatalogueProduct> = {}
      for (const [key, value] of Object.entries(candidate)) {
        // Blanks only. An already-filled field is somebody's decision, and a
        // model quietly overwriting a decision is the worst thing this could do.
        if (!isBlankValue(key, (target as unknown as Record<string, unknown>)[key])) continue
        if (value === null || value === undefined) continue
        if (typeof value === 'string' && value.trim() === '') continue
        if (Array.isArray(value) && value.length === 0) continue
        ;(filled as Record<string, unknown>)[key] = value
      }

      const keys = Object.keys(filled)
      if (keys.length === 0) {
        return NextResponse.json({ ok: true, id: target.id, filled: [], source })
      }

      const review = target.review
      const next: CatalogueProduct = {
        ...target,
        ...filled,
        ...(review
          ? {
              review: {
                ...review,
                sources: {
                  ...review.sources,
                  ...Object.fromEntries(keys.map((k) => [k, source])),
                },
                // Confirmed is untouched: a machine wrote these, so a person
                // still has to tick them before this product can be approved.
                confirmed: review.confirmed.filter((k) => !keys.includes(k)),
              },
            }
          : {}),
      }
      await saveImportedProduct(next)

      return NextResponse.json({ ok: true, id: target.id, filled: keys, source })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Could not fill the blanks.' },
        { status: 502 },
      )
    }
  }

  const pending = pendingForAction
  const current = pending.find((p) => p.id === body.id)
  if (!current) {
    return NextResponse.json({ error: 'That product is not waiting for review.' }, { status: 404 })
  }

  // An edited field is confirmed by the act of editing it, and its source
  // becomes the founder — it is no longer a machine's answer.
  const edited = Object.keys(body.patch ?? {})
  let next: CatalogueProduct = { ...current, ...(body.patch ?? {}) }
  next = withConfirmed(next, [...(body.confirm ?? []), ...edited], edited)

  if (body.action === 'approve') {
    if (!isReviewComplete(next)) {
      // The point of the queue is that nothing sells unchecked, so this refuses
      // rather than approving and hoping.
      return NextResponse.json(
        {
          error: 'Some fields still need checking.',
          remaining: fieldsNeedingReview(next).map((f) => f.key),
        },
        { status: 400 },
      )
    }
    const founder = await getFounder()
    next = approved(next, founder?.email)
  }

  await saveImportedProduct(next)
  return NextResponse.json({
    ok: true,
    product: next,
    remaining: fieldsNeedingReview(next).map((f) => f.key),
    complete: isReviewComplete(next),
    approved: next.review?.status === 'approved',
  })
}
