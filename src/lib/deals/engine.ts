/**
 * Member deals: one per product they've bought, in their hub.
 *
 *   Opens    a week before the pack would run out, so the next one arrives in
 *            time: the pack's servings ÷ what they get through (the same sum
 *            the monthly plan sizes with). A pack that would outlast the hub
 *            opens 14 days before the hub ends, so every deal can be used.
 *   Price    the best deal that product can take at a profit (`quoteOffer`):
 *            delivery first, then the deepest whole percent that still keeps
 *            the floor (Founders Hub → Pricing → "Last-chance offer": keep at
 *            least £X and Y% of what we keep, after VAT, goods, both sides of
 *            delivery, card fees and returns). No profitable deal, no deal.
 *   Ends     with the hub: 90 days after their latest order. Any order adds
 *            90 days, and the product it bought gets a fresh deal.
 *
 * Bought at this price through the checkout's existing one-product path,
 * which works the same deal out again on the server and charges exactly it.
 *
 * Not for: the free gift (not bought), products on their monthly plan (the
 * plan ships them), subscription-only refills and accessories (not sold
 * alone). Pure.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { QuizAnswers, TrainingFrequency } from '@/lib/types'
import { isAccessory } from '@/lib/catalogue/accessory'
import { shortNameOf } from '@/lib/catalogue/short-name'
import { offerProductFor, publicQuote, quoteOffer, type PublicOfferQuote } from '@/lib/last-chance/economics'
import { packMonthsFor } from '@/lib/last-chance/pick'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'

export const HUB_DAYS = 90
/** Opens this long before the pack runs out, so the next one arrives in time. */
export const LEAD_DAYS = 7
/** A deal is always open at least this long before the hub ends. */
export const LAST_CHANCE_WINDOW_DAYS = 14
/** When a pack's servings aren't recorded: about a month. */
export const FALLBACK_RUN_OUT_DAYS = 30
const DAY = 86_400_000

export type DealState = 'upcoming' | 'open'

export interface MemberDeal {
  productId: string
  variantId: string
  title: string
  short: string
  imageUrl: string | null
  /** When they bought the pack this deal follows (YYYY-MM-DD). */
  boughtOn: string
  /** When it would run out, by our sum (YYYY-MM-DD). */
  runsOutOn: string
  /** The servings weren't on record, so the run-out is about a month. */
  estimated: boolean
  opensOn: string
  endsOn: string
  state: DealState
  /** Whole days until it opens (0 when open). */
  opensInDays: number
  quote: PublicOfferQuote
}

