/**
 * Choosing the hero and the bonus (Amp Consult and offer plan, Phase 3). One
 * module for both quizzes; each engine reaches it through a small adapter that
 * says what "kept out" and "fits" mean for its own answers
 * (`stack-blueprint/offer.ts` for the quiz, `consult/offer.ts` for the consult).
 *
 *   Hero    The best-fitting approved hero that clears every one of the
 *           person's exclusions, from `activeHeroIds` (none while the switch is
 *           off, and only approvals with every check complete). It has to meet
 *           at least one of their needs: an approved product that fits nothing
 *           they told us is not their best fit, it is a product we would like
 *           to sell. None → null, and the caller falls back to today's top pick.
 *   Bonus   Per tier, the best-fitting product in the pool that clears every
 *           exclusion, isn't already in that tier, is in stock, and leaves the
 *           order above the margin floor, on a tier that qualifies and meets
 *           the minimum. Ties go to the lower cost to us. None → null.
 *
 * Pure and deterministic: the same answers, catalogue and settings always give
 * the same hero and the same bonus (every ordering ends on the product id).
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { isAccessory } from '@/lib/catalogue/accessory'
import { CLAIMS, type Claim } from '@/lib/consult/claims'
import { getPricingConfig, unitCostOf, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { costFromSupplierPrice } from '@/lib/pricing/vat'
import { goalsBackedBy } from '@/lib/results/goal-claims'
import { GOAL_LINES } from '@/lib/results/phrases'
import type { Goal, StackLevel } from '@/lib/types'
import { activeBonusPool, activeHeroIds, type HeroApproval, type OfferSettings } from './settings'
import { bonusFloor, costedItem, stackMargin, type CostedItem } from './bonus-economics'

/** What an engine knows about one person, for the offer. */
export interface PersonFit {
  /** Why this product may not be offered to them, or null. Every exclusion the engine applies. */
  keepOut(product: CatalogueProduct): string | null
  /** How well it fits them; 0 when it meets none of their needs. */
  fit(product: CatalogueProduct): number
}

export interface OfferInputs {
  settings: OfferSettings
  catalogue: readonly CatalogueProduct[]
  /** YYYY-MM-DD, for the hero's "date checked". Defaults to today. */
  today?: string
  config?: PricingConfig
}

/** Can be sent on its own today: in stock, priced, not a subscription-only refill, not an accessory. */
export function offerable(product: CatalogueProduct): boolean {
  return (
    !product.isSubscriptionOnly &&
    !isAccessory(product) &&
    product.variants.some((v) => v.available && v.price > 0)
  )
}

/* ── The hero ───────────────────────────────────────────────────────────── */

export interface HeroChoice {
  product: CatalogueProduct
  approval: HeroApproval
  fit: number
  /** The wording it was approved to carry, verbatim; null for "no claim". */
  claim: Claim | null
}

export function chooseHero(inputs: OfferInputs, person: PersonFit): HeroChoice | null {
  const byId = new Map(inputs.catalogue.map((p) => [p.id, p]))
  const candidates = activeHeroIds(inputs.settings, inputs.catalogue, inputs.today)
    .map((id) => byId.get(id))
    .filter((p): p is CatalogueProduct => Boolean(p) && offerable(p!) && person.keepOut(p!) === null)
    .map((product) => ({ product, fit: person.fit(product) }))
    .filter((c) => c.fit > 0)
    .sort(
      (a, b) =>
        b.fit - a.fit ||
        (b.product.recommendationPriority ?? 0) - (a.product.recommendationPriority ?? 0) ||
        a.product.id.localeCompare(b.product.id),
    )
  const best = candidates[0]
  if (!best) return null
  const approval = inputs.settings.heroes[best.product.id]
  const claim = approval.claimId && approval.claimId !== 'none' ? (CLAIMS[approval.claimId] ?? null) : null
  return { product: best.product, approval, fit: best.fit, claim }
}

export interface HeroReason {
  /** The line above its name, or null: the label ("Not the obvious pick") then stands alone. */
  line: string | null
  kind: 'goal' | 'answer' | null
  goal?: Goal
  /** The claim beside it: the approved one, verbatim, or null. */
  claim: Claim | null
}

/**
 * Why the hero, claims-aware. A goal may be named only where the goal-to-claim
 * map backs the claim the hero was approved to carry; otherwise a line that
 * isn't about health (one of the person's own answers, when the engine has
 * one), or none.
 *
 * `goals` in the order they should win, primary first, as quiz goals (the
 * consult's adapter maps its own).
 */
export function heroReason(hero: HeroChoice, goals: readonly Goal[], answerLine: string | null = null): HeroReason {
  const claim = hero.claim
  if (claim) {
    const backed = goalsBackedBy(hero.product.swapGroup, claim.id)
    const goal = goals.find((g) => backed.includes(g) && GOAL_LINES[g])
    if (goal) return { line: GOAL_LINES[goal]!, kind: 'goal', goal, claim }
  }
  if (answerLine) return { line: answerLine, kind: 'answer', claim }
  return { line: null, kind: null, claim }
}

/**
 * The hero first in a ranking: moved to the front if it is there, else added
 * at the front. Products it stands in for (the same family, by `sameFamily`)
 * come out, so a stack never carries two of one kind.
 */
