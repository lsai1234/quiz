/**
 * Does subscribing actually win?
 *
 * WHY THIS EXISTS
 * ───────────────
 * It didn't, and nothing noticed. The one-off bundle tiers and the
 * subscribe-&-save ladder were set independently, in different parts of the
 * config, and they collided: a 5-item Performance stack lists at ~£126, which
 * tripped the old £120+ one-off tier at 20% against a 15% subscription rate. A
 * member on the biggest segment in the business PAID MORE PER MONTH TO SUBSCRIBE
 * than to buy the same box outright. Essentials and Complete were level pegging.
 *
 * Every individual number was defensible. The relationship between them was the
 * bug, and a relationship is exactly the thing no single-value test catches. So
 * this module states the invariant the pricing has to satisfy — **every rung of
 * the subscription ladder beats the one-off discount a basket of that size would
 * qualify for, by a margin worth having** — and the hub renders it.
 *
 * A second invariant sits alongside it. The list price is anchored ABOVE the
 * supplier's RRP, so a discount shallower than that premium leaves the member
 * paying more than they'd pay on the high street. Every rung has to clear the
 * anchor, or the "saving" is a markup.
 *
 * Pure. Takes its config, so the hub previews unsaved rules.
 */
import { getPricingConfig, resolveTier, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { StackLevel } from '@/lib/types'
import { premiumOverRrp } from './anchor'

const round4 = (n: number) => Math.round(n * 10000) / 10000

/**
 * How much better subscribing has to be before it reads as a reason rather than
 * a rounding error. Five points is roughly the smallest gap a shopper reliably
 * notices on a price comparison; below that the subscription is asking for a
 * commitment in exchange for nothing they can see.
 */
export const HEALTHY_ADVANTAGE_PP = 0.05

export interface LadderRung {
  level: StackLevel
  /** Products in a stack of this size — what decides the basket value. */
  items: number
  /** Typical list price of a stack this size (£ inc VAT). */
  listPrice: number
  /** The one-off tier this basket qualifies for (0–1), and its label. */
  oneOffPct: number
  oneOffLabel: string | null
  /** The subscribe-&-save rate for this rung (0–1). */
  subscriptionPct: number
  /** subscriptionPct − oneOffPct. Negative = subscribing costs the member money. */
  advantage: number
  /** Where the member lands against the supplier's RRP on each path (0–1). */
  vsRrpOneOff: number
  vsRrpSubscribed: number
  /** True when the subscription beats the one-off by a margin worth having. */
  healthy: boolean
  /** Set when this rung needs a decision. */
  warning: string | null
}

export interface LadderCheck {
  rungs: LadderRung[]
  /** True when every rung is healthy — the headline. */
  coherent: boolean
  /** The anchor premium every rung has to clear (0–1). */
  anchorPremium: number
  /** The shallowest discount that still lands the member at or below RRP (0–1). */
  minDiscountForRrp: number
  /** One sentence on the state of the ladder, for the top of the panel. */
  summary: string
}

/** The stack sizes each bundle level represents, matching `stackLevelOf`. */
const ITEMS_BY_LEVEL: Record<StackLevel, number> = {
  essentials: 3,
  performance: 5,
  complete: 7,
}

/**
 * Check the ladder against a representative list price per product.
 *
 * `averageListPrice` is what one product costs on the shelf — the caller passes
 * the real catalogue average so the basket values, and therefore which one-off
 * tier each stack trips, move with what we actually sell.
 */
export function checkLadder(
  averageListPrice: number,
  config: PricingConfig = getPricingConfig(),
): LadderCheck {
  const premium = premiumOverRrp(config)
  // list = rrp × (1 + premium), so the member is at RRP exactly when
  // (1 + premium)(1 − d) = 1, i.e. d = premium / (1 + premium).
  const minDiscountForRrp = round4(premium / (1 + premium))

  const levels = Object.keys(ITEMS_BY_LEVEL) as StackLevel[]
  const rungs = levels.map<LadderRung>((level) => {
    const items = ITEMS_BY_LEVEL[level]
    const listPrice = Math.round(averageListPrice * items * 100) / 100
    const tier = resolveTier(config.bundleTiers, listPrice, items)
    const subscriptionPct = config.levelSubscriptionDiscount[level] ?? config.subscriptionDiscount
    const advantage = round4(subscriptionPct - tier.pct)

    // Negative = above RRP.
    const vsRrp = (d: number) => round4(1 - (1 + premium) * (1 - d))

    return {
      level,
      items,
      listPrice,
      oneOffPct: round4(tier.pct),
      oneOffLabel: tier.tier?.label ?? null,
      subscriptionPct: round4(subscriptionPct),
      advantage,
      vsRrpOneOff: vsRrp(tier.pct),
      vsRrpSubscribed: vsRrp(subscriptionPct),
      healthy: advantage >= HEALTHY_ADVANTAGE_PP && subscriptionPct >= minDiscountForRrp,
      warning: warningFor(level, advantage, subscriptionPct, tier.pct, minDiscountForRrp),
    }
  })

  const broken = rungs.filter((r) => !r.healthy)
  return {
    rungs,
    coherent: broken.length === 0,
    anchorPremium: premium,
    minDiscountForRrp,
    summary: broken.length === 0
      ? `Every bundle beats buying once by at least ${Math.round(HEALTHY_ADVANTAGE_PP * 100)} points, and every rung lands the member below RRP.`
      : `${broken.length} of ${rungs.length} bundles ${broken.length === 1 ? 'gives' : 'give'} members too little reason to subscribe.`,
  }
}

function warningFor(
  level: StackLevel,
  advantage: number,
  subscriptionPct: number,
  oneOffPct: number,
  minDiscountForRrp: number,
): string | null {
  // The RRP breach is reported first even when the advantage is also thin: a
  // rung that prices above the market is wrong in a way that no gap to the
  // one-off tier can excuse, and fixing it usually fixes the gap too.
  if (subscriptionPct < minDiscountForRrp) {
    return (
      `At ${Math.round(subscriptionPct * 1000) / 10}% this rung leaves the member paying ABOVE the supplier's RRP — ` +
      `the list price is anchored ${Math.round(minDiscountForRrp * 1000) / 10}% above it. The "saving" is a markup.`
    )
  }
  if (advantage < 0) {
    return (
      `Subscribing COSTS the member ${Math.round(-advantage * 1000) / 10} points on this bundle — the one-off ` +
      `discount (${Math.round(oneOffPct * 100)}%) beats subscribe-&-save (${Math.round(subscriptionPct * 100)}%). ` +
      `Lower the one-off tier or raise this rung.`
    )
  }
  if (advantage < HEALTHY_ADVANTAGE_PP) {
    return (
      `Only ${Math.round(advantage * 1000) / 10} points better than buying once — not enough to be worth a ` +
      `commitment. Aim for at least ${Math.round(HEALTHY_ADVANTAGE_PP * 100)}.`
    )
  }
  return null
}
