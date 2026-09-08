import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import {
  getImportedProducts,
  saveImportedProduct,
  getProductOverrides,
  setProductOverride,
  syncPortalRuntime,
} from '@/lib/portal/store'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { putNamesRightWayRound } from '@/lib/supplier/variant-naming'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * Put every product's name and its flavours' names the right way round.
 *
 * ── What this is, and what it is not ────────────────────────────────────────
 * NOT the other name repair. `repair-variants` asks PowerBody what each SKU is
 * called, because it exists for flavours that have no name at all — the rows
 * showing "P45757". This is for the damage left when the names are all present
 * and all on the wrong rows:
 *
 *   Protein Bars, Caramel Chaos - 12 x 60g       ← the product
 *     ├ Protein Bars                             ← the product's name, on a row
 *     ├ Bars, Chocolate Chip Cookie Dough - …
 *     └ Protein Bars, Dark Chocolate Mint - …
 *
 * Everything needed to see that is already here: the title opens with one of
 * its own rows and then keeps going. So this talks to nobody. No supplier call,
 * no rate limit, no timeout, no half-finished run — which is why it can sweep
 * the whole catalogue in one press where the supplier-driven pass has to be
 * batched and watched.
 *
 * ── Why it is a button and not automatic ────────────────────────────────────
 * It rewrites titles, and a title is the most visible field there is. The rule
 * is provable from the strings, but a founder should be the one who says "yes,
 * do that to my shop", and should be able to read afterwards what it did — so
 * GET reports what it would change and changes nothing, and POST reports every
 * rename it made.
 *
 * Products imported from now on do not need it: `rosterRowToProduct` runs the
 * same rule as it builds them.
 */
export const dynamic = 'force-dynamic'

interface Renamed {
  productId: string
  from: string
  to: string
  /** Flavour label → what it became. */
  flavours: Record<string, string>
}

/**
 * Every product, from both places one can live.
 *
 * A product is either still `imported` and awaiting review, or it is in the
 * live catalogue with its edits held as an override. Repairing only the first
 * would leave the shop exactly as wrong as it is now, which is the half
 * customers can see.
 */
async function allProducts(): Promise<CatalogueProduct[]> {
  await syncPortalRuntime()
  const [imported, resolved, overrides] = await Promise.all([
    getImportedProducts(),
    getResolvedCatalogue(),
    getProductOverrides(),
  ])
  const byId = new Map<string, CatalogueProduct>()
  for (const p of resolved.products) byId.set(p.id, p)
  for (const p of imported) byId.set(p.id, { ...p, ...(overrides[p.id] ?? {}) } as CatalogueProduct)
  return [...byId.values()]
}

/** What the pass would do to one product, or null when it would do nothing. */
function planFor(product: CatalogueProduct): Renamed | null {
  const righted = putNamesRightWayRound(product)
  if (!righted) return null
  const flavours: Record<string, string> = {}
  righted.variants.forEach((v, i) => {
    const before = product.variants[i]
    if (v.title !== before.title) flavours[before.title] = v.title
  })
  return { productId: product.id, from: product.title, to: righted.title, flavours }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plans = (await allProducts()).map(planFor).filter((p): p is Renamed => p !== null)
  return NextResponse.json({
    products: plans,
    total: plans.length,
    // Counted separately because they are two different corrections and a
    // founder reading "12 products" deserves to know which kind.
    renamed: plans.filter((p) => p.from !== p.to).length,
    flavours: plans.reduce((n, p) => n + Object.keys(p.flavours).length, 0),
  })
}

export async function POST() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const products = await allProducts()
  const imported = new Set((await getImportedProducts()).map((p) => p.id))
  const done: Renamed[] = []

  for (const product of products) {
    const righted = putNamesRightWayRound(product)
    if (!righted) continue
    const plan = planFor(product)!

    /*
      Written back the way that product is stored. An imported product is ours
      to rewrite whole; a live one is edited through an override, because the
      base product is regenerated from the feed and a direct write would be
      lost on the next sync.

      The HANDLE is never in the patch. It is the product's URL, and every link
      anyone has to it.
    */
    if (imported.has(product.id)) {
      await saveImportedProduct({ ...product, title: righted.title, variants: righted.variants })
    } else {
      await setProductOverride(product.id, { title: righted.title, variants: righted.variants })
    }
    done.push(plan)
  }

  return NextResponse.json({
    ok: true,
    total: done.length,
    renamed: done.filter((p) => p.from !== p.to).length,
    flavours: done.reduce((n, p) => n + Object.keys(p.flavours).length, 0),
    repaired: done,
  })
}
