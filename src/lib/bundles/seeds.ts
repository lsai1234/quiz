import type { PrebuiltBundle } from './types'
import { BIG_NIGHT_BIG_MORNING } from './big-night-big-morning'
import { LEG_DAY_LOADING } from './leg-day-loading'
import { EARLY_SHIFT } from './early-shift'
import { GAME_DAY } from './game-day'
import { DEADLINE_WEEK } from './deadline-week'
import { WIND_DOWN_SUNDAY } from './wind-down-sunday'

/**
 * The bundles that ship with the app. These are the launch line-up; the portal
 * can hide, reorder, edit (via overrides) or add to them, but the seeds are the
 * always-present baseline that a fresh database starts from.
 *
 * Order here is the default shop order (overridable per-bundle by the portal).
 */
export const SEED_BUNDLES: PrebuiltBundle[] = [
  BIG_NIGHT_BIG_MORNING,
  LEG_DAY_LOADING,
  EARLY_SHIFT,
  GAME_DAY,
  DEADLINE_WEEK,
  WIND_DOWN_SUNDAY,
]

export function getSeedBundleBySlug(slug: string): PrebuiltBundle | undefined {
  return SEED_BUNDLES.find((b) => b.slug === slug)
}
