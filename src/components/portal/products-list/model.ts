import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { CheckStatus, ProductReadiness, ReadinessCheck, ReadinessSection } from '@/lib/portal/readiness'
import type { ProductState } from '@/lib/portal/product-edit'
import type { ProductSection } from '@/lib/portal/product-links'
import { liveServings } from '@/lib/catalogue/servings'
import { isAccessory } from '@/lib/catalogue/accessory'

/**
 * What the Products list knows and how it decides what to show.
 *
 * Pure — no fetch, no React — so every rule the founder relies on ("Blocking"
 * means something on sale cannot be sold properly, "info" never counts, a SKU
 * finds its product) is tested directly rather than through a rendered page.
 */

/** One row of `GET /api/portal/products?all=1`. */
export interface ListEntry {
  product: CatalogueProduct
  state: ProductState
  storage?: 'imported' | 'base'
  readiness: ProductReadiness
  /** Review fields still to check — only ever non-zero while it waits for review. */
  remaining: number
}

/** The views the header pills switch between, as `?show=` spells them. */
export type ShowView = 'live' | 'pending' | 'attention' | 'blocking' | 'warnings' | 'removed' | 'all'

export const SHOW_VIEWS: readonly ShowView[] = ['live', 'pending', 'attention', 'blocking', 'warnings', 'removed', 'all']

/**
 * The view a URL asks for, or `all` when it asks for nothing we know.
 *
 * `all` rather than "on sale" as the default because this page replaced three
 * — Catalogue, Dashboard and Readiness — and the founder's complaint was not
 * knowing where a product had gone. Opening on a filtered view would hide the
 * product waiting for review that they came looking for.
 */
export function parseShow(value: string | null | undefined): ShowView {
  return SHOW_VIEWS.includes(value as ShowView) ? (value as ShowView) : 'all'
}

/**
 * Only `fail` and `warn` are things to fix.
 *
 * `info` is something worth knowing that nobody can act on — no weight from
 * PowerBody, an accessory that cannot be a subscription — and the readiness
 * module is explicit that it never makes a product "need attention". Counting
 * it here would put the whole catalogue under Warnings, which is how founders
 * learned to ignore warnings in the first place.
 */
export function attentionChecks(readiness: ProductReadiness): ReadinessCheck[] {
  const rank: Record<CheckStatus, number> = { fail: 0, warn: 1, info: 2, ok: 2 }
  return readiness.checks
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .sort((a, b) => rank[a.status] - rank[b.status])
}

/** The worst thing to fix on a product, read from its checks rather than trusting `overall`. */
export function attentionLevel(readiness: ProductReadiness): 'fail' | 'warn' | null {
  const checks = attentionChecks(readiness)
  if (checks.some((c) => c.status === 'fail')) return 'fail'
  if (checks.some((c) => c.status === 'warn')) return 'warn'
  return null
}

/**
 * Attention is about what is ON SALE.
 *
 * A product waiting for review has its own list of things to check (the review
 * fields), and its own queue to work through; a removed one is not in the shop
 * at all. Counting either under Blocking would make the number disagree with
 * the front page's "Products not launch-ready", which counts the shop's
 * products — and two numbers for the same thing is how a founder stops
 * believing either.
 */
function attentionOf(entry: ListEntry): 'fail' | 'warn' | null {
  return entry.state === 'live' ? attentionLevel(entry.readiness) : null
}

/** Whether a row belongs in a view. */
export function inView(entry: ListEntry, show: ShowView): boolean {
  switch (show) {
    case 'live':
    case 'pending':
    case 'removed':
      return entry.state === show
    case 'blocking':
      return attentionOf(entry) === 'fail'
    case 'warnings':
      return attentionOf(entry) === 'warn'
    case 'attention':
      return attentionOf(entry) !== null
    case 'all':
      return true
  }
}

export interface ViewCounts {
  live: number
  pending: number
  blocking: number
  warnings: number
  attention: number
  removed: number
  all: number
}

