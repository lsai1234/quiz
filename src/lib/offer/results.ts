/**
 * The offer as the results page lays it out (plan Phase 4), for both quizzes:
 *
 *   Start here        The core offer. The approved hero ("Not the obvious
 *                     pick"), or with the hero switch off (or no hero that
 *                     fits) today's top pick ("Your top pick"). Priced and
 *                     drawn exactly as the single-product offer at the foot of
 *                     the page was (`quoteOffer`, `LastChanceView`; the settings
 *                     are now called "Hero offer"): only ever on a real deal,
 *                     once per browser.
 *   Or the full stack The hero first in every depth, and per depth the free
 *                     bonus or why there isn't one ("Free … on stacks from £…").
 *
 * The bonus is never priced in. Stack price, stack saving and delivery are the
 * same with it as without it (CAP Code 3.23–3.25): it is a £0.00 line, nothing
 * more. Pure and client-safe.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { shortNameOf } from '@/lib/catalogue/short-name'
import { offerProductFor, quoteOffer, type OfferQuote } from '@/lib/last-chance/economics'
import { knownServings, packMonthsFor, pickHeroOffer } from '@/lib/last-chance/pick'
import { customerDeliveryCharge } from '@/lib/pricing/delivery'
import { getPricingConfig, type PricingConfig, type UsageLevel } from '@/lib/stack-blueprint/pricing'
import type { TierPlan } from '@/lib/stack-blueprint/tier-plan'
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import type { Goal, QuizAnswers, StackLevel } from '@/lib/types'
import { OFFER_COPY } from './copy'
import { chooseBonus, costedItemsFor, type BonusChoice, type BonusOutcome, type HeroChoice, type HeroReason, type OfferInputs, type PersonFit } from './select'
import type { BonusSettings } from './settings'

const round = (n: number) => Math.round(n * 100) / 100

export interface CoreOffer {
  kind: 'hero' | 'top-pick'
  /** "Not the obvious pick" or "Your top pick". */
  label: string
  product: CatalogueProduct
  variant: CatalogueVariant
  /** Why it is theirs, or null: the label stands alone. */
  reason: string | null
  /** The register claim it carries, verbatim, or null. */
  claim: { id: string; wording: string } | null
  servings: number | null
  packMonths: number | null
  /** The deal, exactly as the old foot-of-page offer priced it (`quoteOffer`). Always viable. */
  quote: OfferQuote
}

function variantFor(product: CatalogueProduct, slots: readonly StackSlotEntry[]): CatalogueVariant | null {
  const chosen = slots.find((s) => s.selectedProductId === product.id)?.selectedVariantId
  return (
    product.variants.find((v) => v.id === chosen && v.available) ??
    product.variants.find((v) => v.id === product.defaultVariantId && v.available) ??
    product.variants.find((v) => v.available) ??
    null
  )
}

/**
 * The hero's deal, or null when it has none: the same test the old
 * foot-of-page offer applied (`quoteOffer` viable), so a hero is only put
 * forward on a real deal at a profit. The page excludes heroes without one
 * before choosing (`dealPerson`).
 */
export function heroDeal(product: CatalogueProduct, slots: readonly StackSlotEntry[] = [], config: PricingConfig = getPricingConfig()): OfferQuote | null {
  const variant = variantFor(product, slots)
  if (!variant) return null
  const quote = quoteOffer(offerProductFor(product, variant), config)
  return quote.viable ? quote : null
}

/**
 * Who may be the hero on the results page: the person's own exclusions, plus
 * "has a deal". A hero without one would be a full price dressed up as an
 * offer, which the core offer, like the offer it replaced, never makes.
 */
export function dealPerson(person: PersonFit, config: PricingConfig = getPricingConfig()): PersonFit {
  return {
    keepOut: (product) => person.keepOut(product) ?? (heroDeal(product, [], config) ? null : 'no deal on its own'),
    fit: person.fit,
  }
}

/**
 * The core offer, priced exactly as the single-product offer at the foot of
 * the page was (`quoteOffer`: delivery first, then the deepest whole percent
 * the margin floor allows). Null when this browser has already had the deal
 * (one per browser, as before), or when nothing in the stack has one.
 */
