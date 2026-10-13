import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getEditableProduct, productPayload } from '@/lib/portal/product-edit'
import { saveProductChange } from '@/lib/portal/editable-products'
import { pullProduct, settlePull, startPull } from '@/lib/supplier/pull'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ResolveStep } from '@/lib/supplier/resolve-sku'

export const dynamic = 'force-dynamic'
/** Finding a SKU's id past the feed ceiling can take a couple of minutes. */
export const maxDuration = 300

/** What the pull itself may spend, checked between SKUs and between batches of held ids. */
const PULL_BUDGET_MS = 240_000

/**
 * The hard stop: below `maxDuration`, with room left to save.
 *
 * The pull's own budget is only looked at between calls, and one PowerBody
 * call that is not being answered can outlive it — a timeout, its retries and
 * their backoff. When that ran past `maxDuration` the platform killed the
 * request: no result line, and nothing from the pull saved, so "press it again"
 * repeated the same wait and Pull all moved on to the next product to do it
 * again. Racing the run against this instead always ends on our terms: what
 * PowerBody did answer is saved, and the reply says so.
 */
const PULL_HARD_STOP_MS = 270_000

type PullReply =
  | ({ ok: true } & Record<string, unknown>)
  | { ok: false; status: number; error: string; timedOut?: true }

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

  /*
    Shared between the run and the hard stop: the product as read, what the pull
    has gathered so far, and who saves. Exactly one of them saves — the run if
    it gets there first, otherwise the stop — so a run that finally returns
    after the stop has answered cannot write over what the stop saved.
  */
  const progress = startPull()
  let read: { product: CatalogueProduct; supplierName: string } | null = null
  let saver: 'run' | 'stop' | null = null

  /*
    What PowerBody sent is settled onto the product AS IT STANDS NOW, not as it
    was read when the pull began.

    A pull runs for minutes, and Pull all works through the Review queue while
    the founder is reviewing those same products. Settled against the copy read
    at the start, a SKU the founder had meanwhile set to 60 servings (or given a
    price of their own) still looked like PowerBody's to refresh, and the save
    put PowerBody's 66 back over it — the "my servings change saved and then
    undid itself" complaint, by a different road. Read again here, the pricing
    rules see the founder's count and leave it, and the save carries only what
    the pull itself changed.
  */
  const save = async (held: { product: CatalogueProduct; supplierName: string }, stopped: boolean) => {
    const entry = await getEditableProduct(id)
    const product = entry?.product ?? held.product
    const force = body.force === true || (entry ? entry.state === 'pending' : false)
    const result = settlePull(product, progress, { force, supplierName: held.supplierName, stopped })
    // What PowerBody answered for is confirmed BY them — nobody needs to
    // re-check a picture that came straight from the supplier.
    const after = confirmFromSupplier(result.after, result.filled)
    await saveProductChange(product, after)
    const payload = await productPayload(id)
    return {
      result,
      reply: {
        ok: true as const,
        ...(payload ?? {}),
        filled: result.filled,
        changed: result.changed,
        answered: result.answered,
        unresolved: result.unresolved,
        refused: result.refused ?? null,
        trace: result.trace,
      },
    }
  }

  const run = async (emit: (step: ResolveStep) => void): Promise<PullReply | null> => {
    await syncPortalRuntime()
    const entry = await getEditableProduct(id)
    if (!entry) return { ok: false as const, status: 404, error: 'There is no such product.' }
    if (!entry.product.variants.some((v) => v.sku)) {
      return { ok: false as const, status: 400, error: 'This product has no PowerBody SKU, so there is nothing to pull.' }
    }
    const supplier = await getSupplier()
    const force = body.force === true || entry.state === 'pending'
    read = { product: entry.product, supplierName: supplier.name }
    // The result settled here is against the product as read; `save` settles
    // what was gathered again, onto the product as it is by then.
    await pullProduct(entry.product, {
      supplier,
      budgetMs: PULL_BUDGET_MS,
      force,
      onStep: emit,
      progress,
    })
    if (saver) return null // the hard stop has answered, and saved what was here
    saver = 'run'
    return (await save(read, false)).reply
  }

  /** The hard stop's answer: save what PowerBody did answer, and say so. */
  const stopped = async (): Promise<PullReply> => {
    const held = read as { product: CatalogueProduct; supplierName: string } | null
    if (!held) {
      return {
        ok: false as const,
        status: 504,
        timedOut: true as const,
        error:
          'PowerBody did not answer in time, and the pull stopped before it had asked them anything. Nothing was changed — ' +
          'try again in a few minutes, and if it keeps happening run the supplier checks in Settings → Supplier.',
      }
    }
    const { result, reply } = await save(held, true)
    const kept = result.answered
    const total = kept + result.unresolved.length
    return {
      ...reply,
      timedOut: true,
      message:
        `PowerBody stopped answering, so the pull stopped before it finished. ` +
        (kept > 0
          ? `What they had sent for ${kept} of ${total} SKU${total === 1 ? '' : 's'} is saved; `
          : 'Nothing new had arrived, so nothing was changed; ') +
        'pull again later to carry on. If it keeps happening, run the supplier checks in Settings → Supplier.',
    }
  }

  /** The run, raced against the hard stop. */
  const answer = async (emit: (step: ResolveStep) => void): Promise<PullReply> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = new Promise<'stopped'>((resolve) => {
      timer = setTimeout(() => resolve('stopped'), PULL_HARD_STOP_MS)
    })
    try {
      const running = run(emit)
      const outcome = await Promise.race([running, stop])
      if (outcome !== 'stopped') return outcome as PullReply
      // The run reached its own save first: that is seconds from done, and is
      // the answer — saving again from here would only race it.
      if (saver === 'run') return (await running) as PullReply
      saver = 'stop'
      // The run carries on in the background until its call gives up; it can
      // no longer save, and if it fails now nobody is waiting to hear.
      running.catch(() => undefined)
      return await stopped()
    } finally {
      clearTimeout(timer)
    }
  }

  if (body.stream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // After the hard stop the abandoned run may still report a step as its
        // last call gives up; by then the reply is closed and the step has
        // nowhere to go.
        let closed = false
        const write = (line: unknown) => {
          if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
        }
        try {
          const result = await answer((step) => write({ type: 'step', ...step }))
          write({ type: 'result', ...result })
        } catch (err) {
          write({ type: 'result', ok: false, status: 500, error: `Not saved — ${err instanceof Error ? err.message : String(err)}` })
        }
        closed = true
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
    const result = await answer(() => {})
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
