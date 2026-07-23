/**
 * Daily stock check.
 *
 * Scans every ACTIVE subscription's lines against live supplier stock and
 * records a stock exception for any line whose product is out of stock at the
 * supplier. For lines the member allows to be substituted, it also picks the
 * best in-stock same-`swapGroup` replacement so the founder has a one-tap fix.
 *
 * Runs on demand from the Founders Hub (the "Run stock check" button); the same
 * function moves onto a real daily schedule at go-live. Sources are injectable
 * for testing.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'
import { getSupplier } from '@/lib/supplier'
import { listActiveSubscriptions } from '@/lib/db/hub-data'
import { getException, saveException } from './repo'
import { now } from '@/lib/db/engine'
import type { StockException } from './types'

function variantForLine(product: CatalogueProduct | undefined, variantTitle: string) {
  if (!product) return undefined
  return (
    product.variants.find((v) => (v.flavour || v.size || v.title) === variantTitle) ??
    product.variants.find((v) => v.available) ??
    product.variants[0]
  )
}

function unitPriceOfLine(line: MemberSubscriptionLine): number {
  return line.pricePerDelivery / Math.max(1, line.quantity)
}

/** The best in-stock, same-category replacement for an out-of-stock line. */
export function suggestReplacement(
  line: MemberSubscriptionLine,
  catalogue: CatalogueProduct[],
  oosSkus: Set<string>,
): CatalogueProduct | null {
  const target = unitPriceOfLine(line)
  const candidates = catalogue.filter((p) => {
    if (p.id === line.productId) return false
    if (p.swapGroup !== line.swapGroup) return false
    if (p.isSubscriptionOnly) return false
    // In stock = has an available variant whose supplier SKU isn't out of stock.
    return p.variants.some((v) => v.available && !(v.sku && oosSkus.has(v.sku)))
  })
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => Math.abs(a.basePrice - target) - Math.abs(b.basePrice - target))[0]
}

export interface StockCheckResult {
  scannedSubscriptions: number
  outOfStockSkus: string[]
  exceptions: StockException[]
}

export async function runStockCheck(opts: {
  subscriptions?: { userId: string; subscription: MemberSubscription }[]
  catalogue?: CatalogueProduct[]
} = {}): Promise<StockCheckResult> {
  const subscriptions = opts.subscriptions ?? (await listActiveSubscriptions())
  let catalogue = opts.catalogue
  if (!catalogue) {
    const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
    catalogue = (await getResolvedCatalogue()).products
  }

  const supplier = await getSupplier()
  const levels = await supplier.getStockLevels()
  const oosSkus = new Set(levels.filter((l) => !l.inStock).map((l) => l.sku))

  const exceptions: StockException[] = []
  for (const { userId, subscription } of subscriptions) {
    for (const line of subscription.lines) {
      const product = catalogue.find((p) => p.id === line.productId)
      const sku = variantForLine(product, line.variantTitle)?.sku ?? null
      if (!sku || !oosSkus.has(sku)) continue

      const id = `exc_${userId}_${line.id}`
      const existing = await getException(id)
      // Leave a founder-resolved exception alone; refresh anything still open.
      if (existing && existing.status === 'resolved') continue

      const allowSubstitution = line.allowSubstitution !== false
      const suggestion = allowSubstitution ? suggestReplacement(line, catalogue, oosSkus) : null
      const exc: StockException = {
        id,
        userId,
        customerEmail: subscription.customerEmail ?? null,
        subscriptionId: subscription.id,
        lineId: line.id,
        productId: line.productId,
        productTitle: line.productTitle,
        sku,
        slotTitle: line.slotTitle,
        swapGroup: line.swapGroup,
        allowSubstitution,
        suggestedReplacementId: suggestion?.id ?? null,
        suggestedReplacementTitle: suggestion?.title ?? null,
        status: 'open',
        createdAt: existing?.createdAt ?? now(),
        resolvedAt: null,
      }
      await saveException(exc)
      exceptions.push(exc)
    }
  }

  return { scannedSubscriptions: subscriptions.length, outOfStockSkus: [...oosSkus], exceptions }
}
