/**
 * Blended economics — does the business make money on the AVERAGE order?
 *
 * WHY THIS IS THE QUESTION THAT MATTERS
 * ─────────────────────────────────────
 * Everything else in `lib/pricing/*` prices ONE order under ONE set of
 * assumptions. That is the right way to set a price and the wrong way to judge a
 * business. A member on the biggest bundle who wins the 50% scratch card pays
 * less than the order costs us — and that is completely fine, because the top
 * card is rationed to roughly one in twenty-one and its cost is already inside
 * the blended intro figure the prices were set from.
 *
 * Hunting for individual loss-making orders finds promotional mechanics working
 * as designed and calls them bugs. The honest question is whether the MIX pays:
 * across the spread of scratch outcomes, bundle sizes, one-off versus
 * subscription, partner-attributed versus not, and delivery zones, does the
 * average order leave money behind?
 *
 * THE PART THAT MAKES AN UNKNOWN SAFE
 * ───────────────────────────────────
 * Nobody knows yet what share of orders will come through partners. That looks
 * like a risk you have to guess at, and it isn't — because if the average
 * ATTRIBUTED order is itself profitable, then no attribution share can make the
 * blend unprofitable. 0% or 100%, the average stays positive.
 *
 * So rather than asking for a number nobody has, `breakEven` reports how far
 * each lever could move before the average reaches zero — and says plainly when
 * a lever cannot break it at all. An unknown you have proven you are safe
 * against stops being a risk.
 *
 * Pure — the caller supplies the config and the representative product.
 */
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { StackLevel } from '@/lib/types'
import { unitEconomics } from './unit-economics'
import { commissionOn } from './commission'

const round = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

/** The product the blend is modelled on — a representative basket. */
export interface BlendedInput {
  /** Shelf price of a typical order before any discount (£ inc VAT). */
  shelfPrice: number
  /** What the goods cost us, ex VAT (£). */
  supplierCost: number
  /** Shipped weight (g). */
  grams: number
}

/** One weighted outcome in the blend, and what it earned. */
export interface BlendedCase {
  label: string
  /** Share of orders that look like this (0–1). */
  weight: number
  /** What the member paid (£ inc VAT). */
  paid: number
  /** Contribution after everything, including commission (£). */
  contribution: number
  marginPct: number
  /** Commission paid on this case (£). */
  commission: number
}

export interface LeverHeadroom {
  lever: string
  /** Where it is now, formatted by the caller. */
  current: number
  /**
   * The value at which the average order reaches zero contribution, or null when
   * the lever cannot break it however far it moves — which is the answer you
   * want and the one worth saying out loud.
   */
  breaksAt: number | null
  /** How much room there is between the two. */
  headroom: number | null
  unit: 'pct' | 'months' | 'currency'
}

export interface BlendedEconomics {
  /** Expected contribution on an average order (£). */
  perOrder: number
  /** perOrder ÷ average net revenue (0–1). */
  marginPct: number
  /** Average net revenue per order (£). */
  netRevenuePerOrder: number
  /** Average commission paid per order (£). */
  commissionPerOrder: number
  /** Expected contribution per customer acquired, over their lifetime (£). */
  perCustomer: number
  /** True when the average order makes money. The headline. */
  profitable: boolean
  /** Every weighted case behind the average, heaviest first. */
  cases: BlendedCase[]
  /** How far each lever can move before the average reaches zero. */
  breakEven: LeverHeadroom[]
  /** What the blend assumed, so the hub can mark guesses as guesses. */
  assumptions: {
    subscriptionShare: number
    attributedShare: number
    averageRetentionMonths: number
    effectiveIntroDiscount: number
    averageBundleDiscount: number
  }
}

/** Weighted-average bundle discount across the level mix. */
export function averageBundleDiscount(config: PricingConfig = getPricingConfig()): number {
  const mix = config.orderMix.levelMix
  const total = Object.values(mix).reduce((s, w) => s + w, 0)
  if (total <= 0) return config.subscriptionDiscount
  const levels = Object.keys(mix) as StackLevel[]
  return round4(
    levels.reduce((s, level) => s + (config.levelSubscriptionDiscount[level] ?? config.subscriptionDiscount) * mix[level], 0) / total,
  )
}

/**
 * The average order, and whether it pays.
 *
 * Four cases, weighted by the mix: one-off and subscription, each attributed and
 * not. Subscriptions are modelled over their whole life — first month at the
 * intro discount and first-order commission, then renewals at the plain
 * subscribe-&-save rate and the renewal commission — then divided back down to a
 * per-order figure, because a subscription that bills six times is six orders.
 */
