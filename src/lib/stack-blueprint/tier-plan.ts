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
 * Four properties hold, and the tests lock all four:
 *
 *  1. **Nested.** Each depth contains everything the depth below it has, and is
 *     built by adding to it — so "the next one up" is always literally more.
 *  2. **Floored.** No depth is below `TIER_SIZE_BANDS[level].min`. A
 *     one-product "Essentials" priced perfectly inside its band is not a cheap
 *     stack, it is not a stack, and the fill used to produce them whenever the
 *     top-ranked pick was dear enough to leave no room under the ceiling.
 *  3. **Banded.** A tier's monthly total sits inside its band whenever the
 *     catalogue allows, and aims at the band's `target` rather than merely
 *     staying under its ceiling — which is what makes a band a price rather
 *     than a range.
 *  4. **Distinct.** While products remain, no depth is the same size as the
 *     depth below — three options are always three options.
 *
 * ── Precedence ──────────────────────────────────────────────────────────────
 * The four pull against each other on a thin catalogue, so the order is fixed
 * here once rather than re-decided per bug report:
 *
 *     size.min  >  price.max  >  size.max  >  price.target
 *
 * A depth reaches its product floor even when that costs more than its ceiling;
 * it respects its ceiling before its count cap; and the target is an aim, not a
 * rule. The one nuance is that "the floor outranks the ceiling" is a licence to
 * break the band, not a reason to ignore it — the floor is filled inside the
 * band by rank wherever it can be, and only then by the cheapest product left,
 * so an overshoot is always as small as the catalogue allows.
 *
 * Prices come from `calculatePricing` with the tier's own level, which is what
 * the reveal and the checkout both charge through, so what the selector shows
 * and what the card is billed cannot drift apart.
 */
import type { QuizAnswers, StackLevel } from '@/lib/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackBlueprint, StackSlotEntry } from './types'
import { calculatePricing, getPricingConfig, type SubscriptionPlanOptions } from './pricing'
import { TIER_ORDER, TIER_MIN_STEP } from '@/lib/quiz-core'

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
  // From the CONFIG, not the constants: `config` already carries any founder
  // override merged over the defaults, so the pricing page moves the bands
  // without a deploy and without a second source of truth.
  bands = config.tierBands,
  sizes = config.tierSizes,
  minStep = TIER_MIN_STEP,
): TierPlan[] {
  const ranked = [...blueprint.slots].sort(byDisplayOrder)

  const priceOf = (slots: StackSlotEntry[], level: StackLevel) =>
    calculatePricing({ ...blueprint, slots, level }, catalogue, answers, config, { ...opts, level })

  const plans: TierPlan[] = []
  let chosen: StackSlotEntry[] = []

  for (const level of TIER_ORDER) {
    const band = bands[level]
    const size = sizes[level]
    const picked = [...chosen]
    const has = (slot: StackSlotEntry) => picked.some((p) => p.slotId === slot.slotId)

    // 1. Anchors, and — for the first tier — the top-ranked product, so the
    //    cheapest depth still leads with the pick the engine is most sure of.
    for (const slot of ranked) {
      if (!has(slot) && (isAnchor(slot) || picked.length === 0)) picked.push(slot)
    }

    // 2. The floor. A one-product "Essentials" priced perfectly inside its band
    //    is not a cheap stack, it is not a stack — so the count is reached
    //    before the money is spent, and it is the one place the price band is
    //    allowed to lose.
    //
    //    In two phases, because "the floor outranks the ceiling" is a licence
    //    to break the band, not a reason to ignore it. Almost always the floor
    //    can be reached inside the band, and doing that by rank keeps the
    //    cheapest depth leading with the picks the engine is most sure of.
    for (const slot of ranked) {
      if (picked.length >= size.min) break
      if (has(slot)) continue
      if (band.max != null && priceOf([...picked, slot], level).subscriptionTotal > band.max) continue
      picked.push(slot)
    }

    //    Only when that fails does the band give way — and then by the CHEAPEST
    //    product left rather than the next-ranked one, so the overshoot is as
    //    small as the catalogue allows. Filling this phase by rank instead put
    //    a £60 Balanced inside a £55 band on stacks that had a perfectly good
    //    £48 option one place further down.
    while (picked.length < size.min) {
      const rest = ranked.filter((slot) => !has(slot))
      if (rest.length === 0) break
      const cheapest = rest.reduce((best, slot) => {
        const cost = priceOf([...picked, slot], level).subscriptionTotal
        return best && best.cost <= cost ? best : { slot, cost }
      }, null as { slot: StackSlotEntry; cost: number } | null)
      if (!cheapest) break
      picked.push(cheapest.slot)
    }

    // 3. Fill by rank TOWARDS the target, not merely under the ceiling.
    //
    //    Filling to the ceiling made a band a range: Essentials came out at
    //    £24 for one member and £43 for the next, which is a great deal better
    //    than the £26-vs-£68 the bands replaced but is still not one price.
    //    Stopping at the target clusters them — the depth is the price it is
    //    sold as, and the products are what fit it.
    //
    //    Rank still decides WHICH product, so the target can only ever end the
    //    fill early; it never reaches past a more relevant product for a
    //    cheaper one that happens to land nearer the number. And a product that
    //    doesn't fit is skipped rather than ending the fill: a £30 protein
    //    sitting second shouldn't cost the member the three cheaper things
    //    ranked below it.
    for (const slot of ranked) {
      if (has(slot) || picked.length >= size.max) continue
      if (picked.length >= size.min && priceOf(picked, level).subscriptionTotal >= band.target) break
      if (band.max != null && priceOf([...picked, slot], level).subscriptionTotal > band.max) continue
      picked.push(slot)
    }

    // 4. Three options must be three options. If the band left this depth with
    //    exactly what the one below has, add the cheapest product still on the
    //    table and let it overshoot the PRICE — an option that costs more and
    //    contains more is worth more than a duplicate row.
    //
    //    The COUNT cap is not overshot, though, which is the change from the
    //    first version of this step. A depth that cannot be distinct without
    //    breaking its own shape should not be shown, and the fold below is a
    //    better answer than a Balanced holding six products.
    if (picked.length === chosen.length && picked.length < ranked.length && picked.length < size.max) {
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
