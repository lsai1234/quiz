import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { toSupplierRow } from '@/lib/supplier/row'
import { normaliseCode, quickResolve, resolveCode, type CodeResolution } from '@/lib/supplier/resolve-code'
import { readSupplierIndex } from '@/lib/portal/supplier-index'
import { getSupplierSource } from '@/lib/supplier'
import { getPersistedProducts, productHoldingSkus, syncPortalRuntime } from '@/lib/portal/store'
import type { ResolveStep } from '@/lib/supplier/resolve-sku'

export const dynamic = 'force-dynamic'

/**
 * A SKU search past PowerBody's feed ceiling can spend a couple of minutes in
 * throttled requests, and a lookup that is cut off mid-search is the "timed
 * out" founders kept hitting. So this has the platform's long allowance and
 * keeps its own clock well inside it, ending with an answer — never a dead
 * request.
 */
export const maxDuration = 300

/** Kept inside `maxDuration` with room to write the answer. */
const DEFAULT_BUDGET_MS = 150_000
const MAX_BUDGET_MS = 240_000

/**
 * POST { code, budgetMs?, stream? } — find ONE product at PowerBody from a SKU
 * or a product id, the way the add-products page needs it.
 *
 * One code per request on purpose. The page runs a pasted list through this one
 * code at a time, so each code gets the whole time allowance, shows its own
 * progress, and ends with its own answer and its own next step — rather than a
 * batch where one slow SKU times the whole paste out.
 *
 * What comes back, besides the lookup's own outcome (see `resolve-code`):
 *   card   — picture, name, brand, category, stock, what it costs us, the price
 *            it would sell at and the margin, ready to show;
 *   stored — a product in OUR catalogue that already sells this SKU (on sale,
 *            waiting for review, or removed), so the page can say "already in
 *            X" or offer Restore instead of adding a duplicate.
 *
 * Read-only: nothing is added here. `POST /api/portal/supplier` adds.
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { code?: unknown; codes?: unknown; budgetMs?: unknown; stream?: unknown; searchAnyway?: unknown; expectSku?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  /*
    The quick pass: every pasted code in one round trip. Ids already held (on
    our products, in the index) and codes that ARE ids are checked with one
    batch of detail calls. Only what is left gets a search, one code at a time.
  */
  if (Array.isArray(body.codes)) {
    const codes = body.codes.filter((c): c is string => typeof c === 'string').map(normaliseCode).filter(Boolean)
    if (codes.length === 0) return NextResponse.json({ error: 'Paste at least one SKU or product id.' }, { status: 400 })
    if (codes.length > 200) return NextResponse.json({ error: `That is ${codes.length} codes — paste 200 or fewer at a time.` }, { status: 400 })
    try {
      await syncPortalRuntime()
      const [supplier, stored, index] = await Promise.all([getSupplier(), getPersistedProducts(), readSupplierIndex().catch(() => null)])
      const { results, refusal } = await quickResolve(codes, { supplier, savedIdFor: savedIdsIn(stored), index })
      return NextResponse.json({
        supplier: supplier.name,
        source: getSupplierSource(),
        refusal,
        index: index
          ? { products: Object.keys(index.bySku).length, complete: index.complete, updatedAt: index.updatedAt }
          : null,
        results: results.map(({ product, ...r }) => {
          const sku = product?.sku ?? (r.kind === 'sku' ? r.code : null)
          const holder = sku ? productHoldingSkus(stored, [sku]) : null
          return {
            ...r,
            card: product ? toSupplierRow(product, new Set()) : null,
            stored: holder ? { id: holder.product.id, title: holder.product.title, state: holder.state, skus: holder.skus } : null,
          }
        }),
      })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'The lookup failed.' }, { status: 502 })
    }
  }

  const code = typeof body.code === 'string' ? normaliseCode(body.code) : ''
  if (!code) return NextResponse.json({ error: 'Give a SKU or a PowerBody product id.' }, { status: 400 })
  const asked = Number(body.budgetMs)
  const budgetMs = Number.isFinite(asked) && asked > 5_000 ? Math.min(asked, MAX_BUDGET_MS) : DEFAULT_BUDGET_MS

  const run = async (emit: (step: ResolveStep) => void) => {
    await syncPortalRuntime()
    const [supplier, stored] = await Promise.all([getSupplier(), getPersistedProducts()])

    const resolution: CodeResolution = await resolveCode(code, {
      supplier,
      budgetMs,
      savedIdFor: savedIdsIn(stored),
      searchAnyway: body.searchAnyway === true,
      expectSku: typeof body.expectSku === 'string' ? body.expectSku : null,
      onStep: emit,
    })
    const sku = resolution.product?.sku ?? (resolution.kind === 'sku' ? code : null)
    const holder = sku ? productHoldingSkus(stored, [sku]) : null
    const { product, ...rest } = resolution
    return {
      ...rest,
      supplierName: supplier.name,
      card: product ? toSupplierRow(product, new Set()) : null,
      stored: holder
        ? { id: holder.product.id, title: holder.product.title, state: holder.state, skus: holder.skus }
        : null,
    }
  }

  if (body.stream) {
    // Newline-delimited JSON: each step as it happens, then the answer. Marked
    // no-transform/no-buffering so a proxy cannot turn live progress back into
    // a minute of silence.
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
        // A hard stop a little past the lookup's own clock: one PowerBody call
        // can outlive the clock, and a request the platform cuts off mid-way
        // ends with no answer at all — the "timed out" with no way forward.
        // Ending on our terms always leaves the page something to act on.
        let timer: ReturnType<typeof setTimeout> | undefined
        const stop = new Promise<'stopped'>((resolve) => {
          timer = setTimeout(() => resolve('stopped'), budgetMs + 25_000)
        })
        try {
          const result = await Promise.race([run((step) => write({ type: 'step', ...step })), stop])
          if (result === 'stopped') {
            write({
              type: 'result',
              code,
              kind: /^\d+$/.test(code) ? 'id' : 'sku',
              status: 'not-yet',
              message: `PowerBody were slow to answer and our request ran out of time before the search for ${code} finished. Search again to carry on — what it found so far is kept.`,
              next: ['search-again', 'paste-id'],
              trace: [],
              probes: 0,
              card: null,
              stored: null,
            })
          } else {
            write({ type: 'result', ...result })
          }
        } catch (err) {
          write({
            type: 'result',
            code,
            status: 'refused',
            message: `The lookup stopped: ${err instanceof Error ? err.message : String(err)}`,
            next: ['run-checks', 'search-again'],
            trace: [],
            probes: 0,
            card: null,
            stored: null,
          })
        }
        clearTimeout(timer)
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
    return NextResponse.json(await run(() => {}))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The lookup failed.' }, { status: 502 })
  }
}

/** An id already saved on one of our products for a SKU — the cheapest answer there is. */
function savedIdsIn(stored: { imported: import('@/lib/catalogue/types').CatalogueProduct[] }) {
  return (sku: string): string | null => {
    for (const p of stored.imported) {
      const v = p.variants.find((x) => normaliseCode(x.sku ?? '') === sku)
      if (v?.supplierProductId) return v.supplierProductId
      if (v && p.variants.length === 1 && p.supplierProductId) return p.supplierProductId
    }
    return null
  }
}