export interface Purchase {
  productId: string
  /** The variant's title as the order recorded it, to find the same size again. */
  variantTitle?: string | null
  quantity: number
  /** ISO. */
  at: string
  bonus?: boolean
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The training frequency the quiz would have recorded, from sessions a week. */
export function frequencyFor(trainDays: number | null | undefined): TrainingFrequency | null {
  if (!trainDays || trainDays <= 0) return null
  return trainDays <= 2 ? '1-2x' : trainDays <= 4 ? '3-4x' : trainDays <= 6 ? '5-6x' : 'daily'
}

/** The variant they bought, or the first one on sale. */
export function variantFor(product: CatalogueProduct, title?: string | null): CatalogueVariant | null {
  const same = title ? product.variants.find((v) => v.title === title && v.available) : undefined
  return same ?? product.variants.find((v) => v.available) ?? null
}

/** Days one purchase lasts at their usage, and whether that's an estimate. */
export function runOutDays(
  product: CatalogueProduct,
  variant: CatalogueVariant,
  quantity: number,
  answers: Partial<QuizAnswers> | null,
): { days: number; estimated: boolean } {
  const months = packMonthsFor(product, variant, (answers ?? null) as QuizAnswers | null)
  if (!months) return { days: FALLBACK_RUN_OUT_DAYS * Math.max(1, quantity), estimated: true }
  return { days: Math.max(7, Math.round(months * 30.4 * Math.max(1, quantity))), estimated: false }
}

/** When a deal opens and ends, from when it was bought, how long it lasts and when the hub ends. */
export function dealWindow(boughtAtMs: number, lastsDays: number, hubEndMs: number): { opensMs: number; endsMs: number } {
  const runOut = boughtAtMs + lastsDays * DAY
  let opens = runOut - LEAD_DAYS * DAY
  opens = Math.min(opens, hubEndMs - LAST_CHANCE_WINDOW_DAYS * DAY)
  opens = Math.max(opens, boughtAtMs + LEAD_DAYS * DAY)
  return { opensMs: opens, endsMs: hubEndMs }
}

/**
 * Their deals: one per product, from its latest purchase in the hub's window,
 * open ones first, then by when they open. `planProductIds` are left out.
 */
export function memberDeals(input: {
  purchases: readonly Purchase[]
  products: readonly CatalogueProduct[]
  answers: Partial<QuizAnswers> | null
  planProductIds?: readonly string[]
  now: Date
  config?: PricingConfig
}): { deals: MemberDeal[]; hubEndsOn: string | null } {
  const config = input.config ?? getPricingConfig()
  const now = input.now.getTime()
  const bought = input.purchases.filter((p) => !p.bonus && Number.isFinite(Date.parse(p.at)))
  if (!bought.length) return { deals: [], hubEndsOn: null }
  const latestOrder = Math.max(...bought.map((p) => Date.parse(p.at)))
  const hubEnd = latestOrder + HUB_DAYS * DAY
  if (hubEnd <= now) return { deals: [], hubEndsOn: ymd(hubEnd) }

  // The latest purchase of each product.
  const latest = new Map<string, Purchase>()
  for (const p of bought) {
    const had = latest.get(p.productId)
    if (!had || Date.parse(p.at) > Date.parse(had.at)) latest.set(p.productId, p)
  }

  const byId = new Map(input.products.map((p) => [p.id, p]))
  const plan = new Set(input.planProductIds ?? [])
  const deals: MemberDeal[] = []
  for (const p of latest.values()) {
    const product = byId.get(p.productId)
    if (!product || plan.has(product.id) || product.isSubscriptionOnly || isAccessory(product)) continue
    const variant = variantFor(product, p.variantTitle)
    if (!variant) continue
    const quote = quoteOffer(offerProductFor(product, variant), config)
    if (!quote.viable) continue
    const boughtAt = Date.parse(p.at)
    const lasts = runOutDays(product, variant, p.quantity, input.answers)
    const { opensMs, endsMs } = dealWindow(boughtAt, lasts.days, hubEnd)
    if (endsMs <= now) continue
    const open = now >= opensMs
    deals.push({
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      short: shortNameOf(product),
      imageUrl: product.imageUrl ?? null,
      boughtOn: ymd(boughtAt),
      runsOutOn: ymd(boughtAt + lasts.days * DAY),
      estimated: lasts.estimated,
      opensOn: ymd(opensMs),
      endsOn: ymd(endsMs),
      state: open ? 'open' : 'upcoming',
      opensInDays: open ? 0 : Math.ceil((opensMs - now) / DAY),
      quote: publicQuote(quote),
    })
  }
  deals.sort((a, b) => (a.state === b.state ? a.opensOn.localeCompare(b.opensOn) : a.state === 'open' ? -1 : 1))
  return { deals, hubEndsOn: ymd(hubEnd) }
}

/**
 * The deal a product in their box would get, for the reveal: the price it
 * would carry and about how many weeks until it opens. Null when there is
 * none to make at a profit.
 */
export function dealPreview(
  product: CatalogueProduct,
  answers: Partial<QuizAnswers> | null,
  config: PricingConfig = getPricingConfig(),
): { productId: string; short: string; weeks: number; estimated: boolean; quote: PublicOfferQuote } | null {
  if (product.isSubscriptionOnly || isAccessory(product)) return null
  const variant = variantFor(product, null)
  if (!variant) return null
  const quote = quoteOffer(offerProductFor(product, variant), config)
  if (!quote.viable) return null
  const lasts = runOutDays(product, variant, 1, answers)
  const { opensMs } = dealWindow(0, lasts.days, HUB_DAYS * DAY)
  return { productId: product.id, short: shortNameOf(product), weeks: Math.max(1, Math.round(opensMs / DAY / 7)), estimated: lasts.estimated, quote: publicQuote(quote) }
}
