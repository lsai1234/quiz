import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getEditableProduct, productPayload } from '@/lib/portal/product-edit'
import { saveProductChange } from '@/lib/portal/editable-products'
import { pullProduct } from '@/lib/supplier/pull'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ResolveStep } from '@/lib/supplier/resolve-sku'

export const dynamic = 'force-dynamic'
/** Finding a SKU's id past the feed ceiling can take a couple of minutes. */
export const maxDuration = 300

/**
 * POST { id, stream?, force? } — pull what PowerBody know about one product
 * onto it (see `supplier/pull` for exactly what it may and may not write).
 *
 * `force` re-prices every SKU by the rule from its own cost — founder prices
 * excepted, always. A product still waiting for review is priced that way
 * regardless, because nobody has priced it yet.
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: unknown; stream?: unknown; force?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'Which product? (id required)' }, { status: 400 })

  const run = async (emit: (step: ResolveStep) => void) => {
    await syncPortalRuntime()
    const entry = await getEditableProduct(id)
    if (!entry) return { ok: false as const, status: 404, error: 'There is no such product.' }
    if (!entry.product.variants.some((v) => v.sku)) {
      return { ok: false as const, status: 400, error: 'This product has no PowerBody SKU, so there is nothing to pull.' }
    }
    const supplier = await getSupplier()
    const result = await pullProduct(entry.product, {
      supplier,
      budgetMs: 240_000,
      force: body.force === true || entry.state === 'pending',
      onStep: emit,
    })
    // What PowerBody answered for is confirmed BY them — nobody needs to
    // re-check a picture that came straight from the supplier.
    const after = confirmFromSupplier(result.after, result.filled)
    await saveProductChange(entry.product, after)
    const payload = await productPayload(id)
    return {
      ok: true as const,
      ...(payload ?? {}),
      filled: result.filled,
      changed: result.changed,
      answered: result.answered,
      unresolved: result.unresolved,
      trace: result.trace,
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
          write({ type: 'result', ok: false, status: 500, error: `Not saved — ${err instanceof Error ? err.message : String(err)}` })
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

  try {
    const result = await run(() => {})
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: result.status })
  } catch (err) {
    return NextResponse.json({ error: `Not saved — ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}

function confirmFromSupplier(product: CatalogueProduct, filled: string[]): CatalogueProduct {
  const review = product.review
  if (!review || filled.length === 0) return product
  const sources = { ...review.sources }
  for (const key of filled) sources[key as keyof CatalogueProduct] = 'supplier'
  return { ...product, review: { ...review, sources, confirmed: [...new Set([...review.confirmed, ...filled])] } }
}
