/**
 * The cut-offs — the handful of numbers that decide what we are allowed to sell.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The rest of the pricing area answers "what does this product make?", product
 * by product. That is the wrong shape for the decision it feeds. Nobody prices a
 * catalogue one line at a time; what you actually need is a small set of floors:
 * *below this we lose money, so don't offer it.*
 *
 * TWO DIFFERENT RULES, AND THE DIFFERENCE MATTERS
 * ───────────────────────────────────────────────
 * **A one-off order must never lose money.** There is nothing behind it — no
 * renewal, no second chance — so if the checkout will let someone buy a basket
 * that loses £2, we lose £2. Every time. That is a hard floor.
 *
 * **A subscription only has to pay over its life.** The first month carries the
 * scratch card, and the top card is *meant* to lose money — it is rationed
 * marketing, priced into the blend. Holding month one to break-even would mean
 * having no intro offer at all. So a subscription gets an averaged floor: the
 * whole life, first month and renewals together, has to clear zero.
 *
 * Applying the one-off rule to subscriptions kills the offer; applying the
 * subscription rule to one-offs quietly bleeds money. They are computed
 * separately here for exactly that reason.
 *
 * HOW THE FLOORS ARE FOUND
 * ────────────────────────
 * By scanning the real waterfall rather than solving algebra. Delivery is a step
 * function and our own free-delivery threshold is a second one, so the profit
 * curve has cliffs in it — and a cliff can put a LOSS-MAKING BAND *above* the
 * first break-even point. An algebraic floor would miss that entirely and report
 * a number that is true and useless. The scan finds every band.
 */