export function countViews(entries: ListEntry[]): ViewCounts {
  const count = (show: ShowView) => entries.filter((e) => inView(e, show)).length
  return {
    live: count('live'),
    pending: count('pending'),
    blocking: count('blocking'),
    warnings: count('warnings'),
    attention: count('attention'),
    removed: count('removed'),
    all: entries.length,
  }
}

/**
 * Everything a founder might know a product by.
 *
 * The title alone was never enough. A size that lives as a VARIANT — "Glycine,
 * Pure Powder - 454 grams" under a product titled "Glycine, 1000mg - 100
 * vcaps" — matched nothing, and neither did the SKU on the PowerBody screen
 * they had just come from, or the PowerBody id in an order's error message.
 * Each is how somebody actually goes looking for a product, so each is here:
 * title, short name, brand, category, every flavour and size label, every SKU,
 * and PowerBody's product id on the product and on each SKU.
 */
function haystack(product: CatalogueProduct): string[] {
  return [
    product.id,
    product.title,
    product.shortName,
    product.brand,
    product.category,
    product.supplierProductId,
    ...product.variants.flatMap((v) => [v.title, v.flavour, v.size, v.sku, v.supplierProductId]),
  ]
    .filter((field): field is string => typeof field === 'string' && field.length > 0)
    .map((field) => field.toLowerCase())
}

/**
 * Every word of the query must be found somewhere in the product.
 *
 * Word by word rather than as one string, so "whey chocolate" finds the whey
 * whose CHOCOLATE is a flavour label rather than part of its title — the two
 * words live in different fields, and nobody searching knows or cares which.
 */
export function matchesProduct(product: CatalogueProduct, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const fields = haystack(product)
  return words.every((word) => fields.some((field) => field.includes(word)))
}

export interface ListFilters {
  show: ShowView
  query: string
  /** A category name, or '' for every category. */
  category: string
  /** Only products with more than one SKU. */
  several: boolean
  /** Only products offered on subscription. */
  subscription: boolean
}

/** The rows a view shows, in the order it shows them. */
export function visibleEntries(entries: ListEntry[], filters: ListFilters): ListEntry[] {
  const rows = entries.filter(
    (e) =>
      inView(e, filters.show) &&
      (!filters.category || e.product.category === filters.category) &&
      (!filters.several || e.product.variants.length > 1) &&
      (!filters.subscription || e.product.subscriptionEligible) &&
      matchesProduct(e.product, filters.query),
  )
  return sortEntries(rows, filters.show)
}

const byTitle = (a: ListEntry, b: ListEntry) => a.product.title.localeCompare(b.product.title)

/**
 * Worst first where the point is fixing things; A–Z everywhere else.
 *
 * In the attention views a blocked product comes before one with a warning,
 * because it is the one that cannot be sold properly today. In "All", removed
 * products sink to the bottom: they are kept so they can be restored, not so
 * they can sit between two products that are on sale.
 */
export function sortEntries(rows: ListEntry[], show: ShowView): ListEntry[] {
  const sorted = [...rows]
  if (show === 'attention' || show === 'blocking' || show === 'warnings') {
    const rank = (e: ListEntry) => (attentionOf(e) === 'fail' ? 0 : 1)
    return sorted.sort((a, b) => rank(a) - rank(b) || byTitle(a, b))
  }
  if (show === 'all') {
    const rank = (e: ListEntry) => (e.state === 'removed' ? 1 : 0)
    return sorted.sort((a, b) => rank(a) - rank(b) || byTitle(a, b))
  }
  return sorted.sort(byTitle)
}

