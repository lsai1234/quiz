/**
 * "Try something new": one product at a time a member on a plan doesn't have,
 * at a first-time price in their next box.
 *
 * Their plan saving already covers everything on their plan and anything they
 * add to a box, so this is the one thing a plan member is offered beyond it: a
 * deeper price on something new to them, once per product, in the box that's
 * going anyway (no delivery to pay for). Up to the founders' size (Settings →
 * Offer → For members on a plan, 25% to start), never below the margin floor,
 * and only when it's a better price than their plan already gives them: at 20%
 * there's little room left above the plan price on most products, and an
 * "offer" that saves 20p isn't one.
 *
 * Never something on their plan, a second of a kind they already have (another
 * whey), something they've tried at this price or said "not for me" to, or
 * anything their answers rule out (`meetsSafetyConstraints`). One at a time: none
 * while a tried product is waiting in a box. Pure.
 */
import type { CatalogueProduct, StackSlot } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { storedRateOf } from '@/lib/recharge/plan-rate'
import { extraPrice, tryPrice } from './extra-price'
import { nextBox } from './next-box'
import { tryBlocker, tryWaiting } from './try-rules'

export interface TryOffer {
  productId: string
  variantId: string
  title: string
  imageUrl: string | null
  /** The first-time price (£). */
  price: number
  /** Its shop price (£). */
  usual: number
  /** Off the shop price, 0–1. */
  pct: number
  /** The box it would go in. */
  box: { id: string; date: string }
}

/** The order kinds of product are suggested in: what a plan most often lacks first. */
const ORDER: StackSlot[] = ['performance', 'health', 'recovery', 'hydration', 'gut', 'sleep', 'energy', 'protein', 'vegan-support', 'menopause']

export function tryOffer(
  sub: MemberSubscription | null,
  catalogue: readonly CatalogueProduct[],
  settings: { on: boolean; maxPct: number },
  config: PricingConfig = getPricingConfig(),
  now: Date = new Date(),
): TryOffer | null {
  if (!sub || !settings.on || sub.status !== 'active' || tryWaiting(sub)) return null
  const box = nextBox(sub, [...catalogue], now)
  if (!box) return null
  const rate = storedRateOf(sub, config)
  const dismissed = new Set(sub.tryDismissed ?? [])
  const rank = (p: CatalogueProduct) => {
    const i = ORDER.indexOf(p.stackSlots[0])
    return i < 0 ? ORDER.length : i
  }
  const candidates = catalogue
    .filter((p) => !dismissed.has(p.id) && tryBlocker(sub, p) === null)
    .sort((a, b) => rank(a) - rank(b) || a.basePrice - b.basePrice || a.id.localeCompare(b.id))
  for (const product of candidates) {
    const variant = product.variants.find((v) => v.available)
    if (!variant) continue
    const price = tryPrice(product, variant, settings.maxPct, config)
    // Only an offer when it beats what their plan already gives them, by enough to notice.
    if (price > extraPrice(product, variant, config, rate) - 0.5) continue
    return {
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      imageUrl: product.imageUrl ?? null,
      price,
      usual: variant.price,
      pct: Math.round((1 - price / variant.price) * 100) / 100,
      box,
    }
  }
  return null
}
