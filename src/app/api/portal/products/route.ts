import { NextResponse } from 'next/server'
import { getFounder, isPortalAuthed } from '@/lib/portal/guard'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { syncPortalRuntime, ProductNotFound } from '@/lib/portal/store'
import { productReadiness } from '@/lib/portal/readiness'
import {
  EditRejected,
  approveProduct,
  getEditableProduct,
  listEditableProducts,
  productPayload,
  updateProduct,
} from '@/lib/portal/product-edit'
import {
  ActionRefused,
  discardProduct,
  fillBlanks,
  mergeIntoProduct,
  removeProduct,
  restoreRemovedProduct,
  undoMerge,
} from '@/lib/portal/product-actions'
import { fieldsNeedingReview } from '@/lib/catalogue/review'
import { getDataSource } from '@/lib/data-source'
import { PersistError } from '@/lib/portal/persist'

export const dynamic = 'force-dynamic'

/**
 * Products, for the hub.
 *
 * GET            the products ON SALE with their readiness — what bundle pickers
 *                and Settings → Catalogue count. Unchanged on purpose: those
 *                screens must never be offered a product the shop does not sell.
 * GET ?all=1     every product a founder can open — on sale, waiting for review,
 *                removed — with where it stands. The Products list reads this.
 * GET ?id=…      one product, any state, with what still needs checking and
 *                what else uses it. The product page reads this.
 * POST           change one: { id, set?, variants?, master?, confirm? }, or an
 *                action { id, action: remove | restore | discard | fill-blanks | merge
 *                | undo-merge }. undo-merge takes the REMOVED product's id, and
 *                `view` names the product whose page asked (its payload answers).
 * DELETE         { id } — remove (soft).
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (id) {
    await syncPortalRuntime()
    // Fresh: the page is often opened straight after a split or merge made
    // this product on another server.
    const payload = await productPayload(id, { fresh: true })
    if (!payload) return NextResponse.json({ error: 'There is no such product. It may have been discarded or merged into another.' }, { status: 404 })
    return NextResponse.json(payload)
  }

  if (url.searchParams.get('all')) {
    const entries = await listEditableProducts()
    const live = getDataSource() === 'real'
    return NextResponse.json({
      source: live ? 'real' : 'mock',
      products: entries.map((e) => ({
        ...e,
        readiness: productReadiness(e.product, { live }),
        remaining: e.state === 'pending' ? fieldsNeedingReview(e.product).length : 0,
      })),
    })
  }

  const { products, source, error } = await getResolvedCatalogue()
  const live = source === 'real'
  return NextResponse.json({
    source,
    error,
    products: products.map((p) => ({ product: p, readiness: productReadiness(p, { live }) })),
  })
}

type Body = {
  id?: string
  /** For `approve-ready`: the products to approve (each only if fully checked). */
  ids?: string[]
  action?: 'remove' | 'restore' | 'discard' | 'fill-blanks' | 'merge' | 'undo-merge' | 'approve' | 'approve-ready'
  /** For `merge`: the products whose SKUs come here. */
  from?: string[]
  /** For `undo-merge` sent from the product it was merged into: answer with that one. */
  view?: string
  set?: Record<string, unknown>
  variants?: Array<Record<string, unknown>>
  master?: string
  confirm?: string[]
  /**
   * The old screens' raw patch. No screen sends it any more (the last one,
   * Suggest tags, now sends `set`) and it is refused — see below.
   */
  patch?: unknown
}