import { getPricingConfig, resolveTier, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { unitEconomics } from './unit-economics'

const round = (n: number) => Math.round(n * 100) / 100

/** A range of order values that loses money. */
export interface LossBand {
  from: number
  to: number
  /** Why this band loses, in a sentence. */
  reason: string
}

export interface Threshold {
  id: string
  /** What this floor is, in plain words. */
  label: string
  /** The floor itself (£). Null when nothing in the scanned range ever pays. */
  value: number | null
  /** What it means and what to do about it. */
  meaning: string
  /** Ranges above the floor that still lose money — the cliffs. */
  lossBands: LossBand[]
  /** A setting that should be enforcing this floor, and whether it does. */
  enforcedBy: { setting: string; label: string; current: number; ok: boolean } | null
}

export interface PricingThresholds {
  thresholds: Threshold[]
  /** True when every floor is enforced by a setting. */
  allEnforced: boolean
}

/** The most we would ever scan to. Beyond this, everything is profitable. */
const SCAN_MAX = 400
const STEP = 0.5

/**
 * Walk a price curve and find the lowest point above which it never loses again,
 * plus any loss-making bands sitting above it.
 *
 * `contributionAt` is the real waterfall for one order at that price, so the
 * scan can't drift from what the hub shows elsewhere.
 */
function scan(contributionAt: (price: number) => number): { floor: number | null; bands: LossBand[] } {
  const losing: number[] = []
  for (let p = STEP; p <= SCAN_MAX; p = round(p + STEP)) {
    if (contributionAt(p) < 0) losing.push(p)
  }
  if (losing.length === 0) return { floor: 0, bands: [] }

  // The floor is just above the last losing price — above that it always pays.
  const floor = round(losing[losing.length - 1] + STEP)
  if (floor > SCAN_MAX) return { floor: null, bands: [] }

  // Any losing stretch that does NOT start at zero is a cliff worth naming.
  const bands: LossBand[] = []
  let start: number | null = null
  let prev: number | null = null
  for (const p of losing) {
    if (start == null) start = p
    else if (prev != null && p > round(prev + STEP)) {
      bands.push({ from: start, to: prev, reason: '' })
      start = p
    }
    prev = p
  }
  if (start != null && prev != null) bands.push({ from: start, to: prev, reason: '' })

  // Drop the opening band — "everything below the floor loses" is the floor
  // itself, not a separate finding.
  return { floor, bands: bands.filter((b) => b.from > STEP) }
}

/**
 * Every floor, computed against the current rules.
 *
 * `costRatio` is what a product costs us as a share of its shelf price — with
 * the pricing rule being "double what we pay", that is 1 ÷ the markup.
 */
export function pricingThresholds(config: PricingConfig = getPricingConfig()): PricingThresholds {
  const costRatio = 1 / Math.max(0.01, config.listPricing.markupOnCost)
  const months = Math.max(1, config.orderMix.averageRetentionMonths)
  const deepestRate = Math.max(...Object.values(config.levelSubscriptionDiscount))
  const intro = config.introOffer.effectiveFirstMonthDiscount

  /** One order at a shelf price, with the goods costed by our own pricing rule. */
  const order = (shelfPrice: number, opts: { chargeDelivery?: boolean; items?: number } = {}) =>
    unitEconomics(
      {
        shelfPrice,
        supplierCost: round(shelfPrice * costRatio),
        chargeDelivery: opts.chargeDelivery,
        sharedParcelItems: opts.items,
      },
      config,
    ).contribution

  // ── 1. A single item, bought on its own ───────────────────────────────────
  // Its own parcel, and the member pays postage if the rule says so. The worst
  // case a real order can be.
  const single = scan((p) => order(p))

  // ── 2. A one-off basket ───────────────────────────────────────────────────
  // Carries whatever bundle tier it earns, and stops paying postage once it
  // clears our free-delivery line — which is where the cliff comes from.
  const oneOff = scan((listValue) => {
    const tier = resolveTier(config.bundleTiers, listValue, config.orderMix.itemsPerOrder).pct
    const paid = round(listValue * (1 - tier))
    // The goods are costed on the LIST value; the discount comes out of us. Free
    // delivery qualifies on that list value too, so a basket cannot lose the
    // perk by earning a discount.
    return unitEconomics(
      { shelfPrice: paid, supplierCost: round(listValue * costRatio), freeDeliveryBasis: listValue },
      config,
    ).contribution
  })

  // ── 3. A subscription renewal ─────────────────────────────────────────────
  // The deepest rate anyone can reach, no intro offer, and OUR OWN DELIVERY RULE
  // applied: a plan under `freeDeliveryThreshold` is charged postage like any
  // other order; only plans above it ship free.
  //
  // This used to force `chargeDelivery: false` — "assume the worst, we absorb
  // it". That is the worst case on the wrong side of our own rule: a £30/month
  // plan does collect £3.95, so pretending otherwise overstated the floor by
  // most of a delivery and turned away subscriptions that make money.
  const renewal = scan((listValue) =>
    unitEconomics(
      {
        shelfPrice: round(listValue * (1 - deepestRate)),
        supplierCost: round(listValue * costRatio),
      },
      config,
    ).contribution,
  )

  // ── 4. A whole subscription, averaged ─────────────────────────────────────
  // First month at the blended scratch discount, then renewals. This is the one
  // the intro offer is allowed to be judged by — see the note at the top.
  const lifetime = scan((listValue) => {
    const cost = round(listValue * costRatio)
    const first = unitEconomics(
      { shelfPrice: round(listValue * (1 - deepestRate) * (1 - intro)), supplierCost: cost },
      config,
    ).contribution
    const rest = unitEconomics(
      { shelfPrice: round(listValue * (1 - deepestRate)), supplierCost: cost },
      config,
    ).contribution
    return (first + rest * (months - 1)) / months
  })

  const cliff = (b: LossBand[], why: string): LossBand[] => b.map((x) => ({ ...x, reason: why }))

  const thresholds: Threshold[] = [
    {
      id: 'single',
      label: 'The cheapest single thing we can sell',
      value: single.floor,
      meaning:
        `Below this, one item posted on its own loses money — the parcel costs more than the item makes. ` +
        `Cheap products aren't banned, they just can't be sold alone: put them in a box that is already going out.`,
      lossBands: cliff(single.bands, 'Loses money even though cheaper orders do not — our free-delivery line starts here, so we stop collecting postage but still pay it.'),
      enforcedBy: {
        setting: 'minOrderValue',
        label: 'Smallest order we accept',
        current: config.minOrderValue,
        ok: single.floor == null ? false : config.minOrderValue >= single.floor,
      },
    },
    {
      id: 'one-off',
      label: 'The smallest one-off order worth taking',
      value: oneOff.floor,
      meaning:
        `A one-off has nothing behind it — no renewal, no second chance — so it has to pay on its own, every time. ` +
        `Below this the checkout would be selling at a loss.`,
      lossBands: cliff(oneOff.bands, 'A dead zone just above the free-delivery threshold: the order gives up the postage we used to collect before it is big enough to carry it.'),
      enforcedBy: {
        setting: 'minOrderValue',
        label: 'Smallest order we accept',
        current: config.minOrderValue,
        ok: oneOff.floor == null ? false : config.minOrderValue >= oneOff.floor,
      },
    },
    {
      id: 'renewal',
      label: 'The smallest monthly plan that pays for itself',
      value: renewal.floor != null ? round(renewal.floor * (1 - deepestRate)) : null,
      meaning:
        `What a member has to be paying each month, on the deepest bundle rate, for a renewal to cover the goods and ` +
        `the postage. Every month after the first has to clear this.`,
      lossBands: [],
      enforcedBy: null,
    },
    {
      id: 'lifetime',
      label: 'The smallest plan that survives the scratch card',
      value: lifetime.floor != null ? round(lifetime.floor * (1 - deepestRate)) : null,
      meaning:
        `The same plan judged across its whole life — first month at the average card, then renewals. This is the ` +
        `honest test for a subscription: individual first months are allowed to lose, because that is what the ` +
        `scratch card is for. It only has to average out.`,
      lossBands: [],
      enforcedBy: {
        setting: 'minSubscriptionMonthly',
        label: 'Minimum to subscribe',
        current: config.minSubscriptionMonthly,
        ok: lifetime.floor == null ? false : config.minSubscriptionMonthly >= round(lifetime.floor * (1 - deepestRate)),
      },
    },
  ]

  return {
    thresholds,
    allEnforced: thresholds.every((t) => t.enforcedBy == null || t.enforcedBy.ok),
  }
}
