/**
 * Which ONE product to put in front of somebody who scrolled past their whole
 * stack without buying it — and what we may honestly say about it.
 *
 * ── The ranking ─────────────────────────────────────────────────────────────
 * Fit is re-scored fresh with the engine's own `scoreProduct`, halved onto the
 * 0–100 scale `confidenceScore` uses. Not `confidenceScore` itself: a swap
 * leaves it describing the old product, and a booster the member added carries
 * `priority × 10`, which is not a fit at all. On top: the stack's anchors
 * (`required`), whether it serves the goal they said matters most, and whether
 * there is register wording to say what it does. `recommendationPriority` and
 * Top 25 are already inside `scoreProduct`, so they are not added twice.
 *
 * Nothing rewards "you'll feel it soon". That was the first draft, and it both
 * broke OC-C-003 (no timeframes for results next to a sale) and pushed the
 * pick towards exactly the kinds of product we can make no claim about.
 *
 * ── The filter, before any of that ──────────────────────────────────────────
 * Buyable on its own on a real deal at a profit: in stock, not an accessory,
 * not a subscription-only refill, not ruled out for this person by a hard
 * gate, and `quoteOffer` viable — which means something genuinely comes off
 * the delivered price. A product with no deal is never shown at full price
 * as an offer; if nothing in the stack has one, the section does not render.
 *
 * ── What the card may say (docs/ORDER_CONFIRMATION_SPEC.md §5) ──────────────
 * - Why you: only that it is one of the products picked for them. Tying it to
 *   a goal they gave us reads as a claim, so that waits for Phase 2. Never the
 *   engine's free-text `reason`, which no claim check has seen.
 * - What it does: one GB-register claim, verbatim (`consult/claims.ts`), or
 *   nothing. Pre-workouts, probiotics, greens, collagen and the rest
 *   deliberately carry none.
 * - Facts: servings, price per serving, how long a pack lasts at their usage.
 *
 * Pure and client-safe.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { Goal, QuizAnswers } from '@/lib/types'
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import { productClaim } from '@/lib/results/goal-claims'
import { explainProduct, type ProductExplanation } from '@/lib/results/explain'
import { getArchetype, scoreProduct, type SlotType } from '@/lib/stack-blueprint/factory'
import { withDeepDiveSignals } from '@/lib/ai-questions'
import { isAccessory } from '@/lib/catalogue/accessory'
import { servingsForVariant } from '@/lib/shop/per-serving'
import {
  getPricingConfig,
  occasionsPerMonthFor,
  proteinWeightFactor,
  USAGE_SERVINGS_PER_OCCASION,
  type PricingConfig,
  type UsageLevel,
} from '@/lib/stack-blueprint/pricing'
import { offerProductFor, quoteOffer, type OfferQuote } from './economics'

export interface HeroOffer {
  slotId: string
  slotType: string
  product: CatalogueProduct
  variant: CatalogueVariant
  quote: OfferQuote
  /** The line under its name: that it is one of their picks, and nothing more. */
  goalLine: string
  /** One register claim, verbatim, or null when the kind has none. */
  claim: { id: string; wording: string } | null
  /** Servings in the pack on offer, when known. */
  servings: number | null
  /** How long one pack lasts at their usage (months), when it can be said. */
  packMonths: number | null
  /** Why it ranked first, for tests and the hub. */
  score: number
}

export interface PickContext {
  /** Their answers, for a fresh fit score and their usage. Absent on direct navigation. */
  answers?: QuizAnswers | null
  /** The goal that matters most — `answers.primaryGoal`, else the blueprint's. */
  primaryGoal?: Goal | null
  /** The member's usage choices from the plan journey. */
  usage?: Record<string, UsageLevel>
}

/**
 * The claim and the "why you" line, from the same source as the stack's cards
 * and the You scene (`@/lib/results`): the product's "Built from your answers"
 * line and the claim beside it when it has one, else the claim the
 * goal-to-claim map picks for their goals, else the kind's first. So the offer
 * can never quote a different claim, or link a goal the map does not back.
 */
function claimAndLine(
  product: CatalogueProduct,
  slot: StackSlotEntry,
  answers: QuizAnswers | null,
  goals: Goal[],
  stackSize: number,
): { claim: HeroOffer['claim']; goalLine: string } {
  let explanation: ProductExplanation | null = null
  if (answers) {
    try {
      explanation = explainProduct({ product, slotType: slot.slotType as SlotType, answers })
    } catch {
      /* No line is the safe answer; the card still has the neutral one. */
    }
  }
  const claim = explanation?.claim ?? productClaim(product, goals)
  return {
    claim: claim ? { id: claim.id, wording: claim.wording } : null,
    goalLine: explanation?.sentence ?? `One of the ${stackSize} products we picked for you.`,
  }
}