export function coreOffer(input: {
  hero: { choice: HeroChoice; reason: HeroReason } | null
  /** The stack on screen, hero first when there is one. */
  slots: readonly StackSlotEntry[]
  catalogue: readonly CatalogueProduct[]
  answers: QuizAnswers | null
  primaryGoal?: Goal | null
  usage?: Record<string, UsageLevel>
  /** This browser has already bought on the deal. */
  dealUsed?: boolean
  config?: PricingConfig
}): CoreOffer | null {
  if (input.dealUsed) return null
  const config = input.config ?? getPricingConfig()
  if (input.hero) {
    const { product } = input.hero.choice
    const variant = variantFor(product, input.slots)
    const quote = variant ? quoteOffer(offerProductFor(product, variant), config) : null
    if (variant && quote?.viable) {
      const claim = input.hero.reason.claim
      return {
        kind: 'hero',
        label: OFFER_COPY.heroLabel,
        product,
        variant,
        reason: input.hero.reason.line,
        claim: claim ? { id: claim.id, wording: claim.wording } : null,
        servings: knownServings(product, variant),
        packMonths: packMonthsFor(product, variant, input.answers, input.usage?.[product.id]),
        quote,
      }
    }
  }
  const pick = pickHeroOffer(input.slots, input.catalogue, { answers: input.answers, primaryGoal: input.primaryGoal, usage: input.usage }, config)
  if (!pick) return null
  return {
    kind: 'top-pick',
    label: OFFER_COPY.topPickLabel,
    product: pick.product,
    variant: pick.variant,
    reason: pick.goalLine,
    claim: pick.claim,
    servings: pick.servings,
    packMonths: pick.packMonths,
    quote: pick.quote,
  }
}

/* ── The bonus, per depth ───────────────────────────────────────────────── */

export function tierBonuses(
  inputs: OfferInputs,
  person: PersonFit | null,
  tiers: readonly TierPlan[],
): Partial<Record<StackLevel, BonusOutcome>> {
  const out: Partial<Record<StackLevel, BonusOutcome>> = {}
  for (const t of tiers) {
    out[t.level] = person
      ? chooseBonus(inputs, person, {
          level: t.level,
          items: costedItemsFor(t.slots.map((s) => ({ productId: s.selectedProductId, variantId: s.selectedVariantId })), inputs.catalogue),
        })
      : { choice: null, blocked: 'off' }
  }
  return out
}

/** The bonus's shop price: what "Worth £…" may say, since it is what the shop sells it for. */
export function bonusWorth(choice: BonusChoice): number {
  return choice.item.price
}

/**
 * What a depth's line under the depth picker says about the bonus: that it
 * comes with this one, or what would qualify, or nothing (switched off, or
 * nothing in the pool suits them, which is not something to advertise).
 */
export type BonusLine =
  | { kind: 'comes-with'; choice: BonusChoice }
  | { kind: 'from'; title: string; minimum: number }
  | null

export function bonusLineFor(level: StackLevel, bonuses: Partial<Record<StackLevel, BonusOutcome>>, settings: BonusSettings): BonusLine {
  const here = bonuses[level]
  if (here?.choice) return { kind: 'comes-with', choice: here.choice }
  if (here?.blocked !== 'minimum' && here?.blocked !== 'tier') return null
  // What would qualify: the gift another depth would come with.
  const elsewhere = Object.values(bonuses).find((b) => b?.choice)?.choice
  if (!elsewhere) return null
  return { kind: 'from', title: titleOf(elsewhere.product), minimum: settings.minSubtotal }
}

export function titleOf(product: Pick<CatalogueProduct, 'shortName' | 'title'>): string {
  return shortNameOf(product)
}

/**
 * A depth delivered (£): its one-off total and the delivery it would carry,
 * which the bonus never changes. What "£X more for the full stack" compares
 * with the core offer's delivered price.
 */
export function tierDelivered(tier: TierPlan, catalogue: readonly CatalogueProduct[], config: PricingConfig = getPricingConfig()): number {
  const items = costedItemsFor(tier.slots.map((s) => ({ productId: s.selectedProductId, variantId: s.selectedVariantId })), catalogue)
  const subtotal = round(items.reduce((sum, i) => sum + i.price, 0))
  return round(tier.oneOff + customerDeliveryCharge(subtotal, 'uk-1', config))
}

/* ── A code, or the bonus ───────────────────────────────────────────────── */

/**
 * Codes and the bonus don't combine. Under the plan's rule ("better-of") the
 * customer gets whichever is worth more on this order: the code when what it
 * takes off is more than the bonus's shop price, else the bonus. Under
 * "code-cancels-bonus" a code always wins.
 */
export function codeOrBonus(rule: BonusSettings['codes'], codeSaving: number, worth: number): 'code' | 'bonus' {
  if (rule === 'code-cancels-bonus') return 'code'
  return codeSaving > worth + 0.005 ? 'code' : 'bonus'
}
