import { NextResponse } from 'next/server'
import { isPortalAuthed, getFounder } from '@/lib/portal/guard'
import {
  getPendingReviewProducts,
  discardImportedProduct,
  editStoredProduct,
  restructureProducts,
  syncPortalRuntime,
  ProductNotFound,
} from '@/lib/portal/store'
import { approved, isReviewComplete, fieldsNeedingReview, withConfirmed } from '@/lib/catalogue/review'
import { canMerge, mergeProducts } from '@/lib/catalogue/merge'
import { applyPatch, type ProductPatch } from '@/lib/catalogue/patch'
import { getSupplier } from '@/lib/supplier'
import { pullProduct } from '@/lib/supplier/pull'
import { saveProductChange } from '@/lib/portal/editable-products'
import { fillBlanks } from '@/lib/portal/product-actions'
import { PersistError } from '@/lib/portal/persist'
import type { ResolveStep } from '@/lib/supplier/resolve-sku'
import type { CatalogueProduct } from '@/lib/catalogue/types'

export const dynamic = 'force-dynamic'
// Filling from PowerBody may have to search for a SKU's id past the feed's
// ceiling, which is minutes of throttled requests — see `supplier/pull`.
export const maxDuration = 300

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
  patch?: Partial<CatalogueProduct>
  confirm?: string[]
  action?: 'save' | 'approve' | 'discard' | 'combine' | 'enrich' | 'ai-fill'
  ids?: string[]
  title?: string
  stream?: boolean
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

  const pending = await getPendingReviewProducts()
  const target = pending.find((p) => p.id === id)
  if (!target) return NextResponse.json({ error: 'That product is not waiting for review.' }, { status: 404 })

  /*
    Fill from PowerBody. The same pull as the product page's button — see
    `supplier/pull` for what it may write. Streams its steps when asked,
    because finding an id past the feed ceiling can take a minute or two and a
    screen showing nothing that long looks hung.
  */
  if (body.action === 'enrich') {
    if (!target.variants.some((v) => v.sku)) {
      return NextResponse.json({ error: 'This product has no supplier SKU, so there is nothing to look up.' }, { status: 400 })
    }
    type EnrichResult =
      | { ok: true; id: string; filled: string[]; gotImage: boolean; via: string; probes: number; trace: ResolveStep[] }
      | { ok: false; status: number; error: string; trace: ResolveStep[] }

    const run = async (emit: (step: ResolveStep) => void): Promise<EnrichResult> => {
      try {
        const supplier = await getSupplier()
        const result = await pullProduct(target, { supplier, budgetMs: 240_000, force: true, onStep: emit })
        if (result.answered === 0) {
          return {
            ok: false,
            status: 404,
            trace: result.trace,
            error: result.unresolved[0]?.message ?? 'PowerBody did not answer for this product.',
          }
        }
        const confirmed = result.filled.length > 0
          ? (() => {
              const review = result.after.review
              if (!review) return result.after
              const sources = { ...review.sources }
              for (const key of result.filled) sources[key as keyof CatalogueProduct] = 'supplier'
              return { ...result.after, review: { ...review, sources, confirmed: [...new Set([...review.confirmed, ...result.filled])] } }
            })()
          : result.after
        await saveProductChange(target, confirmed)
        return {
          ok: true,
          id: target.id,
          filled: result.filled,
          gotImage: Boolean(confirmed.imageUrl),
          via: 'pull',
          probes: result.trace.reduce((n, s) => Math.max(n, s.probes), 0),
          trace: result.trace,
        }
      } catch (err) {
        return { ok: false, status: 502, trace: [], error: err instanceof Error ? err.message : 'PowerBody could not be reached.' }
      }
    }

    if (body.stream) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const write = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
          try {
            const result = await run((step) => write({ type: 'step', ...step }))
            write({ type: 'result', ...result })
          } catch (err) {
            write({ type: 'result', ok: false, status: 500, trace: [], error: err instanceof Error ? err.message : 'The lookup stopped unexpectedly.' })
          }
          controller.close()
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'X-Accel-Buffering': 'no',
        },
      })
    }
    const result = await run(() => {})
    return result.ok
      ? NextResponse.json(result)
      : NextResponse.json({ error: result.error, trace: result.trace }, { status: result.status })
  }

  /*
    Fill the BLANKS with the classifier, and nothing else — recorded as the
    model's and left unconfirmed, so a person still ticks each one.
  */
  if (body.action === 'ai-fill') {
    try {
      const { filled, source } = await fillBlanks(id)
      return NextResponse.json({ ok: true, id, filled, source })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not fill the blanks.' }, { status: 502 })
    }
  }

  // Save / approve. An edited field is confirmed by the act of editing it, and
  // its source becomes the founder — it is no longer a machine's answer.
  const founder = body.action === 'approve' ? await getFounder() : null
  let refusal: string[] | null = null
  try {
    const next = await editStoredProduct(id, (current) => {
      if (current.review?.status !== 'pending') return null
      const edited = Object.keys(body.patch ?? {})
      let product = body.patch ? applyPatch(current, body.patch as ProductPatch) : current
      product = withConfirmed(product, [...(body.confirm ?? []), ...edited], edited)
      if (body.action === 'approve') {
        if (!isReviewComplete(product)) {
          // The point of the queue is that nothing sells unchecked, so this
          // refuses rather than approving and hoping.
          refusal = fieldsNeedingReview(product).map((f) => f.key as string)
          return null
        }
        product = approved(product, founder?.email)
      }
      return product
    })
    if (refusal) {
      return NextResponse.json({ error: 'Some fields still need checking.', remaining: refusal }, { status: 400 })
    }
    return NextResponse.json({
      ok: true,
      product: next,
      remaining: fieldsNeedingReview(next).map((f) => f.key),
      complete: isReviewComplete(next),
      approved: next.review?.status === 'approved',
    })
  } catch (err) {
    return notSaved(err)
  }
}
