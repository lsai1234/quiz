/**
 * Where we stand on VAT — and what registering would actually cost.
 *
 * THE INTUITION THIS EXISTS TO CORRECT
 * ────────────────────────────────────
 * PowerBody are VAT-registered (VAT Reg 940 5412 46), so they charge us VAT on
 * both goods and delivery. While we are NOT registered we cannot reclaim a penny
 * of it, and that shows up as a big, visible, annoying number. The natural
 * reaction is "we should register so we can claim that back".
 *
 * That reaction is usually wrong, and the arithmetic says so cleanly. Holding
 * shelf prices constant:
 *
 *     unregistered:  contribution = P − C(1+v)
 *     registered:    contribution = P/(1+v) − C
 *     difference   = v × [ P/(1+v) − C ]  =  v × (your net gross margin)
 *
 * So registering costs you the VAT rate times your margin — for any business
 * that HAS a margin, it is a straight loss. Reclaiming input VAT only wins when
 * your costs exceed your net revenue, i.e. when you are already losing money.
 *
 * Which is why this module reports BOTH sides and the net: the input VAT we're
 * currently eating (the number that tempts you) next to the output VAT we'd owe
 * (the number that settles it). One without the other misleads.
 *
 * WHAT THIS IS NOT
 * ────────────────
 * Not tax advice. The thresholds are public HMRC figures and the arithmetic is
 * just arithmetic, but registration has consequences this doesn't model (Making
 * Tax Digital, the Flat Rate Scheme, zero-rated foods, what your accountant
 * knows about your circumstances). It answers "what does this do to my margin
 * and when am I forced to act", which is the part the hub can actually see.
 *
 * Pure — the caller reads the orders and hands them in.
 */
import type { Order } from '@/lib/orders/types'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { unitEconomics } from './unit-economics'

const round = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

/** Statuses that count as taxable turnover — money taken and kept. */
const EARNED = new Set(['paid', 'submitted_to_supplier', 'supplier_confirmed', 'shipped', 'delivered'])

export interface VatPosition {
  registered: boolean
  rate: number

  // ── Where we are against the threshold ──
  /** Taxable turnover over the rolling 12 months (£). */
  rollingTurnover: number
  /** HMRC's compulsory registration threshold (£). */
  threshold: number
  /** Turnover still available before registration is compulsory (£). */
  headroom: number
  /** rollingTurnover ÷ threshold (0–1+). */
  pctOfThreshold: number
  /** Average monthly turnover over the months we have data for (£). */
  monthlyRunRate: number
  /** Months until the threshold is crossed at the current run rate. */
  monthsToThreshold: number | null
  /** When we'd cross it, ISO date. Null when the run rate never gets there. */
  projectedCrossing: string | null
  /** True once registration is compulsory rather than optional. */
  mustRegister: boolean

  // ── What the decision is worth ──
  /** VAT PowerBody charge us that we currently cannot reclaim (£, annualised). */
  inputVatLost: number
  /** VAT we would have to hand over on sales (£, annualised). */
  outputVatOwed: number
  /**
   * What registering costs per year, holding prices constant (£).
   * Positive = registering makes us worse off. Negative = better off.
   */
  netCostOfRegistering: number
  /** The same, per order (£). */
  costPerOrder: number
  /** Multiply shelf prices by this to hold the same profit after registering. */
  repriceFactor: number
  /** Orders the figures are based on. */
  orderCount: number

  /** A plain-English read on what to do, and why. */
  verdict: {
    headline: string
    detail: string
    tone: 'ok' | 'watch' | 'act'
  }
}

/** Orders that count towards taxable turnover in the window. */
function taxableOrders(orders: Order[], sinceIso: string): Order[] {
  return orders.filter((o) => EARNED.has(o.status) && o.createdAt >= sinceIso)
}

/**
 * Find the shelf price that yields `targetContribution` under a given config.
 *
 * Bisection on the real waterfall rather than algebra: the stack has a
 * percentage fee, a fixed fee and a piecewise delivery charge in it, and
 * re-deriving all that here would be a second implementation to keep in step
 * with the first. Thirty halvings gets to well under a penny.
 */
function priceForContribution(
  targetContribution: number,
  input: { supplierCost: number; grams: number; chargeDelivery: boolean },
  config: PricingConfig,
): number {
  let low = 0
  let high = Math.max(50, targetContribution * 10 + input.supplierCost * 5 + 100)
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2
    const c = unitEconomics({ ...input, shelfPrice: mid }, config).contribution
    if (c < targetContribution) low = mid
    else high = mid
  }
  return round(high)
}

export interface VatPositionInput {
  orders: Order[]
  config: PricingConfig
  /** Average supplier cost as a share of the shelf price, for the reprice model. */
  averageCostRatio: number
  /** Typical shipped weight, for the reprice model (g). */
  averageGrams?: number
  now?: Date
}

