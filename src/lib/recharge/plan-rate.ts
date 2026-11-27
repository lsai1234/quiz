/**
 * The plan saving: one rule for every plan, wherever it was set up.
 *
 * Subscribe and save is 13%, 15% or 20%, by the size of the plan: the quiz's
 * own three depths (`levelSubscriptionDiscount`) and the monthly bands they're
 * built to (`tierBands`, a plan from about £35 a month is a 15% plan, from about
 * £55 a 20% one). The quiz sells a depth at its rate; a shop basket bought every
 * month gets the rate of the band its size falls in; and after that, any plan's
 * saving moves when a change takes it into another band, up or down. Nothing
 * else moves it: changing a product's rhythm inside the same band leaves the
 * saving the member has, including a quiz depth's rate on a stack that came in
 * under its band.
 *
 * Which band a plan is in is read from what it's worth at shop prices (each
 * product's price times how many come, over how often they come), at the band's
 * own rate: a plan is a 20% plan when its monthly at 20% off reaches where the
 * 20% band starts. One number, rising with the plan, so adding to a plan can
 * only ever keep or raise its band.
 *
 * Every price still goes through the margin floor (`discountWithFloor`), and a
 * price a member is being held at (a supplier rise the founders absorbed,
 * `changes/apply`) is kept in proportion when the saving moves, never reset to
 * today's shop price. Pure: the hub's previews and the server's save
 * (`reprice`) run the same function, so the figure on the review screen is the
 * figure saved.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { StackLevel } from '@/lib/types'
import { discountWithFloor, getPricingConfig, unitCostOf, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { MemberSubscription, MemberSubscriptionLine } from './types'
import { intervalOf } from './clock'

const round = (n: number) => Math.round(n * 100) / 100

export interface PlanBand {
  level: StackLevel
  /** The saving, 0–1. */
  rate: number
  /** The monthly (after the saving) this band starts at (£). */
  from: number
}

/** The three bands, deepest first. */
export function planBands(config: PricingConfig = getPricingConfig()): PlanBand[] {
  const levels: StackLevel[] = ['complete', 'performance', 'essentials']
  return levels.map((level) => ({
    level,
    rate: config.levelSubscriptionDiscount[level] ?? config.subscriptionDiscount,
    from: level === 'essentials' ? 0 : config.tierBands[level]?.min ?? 0,
  }))
}

type PricedLine = Pick<MemberSubscriptionLine, 'productId' | 'quantity' | 'deliveryIntervalMonths' | 'pricePerDelivery'> &
  Partial<Pick<MemberSubscriptionLine, 'variantId' | 'sku'>>

/** The variant a line is for: by id, then SKU, then the first one on sale. */
export function variantOfLine(line: Partial<Pick<MemberSubscriptionLine, 'variantId' | 'sku'>>, product: CatalogueProduct): CatalogueVariant | undefined {
  return (
    (line.variantId ? product.variants.find((v) => v.id === line.variantId) : undefined) ??
    (line.sku ? product.variants.find((v) => v.sku === line.sku) : undefined) ??
    product.variants.find((v) => v.available) ??
    product.variants[0]
  )
}

/**
 * What a plan is worth a month at shop prices. A product no longer in the
 * catalogue counts at its own price before the saving it has.
 */
export function listMonthlyOf(lines: readonly PricedLine[], catalogue: readonly CatalogueProduct[], storedRate: number): number {
  let total = 0
  for (const line of lines) {
    const product = catalogue.find((p) => p.id === line.productId)
    const variant = product ? variantOfLine(line, product) : undefined
    const unit = variant?.price ?? product?.basePrice ?? line.pricePerDelivery / Math.max(1, line.quantity) / Math.max(0.01, 1 - storedRate)
    total += (unit * Math.max(1, line.quantity)) / intervalOf(line)
  }
  return round(total)
}

/** The band a plan worth `listMonthly` a month at shop prices is in. */
export function bandFor(listMonthly: number, config: PricingConfig = getPricingConfig()): PlanBand {
  const bands = planBands(config)
  for (const band of bands) {
    if (listMonthly * (1 - band.rate) >= band.from - 0.005) return band
  }
  return bands[bands.length - 1]
}

