/**
 * Detection — turning two supplier feeds into "what changed".
 *
 * Entirely pure. Everything here takes the previous snapshot plus today's feed
 * and returns what moved; the service layer does the I/O around it. That split
 * is what makes "absent for three syncs" and "8% dearer than last week"
 * testable from fixtures with no database and no supplier.
 *
 * The distinction that matters most here is **out of stock vs discontinued**.
 * They look identical in a single feed — the product isn't buyable — but they
 * mean opposite things to a member: one is a blip worth waiting out, the other
 * is permanent and the plan has to change. You can only tell them apart across
 * time, which is what the snapshot is for.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'
import type { SupplierProduct } from '@/lib/supplier/types'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { ChangeKind, PriceMove } from './types'

/** What the last sync saw for one SKU. */
export interface SupplierSnapshot {
  sku: string
  stock: number
  inStock: boolean
  wholesalePrice: number
  rrp: number
  /**
   * Consecutive syncs this SKU has been absent from the feed. Reset to 0 the
   * moment it reappears — a SKU that flickers must never accumulate its way to
   * "discontinued".
   */
  missedSyncs: number
  /** Last sync in which the SKU appeared at all. */
  lastSeenAt: string
  updatedAt: string
}

/** The subset of a supplier product detection actually reads. */
export type FeedEntry = Pick<SupplierProduct, 'sku' | 'stock' | 'inStock' | 'wholesalePrice' | 'rrp'>

export interface SnapshotDiff {
  /** The state to persist for the next run. */
  next: SupplierSnapshot[]
  /** In the feed, but not buyable. Temporary until proven otherwise. */
  outOfStock: string[]
  /** Absent for `discontinuedAfterMissedSyncs` runs. Treated as gone for good. */
  discontinued: string[]
  /** Back in the feed and buyable after previously being neither. */
  recovered: string[]
  /** Cost moves beyond `priceChangeThresholdPct`. Consumed by the price flow (P7). */
  priceMoves: { sku: string; move: PriceMove }[]
}

const pct = (from: number, to: number): number => (from > 0 ? (to - from) / from : 0)
const round4 = (n: number) => Math.round(n * 10000) / 10000

/**
 * Compare the feed against the previous snapshot.
 *
 * A SKU we've never seen before produces no events — it's new, not changed —
 * but it is snapshotted so the next run has something to compare against.
 */
export function diffSupplierFeed(
  previous: SupplierSnapshot[],
  feed: FeedEntry[],
  opts: { now?: Date; config?: PricingConfig } = {},
): SnapshotDiff {
  const config = opts.config ?? getPricingConfig()
  const at = (opts.now ?? new Date()).toISOString()
  const prevBySku = new Map(previous.map((s) => [s.sku, s]))
  const seen = new Set<string>()

  const diff: SnapshotDiff = { next: [], outOfStock: [], discontinued: [], recovered: [], priceMoves: [] }

  // ── SKUs present in today's feed ──
  for (const entry of feed) {
    seen.add(entry.sku)
    const prev = prevBySku.get(entry.sku)

    diff.next.push({
      sku: entry.sku,
      stock: entry.stock,
      inStock: entry.inStock,
      wholesalePrice: entry.wholesalePrice,
      rrp: entry.rrp,
      missedSyncs: 0, // present today — any absence streak is over
      lastSeenAt: at,
      updatedAt: at,
    })

    if (!prev) continue // first sighting: nothing to compare

    if (!entry.inStock) {
      diff.outOfStock.push(entry.sku)
    } else if (!prev.inStock || prev.missedSyncs > 0) {
      // Buyable again after being out of stock or missing entirely.
      diff.recovered.push(entry.sku)
    }

    const delta = pct(prev.wholesalePrice, entry.wholesalePrice)
    if (Math.abs(delta) >= config.priceChangeThresholdPct && prev.wholesalePrice > 0) {
      diff.priceMoves.push({
        sku: entry.sku,
        move: {
          previousWholesale: prev.wholesalePrice,
          newWholesale: entry.wholesalePrice,
          previousRrp: prev.rrp,
          newRrp: entry.rrp,
          wholesaleDeltaPct: round4(delta),
        },
      })
    }
  }

  // ── SKUs we knew about that aren't in the feed ──
  const threshold = Math.max(1, config.discontinuedAfterMissedSyncs)
  for (const prev of previous) {
    if (seen.has(prev.sku)) continue
    const missedSyncs = prev.missedSyncs + 1
    diff.next.push({ ...prev, missedSyncs, updatedAt: at })
    if (missedSyncs >= threshold) diff.discontinued.push(prev.sku)
  }

  return diff
}

// ── Mapping SKUs onto the people they affect ─────────────────────────────────

/** The supplier SKU behind a subscription line, via its catalogue variant. */
export function skuForLine(
  line: Pick<MemberSubscriptionLine, 'productId' | 'variantTitle'>,
  catalogue: CatalogueProduct[],
): string | null {
  const product = catalogue.find((p) => p.id === line.productId)
  if (!product) return null
  const variant =
    product.variants.find((v) => (v.flavour || v.size || v.title) === line.variantTitle) ??
    product.variants.find((v) => v.available) ??
    product.variants[0]
  return variant?.sku ?? null
}

export interface AffectedLine {
  userId: string
  subscription: MemberSubscription
  line: MemberSubscriptionLine
  sku: string
  kind: ChangeKind
}

/**
 * Which subscription lines a set of unavailable SKUs actually hits.
 *
 * Discontinued wins over out-of-stock for the same SKU: it's the stronger, more
 * permanent fact, and raising both for one line would put the same problem in
 * the queue twice saying different things.
 */
export function findAffectedLines(
  diff: Pick<SnapshotDiff, 'outOfStock' | 'discontinued'>,
  subscriptions: { userId: string; subscription: MemberSubscription }[],
  catalogue: CatalogueProduct[],
): AffectedLine[] {
  const discontinued = new Set(diff.discontinued)
  const outOfStock = new Set(diff.outOfStock.filter((sku) => !discontinued.has(sku)))
  if (discontinued.size === 0 && outOfStock.size === 0) return []

  const affected: AffectedLine[] = []
  for (const { userId, subscription } of subscriptions) {
    for (const line of subscription.lines) {
      const sku = skuForLine(line, catalogue)
      if (!sku) continue
      const kind: ChangeKind | null = discontinued.has(sku)
        ? 'discontinued'
        : outOfStock.has(sku)
          ? 'out-of-stock'
          : null
      if (kind) affected.push({ userId, subscription, line, sku, kind })
    }
  }
  return affected
}

/**
 * Catalogue products that are actually buyable — every SKU that's out of stock
 * or discontinued removed. This is what a replacement must be picked from; a
 * "closest match" that is itself unavailable helps nobody.
 */
export function inStockCatalogue(
  catalogue: CatalogueProduct[],
  unavailableSkus: Set<string>,
): CatalogueProduct[] {
  return catalogue.filter((p) =>
    p.variants.some((v) => v.available && !(v.sku && unavailableSkus.has(v.sku))),
  )
}
