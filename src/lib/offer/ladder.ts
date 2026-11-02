/**
 * Build your stack (the clarity pass): what a bigger stack unlocks, read off
 * the rules checkout already applies, so the page can never promise something
 * the order won't get. Nothing here sets a price; it only says where the
 * existing lines are.
 *
 *   gift            the free bonus, on stacks from its minimum before any
 *                   discount (`chooseBonus`), when this person has one
 *   delivery        each band of `delivery.customerRates`: a band applies
 *                   below its `maxOrderValue` (`customerDeliveryCharge`), so the
 *                   next one starts there; the last is free delivery
 *   bundle          the one-off bundle discounts (`bundleTiers`), from their
 *                   minimum subtotal; a subscription has its own rate instead
 *
 * What each is measured on is checkout's own: the gift and the bundle discount
 * on the list-price subtotal; delivery on that subtotal one-off and on the
 * monthly total subscribed (`qualifiesForFreeDelivery`, `PlanReceipt`).
 */
import { formatGBP, getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'

export type RungKind = 'gift' | 'delivery' | 'free-delivery' | 'bundle'

export interface Rung {
  kind: RungKind
  /** Where it starts, in £. */
  at: number
  /** What it gives, in a few words: "Free delivery", "8% off". */
  label: string
  /** The condition, in a few words: "on stacks from £40". */
  condition: string
  reached: boolean
  /** £ still to add, 0 once reached. */
  toGo: number
}

export interface Ladder {
  rungs: Rung[]
  /** The nearest one not yet reached, if any. */
  next: Rung | null
  /** How far this stack is towards `next` (0–1), for its bar; 1 when everything is reached. */
  progress: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function rewardLadder(input: {
  plan: 'oneoff' | 'subscription'
  /** The stack at list prices, before any discount. */
  listSubtotal: number
  /** The monthly total, when subscribed. */
  monthly: number
  /**
   * The free gift this stack would come with, and its minimum; null when there
   * is none for them. `has` is the offer's own decision for this depth
   * (`bonusLineFor`), which wins over the subtotal: a depth can clear the
   * minimum and still not carry it.
   */
  gift: { title: string; minimum: number; has?: boolean } | null
  config?: PricingConfig
}): Ladder {
  const config = input.config ?? getPricingConfig()
  const sub = input.plan === 'subscription'
  const deliveryBasis = sub ? input.monthly : input.listSubtotal
  const rungs: Rung[] = []
  const add = (kind: RungKind, at: number, label: string, condition: string, basis: number) =>
    rungs.push({ kind, at, label, condition, reached: basis >= at, toGo: round2(Math.max(0, at - basis)) })

  if (input.gift) {
    add('gift', input.gift.minimum, `Free ${input.gift.title}`, `on stacks from ${formatGBP(input.gift.minimum)}`, input.listSubtotal)
    if (input.gift.has !== undefined) {
      const g = rungs[rungs.length - 1]
      g.reached = input.gift.has
      g.toGo = g.reached ? 0 : Math.max(g.toGo, 0.01)
    }
  }

  const rates = config.delivery.customerRates
  rates.forEach((rate, i) => {
    const after = rates[i + 1]
    if (rate.maxOrderValue == null || !after) return
    const per = sub ? ' a month' : ''
    if (after.price === 0) add('free-delivery', rate.maxOrderValue, 'Free delivery', `from ${formatGBP(rate.maxOrderValue)}${per}`, deliveryBasis)
    else add('delivery', rate.maxOrderValue, `Delivery ${formatGBP(after.price)}, not ${formatGBP(rate.price)}`, `from ${formatGBP(rate.maxOrderValue)}${per}`, deliveryBasis)
  })

  if (!sub) {
    for (const tier of config.bundleTiers) {
      if (tier.minSubtotal == null || tier.minItems != null) continue
      add('bundle', tier.minSubtotal, `${Math.round(tier.discountPct * 100)}% off`, `on stacks from ${formatGBP(tier.minSubtotal)}`, input.listSubtotal)
    }
  }

  rungs.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind))
  const next = rungs.find((r) => !r.reached) ?? null
  // The bar: how far this stack is towards the next line, on that line's own measure.
  const progress = next ? Math.min(1, Math.max(0, (next.at - next.toGo) / next.at)) : 1
  return { rungs, next, progress }
}