/** Every failure as something a founder can read and act on. */
function failure(err: unknown) {
  if (err instanceof EditRejected) return NextResponse.json({ error: err.message, problems: err.problems }, { status: 400 })
  if (err instanceof ProductNotFound) return NextResponse.json({ error: err.message }, { status: 404 })
  if (err instanceof ActionRefused) return NextResponse.json({ error: err.message, link: err.link ?? null }, { status: 409 })
  if (err instanceof PersistError) {
    return NextResponse.json({ error: `Not saved — ${err.message}` }, { status: err.reason === 'conflict' ? 409 : 503 })
  }
  return NextResponse.json({ error: `Not saved — ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (body.action === 'approve-ready') {
    /*
      Each one only if every review field is checked — and the answer always
      says exactly which were approved and which were not, and why.

      Each approval is its own write, so by the time one fails the ones before
      it are on sale. This used to let the first failure answer for the whole
      batch: one product discarded or merged away in another tab (or by a
      co-founder) turned the request into a 404, the queue said "Nothing was
      approved", and the products before it were on sale while the page said
      they were not — and the ones after it were never tried, silently.

        gone      no longer held (discarded, merged away) — reported, the rest go on
        failed    the store refused a write — the rest are not tried, because a
                  store that cannot write one will not write the next; `notTried`
                  lists them so nothing is left unaccounted for
    */
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : []
    if (ids.length === 0) return NextResponse.json({ error: 'No products selected.' }, { status: 400 })
    let by: string | null
    try {
      await syncPortalRuntime()
      by = (await getFounder())?.email ?? null
    } catch (err) {
      return failure(err)
    }
    const approvedIds: string[] = []
    const notReady: Array<{ id: string; remaining: string[] }> = []
    const gone: string[] = []
    let failed: { id: string; error: string; notTried: string[] } | null = null
    for (const [i, pid] of ids.entries()) {
      try {
        const result = await approveProduct(pid, by)
        if (result.ok) approvedIds.push(pid)
        else notReady.push({ id: pid, remaining: result.remaining })
      } catch (err) {
        if (err instanceof ProductNotFound) {
          gone.push(pid)
          continue
        }
        // Nothing approved and nothing else to say: the plain failure is the whole truth.
        if (approvedIds.length === 0 && notReady.length === 0 && gone.length === 0) return failure(err)
        const reason = err instanceof PersistError ? `Not saved — ${err.message}` : err instanceof Error ? err.message : String(err)
        failed = { id: pid, error: reason, notTried: ids.slice(i + 1) }
        break
      }
    }
    return NextResponse.json({ ok: true, approved: approvedIds, notReady, gone, failed })
  }

  if (!body.id || typeof body.id !== 'string') return NextResponse.json({ error: 'Which product? (id required)' }, { status: 400 })
  const id = body.id

  /** Every successful change answers with the product as it now stands. */
  const done = async (extra: Record<string, unknown> = {}) => {
    const payload = await productPayload(id)
    return NextResponse.json({ ok: true, ...extra, ...(payload ?? {}) })
  }

  try {
    await syncPortalRuntime()
    switch (body.action) {
      case 'remove':
        await removeProduct(id)
        return done()
      case 'restore':
        await restoreRemovedProduct(id)
        return done()
      case 'discard':
        await discardProduct(id)
        return NextResponse.json({ ok: true, discarded: id })
      case 'approve': {
        const result = await approveProduct(id, (await getFounder())?.email ?? null)
        if (!result.ok) {
          return NextResponse.json({ error: 'Some fields still need checking.', remaining: result.remaining }, { status: 400 })
        }
        return done()
      }
      case 'fill-blanks': {
        // Only for a product waiting for review: what the model writes is left
        // unconfirmed, so a person still checks it. On a product already on
        // sale it would publish unchecked guesses straight to the shop — the
        // page fills its unsaved form instead, and nothing lands until Save.
        const entry = await getEditableProduct(id)
        if (entry && entry.state !== 'pending') {
          return NextResponse.json(
            { error: 'Fill the blanks writes straight to products waiting for review. For one on sale, use Suggest — it fills the form for you to check and save.' },
            { status: 409 },
          )
        }
        // Under its own key: the payload carries a `source` of its own (real or
        // sample catalogue), and spread beside it the fill's source — AI or
        // keyword guess — was overwritten, so the page could not say which.
        const fill = await fillBlanks(id)
        return done({ fill })
      }
      case 'merge': {
        const result = await mergeIntoProduct(id, Array.isArray(body.from) ? body.from.filter((f) => typeof f === 'string') : [])
        return done({ moved: result.moved, removed: result.removed, discarded: result.discarded })
      }
      case 'undo-merge': {
        const result = await undoMerge(id)
        const extra = { moved: result.moved, restored: { id: result.restored.id, title: result.restored.title }, target: { id: result.target.id, title: result.target.title } }
        if (typeof body.view === 'string' && body.view !== id) {
          const payload = await productPayload(body.view)
          return NextResponse.json({ ok: true, ...extra, ...(payload ?? {}) })
        }
        return done(extra)
      }
      case undefined:
        break
      default:
        return NextResponse.json({ error: `Unknown action “${String(body.action)}”.` }, { status: 400 })
    }

    if (body.patch !== undefined && !body.set && !body.variants && !body.master) {
      // The old screens' raw patch skipped every check `updateProduct` makes,
      // and nothing sends it now. Refused out loud rather than ignored: a page
      // left open from before the change would otherwise be told "saved" for
      // an edit that never happened.
      return NextResponse.json(
        { error: 'Not saved — this page is out of date. Reload it and make the change again.' },
        { status: 400 },
      )
    }

    const { changed } = await updateProduct(id, {
      set: body.set,
      variants: body.variants,
      master: body.master,
      confirm: body.confirm,
    })
    return done({ changed })
  } catch (err) {
    return failure(err)
  }
}

/** Remove a product from the catalogue (soft — it can be restored). */
export async function DELETE(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await syncPortalRuntime()
    await removeProduct(body.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failure(err)
  }
}
