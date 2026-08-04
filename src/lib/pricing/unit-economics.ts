/**
 * Unit economics — one explicit stack from "what the customer pays" down to
 * "what we keep".
 *
 * WHY THIS IS THE CENTRE OF THE PRICING AREA
 * ──────────────────────────────────────────
 * "Margin" was being computed as price minus supplier cost. That single
 * subtraction hides four separate leaks, every one of which is real money:
 *
 *   1. VAT      — up to 20% of the shelf price was never ours (see ./vat.ts).
 *   2. Delivery — PowerBody charge £3.25–£5.17 per order, by weight, with no
 *                 free threshold for dropshippers. On a £20 tub that is a fifth
 *                 of the price.
 *   3. Card fees— 1.5% + 20p of the gross, and no VAT to reclaim on it.
 *   4. Returns  — the goods come back but the shipping never does, so a 2%
 *                 return rate is a real per-order cost on the other 98%.
 *
 * Netting all four off a £30 sale on a £10 product turns an apparent 67% margin
 * into something close to 30%. A pricing page that shows the first number and
 * not the second is worse than no pricing page, because it is confidently wrong.
 *
 * So this module produces a WATERFALL — every step named, signed and ordered,
 * summing exactly to the contribution. The UI renders the steps rather than
 * recomputing them, which is what makes the screen self-explaining: there is
 * nowhere for a number to come from except a line you can see.
 *
 * Pure. Every function takes its config, so the hub previews unsaved rules.
 */
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { blendedDeliveryCost, customerDeliveryCharge, shipmentWeight } from './delivery'
import { costFromSupplierPrice, revenueFromShelfPrice, vatRateFor } from './vat'

const round = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

/** One line of the waterfall. Positive adds, negative takes away. */
export interface EconomicsStep {
  id: string
  label: string
  /** Signed amount (£). */
  amount: number
  /** Running total after this step (£). */
  runningTotal: number
  /** Why this line exists, in a sentence — rendered as the row's explanation. */
  note: string
  /** True when the figure rests on an assumption rather than a known number. */
  estimated?: boolean
}

export interface UnitEconomics {
  /** What the customer is charged for the goods, inc VAT (£). */
  shelfPrice: number
  /** Plus any delivery they paid, inc VAT (£). */
  deliveryCharged: number
  /** Everything the customer pays (£). */
  grossRevenue: number
  /** What we keep after VAT (£). */
  netRevenue: number
  vat: number
  productCost: number
  deliveryCost: number
  paymentFee: number
  returnsProvision: number
  /** netRevenue − every cost (£). This is the money the business actually makes. */
  contribution: number
  /** contribution ÷ netRevenue (0–1). Negative when the sale loses money. */
  marginPct: number
  /** contribution ÷ grossRevenue — the number people expect to see, kept so the
   *  two can be shown side by side rather than argued about. */
  marginOfGrossPct: number
  /** The ordered waterfall, summing to `contribution`. */
  steps: EconomicsStep[]
  /** Assumptions the figures rest on, for the "this is estimated" callouts. */
  assumptions: {
    vatRate: number
    vatRegistered: boolean
    grams: number
    weightKnown: boolean
    costKnown: boolean
    deliveryUnavailable: string | null
  }
}

export interface EconomicsInput {
  /** What the customer is charged for the goods, inc VAT (£). */
  shelfPrice: number
  /** What we pay the supplier for the goods, ex VAT (£). Null = estimate it. */
  supplierCost?: number | null
  /** Shipped weight of the goods (g). Null = use the configured default. */
  grams?: number | null
  /** VAT rate for these goods (0–1). Null = standard rate. */
  vatRate?: number | null
  /**
   * Units in the shipment. Scales goods and weight, but NOT the delivery
   * charge — one parcel is one delivery, which is exactly why bundles are more
   * profitable per pound than single items.
   */
  quantity?: number
  /** Charge the customer for delivery, per the free-delivery threshold.
   *  Defaults to applying the rule; pass false to model absorbing it. */
  chargeDelivery?: boolean
}

/**
 * The full stack for one order of one product.
 *
 * Note what scales and what doesn't. Goods and weight scale with quantity; the
 * delivery charge and the fixed part of the card fee do not. That asymmetry is
 * the whole economic argument for bundles, and it only shows up if the model
 * keeps them separate.
 */
