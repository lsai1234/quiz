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
import { indexPowerBodyCsv, looksLikePowerBodyCsv } from '@/lib/supplier/powerbody-csv'
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
 * It may talk to PowerBody, so it can take as long as their API takes and fail
 * halfway. A migration that does that blocks a deploy on a third party being
 * up. Run from the Hub it can be repeated, watched, and read afterwards.
 *
 * ── Two sources, the offline one first ──────────────────────────────────────
 * Naming a flavour through the API is one detail call per SKU, and sixty of
 * those rate-limit, time out, or answer for a code that has since moved — which
 * is exactly what happened, and why this can be handed PowerBody's dropshipping
 * catalogue export instead. That file has every SKU they sell, is a megabyte,
 * and cannot fail halfway. When a CSV is supplied it answers first and the API
 * is asked only for whatever it does not cover.
 *
 * A supplier that will not answer is therefore no longer fatal: if the CSV
 * named anything at all, that work is kept.
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
  names: Map<string, SupplierName>,
  force: boolean,
): { product: CatalogueProduct; fixed: Record<string, string>; unresolved: string[] } | null {
  /* Which variants this run is allowed to touch. */
  const rewritable = (v: CatalogueVariant) => force || looksLikeSku(v.title)

  const labels = variantLabels(
    product.variants.map((v) => {
      const found = names.get(v.sku ?? '')
      return {
        sku: v.sku ?? v.id,
        // A title we are not rewriting is a name somebody is happy with — feed
        // it back in so it takes part in working out the common prefix, and so
        // it survives untouched.
        name: rewritable(v) ? (found?.name ?? null) : v.title,
        flavour: rewritable(v) ? (found?.flavour ?? null) : null,
      }
    }),
  )

  const fixed: Record<string, string> = {}
  const unresolved: string[] = []
  const variants: CatalogueVariant[] = product.variants.map((v, i) => {
    const label = labels[i]
    if (!rewritable(v)) return v
    if (!label.named) {
      unresolved.push(v.sku ?? v.id)
      return v
    }
    // Nothing to report when the label it would write is the one already there.
    if (v.title === label.label && v.flavour === label.label) return v
    fixed[v.sku ?? v.id] = label.label
    return { ...v, title: label.label, flavour: label.label }
  })

  if (Object.keys(fixed).length === 0) return null
  return { product: { ...product, variants }, fixed, unresolved }
}

/** What a source knows about one SKU. */
interface SupplierName {
  name: string
  /** The supplier's own flavour field. Present far less often than the name. */
  flavour: string | null
}

/**
 * What every SKU given is called, as far as anything will answer.
 *
 * The CSV goes first because it cannot fail. The API is then asked only about
 * what is left, and its failure is reported rather than thrown — a supplier
 * that is down must not throw away names the file already gave us.
 */
async function fetchNames(
  skus: string[],
  csv: string | null,
): Promise<{ names: Map<string, SupplierName>; apiError: string | null }> {
  const names = new Map<string, SupplierName>()
  if (skus.length === 0) return { names, apiError: null }

  if (csv) {
    const rows = indexPowerBodyCsv(csv)
    for (const sku of skus) {
      const row = rows.get(sku)
      // The flavour field travels with the name. It is blank more often than
      // not, but where it is set it is the shortest true label there is — see
      // `variantLabels`.
      if (row?.name) names.set(sku, { name: row.name, flavour: row.flavour })
    }
  }

  const missing = skus.filter((s) => !names.has(s))
  if (missing.length === 0) return { names, apiError: null }

  try {
    const supplier = await getSupplier()
    const indexed = await indexedProductIds(missing)
    const ids = missing.map((s) => indexed.get(s)?.productId).filter((id): id is string => Boolean(id))

    if (ids.length > 0) {
      const byId = await supplier.getProductsById(ids)
      // Verified against the SKU we asked about: an index entry that has moved
      // would otherwise put another product's name on our variant.
      for (const p of byId) {
        if (missing.includes(p.sku) && p.name) names.set(p.sku, { name: p.name, flavour: null })
      }
    }

    const stillMissing = missing.filter((s) => !names.has(s))
    if (stillMissing.length > 0) {
      const bySku = await supplier.getProductsBySku(stillMissing)
      for (const p of bySku) if (p.name) names.set(p.sku, { name: p.name, flavour: null })
    }
    return { names, apiError: null }
  } catch (err) {
    return { names, apiError: err instanceof Error ? err.message : 'PowerBody could not be reached.' }
  }
}

