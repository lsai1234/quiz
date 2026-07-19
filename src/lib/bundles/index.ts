export type {
  PrebuiltBundle,
  BundleAddOn,
  BundleWorkout,
  BundleHowToStep,
  WorkoutExercise,
} from './types'
export { BIG_NIGHT_BIG_MORNING } from './big-night-big-morning'
export { SEED_BUNDLES, getSeedBundleBySlug } from './seeds'

import { SEED_BUNDLES, getSeedBundleBySlug } from './seeds'
import type { PrebuiltBundle } from './types'

/**
 * Every seed bundle. Kept as a named alias for readability at call sites that
 * want "the built-in bundles" without the resolved-store layer (Phase 2).
 */
export const PREBUILT_BUNDLES: PrebuiltBundle[] = SEED_BUNDLES

/**
 * Synchronous seed lookup by slug. The resolved store (`lib/bundles/store.ts`)
 * is the source of truth once the portal is in play; this stays for tests and
 * for code paths that only ever need the shipped baseline.
 */
export function getBundleBySlug(slug: string): PrebuiltBundle | undefined {
  return getSeedBundleBySlug(slug)
}