export function unitEconomics(input: EconomicsInput, config: PricingConfig = getPricingConfig()): UnitEconomics {
  const quantity = Math.max(1, input.quantity ?? 1)
  const vatRate = vatRateFor({ vatRate: input.vatRate }, config)
  const costKnown = input.supplierCost != null

  // ── Revenue ──
  const shelfPrice = round(input.shelfPrice * quantity)
  const { grams, weightKnown } = shipmentWeight(
    [{ weightGrams: input.grams ?? null, quantity }],
    config,
  )
  const deliveryCharged =
    input.chargeDelivery === false ? 0 : customerDeliveryCharge(shelfPrice, config)
  const grossRevenue = round(shelfPrice + deliveryCharged)
  const netRevenue = round(
    revenueFromShelfPrice(shelfPrice, vatRate, config) +
      // Delivery we charge is standard-rated whatever the goods are.
      revenueFromShelfPrice(deliveryCharged, config.vat.standardRate, config),
  )
  const vat = round(grossRevenue - netRevenue)

  // ── Costs ──
  // With no cost on file, fall back to the configured ratio of the shelf price
  // — but that shelf price includes VAT, so take the ratio of the NET price or
  // the estimate is 20% too high before it starts.
  const supplierExVat = costKnown
    ? input.supplierCost! * quantity
    : round((netRevenue - revenueFromShelfPrice(deliveryCharged, config.vat.standardRate, config)) * config.defaultCostRatio)
  const productCost = costFromSupplierPrice(supplierExVat, config)

  const deliveryCost = blendedDeliveryCost(grams, config)
  const paymentFee = round(grossRevenue * config.paymentFees.percent + config.paymentFees.fixed)

  // A return refunds the goods but never the shipping, so what a return costs
  // is the delivery — out, and back again. Spread across every order at the
  // return rate, because that is how a provision works.
  const returnsProvision = round(
    config.returns.ratePct * deliveryCost * config.returns.costMultipleOfDelivery,
  )

  const contribution = round(netRevenue - productCost - deliveryCost - paymentFee - returnsProvision)

  // ── The waterfall ──
  const steps: EconomicsStep[] = []
  let running = 0
  const push = (id: string, label: string, amount: number, note: string, estimated?: boolean) => {
    running = round(running + amount)
    steps.push({ id, label, amount: round(amount), runningTotal: running, note, ...(estimated ? { estimated } : {}) })
  }

  push('shelf', 'Customer pays', shelfPrice, quantity > 1 ? `${quantity} × the shelf price, VAT included.` : 'The shelf price, VAT included.')
  if (deliveryCharged > 0) {
    push('delivery-charged', 'Delivery charged', deliveryCharged, `Under the £${config.freeDeliveryThreshold} free-delivery threshold, so they pay postage.`)
  }
  push('vat', config.vat.registered ? 'Less VAT' : 'No VAT charged', -vat,
    config.vat.registered
      ? `${Math.round(vatRate * 1000) / 10}% of the price is HMRC's, not ours.`
      : 'Not VAT-registered, so nothing is charged — and nothing can be reclaimed on costs.')
  push('goods', 'Less what PowerBody charge for the goods', -productCost,
    config.vat.registered
      ? 'Their wholesale price, ex VAT — we reclaim the VAT they charge us.'
      : 'Their wholesale price plus VAT, which we cannot reclaim.',
    !costKnown)
  push('delivery-cost', 'Less what PowerBody charge to ship it', -deliveryCost,
    `${grams}g, blended across mainland and Highlands rates. Dropshippers get no free delivery, so this is on every order.`,
    !weightKnown)
  push('fees', 'Less card fees', -paymentFee,
    `${Math.round(config.paymentFees.percent * 1000) / 10}% + ${config.paymentFees.fixed.toFixed(2)} of the gross. VAT-exempt, so there is nothing to reclaim.`)
  push('returns', 'Less returns provision', -returnsProvision,
    `${Math.round(config.returns.ratePct * 1000) / 10}% of orders come back. The goods are refunded to us; the shipping never is.`)

  return {
    shelfPrice,
    deliveryCharged,
    grossRevenue,
    netRevenue,
    vat,
    productCost,
    deliveryCost,
    paymentFee,
    returnsProvision,
    contribution,
    marginPct: netRevenue > 0 ? round4(contribution / netRevenue) : -1,
    marginOfGrossPct: grossRevenue > 0 ? round4(contribution / grossRevenue) : -1,
    steps,
    assumptions: {
      vatRate,
      vatRegistered: config.vat.registered,
      grams,
      weightKnown,
      costKnown,
      deliveryUnavailable: null,
    },
  }
}

/**
 * Solve for the shelf price that yields a given contribution margin.
 *
 * Closed-form rather than iterative. Writing the stack out in terms of the shelf
 * price P, with D for any delivery we collect from the member:
 *
 *   net    = P / (1 + v)  +  D / (1 + v_std)
 *   costs  = c + d + f%·(P + D) + f_fixed + r
 *   want:    (net − costs) / net = m
 *
 *   ⇒ P · [ (1 − m)/(1 + v) − f% ]
 *       = c + d + f_fixed + r + f%·D − (1 − m)·D/(1 + v_std)
 *
 * THE PIECEWISE PART. D is not a constant: the member pays postage below the
 * free-delivery threshold and nothing above it. That makes the equation
 * piecewise, and solving one branch blindly gives a price that contradicts its
 * own assumption — a "break-even" price that isn't, because the solver assumed
 * postage the waterfall then didn't charge. So both branches are solved and the
 * one consistent with its own answer is returned; if both are (or neither is),
 * the no-postage branch wins because it is the conservative one.
 *
 * The bracket goes to zero when card fees eat the entire net margin — a real if
 * absurd configuration — hence the guard rather than a silent divide-by-zero
 * producing a plausible-looking number.
 */
