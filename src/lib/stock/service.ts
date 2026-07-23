/**
 * Resolving a stock exception.
 *
 * Three founder actions, all reusing the pure recharge mutation helpers so the
 * member's stored subscription stays the single source of truth:
 *   • substitute — permanently swap the out-of-stock line to a same-category,
 *     in-stock product (the easy fix for lines that allow substitution).
 *   • skip       — skip that line's next box (banks a credit); hold for now.
 *   • notify     — leave the bundle unchanged, record that we'll contact the
 *                  member to choose (for lines that don't allow substitution).
 */
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { swapSubscriptionLine, skipNextDelivery } from '@/lib/recharge/mock'
import { getException, updateException, now } from './repo'
import type { StockException, StockResolution } from './types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

async function markResolved(id: string, resolution: StockResolution, detail: string): Promise<StockException | null> {
  return updateException(id, (e) => {
    e.status = 'resolved'
    e.resolution = resolution
    e.resolutionDetail = detail
    e.resolvedAt = now()
  })
}

export interface ResolveResult {
  exception: StockException
}

/** Swap the affected line to an in-stock, same-category replacement. */
export async function substituteException(id: string, replacementProductId: string): Promise<ResolveResult> {
  const exc = await getException(id)
  if (!exc) throw new Error('Stock exception not found')
  if (!exc.allowSubstitution) throw new Error('This line does not allow substitution')

  const sub = await getSubscription(exc.userId)
  if (!sub) throw new Error('Subscription not found')

  const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
  const { products } = await getResolvedCatalogue()
  const replacement: CatalogueProduct | undefined = products.find((p) => p.id === replacementProductId)
  if (!replacement) throw new Error('Replacement product not found')

  const next = swapSubscriptionLine(sub, exc.lineId, replacement)
  await saveSubscription(exc.userId, next)
  const resolved = await markResolved(id, 'substituted', `Swapped to ${replacement.title}`)
  return { exception: resolved! }
}

/** Skip the affected line's next delivery (hold it, credit the box). */
export async function skipException(id: string): Promise<ResolveResult> {
  const exc = await getException(id)
  if (!exc) throw new Error('Stock exception not found')
  const sub = await getSubscription(exc.userId)
  if (!sub) throw new Error('Subscription not found')
  const next = skipNextDelivery(sub, exc.lineId)
  await saveSubscription(exc.userId, next)
  const resolved = await markResolved(id, 'skipped', 'Skipped the next box for this line')
  return { exception: resolved! }
}

/** Leave the bundle as-is; record that we'll contact the member. */
export async function notifyException(id: string): Promise<ResolveResult> {
  const exc = await getException(id)
  if (!exc) throw new Error('Stock exception not found')
  const resolved = await markResolved(id, 'notified', 'Flagged to contact the member')
  return { exception: resolved! }
}
