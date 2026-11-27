/**
 * Who may try what at its first-time price (`try-new`), shared by the offer and
 * by the server that adds it to a box (`next-box`). Pure.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { isAccessory } from '@/lib/catalogue/accessory'
import { constraintsFor, meetsSafetyConstraints } from '@/lib/changes/safety'

/** Why a product can't be tried at its first-time price right now, or null when it can. */
export function tryBlocker(sub: MemberSubscription, product: CatalogueProduct): 'on-plan' | 'kind-on-plan' | 'tried' | 'not-suitable' | 'not-for-sale' | null {
  if (product.isSubscriptionOnly || product.subscriptionEligible === false || isAccessory(product)) return 'not-for-sale'
  if (sub.lines.some((l) => l.productId === product.id)) return 'on-plan'
  if (sub.lines.some((l) => l.swapGroup === product.swapGroup)) return 'kind-on-plan'
  if ((sub.tried ?? []).includes(product.id)) return 'tried'
  if (!meetsSafetyConstraints(product, constraintsFor(sub))) return 'not-suitable'
  return null
}

/** A try extra already waiting in a box still to come. */
export function tryWaiting(sub: MemberSubscription): boolean {
  return Object.values(sub.deliveryOverrides ?? {}).some((o) => !o.skipped && (o.addedItems ?? []).some((x) => x.kind === 'try'))
}

