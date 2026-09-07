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
import { repriceVariants, type SkuFacts } from '@/lib/supplier/variant-pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * Give every variant its own price and its own serving count.
 *
 * ── The damage this repairs ─────────────────────────────────────────────────
 * Import merged a roster row's sibling SKUs into one product and priced them all
 * from the ROW's main SKU, on the reasoning that a flavour of one tub costs one
 * price. True of flavours. False of everything else that ends up under one
 * master SKU — and the sheet is written by a person, so it happens:
 *
 *   Glycine, 1000mg - 100 vcaps      £11.12 cost   33 servings
 *   Glycine, Pure Powder - 454 grams £20.04 cost  454 servings
 *
 * Both went on the shelf at £14.99 with "33 servings" under each. One is sold
 * at a loss, the other at a price nobody would pay, and the serving count — the
 * number the per-serving price is computed from — is wrong by a factor of
 * fourteen.
 *
 * The import path is fixed (see `supplier/roster-import`), which only helps
 * products imported from now on. This is the pass for everything already here.
 *
 * ── Two calls, cheapest first ───────────────────────────────────────────────
 * Cost and RRP come from `getStockLevels`, which is the cheap feed read the
 * nightly sync already makes for every SKU we sell. Servings only exist on the
 * per-product detail call (`portion_count`), so those are fetched by id through
 * the crawled index — the same route the flavour-name repair takes. A supplier
 * that will not answer the second call is not fatal: the prices still land, and
 * what is missing is said.
 *
 * ── What it will not touch ──────────────────────────────────────────────────
 * By default it re-prices a variant only where the siblings' COSTS actually
 * differ and the shelf is still showing them at one shared price — the exact
 * signature of the bug. A product somebody has priced by hand has variants that
 * already differ, so it is left alone. `force` re-prices every variant of every
 * multi-SKU product from its own cost, which is the deliberate, separate action.
 *
 * Servings and cost are FACTS, not decisions, so they are written wherever the
 * supplier answered — except on accessories, which have no dose and no servings
 * to be right about.
 *
 * GET reports what it would do and changes nothing. POST does it.
 */
export const dynamic = 'force-dynamic'

/** Detail lookups are one throttled call per SKU, so this needs the room a lookup gets. */
export const maxDuration = 60

interface Repair {
  productId: string
  title: string
  /** SKU → what changed on it, in words a founder can check. */
  changed: Record<string, string>
}

/** Every product whose variants map to more than one supplier SKU. */
function isMultiSku(product: CatalogueProduct): boolean {
  const skus = new Set(product.variants.map((v) => v.sku).filter(Boolean))
  return skus.size > 1
}

/**
 * Every product with more than one supplier SKU behind it, from both places one
 * can live: still `imported` and awaiting review, or live in the catalogue with
 * its edits held as an override.
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
  return [...byId.values()].filter(isMultiSku)
}

/** A product whose variants are all at one price is the one worth flagging. */
function looksMispriced(product: CatalogueProduct): boolean {
  return new Set(product.variants.map((v) => v.price)).size === 1
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const affected = await candidates()
  return NextResponse.json({
    products: affected.map((p) => ({
      productId: p.id,
      title: p.title,
      variants: p.variants.length,
      // Whether every variant is showing one price. It is a suspicion, not a
      // fault: most products genuinely are one price in six flavours, and only
      // the supplier's costs can tell the two apart.
      onePrice: looksMispriced(p),
      // Whether anything knows this variant's own serving count yet.
      servingsKnown: p.variants.filter((v) => v.servings != null).length,
    })),
    total: affected.length,
  })
}

/** What the supplier will tell us about these SKUs, cheapest call first. */
async function fetchFacts(
  skus: string[],
): Promise<{ facts: Map<string, SkuFacts>; priceError: string | null; servingsError: string | null }> {
  const facts = new Map<string, SkuFacts>()
  if (skus.length === 0) return { facts, priceError: null, servingsError: null }

  const supplier = await getSupplier()
  let priceError: string | null = null
  let servingsError: string | null = null

  // Cost and RRP: one feed read for every SKU at once, the same call the
  // nightly sync makes. It cannot time out per product because it is not per
  // product.
  try {
    for (const level of await supplier.getStockLevels(skus)) {
      facts.set(level.sku, {
        cost: level.wholesalePrice > 0 ? level.wholesalePrice : null,
        rrp: level.rrp > 0 ? level.rrp : null,
        servings: null,
        name: null,
      })
    }
  } catch (err) {
    priceError = err instanceof Error ? err.message : 'PowerBody could not be reached for prices.'
  }

  // Servings: only on the per-product detail call, reached by id through the
  // crawled index so nothing has to page the feed to find each one.
  try {
    const indexed = await indexedProductIds(skus)
    const ids = skus.map((s) => indexed.get(s)?.productId).filter((id): id is string => Boolean(id))
    if (ids.length > 0) {
      const detailed = await supplier.getProductsById(ids)
      // Verified against the SKU we asked about: an index entry that has moved
      // would otherwise put another product's serving count on our variant.
      for (const p of detailed.filter((p) => skus.includes(p.sku))) {
        const held = facts.get(p.sku)
        facts.set(p.sku, {
          cost: held?.cost ?? (p.wholesalePrice > 0 ? p.wholesalePrice : null),
          rrp: held?.rrp ?? (p.rrp > 0 ? p.rrp : null),
          servings: p.servings,
          name: p.name || null,
        })
      }
    }
  } catch (err) {
    servingsError = err instanceof Error ? err.message : 'PowerBody could not be reached for serving counts.'
  }

  return { facts, priceError, servingsError }
}

export async function POST(request: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let force = false
  const raw = await request.text().catch(() => '')
  if (raw.trim()) {
    try {
      force = (JSON.parse(raw) as { force?: boolean }).force === true
    } catch {
      return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
    }
  }

  const affected = await candidates()
  if (affected.length === 0) {
    return NextResponse.json({ ok: true, repaired: [], total: 0, message: 'No product has more than one supplier SKU behind it.' })
  }

  const skus = [
    ...new Set(affected.flatMap((p) => p.variants.map((v) => v.sku).filter((s): s is string => Boolean(s)))),
  ]
  const { facts, priceError, servingsError } = await fetchFacts(skus)
  if (facts.size === 0) {
    return NextResponse.json(
      { error: priceError ?? servingsError ?? 'PowerBody answered for none of those SKUs.' },
      { status: 502 },
    )
  }

  const imported = new Set((await getImportedProducts()).map((p) => p.id))
  const repaired: Repair[] = []

  for (const product of affected) {
    const result = repriceVariants(product, facts, force)
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
      await setProductOverride(product.id, {
        variants: result.product.variants,
        basePrice: result.product.basePrice,
        compareAtPrice: result.product.compareAtPrice,
      })
    }

    repaired.push({ productId: product.id, title: product.title, changed: result.changed })
  }

  return NextResponse.json({
    ok: true,
    total: repaired.length,
    variants: repaired.reduce((n, r) => n + Object.keys(r.changed).length, 0),
    ...(priceError ? { priceError } : {}),
    ...(servingsError ? { servingsError } : {}),
    repaired,
  })
}
