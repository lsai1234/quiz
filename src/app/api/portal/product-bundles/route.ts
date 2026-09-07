import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import type { ProductBundle } from '@/lib/bundles'
import {
  getProductBundles,
  createProductBundle,
  editProductBundle,
  deleteProductBundle,
  getResolvedBundles,
} from '@/lib/bundles/store'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { calculatePricing } from '@/lib/stack-blueprint/pricing'

export const dynamic = 'force-dynamic'

/**
 * Pre-built bundles — the named product stacks a workout bundle sells.
 *
 * Separate from `/api/portal/bundles` because they are separate things: this
 * one owns products, that one owns a session and a story. The split is what
 * lets one stack serve every package built on it.
 *
 * GET carries a little more than the record: what each stack costs right now,
 * and which packages are selling it. Both are the questions a founder asks
 * before editing one, and neither can be answered from the stored row.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [bundles, { products }, workoutBundles] = await Promise.all([
    getProductBundles(),
    getResolvedCatalogue(),
    getResolvedBundles({ includeRemoved: true }),
  ])

  const usage = bundles.map((b) => {
    const pricing = calculatePricing(b.blueprint, products)
    const missing = b.blueprint.slots
      .map((s) => s.selectedProductId)
      .filter((id) => {
        const product = products.find((p) => p.id === id)
        return !product || !product.variants.some((v) => v.available)
      })
    return {
      slug: b.slug,
      price: pricing.oneOffTotal,
      subscriptionPrice: pricing.subscriptionMinOrderMet ? pricing.subscriptionTotal : 0,
      missing,
      usedBy: workoutBundles.filter((w) => w.productBundleSlug === b.slug).map((w) => w.name),
    }
  })

  return NextResponse.json({ bundles, usage })
}

type Action =
  | { action: 'create'; bundle: ProductBundle }
  | { action: 'edit'; slug: string; patch: Partial<ProductBundle> }

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Action
  try {
    body = (await req.json()) as Action
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    switch (body.action) {
      case 'create':
        if (!body.bundle?.slug) return NextResponse.json({ error: 'bundle.slug required' }, { status: 400 })
        await createProductBundle(body.bundle)
        break
      case 'edit':
        if (!body.slug || !body.patch) return NextResponse.json({ error: 'slug and patch required' }, { status: 400 })
        await editProductBundle(body.slug, body.patch)
        break
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * Delete a stack.
 *
 * Refused while a workout bundle still sells it — the store says which ones, so
 * the founder re-points those rather than finding out from an empty shop shelf.
 */
export async function DELETE(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { slug?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
  try {
    await deleteProductBundle(body.slug)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