export function blendedEconomics(
  input: BlendedInput,
  config: PricingConfig = getPricingConfig(),
): BlendedEconomics {
  const mix = config.orderMix
  const bundleDiscount = averageBundleDiscount(config)
  const months = Math.max(1, mix.averageRetentionMonths)

  const shape = { supplierCost: input.supplierCost, grams: input.grams, chargeDelivery: false as const }

  /** One order at a given discount, with or without a partner on it. */
  const priceCase = (discount: number, attributed: boolean, kind: 'first' | 'renewal') => {
    const paid = round(input.shelfPrice * (1 - discount))
    const e = unitEconomics({ ...shape, shelfPrice: paid }, config)
    const commission = attributed ? commissionOn(e.netRevenue, kind, config).amount : 0
    return { paid, economics: e, commission, contribution: round(e.contribution - commission) }
  }

  // The intro discount an order carries: the blended scratch figure normally,
  // and the partner floor when a code was used (the code raises the card's worst
  // outcome, so attributed orders give away more on month one).
  const introPlain = config.introOffer.effectiveFirstMonthDiscount
  const introPartner = Math.max(introPlain, config.partners.introFloorPct)

  const combine = (a: number, b: number) => 1 - (1 - a) * (1 - b)

  /** A weighted case: everything is already a per-order average by this point. */
  interface Averaged { paid: number; contribution: number; commission: number; netRevenue: number }

  const cases: BlendedCase[] = []
  const netByCase: number[] = []
  const push = (label: string, weight: number, a: Averaged) => {
    if (weight <= 0) return
    cases.push({
      label,
      weight: round4(weight),
      paid: round(a.paid),
      contribution: round(a.contribution),
      marginPct: a.netRevenue > 0 ? round4(a.contribution / a.netRevenue) : 0,
      commission: round(a.commission),
    })
    netByCase.push(a.netRevenue)
  }

  const subShare = Math.min(1, Math.max(0, mix.subscriptionShare))
  const attShare = Math.min(1, Math.max(0, mix.attributedShare))

  const flatten = (c: ReturnType<typeof priceCase>): Averaged => ({
    paid: c.paid,
    contribution: c.contribution,
    commission: c.commission,
    netRevenue: c.economics.netRevenue,
  })

  // ── One-off orders ──
  // No intro offer (that is a subscription mechanic), no renewals.
  const oneOffShare = 1 - subShare
  push('One-off, direct', oneOffShare * (1 - attShare), flatten(priceCase(0, false, 'first')))
  push('One-off, via a partner', oneOffShare * attShare, flatten(priceCase(0, true, 'first')))

  // ── Subscriptions ──
  // Modelled over the whole life — one first month at the intro discount and the
  // first-order commission, then renewals — and divided back down, because a
  // subscription that bills six times is six orders.
  const subCase = (attributed: boolean, intro: number): Averaged & { lifetime: number } => {
    const first = priceCase(combine(bundleDiscount, intro), attributed, 'first')
    const renewal = priceCase(bundleDiscount, attributed, 'renewal')
    const renewals = months - 1
    const paidCommissionMonths = Math.min(renewals, config.partners.renewalMonths)
    const lifetime = first.contribution + renewal.contribution * renewals
    return {
      paid: (first.paid + renewal.paid * renewals) / months,
      contribution: lifetime / months,
      commission: (first.commission + renewal.commission * paidCommissionMonths) / months,
      netRevenue: (first.economics.netRevenue + renewal.economics.netRevenue * renewals) / months,
      lifetime: round(lifetime),
    }
  }

  const directSub = subCase(false, introPlain)
  const partnerSub = subCase(true, introPartner)
  push('Subscription, direct', subShare * (1 - attShare), directSub)
  push('Subscription, via a partner', subShare * attShare, partnerSub)

  // Sort AFTER pairing net revenue with each case, so the two stay aligned.
  const paired = cases.map((c, i) => ({ c, net: netByCase[i] })).sort((a, b) => b.c.weight - a.c.weight)
  const sorted = paired.map((p) => p.c)

  const weightTotal = sorted.reduce((s, c) => s + c.weight, 0) || 1
  const perOrder = round(sorted.reduce((s, c) => s + c.contribution * c.weight, 0) / weightTotal)
  const commissionPerOrder = round(sorted.reduce((s, c) => s + c.commission * c.weight, 0) / weightTotal)
  const netRevenuePerOrder = round(paired.reduce((s, p) => s + p.net * p.c.weight, 0) / weightTotal)

  // Lifetime value of one acquired customer, blending the two ways they arrive.
  const perCustomer = round(
    (1 - subShare) * (perOrder) +
      subShare * ((1 - attShare) * directSub.lifetime + attShare * partnerSub.lifetime),
  )

  return {
    perOrder,
    marginPct: netRevenuePerOrder > 0 ? round4(perOrder / netRevenuePerOrder) : 0,
    netRevenuePerOrder,
    commissionPerOrder,
    perCustomer,
    profitable: perOrder > 0,
    cases: sorted,
    breakEven: breakEvenLevers(input, config),
    assumptions: {
      subscriptionShare: round4(subShare),
      attributedShare: round4(attShare),
      averageRetentionMonths: months,
      effectiveIntroDiscount: round4(introPlain),
      averageBundleDiscount: bundleDiscount,
    },
  }
}

