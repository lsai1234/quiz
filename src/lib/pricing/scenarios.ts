/**
 * The handful of ways a product actually gets sold, and what we keep on each.
 *
 * WHAT THIS REPLACED
 * ──────────────────
 * A weighted average-order model with break-even sensitivity sweeps across seven
 * levers. It was correct and nobody could use it: to know whether a product was
 * fine you had to hold an order mix, a retention curve and a commission
 * structure in your head at once.
 *
 * This asks the same question the other way round. Rather than one blended
 * number nobody can check, it lists the four or five routes a real customer
 * takes and shows what each leaves us. If they are all positive the product is
 * fine; if one isn't, you can see which and why without unpacking a model.
 *
 * THE FIRST MONTH IS ALLOWED TO LOSE — THE LIFETIME IS NOT
 * ────────────────────────────────────────────────────────
 * The intro offer is rationed marketing, and holding it to break-even would
 * mean not having one. So every first-month scenario is marked `promotional`
 * and excluded from the verdict, INCLUDING the averaged one.
 *
 * What must hold instead is the whole subscription: first month plus renewals,
 * over how long a member actually stays. That is the test the business has
 * agreed to, and getting it wrong in either direction is expensive — demanding
 * month one pays kills the offer, and letting the lifetime slide bleeds money
 * quietly.
 */
import { getPricingConfig, introOutcomesForModelling, resolveTier, scratchRevealEnabled, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { unitEconomics } from './unit-economics'

const round = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

export interface Scenario {
  id: string
  /** What this route is, in words a customer would recognise. */
  label: string
  /** The discount applied on this route (0–1). */
  discount: number
  /** What the customer pays for the goods (£). */
  paid: number
  /** What we keep after everything (£). */
  keeps: number
  /** keeps ÷ what we keep of the price (0–1). */
  marginPct: number
  /**
   * True when losing money here is the design rather than a fault — the rare
   * scratch card. Excluded from the verdict.
   */
  promotional: boolean
}

export interface ScenarioCheck {
  /** The list price these were run at (£). */
  listPrice: number
  scenarios: Scenario[]
  /** True when every non-promotional route pays. */
  ok: boolean
  /** The routes that lose money and aren't supposed to. */
  problems: Scenario[]
}

/**
 * Run one basket through every route a customer can take.
 *
 * `listPrice` is the undiscounted total; `supplierCost` what we pay for it.
 * `sharedParcelItems` says how many products share the parcel — 1 for something
 * bought on its own, the stack size for a quiz box.
 */
export function checkScenarios(
  input: { listPrice: number; supplierCost: number; sharedParcelItems?: number },
  config: PricingConfig = getPricingConfig(),
): ScenarioCheck {
  const { listPrice, supplierCost } = input
  const items = Math.max(1, input.sharedParcelItems ?? 1)
  const deepest = Math.max(...Object.values(config.levelSubscriptionDiscount))
  // The outcomes actually in force — the card's while it runs, a single certain
  // outcome at the flat rate once it doesn't. Reading the card's config directly
  // meant these scenarios went on modelling cards that were never dealt.
  const cards = [...introOutcomesForModelling(config)].sort((a, b) => b.discount - a.discount)
  // Whether a *card* is actually being dealt, as opposed to one certain rate.
  // Drives the wording, and whether the worst case counts as promotional.
  const cardsAreDealt = scratchRevealEnabled(config)
  const totalWeight = cards.reduce((s, c) => s + c.weight, 0) || 1

  const run = (id: string, label: string, discount: number, promotional = false): Scenario => {
    const paid = round(listPrice * (1 - discount))
    const e = unitEconomics(
      {
        shelfPrice: paid,
        supplierCost,
        sharedParcelItems: items,
        // Free delivery qualifies on what the basket is WORTH, not on what it
        // costs after we've discounted it — same basis as the bundle tier.
        freeDeliveryBasis: listPrice,
      },
      config,
    )
    return {
      id,
      label,
      discount: round4(discount),
      paid,
      keeps: e.contribution,
      marginPct: e.marginPct,
      promotional,
    }
  }

  const oneOffTier = resolveTier(config.bundleTiers, listPrice, items).pct
  const scenarios: Scenario[] = [
    run('full', 'Bought on its own', 0),
    run('one-off', `In a basket over £${config.bundleTiers[0]?.minSubtotal ?? 0}`, oneOffTier),
    run('subscribed', 'Subscriber, every month after the first', deepest),
  ]

  // The first month, averaged across the card — shown, but not the test.
  const first = cards.reduce((sum, c) => {
    const paid = round(listPrice * (1 - deepest) * (1 - c.discount))
    const e = unitEconomics(
      { shelfPrice: paid, supplierCost, sharedParcelItems: items, freeDeliveryBasis: listPrice },
      config,
    )
    return sum + (c.weight / totalWeight) * e.contribution
  }, 0)
  const avgCardDiscount = round4(1 - (1 - deepest) * (1 - cards.reduce((s, c) => s + (c.weight / totalWeight) * c.discount, 0)))
  scenarios.push({
    id: 'first-month',
    label: cardsAreDealt
      ? 'First month, averaged across the scratch card'
      : 'First month',
    discount: avgCardDiscount,
    paid: round(listPrice * (1 - avgCardDiscount)),
    keeps: round(first),
    marginPct: 0,
    // Promotional: the intro offer is acquisition cost by design. What has to
    // pay is the LIFETIME below, not this month.
    promotional: true,
  })

  // The whole subscription — the test that actually has to pass.
  const months = Math.max(1, config.orderMix.averageRetentionMonths)
  const renewal = scenarios.find((s) => s.id === 'subscribed')!
  const lifetime = round(first + renewal.keeps * (months - 1))
  scenarios.push({
    id: 'lifetime',
    label: `A whole subscription, over ${months} months`,
    discount: 0,
    paid: round(scenarios.find((s) => s.id === 'first-month')!.paid + renewal.paid * (months - 1)),
    keeps: lifetime,
    marginPct: 0,
    promotional: false,
  })

  // …and the deepest first month on its own, so the worst case is visible rather
  // than hidden inside an average. Allowed to lose while it is a rare card; a
  // flat rate everybody gets is not promotional and is not allowed to lose,
  // which is the whole reason the model has to know which one is running.
  const top = cards[0]
  if (top && cardsAreDealt) {
    scenarios.push(
      run('top-card', `Worst case: ${Math.round(top.discount * 100)}% card (1 in ${Math.round(totalWeight / top.weight)})`,
        1 - (1 - deepest) * (1 - top.discount), true),
    )
  }

  const problems = scenarios.filter((s) => !s.promotional && s.keeps < 0)
  return { listPrice, scenarios, ok: problems.length === 0, problems }
}
