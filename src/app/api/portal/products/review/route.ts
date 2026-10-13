import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import {
  getPendingReviewProducts,
  discardImportedProduct,
  restructureProducts,
  syncPortalRuntime,
  ProductNotFound,
} from '@/lib/portal/store'
import { isReviewComplete, fieldsNeedingReview } from '@/lib/catalogue/review'
import { canMerge, mergeProducts } from '@/lib/catalogue/merge'
import { PersistError } from '@/lib/portal/persist'
import type { CatalogueProduct } from '@/lib/catalogue/types'

export const dynamic = 'force-dynamic'

/**
 * The review queue: products imported from PowerBody that are held out of the
 * shop and the quiz until a founder has checked the half a rule or a model
 * decided. Each product is reviewed on its own product page; this is the queue
 * and the actions on it.
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
  action?: 'discard' | 'combine'
  ids?: string[]
  title?: string
}

function notSaved(err: unknown) {
  if (err instanceof ProductNotFound) return NextResponse.json({ error: err.message }, { status: 404 })
  const message = err instanceof Error ? err.message : String(err)
  return NextResponse.json({ error: `Not saved — ${message}` }, { status: err instanceof PersistError ? 503 : 500 })
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

  /*
    Several imported flavours become one product. One write: the sources go and
    the combined product arrives together, or nothing changes.
  */
  if (body.action === 'combine') {
    const ids = [...new Set((body.ids ?? []).filter((id): id is string => typeof id === 'string'))]
    try {
      const outcome = await restructureProducts((bench) => {
        const chosen = ids.map((id) => bench.get(id))
        if (chosen.some((p) => !p || p.review?.status !== 'pending')) {
          return { error: 'Some of those products are not waiting for review.', status: 404 } as const
        }
        const products = chosen as CatalogueProduct[]
        // Refused rather than half-supported when the model cannot carry the
        // difference — see `canMerge`.
        const check = canMerge(products)
        if (!check.ok) return { error: check.reason, status: 400 } as const
        const merged = mergeProducts(products, { title: body.title })
        for (const id of ids) bench.discard(id)
        // Whatever any of them still needed checking, the combined product
        // needs: its review starts from the first one's.
        const id = bench.add({ ...merged, review: products[0].review })
        return { id, variants: merged.variants.length } as const
      })
      if ('error' in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
      return NextResponse.json({ ok: true, ...outcome })
    } catch (err) {
      return notSaved(err)
    }
  }

  if (body.action === 'discard' && Array.isArray(body.ids)) {
    const ids = body.ids.filter((v): v is string => typeof v === 'string' && v !== '')
    if (ids.length === 0) return NextResponse.json({ error: 'No products selected.' }, { status: 400 })
    try {
      await restructureProducts((bench) => {
        for (const id of ids) if (bench.get(id)?.review?.status === 'pending') bench.discard(id)
      })
    } catch (err) {
      return notSaved(err)
    }
    return NextResponse.json({ ok: true, discarded: ids.length })
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const id = body.id

  if (body.action === 'discard') {
    try {
      await discardImportedProduct(id)
    } catch (err) {
      return notSaved(err)
    }
    return NextResponse.json({ ok: true, discarded: id })
  }

  /*
    Nothing else is done here any more, and anything else is refused out loud.

    This route used to save and approve with a raw `patch`: `applyPatch` over
    the stored product with no checks at all — a negative price, a handle
    another product already uses, a PowerBody id that is not a number, and
    `approved` in the same request, so it went on sale with nothing checked.
    No screen sends it now; it was a second write path beside `updateProduct`
    that broke the queue's one rule, that nothing sells unchecked. Its other
    two actions live where the product page and Review already call them:
    filling from PowerBody is POST /api/portal/products/pull, filling blanks
    with the classifier is POST /api/portal/products {action: 'fill-blanks'},
    and saving and approving are POST /api/portal/products, which check every
    field first.

    A page left open from before the change would otherwise be told nothing,
    or worse "saved", so it is told to reload.
  */
  return NextResponse.json(
    { error: 'Not saved — this page is out of date. Reload it and make the change again on the product’s own page.' },
    { status: 400 },
  )
}
