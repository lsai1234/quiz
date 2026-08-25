import { NextResponse } from 'next/server'
import { isPortalAuthed, getFounder } from '@/lib/portal/guard'
import {
  getImportedProducts,
  getPendingReviewProducts,
  saveImportedProduct,
  discardImportedProduct,
  syncPortalRuntime,
} from '@/lib/portal/store'
import { approved, isReviewComplete, fieldsNeedingReview, withConfirmed } from '@/lib/catalogue/review'
import { canMerge, mergeProducts } from '@/lib/catalogue/merge'
import { uniqueProductId } from '@/lib/supplier/mapping'
import { getSupplier } from '@/lib/supplier'
import { listPriceFor } from '@/lib/pricing/list-price'
import type { CatalogueProduct } from '@/lib/catalogue/types'

export const dynamic = 'force-dynamic'

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
  action?: 'save' | 'approve' | 'discard' | 'combine' | 'enrich'
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
      const [found] = await supplier.getProductsBySku([sku])
      if (!found) {
        return NextResponse.json(
          { error: `PowerBody returned nothing for ${sku}. It may be past their feed's 3,000-product ceiling.` },
          { status: 404 },
        )
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
      })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'PowerBody could not be reached.' },
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
