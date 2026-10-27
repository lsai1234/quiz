/**
 * What `/api/cart` re-checks before taking a payment (plan Phase 3, 5).
 *
 * The browser chose the hero and the bonus; the server decides whether they
 * still stand, from the catalogue and the hub's settings as they are NOW. A
 * founder may have switched the bonus off, emptied the pool or withdrawn a
 * hero's approval while the page was open; a product may have sold out; a
 * swap on the page may have pushed the order under the floor. Each of those
 * is said before payment, never discovered after it.
 *
 * Pure: the route hands in the priced basket and the person's exclusions.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { meetsSafetyConstraints } from '@/lib/changes/safety'
import type { SafetyConstraints } from '@/lib/recharge/types'
import type { PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { StackLevel } from '@/lib/types'
import { activeBonusPool, activeHeroIds, STACK_LEVELS, type OfferSettings } from './settings'
import { bonusFloor, costedItem, stackMargin, type CostedItem } from './bonus-economics'
import { offerable } from './select'

export type BonusRefusal = 'off' | 'not-in-pool' | 'tier' | 'not-a-stack' | 'in-basket' | 'stock' | 'excluded' | 'minimum' | 'margin' | 'code'

export interface BonusClaim {
  productId: string
  level: StackLevel
}

export type BonusCheck =
  | { ok: true; product: CatalogueProduct; item: CostedItem; contributionWith: number; floor: number }
  | { ok: false; reason: BonusRefusal; message: string }

/** What the customer is told, by reason. Calm, specific, and says nothing was charged. */
const WHY: Record<BonusRefusal, string> = {
  off: 'the free gift isn’t running any more',
  'not-in-pool': 'it isn’t one of our free gifts any more',
  tier: 'it doesn’t come with this size of stack',
  'not-a-stack': 'it comes with a full stack only',
  'in-basket': 'it’s already in your stack',
  stock: 'it has just sold out',
  excluded: 'it isn’t suitable for you',
  minimum: 'your stack is now under the minimum for it',
  margin: 'it doesn’t fit this order any more',
  code: 'it doesn’t combine with a code',
}

export function refusalMessage(title: string, reason: BonusRefusal): string {
  return `The free ${title} can’t come with this order: ${WHY[reason]}. Nothing has been charged — check your stack and try again.`
}

export function checkBonusClaim(input: {
  claim: unknown
  settings: OfferSettings
  catalogue: readonly CatalogueProduct[]
  /** The basket as the server priced it: product, the variant's price and cost. */
  lines: readonly { product: CatalogueProduct; price: number; cost: number | null; quantity: number }[]
  /** The person's exclusions, as the order would keep them. */
  constraints: SafetyConstraints
  /** A stack from the quiz or the consult (not a shop basket, not the hero on its own). */
  isStack: boolean
  /** A code was applied and the settings say a code replaces the bonus. */
  codeApplied: boolean
  config?: PricingConfig
}): BonusCheck {
  const raw = (input.claim && typeof input.claim === 'object' ? input.claim : {}) as Partial<BonusClaim>
  const product = input.catalogue.find((p) => p.id === raw.productId)
  const title = product?.shortName || product?.title || 'gift'
  const refuse = (reason: BonusRefusal): BonusCheck => ({ ok: false, reason, message: refusalMessage(title, reason) })
  const { bonus } = input.settings

  if (!bonus.enabled) return refuse('off')
  if (!product || !activeBonusPool(input.settings, input.catalogue).includes(product.id)) return refuse('not-in-pool')
  if (!STACK_LEVELS.includes(raw.level as StackLevel) || !bonus.tiers.includes(raw.level as StackLevel)) return refuse('tier')
  if (!input.isStack || input.lines.length < 2) return refuse('not-a-stack')
  if (input.lines.some((l) => l.product.id === product.id)) return refuse('in-basket')
  if (input.codeApplied && bonus.codes === 'code-cancels-bonus') return refuse('code')
  const item = offerable(product) ? costedItem(product) : null
  if (!item) return refuse('stock')
  if (!meetsSafetyConstraints(product, input.constraints)) return refuse('excluded')

  const basket: CostedItem[] = input.lines.flatMap((l) =>
    Array.from({ length: Math.max(1, l.quantity) }, () => ({ id: l.product.id, title: l.product.title, price: l.price, supplierCost: l.cost, grams: l.product.weightGrams ?? null })),
  )
  const without = stackMargin(basket, null, input.config)
  if (without.subtotal < bonus.minSubtotal) return refuse('minimum')
  const withIt = stackMargin(basket, item, input.config)
  const floor = bonusFloor(withIt.netRevenue, bonus)
  if (withIt.contribution < floor) return refuse('margin')
  return { ok: true, product, item, contributionWith: withIt.contribution, floor }
}

/**
 * A single-product deal sold as the hero must still be an approved hero. With
 * the switch off or the approval withdrawn it is refused before payment, so
 * the page can stop calling it "Not the obvious pick" and fall back.
 */
export function heroStillApproved(productId: string, settings: OfferSettings, catalogue: readonly Pick<CatalogueProduct, 'id' | 'swapGroup'>[], today?: string): boolean {
  return activeHeroIds(settings, catalogue, today).includes(productId)
}