/**
 * Every product with code-titled variants, from both places one can live.
 *
 * A product is either still `imported` and awaiting review, or it is in the
 * live catalogue with its edits held as an override. Repairing only the first
 * would leave the shop exactly as broken as it is now, which is the half that
 * customers can see.
 */
async function candidates(force = false): Promise<CatalogueProduct[]> {
  await syncPortalRuntime()
  const [imported, resolved, overrides] = await Promise.all([
    getImportedProducts(),
    getResolvedCatalogue(),
    getProductOverrides(),
  ])
  const byId = new Map<string, CatalogueProduct>()
  for (const p of resolved.products) byId.set(p.id, p)
  for (const p of imported) byId.set(p.id, { ...p, ...(overrides[p.id] ?? {}) } as CatalogueProduct)
  return [...byId.values()].filter((p) =>
    force ? p.variants.length > 1 && p.variants.some((v) => v.sku) : brokenSkus(p).length > 0,
  )
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

/** 12MB: the catalogue export is about one, and JSON-encoding it adds a little. */
const MAX_BODY = 12 * 1024 * 1024

export async function POST(request: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The body is optional — no CSV means the API-only path, as before.
  let csv: string | null = null
  /*
    Force rewrites EVERY variant of a multi-variant product from the source,
    not just the ones still showing a code.

    It exists because the first repair could only work from names, and a
    product merged from two of a brand's lines has siblings with almost nothing
    in common — so the diff kept nearly the whole string and the picker filled
    with sixty-character labels. Those are no longer codes, so the narrow pass
    will never look at them again.

    It is a separate, explicitly labelled action because it overwrites labels
    somebody may have typed. The narrow pass remains the default.
  */
  let force = false
  const raw = await request.text().catch(() => '')
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: 'That file is too large.' }, { status: 413 })
  }
  if (raw.trim()) {
    try {
      const body = JSON.parse(raw) as { csv?: string; force?: boolean }
      csv = typeof body.csv === 'string' && body.csv.trim() ? body.csv : null
      force = body.force === true
    } catch {
      return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
    }
  }
  if (csv && !looksLikePowerBodyCsv(csv)) {
    return NextResponse.json(
      { error: "That does not look like PowerBody's catalogue export. It starts with a `sku;` header." },
      { status: 400 },
    )
  }

  const affected = await candidates(force)
  if (affected.length === 0) {
    return NextResponse.json({ ok: true, repaired: [], total: 0, message: 'Every flavour already has a name.' })
  }

  const skus = [
    ...new Set(
      affected.flatMap((p) =>
        force ? p.variants.map((v) => v.sku).filter((s): s is string => Boolean(s)) : brokenSkus(p),
      ),
    ),
  ]
  const { names, apiError } = await fetchNames(skus, csv)

  // Only a total failure is worth refusing: if anything was named, the run is
  // worth keeping and what is left is reported per product.
  if (names.size === 0) {
    return NextResponse.json(
      { error: apiError ?? 'No names could be found for any of those SKUs.' },
      { status: 502 },
    )
  }

  const imported = new Set((await getImportedProducts()).map((p) => p.id))
  const repaired: Repair[] = []

  for (const product of affected) {
    const result = relabel(product, names, force)
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
    source: csv ? 'csv' : 'api',
    ...(apiError ? { apiError } : {}),
    repaired,
  })
}
