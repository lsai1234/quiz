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
import { blendedCustomerCharge, blendedDeliveryCost, customerDeliveryCharge, entryDeliveryCharge, shipmentWeight, toFreeShipping } from './delivery'
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
  /**
   * The basket SUBTOTAL that free delivery qualifies on, before any bundle
   * discount (£ inc VAT). Defaults to `shelfPrice`.
   *
   * They differ whenever a discount applies, and the difference matters: a £62
   * basket earning 8% off pays £57, and qualifying on that would charge it
   * postage it would have avoided by being cheaper. Both perks qualify on what
   * the basket is worth — see `qualifiesForFreeDelivery`.
   */
  freeDeliveryBasis?: number
  /**
   * How many products share the parcel this line ships in.
   *
   * PowerBody charge per parcel on its total wholesale value, so a product in a
   * three-item stack carries a third of one delivery — and a bigger parcel may
   * clear their free line and carry none. Default 1 (ships alone), which is the
   * worst case and not how the quiz actually sells.
   */
  sharedParcelItems?: number
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
    input.chargeDelivery === false
      ? 0
      : blendedCustomerCharge(input.freeDeliveryBasis ?? shelfPrice, config)
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

  // PowerBody band delivery on what WE pay them for the whole PARCEL, so a
  // product sharing a parcel carries only its share — and a big enough parcel
  // clears their free line and carries none.
  const shareOfParcel = Math.max(1, input.sharedParcelItems ?? 1)
  const deliveryCost = round(blendedDeliveryCost(supplierExVat * shareOfParcel, config) / shareOfParcel)
  const paymentFee = round(grossRevenue * config.paymentFees.percent + config.paymentFees.fixed)

  // A return refunds the goods but never the shipping, so what a return costs
  // is the delivery — out, and back again. Spread across every order at the
  // return rate, because that is how a provision works.
  const returnsProvision = round(
    config.returns.ratePct * deliveryCost * config.returns.costMultipleOfDelivery,
  )

  const contribution = round(netRevenue - productCost - deliveryCost - paymentFee - returnsProvision)

  // Read the bands off the whole PARCEL — the shortfall a founder can act on is
  // "how much more stock goes in the box", not "how much more of this one line".
  const parcelValue = round(supplierExVat * shareOfParcel)
  const free = toFreeShipping(parcelValue, config.delivery.defaultZone, config)

  /**
   * The delivery line, said in terms of the box rather than the line.
   *
   * The free line gets a mention but not the emphasis: £99 of wholesale is a
   * ~£190 basket and almost nothing reaches it, so leading with it is a
   * counsel of perfection. The next band down usually is reachable, and that is
   * what belongs in front of someone building a bundle.
   */
  function deliveryNote(): string {
    const box =
      shareOfParcel > 1
        ? `£${parcelValue.toFixed(2)} of wholesale in a ${shareOfParcel}-item parcel, split ${shareOfParcel} ways`
        : `£${parcelValue.toFixed(2)} of wholesale in this order`
    if (deliveryCost === 0) return `Free — the ${box} clears PowerBody's £${free.threshold} line.`
    const step = free.next
      ? ` £${free.next.shortfall.toFixed(2)} more of stock drops it to £${free.next.price.toFixed(2)}` +
        (free.next.price === 0 ? '.' : `, and £${(free.shortfall ?? 0).toFixed(2)} more ships it free.`)
      : ''
    return `Banded on the ${box}.${step}`
  }

  // ── The waterfall ──
  const steps: EconomicsStep[] = []
  let running = 0
  const push = (id: string, label: string, amount: number, note: string, estimated?: boolean) => {
    running = round(running + amount)
    steps.push({ id, label, amount: round(amount), runningTotal: running, note, ...(estimated ? { estimated } : {}) })
  }

  push('shelf', 'Customer pays', shelfPrice, quantity > 1 ? `${quantity} × the shelf price, VAT included.` : 'The shelf price, VAT included.')
  if (deliveryCharged > 0) {
    // Blended across zones, like the delivery COST below it — so an order over
    // the free line still shows a few pence: the Highlands surcharge, averaged
    // over the share of orders that pay one. Saying "they pay postage" on a
    // free-delivery order would be the wrong explanation for a real number.
    const basis = input.freeDeliveryBasis ?? shelfPrice
    const freeOnMainland = customerDeliveryCharge(basis, 'uk-1', config) === 0
    push(
      'delivery-charged',
      'Delivery charged',
      deliveryCharged,
      freeOnMainland
        ? `Free over £${config.freeDeliveryThreshold}, so this is the Highlands surcharge averaged over the ${Math.round(config.delivery.zone2SharePct * 100)}% of orders that pay it.`
        : `Under the £${config.freeDeliveryThreshold} free-delivery threshold, so they pay postage — blended across zones.`,
    )
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
  push('delivery-cost', 'Less what PowerBody charge to ship it', -deliveryCost, deliveryNote(), !weightKnown)
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

  // Delivery bands on OUR wholesale cost, so when that cost is itself a share of
  // the price we are solving for, delivery depends on the answer. Rather than
  // inverting a step function, start from a guess and iterate: solve, re-read
  // which band the resulting cost lands in, solve again. It settles in two or
  // three passes because the bands are coarse and the cost moves smoothly.
  //
  // Seeded from the DEAREST band rather than from zero when the cost is unknown.
  // A zero seed makes the first pass believe delivery is free, which produced a
  // nonsense first price — and on the postage-charged branch a negative one,
  // because the postage we collect outweighed a cost base of almost nothing.
  const dearestBand = Math.max(
    0,
    ...config.delivery.services.filter((sv) => sv.zone === config.delivery.defaultZone).map((sv) => sv.price),
  )
  // A line sharing a parcel carries only its share of one delivery — and the
  // band is read from the WHOLE parcel's wholesale value, not this line's.
  const parcelItems = Math.max(1, input.sharedParcelItems ?? 1)
  let deliveryCost = costKnown
    ? round(blendedDeliveryCost(input.supplierCost! * quantity * parcelItems, config) / parcelItems)
    : round(costFromSupplierPrice(dearestBand, config) / parcelItems)

  const solve = (deliveryCharged: number): number => {
    const returnsProvision = round(config.returns.ratePct * deliveryCost * config.returns.costMultipleOfDelivery)
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

  /** Re-read the delivery band from the price a solve produced. */
  const settleDelivery = (price: number): boolean => {
    if (costKnown || price <= 0) return true
    const estimatedCost = (price / netDivisor) * config.defaultCostRatio
    const next = round(blendedDeliveryCost(estimatedCost * parcelItems, config) / parcelItems)
    if (next === deliveryCost) return true
    deliveryCost = next
    return false
  }

  const freeAbove = config.freeDeliveryThreshold
  /**
   * What the member pays for delivery — which now depends on the answer, the
   * same way the supplier's band does.
   *
   * It used to be one number, so the solver could take it as a constant. On a
   * ladder it is a step function of the very price being solved for: seed from
   * the dearest rung, solve, re-read which rung the answer lands on, solve
   * again. `settleCharge` below closes that loop alongside `settleDelivery`.
   * Without it a price solved at the £4.95 rung but landing in the £2.95 band
   * would be under-priced by the difference — silently, and only on the baskets
   * near a rung boundary.
   */
  let charge = entryDeliveryCharge(config)

  /** Re-read the customer's delivery rung from the price a solve produced. */
  const settleCharge = (price: number): boolean => {
    if (input.chargeDelivery === false || price <= 0) return true
    const next = blendedCustomerCharge(price, config)
    if (next === charge) return true
    charge = next
    return false
  }

  const chooseBranch = (): number => {
    // The caller can pin the branch — the good-price model does, because its
    // worst case is that we absorb the postage.
    if (input.chargeDelivery === false) return solve(0)
    if (input.chargeDelivery === true) return solve(charge)
    if (freeAbove <= 0) return solve(charge) // no free-delivery offer: always charged

    const withoutPostage = solve(0)
    if (withoutPostage >= freeAbove) return withoutPostage

    // A branch that solves to a non-positive price has not found an answer, it
    // has found an arithmetic artefact — the postage collected outweighing the
    // costs. Fall back rather than returning a negative price that would then
    // sail through the convergence check.
    const withPostage = solve(charge)
    if (withPostage <= 0) return withoutPostage
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
  // Settle the delivery band first — a price solved against the wrong band is
  // out by pounds, and the penny-nudge below only fixes rounding.
  for (let pass = 0; pass < 6; pass++) {
    // Both bands have to settle: the supplier's (on our wholesale cost) and the
    // member's (on the shelf price). Each re-solve can move the other, so they
    // are settled together rather than one after the next.
    const settled = settleDelivery(price)
    const charged = settleCharge(price)
    if (settled && charged) break
    price = chooseBranch()
  }

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
