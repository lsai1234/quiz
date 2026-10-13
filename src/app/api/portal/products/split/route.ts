import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { restructureProducts, syncPortalRuntime } from '@/lib/portal/store'
import { listEditableProducts } from '@/lib/portal/product-edit'
import { splitOut, freeId, normaliseSize } from '@/lib/catalogue/split'
import { ActionRefused } from '@/lib/portal/product-actions'
import { productHref } from '@/lib/portal/product-links'

/**
 * Move some of a product's SKUs onto a product of their own.
 *
 * ── What this undoes ────────────────────────────────────────────────────────
 * Import merges every SKU hanging off a PowerBody master into one product with
 * variants, which is right for six flavours of one bag and wrong for a row that
 * hangs 100 capsules and a 454g bag off the same master. Those are two products
 * a customer chooses between, and merged they shared a page, a photograph and
 * one of the two prices.
 *
 * ── Why it is a request and not a migration ─────────────────────────────────
 * Only the founder knows whether two sizes are two products. The rule this
 * offers — same size or not — is evidence, and it is applied by somebody
 * pressing a button on a product they are looking at.
 *
 * ── How both halves are written ─────────────────────────────────────────────
 * The new product is always an IMPORTED product: it did not exist a moment ago,
 * so there is no base row for it to override. The one it came out of is written
 * back the way it is already stored — imported products wholesale, catalogue
 * products through an override — because a direct write to a base product is
 * lost on the next feed sync.
 *
 * Both halves land in one write (`restructureProducts`): the new product and
 * the one it came out of are saved together or not at all, so a SKU is never
 * listed twice or lost from sale by a write that half-happened.
 *
 * ── Not from a removed product ──────────────────────────────────────────────
 * A product that is off sale is refused, with what to do instead. The new
 * product is a fresh record, and nothing about a fresh record says "removed",
 * so the SKUs moved out of a removed product went straight on sale on their
 * own — a product taken off the shop came back in part, with no Restore to
 * press. For a product merged into another it was worse: its SKUs are already
 * sold there, so the split listed the same tub twice under the same variant id.
 * Keeping the new half removed instead would leave the founder looking at a
 * second removed product they never asked for; refusing says the one thing to
 * do first (Restore, or undo the merge) and leaves nothing to tidy up.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string; variantIds?: string[]; title?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
  }
  if (!body.id || !Array.isArray(body.variantIds) || body.variantIds.length === 0) {
    return NextResponse.json({ error: 'A product and at least one SKU are required.' }, { status: 400 })
  }

  await syncPortalRuntime()
  // Any product a founder can open — one still waiting for review splits the
  // same way as one on sale (sizes are often only noticed while reviewing).
  const entries = await listEditableProducts()
  const product = entries.find((e) => e.product.id === body.id)?.product
  if (!product) return NextResponse.json({ error: 'No such product.' }, { status: 404 })

  const taken = new Set(entries.map((e) => e.product.id))
  /*
    The new product's URL says what it is.

    `glycine-454g` rather than `glycine-split`: these SKUs are being lifted out
    BECAUSE they are a different size, so the size is the thing that
    distinguishes the new page from the one it came from — and a founder
    reading a list of handles can tell which is which. Falls back to the SKU
    when the sizes disagree, which is a split the founder made for some other
    reason and which only they can name.
  */
  const variantIds = body.variantIds
  let outcome: { kept: { id: string; title: string; skus: number }; moved: { id: string; title: string; skus: number } } | null
  try {
    // Worked out again inside the write, from the product as it is then: both
    // halves land together or neither does.
    outcome = await restructureProducts((bench) => {
      const current = bench.get(product.id)
      if (!current) return null
      if (bench.isRemoved(current.id)) {
        const skus = current.variants.map((v) => v.sku).filter((s): s is string => Boolean(s))
        const holder = bench.holderOf(skus, current.id)
        const mergedInto =
          holder && holder.state !== 'removed' && holder.product.variants.some((v) => v.formerly?.some((f) => f.productId === current.id))
            ? holder.product
            : null
        throw mergedInto
          ? new ActionRefused(
              `This product was merged into “${mergedInto.title}”, which sells its SKUs now — splitting it here would list them twice. Split them off “${mergedInto.title}” instead, or undo the merge first.`,
              { label: `Open ${mergedInto.title}`, href: productHref(mergedInto.id, 'variants') },
            )
          : new ActionRefused(
              'This product is off sale. Restore it first, then split it — otherwise the SKUs you move out would go on sale on their own.',
            )
      }
      const moving = current.variants.filter((v) => variantIds.includes(v.id))
      const sizes = new Set(moving.map((v) => normaliseSize(v.size)).filter(Boolean))
      const suffix = sizes.size === 1 ? [...sizes][0] : (moving[0]?.sku ?? 'split')
      const result = splitOut(current, variantIds, { id: freeId(`${current.id}-${suffix}`, taken), title: body.title })
      if (!result) return null
      bench.put(result.kept)
      const movedId = bench.add(result.moved)
      return {
        moved: { id: movedId, title: result.moved.title, skus: result.moved.variants.length },
        kept: { id: result.kept.id, title: result.kept.title, skus: result.kept.variants.length },
      }
    })
  } catch (err) {
    if (err instanceof ActionRefused) return NextResponse.json({ error: err.message, link: err.link ?? null }, { status: 409 })
    return NextResponse.json({ error: `Not split: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
  if (!outcome) {
    return NextResponse.json(
      { error: 'A split needs at least one SKU to move and at least one to leave behind.' },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true, moved: outcome.moved, kept: outcome.kept })
}
