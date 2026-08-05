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
 * A second invariant sits alongside it. Prices are set at a fixed multiple of
 * what we pay, and no discount may take a product below cost plus the margin
 * floor — so there is a hard ceiling on how deep the ladder can ever go, and it
 * is worth showing how much room is left before the deepest rung plus a scratch
 * card runs into it.
 *
 * Pure. Takes its config, so the hub previews unsaved rules.
 */
import { getPricingConfig, resolveTier, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { StackLevel } from '@/lib/types'


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
  /** What the member pays on each path, on a £100 list basket (£). */
  paysOneOff: number
  paysSubscribed: number
  /** True when the subscription beats the one-off by a margin worth having. */
  healthy: boolean
  /** Set when this rung needs a decision. */
  warning: string | null
}

export interface LadderCheck {
  rungs: LadderRung[]
  /** True when every rung is healthy — the headline. */
  coherent: boolean
  /** The multiple of supplier cost every list price is set at. */
  markupOnCost: number
  /** The deepest total discount any product can take before hitting the margin
   *  floor (0–1) — the hard ceiling on the ladder plus any intro offer. */
  deepestPossibleDiscount: number
  /** The deepest combination we actually offer: biggest bundle + best card (0–1). */
  deepestOffered: number
  /**
   * Set when the deepest offer is deeper than the prices can carry, so the floor
   * silently clips it.
   *
   * This matters because it is a promise we don't keep: the card says 40% off,
   * the floor hands back 28%, and the member sees a number that doesn't match
   * the one they scratched. Either the card comes down or the floor does — but
   * quietly splitting the difference is the worst of the three.
   */
  clipped: { advertised: number; delivered: number } | null
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
  // A price set at cost × markup, floored at cost × (1 + marginFloor), can take
  // at most this much off before the floor stops it. Nothing to do with RRP —
  // it falls straight out of the two numbers we set ourselves.
  const markup = Math.max(0.01, config.listPricing.markupOnCost)
  const deepestPossibleDiscount = round4(Math.max(0, 1 - (1 + config.marginFloorPct) / markup))

  // The deepest thing we actually offer: biggest bundle, then the best card on
  // top of it.
  const bestCard = Math.max(0, ...config.introOffer.scratchReveal.outcomes.map((o) => o.discount))
  const deepestRung = Math.max(...Object.values(config.levelSubscriptionDiscount))
  const deepestOffered = round4(1 - (1 - deepestRung) * (1 - bestCard))

  const levels = Object.keys(ITEMS_BY_LEVEL) as StackLevel[]
  const rungs = levels.map<LadderRung>((level) => {
    const items = ITEMS_BY_LEVEL[level]
    const listPrice = Math.round(averageListPrice * items * 100) / 100
    const tier = resolveTier(config.bundleTiers, listPrice, items)
    const subscriptionPct = config.levelSubscriptionDiscount[level] ?? config.subscriptionDiscount
    const advantage = round4(subscriptionPct - tier.pct)
    const pays = (d: number) => Math.round(listPrice * (1 - d) * 100) / 100

    return {
      level,
      items,
      listPrice,
      oneOffPct: round4(tier.pct),
      oneOffLabel: tier.tier?.label ?? null,
      subscriptionPct: round4(subscriptionPct),
      advantage,
      paysOneOff: pays(tier.pct),
      paysSubscribed: pays(subscriptionPct),
      healthy: advantage >= HEALTHY_ADVANTAGE_PP,
      warning: warningFor(advantage, subscriptionPct, tier.pct),
    }
  })

  // Only a real clip when the floor actually applies to the intro offer. With
  // `respectMarginFloor` off the deep card is paid in full and simply loses
  // money on purpose, which is the design rather than a broken promise.
  const clipped =
    config.introOffer.respectMarginFloor && deepestOffered > deepestPossibleDiscount
      ? { advertised: deepestOffered, delivered: deepestPossibleDiscount }
      : null

  const broken = rungs.filter((r) => !r.healthy)
  const summary = broken.length > 0
    ? `${broken.length} of ${rungs.length} bundles ${broken.length === 1 ? 'gives' : 'give'} members too little reason to subscribe.`
    : clipped
      ? `Every bundle beats buying once — but the biggest bundle plus the top scratch card asks for ${Math.round(clipped.advertised * 100)}% off, and prices at ${markup}× cost can only carry ${Math.round(clipped.delivered * 100)}%.`
      : `Every bundle beats buying once by at least ${Math.round(HEALTHY_ADVANTAGE_PP * 100)} points, and the biggest discount we offer stays inside what the prices can carry.`

  return {
    rungs,
    coherent: broken.length === 0 && clipped == null,
    markupOnCost: markup,
    deepestPossibleDiscount,
    deepestOffered,
    clipped,
    summary,
  }
}

function warningFor(advantage: number, subscriptionPct: number, oneOffPct: number): string | null {
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
