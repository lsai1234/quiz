import type { PrebuiltBundle } from './types'
import { BIG_NIGHT_BIG_MORNING } from './big-night-big-morning'

export type {
  PrebuiltBundle,
  BundleAddOn,
  BundleWorkout,
  BundleHowToStep,
  WorkoutExercise,
} from './types'
export { BIG_NIGHT_BIG_MORNING } from './big-night-big-morning'

/** Every live prebuilt bundle. New bundles register here. */
export const PREBUILT_BUNDLES: PrebuiltBundle[] = [BIG_NIGHT_BIG_MORNING]

export function getBundleBySlug(slug: string): PrebuiltBundle | undefined {
  return PREBUILT_BUNDLES.find((b) => b.slug === slug)
}