/** The band above this one, and how much more a month (at shop prices) reaches it. Null at the top. */
export function nextBand(listMonthly: number, config: PricingConfig = getPricingConfig()): { band: PlanBand; moreAtShopPrices: number } | null {
  const current = bandFor(listMonthly, config)
  const bands = planBands(config)
  const above = bands[bands.findIndex((b) => b.level === current.level) - 1]
  if (!above) return null
  const reachesAt = above.from / (1 - above.rate)
  return { band: above, moreAtShopPrices: round(Math.max(0, reachesAt - listMonthly)) }
}

/**
 * Lines re-priced from one saving to another. A line's price scales with the
 * saving (a held price stays held, in proportion), never above the fresh price
 * at the new saving and never below the margin floor.
 */
export function rerateLines<L extends PricedLine>(
  lines: readonly L[],
  from: number,
  to: number,
  catalogue: readonly CatalogueProduct[],
  config: PricingConfig = getPricingConfig(),
): L[] {
  if (Math.abs(from - to) < 1e-9) return [...lines]
  return lines.map((line) => {
    const units = Math.max(1, line.quantity)
    const stored = line.pricePerDelivery / units
    const scaled = (stored * (1 - to)) / Math.max(0.01, 1 - from)
    const product = catalogue.find((p) => p.id === line.productId)
    const variant = product ? variantOfLine(line, product) : undefined
    let unit = scaled
    if (product && variant) {
      const cost = variant.cost ?? unitCostOf(product, variant.price, config)
      const fresh = discountWithFloor(variant.price, to, cost, config, product.vatRate)
      const floor = discountWithFloor(variant.price, 1, cost, config, product.vatRate)
      unit = Math.max(floor, Math.min(scaled, fresh))
    }
    return { ...line, pricePerDelivery: round(unit * units) }
  })
}

const flatMonthlyOf = (lines: readonly PricedLine[]) => round(lines.reduce((s, l) => s + l.pricePerDelivery / intervalOf(l), 0))

/** The saving a plan has now. */
export function storedRateOf(sub: Pick<MemberSubscription, 'subscriptionDiscountRate'>, config: PricingConfig = getPricingConfig()): number {
  return sub.subscriptionDiscountRate ?? config.subscriptionDiscount
}

/**
 * The plan after a change, with its saving following its size: when the change
 * takes it into another band, every line is re-priced at that band's saving.
 */
export function withPlanRate(
  previous: MemberSubscription,
  next: MemberSubscription,
  catalogue: readonly CatalogueProduct[],
  config: PricingConfig = getPricingConfig(),
): MemberSubscription {
  const stored = storedRateOf(previous, config)
  const before = bandFor(listMonthlyOf(previous.lines, catalogue, stored), config)
  const after = bandFor(listMonthlyOf(next.lines, catalogue, stored), config)
  if (before.level === after.level) return { ...next, subscriptionDiscountRate: previous.subscriptionDiscountRate }
  const lines = rerateLines(next.lines, stored, after.rate, catalogue, config)
  return { ...next, lines, subscriptionDiscountRate: after.rate, flatMonthly: flatMonthlyOf(lines) }
}

/** What a change does to the saving, for the review screen: null when it doesn't move. */
export function planRateChange(
  previous: MemberSubscription,
  next: MemberSubscription,
  catalogue: readonly CatalogueProduct[],
  config: PricingConfig = getPricingConfig(),
): { from: number; to: number } | null {
  const after = withPlanRate(previous, next, catalogue, config)
  const from = storedRateOf(previous, config)
  const to = storedRateOf(after, config)
  return Math.abs(from - to) < 1e-9 ? null : { from, to }
}

/** "15%": a saving as people read it. */
export function ratePct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

/** What a move in the plan saving means, in a sentence for the review screen. */
export function rateNote(rate: { from: number; to: number } | null | undefined): string {
  if (!rate) return ''
  return rate.to > rate.from
    ? `Your plan is now big enough to save ${ratePct(rate.to)} on everything on it (it was ${ratePct(rate.from)}).`
    : `Your plan saving goes from ${ratePct(rate.from)} to ${ratePct(rate.to)}, as your plan is smaller.`
}
