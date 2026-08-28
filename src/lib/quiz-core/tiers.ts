/**
 * Value-first depth tiers (config). Each tier is a nested selection from the
 * ranked stack; the results screen prices them so the customer sees value
 * before price. Centralised here so the bands/labels are editable in one place.
 */
import type { StackLevel } from '@/lib/types'

export const TIER_ORDER: StackLevel[] = ['essentials', 'performance', 'complete']

/**
 * The monthly SUBSCRIPTION price band (£) each depth is built to.
 *
 * PRICE, NOT PRODUCT COUNT, IS WHAT SIZES A TIER. Depths used to be fixed
 * prefixes — 3 / 5 / 7 products — which meant the price of "Essentials" was
 * whatever three products happened to cost: £26 for one quiz and £68 for the
 * next. Two people comparing notes on the same three options saw two different
 * shops. The bands invert that: the price is the fixed thing, and the number of
 * products is whatever fits it (`planTiers` in `@/lib/stack-blueprint`).
 *
 * Bands are contiguous and cover the range end to end — every price belongs to
 * exactly one depth, so the three options can never overlap or leave a gap.
 * `max` is a ceiling the fill never crosses; `min` is the band's floor, which
 * the fill reaches when the catalogue allows (it is not forced — a stack of
 * three cheap vitamins is allowed to come in under it rather than have a
 * product it doesn't need pushed into it).
 *
 * Read against the one-off column at your peril: these are the subscribed
 * monthly totals, which is the plan the tiers are sold on.
 */
export const TIER_PRICE_BANDS: Record<StackLevel, { min: number; target: number; max: number | null }> = {
  essentials: { min: 0, target: 30, max: 35 },
  performance: { min: 35, target: 45, max: 55 },
  // Capped rather than open-ended: "every angle covered" that lands at £120 for
  // one quiz and £55 for another is the same inconsistency the bands exist to
  // remove. Anything that doesn't fit stays on the results page as an upgrade,
  // so the member chooses to go above the band rather than being shown it.
  complete: { min: 55, target: 68, max: 80 },
}

/**
 * How many products a depth holds.
 *
 * `max` is the backstop `TIER_MAX_SIZES` always was: it stops a stack of cheap
 * vitamins from packing eight products into Essentials just because they fit
 * under the ceiling, and keeps the three options visibly stepped.
 *
 * `min` is the part that was missing, and its absence was a real fault. The
 * fill seeded Essentials with "the anchors, or the top-ranked product if there
 * are none", so a member whose top pick happened to be a £30 product was
 * offered a ONE-PRODUCT Essentials — priced correctly inside its band, and
 * reading as a mistake. `general health` did exactly this on the mock
 * catalogue.
 *
 * **The floor outranks the price ceiling.** A depth below its floor is not a
 * cheaper stack, it is a stack that isn't one, so the fill reaches the minimum
 * count even when that costs more than the band allows. See the precedence note
 * on `planTiers`.
 */
export const TIER_SIZE_BANDS: Record<StackLevel, { min: number; max: number }> = {
  essentials: { min: 2, max: 3 },
  performance: { min: 3, max: 4 },
  complete: { min: 4, max: 6 },
}

/**
 * The smallest monthly gap (£) between two depths worth showing as two options.
 *
 * Small stacks run out of products before they run out of bands, and the result
 * is two rows a few pence apart — "£53.09 for five" next to "£53.17 for six",
 * which reads as a fault rather than a choice. `planTiers` folds any pair
 * closer than this into the deeper of the two, so what's on screen is always a
 * real decision: fewer options, never fake ones.
 */
export const TIER_MIN_STEP = 5

export const TIER_META: Record<StackLevel, { label: string; blurb: string; badge?: string }> = {
  essentials: { label: 'Essentials', blurb: 'The core that moves the needle most' },
  performance: { label: 'Balanced', blurb: 'A well-rounded daily stack', badge: 'Recommended' },
  complete: { label: 'Complete', blurb: 'Every angle covered' },
}