export function heroFirst(rankedIds: readonly string[], heroId: string, sameFamily: (id: string) => boolean = () => false): string[] {
  return [heroId, ...rankedIds.filter((id) => id !== heroId && !sameFamily(id))]
}

/* ── The bonus ──────────────────────────────────────────────────────────── */

export interface TierForBonus {
  level: StackLevel
  /** What is in the tier, as it is priced. */
  items: CostedItem[]
}

export type BonusBlock = 'off' | 'tier' | 'minimum' | 'none-fits' | 'margin' | 'stock'

export interface BonusChoice {
  level: StackLevel
  product: CatalogueProduct
  item: CostedItem
  fit: number
  /** What it costs us (£): PowerBody's price, VAT included when we pay it; estimated when not on file. */
  costToUs: number
  /** What the order keeps with the bonus in it, and the floor it cleared (£). */
  contributionWith: number
  floor: number
}

export interface BonusOutcome {
  choice: BonusChoice | null
  /** Why there is none, for the funnel (`bonus_blocked`) and the screen's "what would qualify". */
  blocked: BonusBlock | null
}

function costToUsOf(item: CostedItem, config: PricingConfig): number {
  const exVat = item.supplierCost ?? unitCostOf({ basePrice: item.price }, item.price, config)
  return costFromSupplierPrice(exVat, config)
}

export function chooseBonus(inputs: OfferInputs, person: PersonFit, tier: TierForBonus): BonusOutcome {
  const config = inputs.config ?? getPricingConfig()
  const { bonus } = inputs.settings
  const pool = activeBonusPool(inputs.settings, inputs.catalogue)
  if (!bonus.enabled || pool.length === 0) return { choice: null, blocked: 'off' }
  if (!bonus.tiers.includes(tier.level)) return { choice: null, blocked: 'tier' }
  const base = stackMargin(tier.items, null, config)
  if (base.subtotal < bonus.minSubtotal) return { choice: null, blocked: 'minimum' }

  const inTier = new Set(tier.items.map((i) => i.id))
  const byId = new Map(inputs.catalogue.map((p) => [p.id, p]))
  let sawFit = false
  let sawStock = false
  let sawMargin = false
  const choices: BonusChoice[] = []
  for (const id of pool) {
    const product = byId.get(id)
    if (!product || inTier.has(id) || person.keepOut(product) !== null) continue
    sawFit = true
    const item = offerable(product) ? costedItem(product) : null
    if (!item) {
      sawStock = true
      continue
    }
    const withIt = stackMargin(tier.items, item, config)
    const floor = bonusFloor(withIt.netRevenue, bonus)
    if (withIt.contribution < floor) {
      sawMargin = true
      continue
    }
    choices.push({ level: tier.level, product, item, fit: person.fit(product), costToUs: costToUsOf(item, config), contributionWith: withIt.contribution, floor })
  }
  choices.sort((a, b) => b.fit - a.fit || a.costToUs - b.costToUs || a.product.id.localeCompare(b.product.id))
  if (choices[0]) return { choice: choices[0], blocked: null }
  return { choice: null, blocked: !sawFit ? 'none-fits' : sawMargin ? 'margin' : sawStock ? 'stock' : 'none-fits' }
}

/** A tier's products as priced: the variant on the page where there is one, else the product's master. */
export function costedItemsFor(entries: readonly { productId: string; variantId?: string | null }[], catalogue: readonly CatalogueProduct[]): CostedItem[] {
  const byId = new Map(catalogue.map((p) => [p.id, p]))
  const out: CostedItem[] = []
  for (const e of entries) {
    const product = byId.get(e.productId)
    if (!product) continue
    const variant = (e.variantId && product.variants.find((v) => v.id === e.variantId)) || null
    const base = costedItem(product)
    if (!base) continue
    out.push(
      variant && variant.price > 0
        ? { ...base, price: variant.price, supplierCost: (variant as { cost?: number | null }).cost ?? base.supplierCost }
        : base,
    )
  }
  return out
}

/* ── A person, carried to the results page ──────────────────────────────── */

/**
 * What an engine decided about one person, product by product: why each is
 * kept out (or null), how well it fits and what kind of thing it is. For the
 * consult, whose answers the results page doesn't have (the store holds the
 * quiz-shaped answers `toQuizAnswers` made), so the decision is taken where
 * the answers are (`prepareResults`) and carried over as data.
 */
export type PersonSnapshot = Record<string, { out: string | null; fit: number; kind: string }>

export function snapshotPerson(person: PersonFit, catalogue: readonly CatalogueProduct[], kindOf: (p: CatalogueProduct) => string): PersonSnapshot {
  const snap: PersonSnapshot = {}
  for (const p of catalogue) snap[p.id] = { out: person.keepOut(p), fit: person.fit(p), kind: kindOf(p) }
  return snap
}

/** The snapshot as a `PersonFit`. A product it never saw is kept out: it was never checked. */
export function personFromSnapshot(snap: PersonSnapshot): PersonFit {
  return {
    keepOut: (product) => (snap[product.id] ? snap[product.id].out : 'not checked for this person'),
    fit: (product) => snap[product.id]?.fit ?? 0,
  }
}