/** The categories present, A–Z, each with how many products are in it. */
export function categoriesOf(entries: ListEntry[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const e of entries) {
    const name = e.product.category?.trim()
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
}

// ── What each row says ───────────────────────────────────────────────────────

/**
 * The shelf price, said honestly.
 *
 * Carried over from the old Dashboard, where it was the one price line in the
 * hub a founder could trust:
 *
 * "was" only when it actually was more. PowerBody's RRP comes back below our
 * shelf price often enough to matter — it is their recommended price, not a
 * price this shop ever charged — and "£23.99 (was £14.90)" reads as a price
 * rise nobody made. The shop already refuses to draw a saving that is not one
 * (`dealInfo`); the hub must not print one either.
 *
 * "· your price" when any SKU carries a price somebody set by hand rather than
 * the rule's: a founder scanning for the ones they priced themselves should not
 * have to open fifteen products to find them.
 */
export function priceLabel(p: CatalogueProduct): string {
  const base = `£${p.basePrice.toFixed(2)}`
  const was = p.compareAtPrice && p.compareAtPrice > p.basePrice ? `  (was £${p.compareAtPrice.toFixed(2)})` : ''
  const mine = p.variants.some((v) => v.priceSource === 'founder') ? ' · your price' : ''
  return `${base}${was}${mine}`
}

/** How many flavours or sizes it comes in, in words. */
export function skuCountLabel(p: CatalogueProduct): string {
  const n = p.variants.length
  if (n === 0) return 'No SKUs'
  return n === 1 ? 'One flavour/size' : `${n} flavours/sizes`
}

/**
 * The serving count the shelf shows — the master SKU's own, the way the shop
 * reads it (`liveServings`), not the product-level field that a pull from
 * PowerBody can leave behind. Nothing for an accessory, which the shop never
 * gives a serving count.
 */
export function servingsLabel(p: CatalogueProduct): string | null {
  if (isAccessory(p)) return null
  const n = liveServings(p)
  return n > 0 ? `${n} serving${n === 1 ? '' : 's'}` : 'Servings not known'
}

/** Whether it can be bought today, across its SKUs. */
export function stockLabel(p: CatalogueProduct): { text: string; tone: 'ok' | 'some' | 'none' } {
  const total = p.variants.length
  const soldOut = p.variants.filter((v) => !v.available).length
  if (total === 0) return { text: 'Nothing to sell', tone: 'none' }
  if (soldOut === 0) return { text: total === 1 ? 'In stock' : 'All in stock', tone: 'ok' }
  if (soldOut === total) return { text: total === 1 ? 'Sold out' : 'All sold out', tone: 'none' }
  return { text: `${soldOut} sold out`, tone: 'some' }
}

const PAGE_SECTIONS: readonly ProductSection[] = ['checks', 'preview', 'listing', 'variants', 'quiz', 'supplier']

/**
 * Where on the product page a check is fixed.
 *
 * Read defensively, because the readiness module and the product page are two
 * lists of sections kept by different files: a check naming a section the page
 * does not have opens the page at its Checks — which lists every problem with a
 * link to its own section — rather than at an anchor that is not there. Per-SKU
 * prices live with the flavours and sizes they belong to, so a check that says
 * `prices` goes there.
 */
export function sectionFor(section: ReadinessSection | string | undefined): ProductSection {
  if (section === 'prices') return 'variants'
  return PAGE_SECTIONS.includes(section as ProductSection) ? (section as ProductSection) : 'checks'
}

/** "2 things to fix", for a row that is not showing its checks in full. */
export function attentionSummary(entry: ListEntry): { text: string; tone: 'fail' | 'warn' } | null {
  if (entry.state === 'pending') {
    if (entry.remaining <= 0) return null
    return {
      text: `${entry.remaining} thing${entry.remaining === 1 ? '' : 's'} to check before it can go on sale`,
      tone: 'warn',
    }
  }
  if (entry.state !== 'live') return null
  const checks = attentionChecks(entry.readiness)
  if (checks.length === 0) return null
  const blocking = checks.filter((c) => c.status === 'fail').length
  return {
    text: `${checks.length} thing${checks.length === 1 ? '' : 's'} to fix${blocking ? ` · ${blocking} blocking` : ''}`,
    tone: blocking ? 'fail' : 'warn',
  }
}