export function buildVatPosition(input: VatPositionInput): VatPosition {
  const config = input.config ?? getPricingConfig()
  const now = input.now ?? new Date()
  const rate = config.vat.standardRate
  const threshold = config.vat.registrationThreshold

  const yearAgo = new Date(now.getTime() - 365 * 86_400_000).toISOString()
  const window = taxableOrders(input.orders, yearAgo)
  const rollingTurnover = round(window.reduce((s, o) => s + o.total, 0))

  // Run rate over the months we actually have, not over a full year we don't —
  // a business three months old would otherwise look a quarter as busy as it is.
  const earliest = window.reduce<string | null>((min, o) => (!min || o.createdAt < min ? o.createdAt : min), null)
  const monthsOfData = earliest
    ? Math.max(1, (now.getTime() - new Date(earliest).getTime()) / (30 * 86_400_000))
    : 1
  const monthlyRunRate = round(rollingTurnover / monthsOfData)

  const headroom = round(Math.max(0, threshold - rollingTurnover))
  const monthsToThreshold = monthlyRunRate > 0 ? Math.ceil(headroom / monthlyRunRate) : null
  const projectedCrossing =
    monthsToThreshold != null && monthsToThreshold < 600
      ? new Date(now.getTime() + monthsToThreshold * 30 * 86_400_000).toISOString().slice(0, 10)
      : null

  // ── What registering would do, run through the real waterfall both ways ──
  const registeredCfg: PricingConfig = { ...config, vat: { ...config.vat, registered: true } }
  const unregisteredCfg: PricingConfig = { ...config, vat: { ...config.vat, registered: false } }
  const grams = input.averageGrams ?? config.delivery.defaultProductGrams

  let inputVatLost = 0
  let outputVatOwed = 0
  let contributionRegistered = 0
  let contributionUnregistered = 0

  for (const order of window) {
    const supplierCost = order.lines.reduce((s, l) => s + (l.supplierCost ?? 0) * l.quantity, 0)
    const shape = { shelfPrice: order.total, supplierCost, grams, chargeDelivery: false as const }
    const reg = unitEconomics(shape, registeredCfg)
    const unreg = unitEconomics(shape, unregisteredCfg)

    contributionRegistered += reg.contribution
    contributionUnregistered += unreg.contribution
    outputVatOwed += reg.vat
    // The VAT premium we pay PowerBody and cannot claim back.
    inputVatLost += unreg.productCost - reg.productCost + (unreg.deliveryCost - reg.deliveryCost)
  }

  // Annualise from the window we actually measured.
  const annualise = (n: number) => round((n / monthsOfData) * 12)
  const netCostOfRegistering = round(annualise(contributionUnregistered - contributionRegistered))

  // What we'd have to charge to be no worse off. Modelled on the average order
  // so it reads as a percentage a founder can apply across a price list.
  const avgOrder = window.length > 0 ? rollingTurnover / window.length : 0
  const avgCost = avgOrder * input.averageCostRatio
  let repriceFactor = 1
  if (avgOrder > 0) {
    // Both sides must make the SAME delivery assumption. Measuring today's
    // contribution with postage absorbed and then solving tomorrow's with it
    // collected quietly hands the registered case free revenue, and the answer
    // comes out as a price CUT — which is how this was wrong the first time.
    const shape = { supplierCost: avgCost, grams, chargeDelivery: false }
    const currentContribution = unitEconomics({ ...shape, shelfPrice: avgOrder }, config).contribution
    const needed = priceForContribution(currentContribution, shape, registeredCfg)
    repriceFactor = round4(needed / avgOrder)
  }

  const mustRegister = rollingTurnover >= threshold

  return {
    registered: config.vat.registered,
    rate,
    rollingTurnover,
    threshold,
    headroom,
    pctOfThreshold: round4(threshold > 0 ? rollingTurnover / threshold : 0),
    monthlyRunRate,
    monthsToThreshold,
    projectedCrossing,
    mustRegister,
    inputVatLost: annualise(inputVatLost),
    outputVatOwed: annualise(outputVatOwed),
    netCostOfRegistering,
    costPerOrder: window.length > 0 ? round((contributionUnregistered - contributionRegistered) / window.length) : 0,
    repriceFactor,
    orderCount: window.length,
    verdict: verdictFor({
      registered: config.vat.registered,
      mustRegister,
      pctOfThreshold: threshold > 0 ? rollingTurnover / threshold : 0,
      monthsToThreshold,
      netCostOfRegistering,
      repriceFactor,
      rate,
    }),
  }
}

function verdictFor(p: {
  registered: boolean
  mustRegister: boolean
  pctOfThreshold: number
  monthsToThreshold: number | null
  netCostOfRegistering: number
  repriceFactor: number
  rate: number
}): VatPosition['verdict'] {
  const risePct = Math.round((p.repriceFactor - 1) * 1000) / 10

  if (p.registered) {
    return {
      tone: 'ok',
      headline: 'Registered — VAT is handled',
      detail:
        'Shelf prices include VAT and we hand it over; the VAT PowerBody charge us is reclaimed, so their prices cost us the ex-VAT figure. Every margin in the hub already accounts for this.',
    }
  }

  if (p.mustRegister) {
    return {
      tone: 'act',
      headline: 'Over the threshold — registration is compulsory',
      detail: `Rolling 12-month turnover has passed the threshold, so registering is no longer a choice. HMRC expect it within 30 days of the end of the month you crossed in. Holding prices, that costs about £${Math.abs(p.netCostOfRegistering).toFixed(0)} a year; raising prices by ${risePct}% would hold the margin. Switch the toggle in the rules once you're registered so the whole hub reprices.`,
    }
  }

  if (p.pctOfThreshold >= 0.8 || (p.monthsToThreshold != null && p.monthsToThreshold <= 3)) {
    return {
      tone: 'watch',
      headline: 'Approaching the threshold',
      detail: `Close enough to plan for. When it lands, the choice is absorb roughly £${Math.abs(p.netCostOfRegistering).toFixed(0)} a year or raise prices by about ${risePct}%. Deciding now beats deciding in the 30 days HMRC give you.`,
    }
  }

  return {
    tone: 'ok',
    headline: 'Not registered, and not required to be',
    detail: `Staying unregistered is worth about £${Math.abs(p.netCostOfRegistering).toFixed(0)} a year at this run rate. The VAT PowerBody charge us can't be reclaimed — but registering to claim it back would mean handing over more on sales than we'd get back on costs, so it would cost us, not save us.`,
  }
}
