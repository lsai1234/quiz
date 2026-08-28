/**
 * quiz-core — the data-driven decision matrix.
 *
 * The curated, editable configuration the recommendation engine reads: the goal
 * map (slot relevance, wellbeing slots, goal→product affinity), the scoring
 * weights, and the value-first depth tiers. Extracting these out of the engine
 * is what lets the catalogue and the ranking be re-tuned as data, not code —
 * and (once connected) edited from the Founders portal.
 */
export { SLOT_ORDER, GOAL_SLOT_RELEVANCE, WELLBEING_GOAL_SLOTS, GOAL_AFFINITY } from './goal-map'
export type { SlotType } from './goal-map'
export { SCORING, FOUNDATIONAL_SWAP_GROUPS } from './scoring'
export { TIER_ORDER, TIER_PRICE_BANDS, TIER_SIZE_BANDS, TIER_MIN_STEP, TIER_META } from './tiers'
export { applyBundleRules, DOSE_CAPS, BUNDLE_RULES } from './bundle-rules'