function variantFor(product: CatalogueProduct, slot: StackSlotEntry): CatalogueVariant | null {
  return (
    product.variants.find((v) => v.id === slot.selectedVariantId && v.available) ??
    product.variants.find((v) => v.id === product.defaultVariantId && v.available) ??
    product.variants.find((v) => v.available) ??
    null
  )
}

/**
 * Servings in the pack, only when somebody actually recorded a count.
 *
 * `servingsForVariant` falls back to `resolveConsumption`, which assumes 30
 * when nothing is known — fine for sizing a subscription, but on a sales card
 * it would turn "we don't know" into "lasts about a month".
 */
export function knownServings(product: CatalogueProduct, variant: CatalogueVariant): number | null {
  const recorded =
    (variant.servings ?? 0) > 0 || (product.consumption?.servingsPerUnit ?? 0) > 0 || (product.servings ?? 0) > 0
  return recorded ? servingsForVariant(product, variant) : null
}

/** How long one pack lasts at their usage, or null when the servings are not known. */
export function packMonthsFor(
  product: CatalogueProduct,
  variant: CatalogueVariant,
  answers: QuizAnswers | null,
  usage: UsageLevel = 'standard',
): number | null {
  const servings = knownServings(product, variant)
  if (!servings || servings <= 0) return null
  const perMonth =
    occasionsPerMonthFor(product, answers) * USAGE_SERVINGS_PER_OCCASION[usage] * proteinWeightFactor(product, answers)
  if (!(perMonth > 0)) return null
  return Math.round((servings / perMonth) * 10) / 10
}

/** Fit on the engine's 0–100 scale, fresh; -Infinity when a hard gate rules it out. */
function fitFor(product: CatalogueProduct, slot: StackSlotEntry, answers: QuizAnswers | null): number {
  if (!answers) return Math.max(0, Math.min(100, slot.confidenceScore))
  const raw = scoreProduct(product, slot.slotType as SlotType, answers, getArchetype(answers.goals ?? []))
  if (raw === -Infinity) return -Infinity
  return Math.max(0, Math.min(100, Math.round(raw / 2)))
}

/**
 * The hero, or null when no product in the stack can be sold on its own on a
 * real deal at a profit — in which case the section does not render at all.
 */
export function pickHeroOffer(
  slots: readonly StackSlotEntry[],
  products: readonly CatalogueProduct[],
  ctx: PickContext = {},
  config: PricingConfig = getPricingConfig(),
): HeroOffer | null {
  // One product is not a "smaller sale" of a stack of one.
  if (slots.length < 2) return null

  const answers = ctx.answers ? withDeepDiveSignals(ctx.answers) : null
  const goals: Goal[] = answers?.goals ?? (ctx.primaryGoal ? [ctx.primaryGoal] : [])
  const primary = answers?.primaryGoal ?? ctx.primaryGoal ?? goals[0] ?? null
  const ordered = primary ? [primary, ...goals.filter((g) => g !== primary)] : goals

  const candidates: Array<HeroOffer & { order: number }> = []
  for (const slot of slots) {
    const product = products.find((p) => p.id === slot.selectedProductId)
    if (!product || product.isSubscriptionOnly || isAccessory(product)) continue
    const variant = variantFor(product, slot)
    if (!variant) continue
    const fit = fitFor(product, slot, answers)
    if (fit === -Infinity) continue
    const quote = quoteOffer(offerProductFor(product, variant), config)
    if (!quote.viable) continue
    const { claim, goalLine } = claimAndLine(product, slot, answers, ordered, slots.length)
    const score =
      fit +
      (slot.required ? 15 : 0) +
      (primary && (product.goals ?? []).includes(primary) ? 10 : 0) +
      (claim ? 5 : 0)
    candidates.push({
      slotId: slot.slotId,
      slotType: slot.slotType,
      product,
      variant,
      quote,
      goalLine,
      claim,
      servings: knownServings(product, variant),
      packMonths: packMonthsFor(product, variant, answers, ctx.usage?.[product.id]),
      score,
      order: slot.displayOrder,
    })
  }
  if (candidates.length === 0) return null

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.quote.costKnown) - Number(a.quote.costKnown) ||
      b.quote.totalSaving - a.quote.totalSaving ||
      a.order - b.order ||
      b.quote.contribution - a.quote.contribution,
  )
  const { order: _order, ...hero } = candidates[0]
  return hero
}
