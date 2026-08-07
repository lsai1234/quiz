import { NextResponse } from 'next/server'
import { isPortalAuthed, getFounder } from '@/lib/portal/guard'
import {
  getPendingReviewProducts,
  saveImportedProduct,
  discardImportedProduct,
  syncPortalRuntime,
} from '@/lib/portal/store'
import { approved, isReviewComplete, fieldsNeedingReview, withConfirmed } from '@/lib/catalogue/review'
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
  action?: 'save' | 'approve' | 'discard'
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: ReviewBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await syncPortalRuntime()

  if (body.action === 'discard') {
    await discardImportedProduct(body.id)
    return NextResponse.json({ ok: true, discarded: body.id })
  }

  const pending = await getPendingReviewProducts()
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
