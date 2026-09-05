import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { indexedProductIds } from '@/lib/portal/supplier-index'
import {
  getImportedProducts,
  saveImportedProduct,
  getProductOverrides,
  setProductOverride,
  syncPortalRuntime,
} from '@/lib/portal/store'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { variantLabels, looksLikeSku } from '@/lib/supplier/variant-labels'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'

/**
 * Put flavour names on products that were imported without them.
 *
 * ── The damage this repairs ─────────────────────────────────────────────────
 * Import used to fetch the detail for a row's MAIN sku only. The feed index
 * gave every flavour its stock, so every flavour was orderable — but nothing
 * ever asked PowerBody what the other flavours were CALLED, and the names only
 * exist on the detail call. So a six-flavour product went live with one real
 * name and five raw codes in its picker: "P45757" where "Orange" belongs.
 *
 * The import path is fixed (see `import-csv`), but that only helps products
 * imported from now on. This is the pass for everything already in the shop.
 *
 * ── Why it is a button and not a migration ──────────────────────────────────
 * It talks to PowerBody, so it takes as long as their API takes and can fail
 * halfway. A migration that does that blocks a deploy on a third party being
 * up. Run from the Hub it can be repeated, watched, and read afterwards.
 *
 * ── What it will not touch ──────────────────────────────────────────────────
 * Only variant titles that still LOOK like supplier codes, and only where
 * PowerBody answered with a real name. A label somebody typed by hand is never
 * overwritten — `looksLikeSku` is deliberately narrow for exactly that reason,
 * because the expensive mistake here is silently replacing a human's wording.
 *
 * GET reports what it would do and changes nothing. POST does it.
 */
export const dynamic = 'force-dynamic'

interface Repair {
  productId: string
  title: string
  /** SKU → the label it would get (or did). */
  fixed: Record<string, string>
  /** SKUs still showing a code, because PowerBody had no name for them. */
  unresolved: string[]
}

/** The variants of a product that still carry a raw code as their title. */
function brokenSkus(product: CatalogueProduct): string[] {
  if (product.variants.length < 2) return []
  return product.variants
    .filter((v) => v.sku && looksLikeSku(v.title))
    .map((v) => v.sku as string)
}

/**
 * Re-label a product's variants from supplier names, keeping everything else.
 *
 * Returns null when nothing changed, so a caller can skip the write rather than
 * rewriting a hundred identical rows.
 */
function relabel(
  product: CatalogueProduct,
  names: Map<string, string>,
): { product: CatalogueProduct; fixed: Record<string, string>; unresolved: string[] } | null {
  const labels = variantLabels(
    product.variants.map((v) => ({
      sku: v.sku ?? v.id,
      // A title that is not a code is a name somebody is happy with — feed it
      // back in so it takes part in working out the common prefix, and so it
      // survives untouched.
      name: looksLikeSku(v.title) ? (names.get(v.sku ?? '') ?? null) : v.title,
    })),
  )

  const fixed: Record<string, string> = {}
  const unresolved: string[] = []
  const variants: CatalogueVariant[] = product.variants.map((v, i) => {
    const label = labels[i]
    if (!looksLikeSku(v.title)) return v
    if (!label.named) {
      unresolved.push(v.sku ?? v.id)
      return v
    }
    fixed[v.sku ?? v.id] = label.label
    return { ...v, title: label.label, flavour: label.label }
  })

  if (Object.keys(fixed).length === 0) return null
  return { product: { ...product, variants }, fixed, unresolved }
}

/** Ask PowerBody for the name of every SKU given, as far as it will answer. */
async function fetchNames(skus: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (skus.length === 0) return names

  const supplier = await getSupplier()
  const indexed = await indexedProductIds(skus)
  const ids = skus.map((s) => indexed.get(s)?.productId).filter((id): id is string => Boolean(id))

  if (ids.length > 0) {
    const byId = await supplier.getProductsById(ids)
    // Verified against the SKU we asked about: an index entry that has moved
    // would otherwise put another product's name on our variant.
    for (const p of byId) {
      if (skus.includes(p.sku) && p.name) names.set(p.sku, p.name)
    }
  }

  // Anything the index could not resolve is worth one feed lookup.
  const missing = skus.filter((s) => !names.has(s))
  if (missing.length > 0) {
    const bySku = await supplier.getProductsBySku(missing)
    for (const p of bySku) if (p.name) names.set(p.sku, p.name)
  }

  return names
}

/**
 * Every product with code-titled variants, from both places one can live.
 *
 * A product is either still `imported` and awaiting review, or it is in the
 * live catalogue with its edits held as an override. Repairing only the first
 * would leave the shop exactly as broken as it is now, which is the half that
 * customers can see.
 */
async function candidates(): Promise<CatalogueProduct[]> {
  await syncPortalRuntime()
  const [imported, resolved, overrides] = await Promise.all([
    getImportedProducts(),
    getResolvedCatalogue(),
    getProductOverrides(),
  ])
  const byId = new Map<string, CatalogueProduct>()
  for (const p of resolved.products) byId.set(p.id, p)
  for (const p of imported) byId.set(p.id, { ...p, ...(overrides[p.id] ?? {}) } as CatalogueProduct)
  return [...byId.values()].filter((p) => brokenSkus(p).length > 0)
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const affected = await candidates()
  return NextResponse.json({
    products: affected.map((p) => ({
      productId: p.id,
      title: p.title,
      skus: brokenSkus(p),
    })),
    total: affected.length,
    variants: affected.reduce((n, p) => n + brokenSkus(p).length, 0),
  })
}

export async function POST() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const affected = await candidates()
  if (affected.length === 0) {
    return NextResponse.json({ ok: true, repaired: [], total: 0, message: 'Every flavour already has a name.' })
  }

  const skus = [...new Set(affected.flatMap(brokenSkus))]
  let names: Map<string, string>
  try {
    names = await fetchNames(skus)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PowerBody could not be reached.' },
      { status: 502 },
    )
  }

  const imported = new Set((await getImportedProducts()).map((p) => p.id))
  const repaired: Repair[] = []

  for (const product of affected) {
    const result = relabel(product, names)
    if (!result) continue

    /*
      Written back the way that product is stored. An imported product is ours
      to rewrite whole; a live one is edited through an override, because the
      base product is regenerated from the feed and a direct write would be
      lost on the next sync.
    */
    if (imported.has(product.id)) {
      await saveImportedProduct(result.product)
    } else {
      await setProductOverride(product.id, { variants: result.product.variants })
    }

    repaired.push({
      productId: product.id,
      title: product.title,
      fixed: result.fixed,
      unresolved: result.unresolved,
    })
  }

  return NextResponse.json({
    ok: true,
    total: repaired.length,
    variants: repaired.reduce((n, r) => n + Object.keys(r.fixed).length, 0),
    unresolved: repaired.reduce((n, r) => n + r.unresolved.length, 0),
    repaired,
  })
}
