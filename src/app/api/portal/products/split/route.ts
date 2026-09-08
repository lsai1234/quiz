import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import {
  getImportedProducts,
  addImportedProducts,
  saveImportedProduct,
  setProductOverride,
  syncPortalRuntime,
} from '@/lib/portal/store'
import { splitOut, freeId, normaliseSize } from '@/lib/catalogue/split'

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
 * The two writes are separate, so the order matters: the new product is added
 * FIRST. If the second write fails, the SKUs are listed twice for a moment,
 * which is visibly wrong and fixable. The other order loses them from sale.
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
  const [{ products }, imported] = await Promise.all([getResolvedCatalogue(), getImportedProducts()])
  const product = products.find((p) => p.id === body.id)
  if (!product) return NextResponse.json({ error: 'No such product.' }, { status: 404 })

  const taken = new Set([...products.map((p) => p.id), ...imported.map((p) => p.id)])
  /*
    The new product's URL says what it is.

    `glycine-454g` rather than `glycine-split`: these SKUs are being lifted out
    BECAUSE they are a different size, so the size is the thing that
    distinguishes the new page from the one it came from — and a founder
    reading a list of handles can tell which is which. Falls back to the SKU
    when the sizes disagree, which is a split the founder made for some other
    reason and which only they can name.
  */
  const moving = product.variants.filter((v) => body.variantIds!.includes(v.id))
  const sizes = new Set(moving.map((v) => normaliseSize(v.size)).filter(Boolean))
  const suffix = sizes.size === 1 ? [...sizes][0] : (moving[0]?.sku ?? 'split')
  const result = splitOut(product, body.variantIds, {
    id: freeId(`${product.id}-${suffix}`, taken),
    title: body.title,
  })
  if (!result) {
    return NextResponse.json(
      { error: 'A split needs at least one SKU to move and at least one to leave behind.' },
      { status: 400 },
    )
  }

  const { kept, moved } = result
  await addImportedProducts([moved])

  if (imported.some((p) => p.id === product.id)) {
    await saveImportedProduct(kept)
  } else {
    // An override carries only what changed. `variants` is the split itself;
    // the rest is the face the remaining SKUs now present.
    await setProductOverride(product.id, {
      variants: kept.variants,
      formats: kept.formats,
      defaultVariantId: kept.defaultVariantId,
      basePrice: kept.basePrice,
      compareAtPrice: kept.compareAtPrice,
      imageUrl: kept.imageUrl,
      servings: kept.servings,
      cost: kept.cost,
      ...(kept.consumption ? { consumption: kept.consumption } : {}),
    })
  }

  return NextResponse.json({
    ok: true,
    moved: { id: moved.id, title: moved.title, skus: moved.variants.length },
    kept: { id: kept.id, title: kept.title, skus: kept.variants.length },
  })
}