export function priceForMargin(
  targetMargin: number,
  input: Omit<EconomicsInput, 'shelfPrice'>,
  config: PricingConfig = getPricingConfig(),
): number | null {
  const quantity = Math.max(1, input.quantity ?? 1)
  const vatRate = vatRateFor({ vatRate: input.vatRate }, config)
  const m = Math.min(0.99, Math.max(0, targetMargin))

  const { grams } = shipmentWeight([{ weightGrams: input.grams ?? null, quantity }], config)
  const deliveryCost = blendedDeliveryCost(grams, config)
  const returnsProvision = round(config.returns.ratePct * deliveryCost * config.returns.costMultipleOfDelivery)

  // An unknown cost is a share of the net price, which makes it scale WITH P —
  // so it belongs on the left of the equation, not the right.
  const costKnown = input.supplierCost != null
  const netDivisor = config.vat.registered ? 1 + vatRate : 1
  const stdDivisor = config.vat.registered ? 1 + config.vat.standardRate : 1
  const costMultiplier = config.vat.registered ? 1 : 1 + config.vat.standardRate

  const perPound =
    (1 - m) / netDivisor -
    config.paymentFees.percent -
    (costKnown ? 0 : (config.defaultCostRatio * costMultiplier) / netDivisor)

  if (perPound <= 0) return null

  const solve = (deliveryCharged: number): number => {
    const base =
      (costKnown ? costFromSupplierPrice(input.supplierCost! * quantity, config) : 0) +
      deliveryCost +
      config.paymentFees.fixed +
      returnsProvision +
      config.paymentFees.percent * deliveryCharged -
      ((1 - m) * deliveryCharged) / stdDivisor
    // Round UP: rounding a floor down puts you under it.
    return Math.ceil((base / perPound) * 100) / 100
  }

  const charge = round(config.delivery.customerDeliveryCharge)
  const freeAbove = config.freeDeliveryThreshold

  const chooseBranch = (): number => {
    // The caller can pin the branch — the good-price model does, because its
    // worst case is that we absorb the postage.
    if (input.chargeDelivery === false) return solve(0)
    if (input.chargeDelivery === true) return solve(charge)
    if (freeAbove <= 0) return solve(charge) // no free-delivery offer: always charged

    const withoutPostage = solve(0)
    if (withoutPostage >= freeAbove) return withoutPostage
    const withPostage = solve(charge)
    return withPostage < freeAbove ? withPostage : withoutPostage
  }

  // Verify against the real waterfall rather than trusting the algebra.
  //
  // The closed form is exact; the waterfall it has to agree with is not, because
  // every line in it is rounded to whole pence. Those roundings can land the
  // achieved margin a hundredth of a percent under target — which would make
  // "the price that hits 35%" a price that reports 34.99%, and a founder right
  // to distrust the page. So nudge up by a penny until the rendered numbers
  // actually clear it. Bounded because a config where a penny never helps
  // (fees ≥ margin) should return null, not spin.
  let price = chooseBranch()
  for (let i = 0; i < 25; i++) {
    if (unitEconomics({ ...input, shelfPrice: price }, config).marginPct >= m) return price
    price = round(price + 0.01)
  }
  return null
}

/** Grade an existing price, and say what it should have been. */
export interface PriceGrade {
  economics: UnitEconomics
  /** The price that would hit the target margin (£), or null if unreachable. */
  targetPrice: number | null
  /** The price at which the sale breaks exactly even (£), or null. */
  breakEvenPrice: number | null
  profitable: boolean
  meetsTarget: boolean
  /** How far the current price is from the target (£; negative = underpriced). */
  vsTarget: number | null
}

export function gradePrice(
  input: EconomicsInput,
  targetMargin: number,
  config: PricingConfig = getPricingConfig(),
): PriceGrade {
  const economics = unitEconomics(input, config)
  const targetPrice = priceForMargin(targetMargin, input, config)
  const breakEvenPrice = priceForMargin(0, input, config)
  return {
    economics,
    targetPrice,
    breakEvenPrice,
    profitable: economics.contribution > 0,
    meetsTarget: economics.marginPct >= targetMargin,
    vsTarget: targetPrice != null ? round(economics.shelfPrice - targetPrice) : null,
  }
}