/**
 * How far each lever can move before the average order reaches zero.
 *
 * Solved by search rather than algebra: the blend has a piecewise delivery
 * charge, a commission floor and a weighted mix inside it, and an algebraic
 * inversion would be a second implementation to keep in step with the first.
 * A hundred steps over each lever's plausible range is exact enough for a number
 * that is read as "you have plenty of room" or "you don't".
 */
function breakEvenLevers(input: BlendedInput, config: PricingConfig): LeverHeadroom[] {
  /**
   * Walk a lever until the average goes negative.
   *
   * `to` may be below `current` — retention is a risk when it FALLS, and a
   * headroom table that only sweeps upwards would report the most dangerous
   * assumption in the model as perfectly safe.
   */
  const sweep = (
    lever: string,
    unit: LeverHeadroom['unit'],
    current: number,
    to: number,
    apply: (v: number) => { input?: Partial<BlendedInput>; config?: Partial<PricingConfig> },
  ): LeverHeadroom => {
    const steps = 100
    for (let i = 1; i <= steps; i++) {
      const raw = current + ((to - current) * i) / steps
      // Report the value actually tested, so a whole-month lever never reports
      // breaking at 3.4 months when 3 is what was modelled.
      const v = unit === 'months' ? Math.max(1, Math.round(raw)) : raw
      const { input: iOver, config: cOver } = apply(v)
      if (blendedEconomicsRaw({ ...input, ...iOver }, { ...config, ...cOver }) <= 0) {
        return { lever, unit, current: round4(current), breaksAt: round4(v), headroom: round4(v - current) }
      }
    }
    // Nothing in range breaks it — the answer worth having.
    return { lever, unit, current: round4(current), breaksAt: null, headroom: null }
  }

  return [
    // The unknown the founder is actually worried about.
    sweep('Orders through partners', 'pct', config.orderMix.attributedShare, 1, (v) => ({
      config: { orderMix: { ...config.orderMix, attributedShare: v } },
    })),
    sweep('Commission on a first order', 'pct', config.partners.firstOrderPct, 1, (v) => ({
      config: { partners: { ...config.partners, firstOrderPct: v } },
    })),
    // Swept DOWNWARD — this is the one that bites, because renewals are what pay
    // for the discounted first month.
    sweep('Average subscriber life', 'months', config.orderMix.averageRetentionMonths, 1, (v) => ({
      config: { orderMix: { ...config.orderMix, averageRetentionMonths: Math.max(1, Math.round(v)) } },
    })),
    // PowerBody set their own prices and their terms say so. Doubling is the
    // range, not the expectation.
    sweep('What PowerBody charge us', 'currency', input.supplierCost, input.supplierCost * 3, (v) => ({
      input: { supplierCost: v },
    })),
    sweep('Average first-month discount', 'pct', config.introOffer.effectiveFirstMonthDiscount, 1, (v) => ({
      config: { introOffer: { ...config.introOffer, effectiveFirstMonthDiscount: v } },
    })),
    sweep('Biggest bundle discount', 'pct', config.levelSubscriptionDiscount.complete, 1, (v) => ({
      config: { levelSubscriptionDiscount: { ...config.levelSubscriptionDiscount, complete: v } },
    })),
    sweep('Orders returned', 'pct', config.returns.ratePct, 1, (v) => ({
      config: { returns: { ...config.returns, ratePct: v } },
    })),
  ]
}

/** The blended contribution per order alone — the inner loop of the sweep. */
function blendedEconomicsRaw(input: BlendedInput, config: PricingConfig): number {
  const mix = config.orderMix
  const bundleDiscount = averageBundleDiscount(config)
  const months = Math.max(1, mix.averageRetentionMonths)
  const shape = { supplierCost: input.supplierCost, grams: input.grams, chargeDelivery: false as const }

  const one = (discount: number, attributed: boolean, kind: 'first' | 'renewal') => {
    const e = unitEconomics({ ...shape, shelfPrice: round(input.shelfPrice * (1 - discount)) }, config)
    return e.contribution - (attributed ? commissionOn(e.netRevenue, kind, config).amount : 0)
  }

  const introPlain = config.introOffer.effectiveFirstMonthDiscount
  const introPartner = Math.max(introPlain, config.partners.introFloorPct)
  const combine = (a: number, b: number) => 1 - (1 - a) * (1 - b)
  const subShare = Math.min(1, Math.max(0, mix.subscriptionShare))
  const attShare = Math.min(1, Math.max(0, mix.attributedShare))

  const sub = (attributed: boolean, intro: number) =>
    (one(combine(bundleDiscount, intro), attributed, 'first') +
      one(bundleDiscount, attributed, 'renewal') * (months - 1)) /
    months

  return (
    (1 - subShare) * ((1 - attShare) * one(0, false, 'first') + attShare * one(0, true, 'first')) +
    subShare * ((1 - attShare) * sub(false, introPlain) + attShare * sub(true, introPartner))
  )
}
