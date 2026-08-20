/**
 * Price-banded depth tiers — what Essentials / Balanced / Complete actually
 * contain for one member's stack.
 *
 * The engine builds ONE ranked stack. This decides how much of it each depth
 * gets, and it sizes by PRICE rather than by product count: each tier is filled
 * with the most relevant products that keep its monthly subscription total
 * inside its band (`TIER_PRICE_BANDS`). The old fixed 3 / 5 / 7 prefixes made
 * the count the constant and the price the variable, so the same three options
 * cost £26 / £40 / £117 for one quiz and £34 / £53 / £53 for the next — the
 * tier names meant nothing across two members, and the top two could land on
 * the same price.
 *
 * Three properties hold, and the tests lock all three:
 *
 *  1. **Nested.** Each depth contains everything the depth below it has, and is
 *     built by adding to it — so "the next one up" is always literally more.
 *  2. **Banded.** A tier's monthly total sits inside its band whenever the
 *     catalogue allows. It can only exceed the ceiling when the products that
 *     must be there (see anchors) already cost more than the band, or when the
 *     tier would otherwise be identical to the one below it.
 *  3. **Distinct.** While products remain, no depth is the same size as the
 *     depth below — three options are always three options.
 *
 * Prices come from `calculatePricing` with the tier's own level, which is what
 * the reveal and the checkout both charge through, so what the selector shows
 * and what the card is billed cannot drift apart.
 */
import type { QuizAnswers, StackLevel } from '@/lib/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackBlueprint, StackSlotEntry } from './types'
import { calculatePricing, getPricingConfig, type SubscriptionPlanOptions } from './pricing'
import { TIER_ORDER, TIER_PRICE_BANDS, TIER_MAX_SIZES, TIER_MIN_STEP } from '@/lib/quiz-core'

export interface TierPlan {
  level: StackLevel
  /** The slots this depth includes, in display order. */
  slots: StackSlotEntry[]
  /** Monthly subscription total (£) — the number the band is set against. */
  monthly: number
  /** One-off total (£) for the same products, for the "or buy once" line. */
  oneOff: number
}

/**
 * Slots that are in every depth, however much they cost.
 *
 * Required slots are the stack's reason for existing — a bulking member's mass
 * builder is £37/month on its own, and an Essentials that quietly swapped it
 * for two £15 vitamins to fit the band would be a cheaper stack for a different
 * person. Anything the member added themselves is in for the same reason: they
 * asked for it, so it is never sized out from under them.
 */
function isAnchor(slot: StackSlotEntry): boolean {
  return slot.required || slot.addedByUser === true
}

const byDisplayOrder = (a: StackSlotEntry, b: StackSlotEntry) => a.displayOrder - b.displayOrder

/**
 * Plan all three depths for a blueprint, cheapest first.
 *
 * `opts` is the same options object the reveal prices with (usage levels,
 * partner code, intro offer); the level is set per tier and any level passed in
 * is ignored, since that is precisely what is being decided here.
 */
export function planTiers(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
  opts: SubscriptionPlanOptions = {},
  bands = TIER_PRICE_BANDS,
  maxSizes = TIER_MAX_SIZES,
  minStep = TIER_MIN_STEP,
): TierPlan[] {
  const ranked = [...blueprint.slots].sort(byDisplayOrder)

  const priceOf = (slots: StackSlotEntry[], level: StackLevel) =>
    calculatePricing({ ...blueprint, slots, level }, catalogue, answers, config, { ...opts, level })

  const plans: TierPlan[] = []
  let chosen: StackSlotEntry[] = []

  for (const level of TIER_ORDER) {
    const band = bands[level]
    const maxSize = maxSizes[level]
    const picked = [...chosen]
    const has = (slot: StackSlotEntry) => picked.some((p) => p.slotId === slot.slotId)

    // 1. Anchors, and — for the first tier — the top-ranked product, so the
    //    cheapest depth still leads with the pick the engine is most sure of.
    for (const slot of ranked) {
      if (!has(slot) && (isAnchor(slot) || picked.length === 0)) picked.push(slot)
    }

    // 2. Fill by rank while the band's ceiling holds. A product that doesn't fit
    //    is skipped rather than ending the fill: a £30 protein sitting second
    //    shouldn't cost the member the three cheaper things ranked below it.
    for (const slot of ranked) {
      if (has(slot) || picked.length >= maxSize) continue
      const candidate = [...picked, slot]
      if (band.max != null && priceOf(candidate, level).subscriptionTotal > band.max) continue
      picked.push(slot)
    }

    // 3. Three options must be three options. If the band left this depth with
    //    exactly what the one below has, add the cheapest product still on the
    //    table and let it overshoot — an option that costs more and contains
    //    more is worth more than a duplicate row.
    if (picked.length === chosen.length && picked.length < ranked.length) {
      const rest = ranked.filter((slot) => !has(slot))
      const cheapest = rest.reduce((best, slot) => {
        const cost = priceOf([...picked, slot], level).subscriptionTotal
        return best && best.cost <= cost ? best : { slot, cost }
      }, null as { slot: StackSlotEntry; cost: number } | null)
      if (cheapest) picked.push(cheapest.slot)
    }

    const slots = [...picked].sort(byDisplayOrder)
    const pricing = priceOf(slots, level)
    plans.push({ level, slots, monthly: pricing.subscriptionTotal, oneOff: pricing.oneOffTotal })
    chosen = picked
  }

  // 4. Fold anything that isn't a real choice — a stack can run out of products
  //    before it runs out of bands. Which half of the pair survives depends on
  //    why they collided:
  //
  //    · Same products, deeper label — the stack ran out, so the deeper depth is
  //      the same shopping list at a better subscribe-&-save rung. DROP IT.
  //      Showing it would price identical stacks differently, and hand the
  //      bigger-bundle discount to a bundle that never got bigger.
  //    · Different products, trivial step — "£53.09 for five" beside "£53.17 for
  //      six" is not a decision, it's a puzzle. KEEP THE DEEPER: same money,
  //      more in the box.
  const shown: TierPlan[] = []
  for (const plan of plans) {
    const prev = shown[shown.length - 1]
    const sameSlots =
      prev != null &&
      prev.slots.length === plan.slots.length &&
      prev.slots.every((slot, i) => slot.slotId === plan.slots[i].slotId)
    if (sameSlots) continue
    if (prev && plan.monthly - prev.monthly < minStep) shown[shown.length - 1] = plan
    else shown.push(plan)
  }

  return shown
}

/**
 * The plan for one depth.
 *
 * Folding means a level the member last chose may no longer be on offer, so
 * this resolves to the nearest depth at or above it, and to the deepest one
 * otherwise — never nothing. **Price with the returned plan's `level`**, not
 * the one asked for, or the selector and the receipt will quote different
 * subscribe-&-save rungs.
 */
export function tierPlanFor(plans: TierPlan[], level: StackLevel): TierPlan {
  const wanted = TIER_ORDER.indexOf(level)
  const atOrAbove = plans.find((p) => TIER_ORDER.indexOf(p.level) >= wanted)
  return plans.find((p) => p.level === level) ?? atOrAbove ?? plans[plans.length - 1]
}
