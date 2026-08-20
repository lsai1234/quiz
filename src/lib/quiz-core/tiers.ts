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
export const TIER_PRICE_BANDS: Record<StackLevel, { min: number; max: number | null }> = {
  essentials: { min: 0, max: 35 },
  performance: { min: 35, max: 55 },
  // Capped rather than open-ended: "every angle covered" that lands at £120 for
  // one quiz and £55 for another is the same inconsistency the bands exist to
  // remove. Anything that doesn't fit stays on the results page as an upgrade,
  // so the member chooses to go above the band rather than being shown it.
  complete: { min: 55, max: 80 },
}

/**
 * The most products a depth may hold, whatever the band allows.
 *
 * A backstop on shape, not the sizing control: it stops a stack of cheap
 * vitamins from packing eight products into Essentials just because they fit
 * under £35, and keeps the three options visibly stepped.
 */
export const TIER_MAX_SIZES: Record<StackLevel, number> = { essentials: 4, performance: 6, complete: 8 }

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
