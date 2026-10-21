/**
 * The shapes that explain a stack: where each product's score came from, why a
 * product was left out, and what the rules pass changed.
 *
 * `scoreProductDetailed` (factory.ts) produces `ScoreDetail`;
 * `buildStackBlueprint` records `StackCheck`s on the blueprint. Nothing here is
 * customer text. It is data that copy is written from, and the copy decides
 * what may be said (safety exclusions, for one, never are).
 */

/**
 * Where a score term came from. Most are the `QuizAnswers` field the points
 * were read from. The `product.*` ones are properties of the product and say
 * nothing about the person: they must never be presented as "because you said".
 * `archetype` is derived from `goals` (value = the archetype id).
 */
export type ContributionField =
  | 'goals'
  | 'wellbeingAnswers.sleepQuality'
  | 'wellbeingAnswers.stressPattern'
  | 'wellbeingAnswers.collagenOk'
  | 'lifestyle'
  | 'drivers'
  | 'diet'
  | 'dietary'
  | 'trainingFocus'
  | 'gender'
  | 'ageBracket'
  | 'trainingTime'
  | 'caffeineLevel'
  | 'stimPreference'
  | 'trainingExperience'
  | 'trainingFrequency'
  | 'budget'
  | 'proteinIntakeG'
  | 'currentSupplements'
  | 'currentVitamins'
  | 'archetype'
  | 'product.recommendationPriority'
  | 'product.topRank'
  | 'product.swapGroup'

/**
 * One term of a product's score.
 *
 * `rule` is a stable key naming the term (`goalOverlap`, `goalAffinity`,
 * `archetype.muscleProteinOrPerformance`, `lifestyle.jointSupport`...). Where
 * the term reads a SCORING weight, the key is that weight's path in SCORING.
 * `value` is the answer that triggered it (a goal id, a driver id, 'evening'),
 * or null when the term fires on the ABSENCE of an answer (no muscle goal).
 */
export interface Contribution {
  field: ContributionField
  value: string | number | null
  points: number
  rule: string
}

/** Why a hard gate removed a product. */
export type ExclusionReason =
  | 'safety'
  | 'goal-gate'
  | 'stimulant'
  | 'vegan'
  | 'gluten-free'
  | 'already-taking'
  | 'collagen-veggie'

/**
 * The gate that removed a product, and the answer behind it. `goal-gate` is
 * keyed by the product's swap group (the gate fires because a goal is missing).
 * `safety` never carries the flag itself: value is always null.
 */
export interface Exclusion {
  reason: ExclusionReason
  field: ContributionField | 'safetyFlags' | 'product.swapGroup'
  value: string | number | null
}

/**
 * A product's score with its working.
 *
 * Not excluded: `score` equals the sum of `contributions[].points` in order
 * (zero-point terms are omitted). Excluded: `score` is -Infinity, `excludedBy`
 * says why and `contributions` is empty.
 */
export interface ScoreDetail {
  score: number
  contributions: Contribution[]
  excludedBy: Exclusion | null
}

/** The three post-selection rules in quiz-core/bundle-rules.ts. */
export type BundleRuleId = 'relevance-floor' | 'dedup-active' | 'dose-cap'

export type StackCheckKind = ExclusionReason | BundleRuleId

/**
 * Something the engine did for this person, recorded on the blueprint.
 *
 * Exclusions are aggregated: one check per reason and answer, listing every
 * product that was a real candidate in this build and was removed for it, in
 * the order first met. Products that ended up in the stack anyway (excluded in
 * one slot, chosen in another) are not listed. Each bundle-rule drop is its own
 * check, with the shared `active` for dedup-active and the `active` and its
 * `capMg` for dose-cap.
 *
 * `buildStackBlueprint` never records `safety`: those are special-category
 * answers and nothing the page shows may hint at them.
 */
export interface StackCheck {
  kind: StackCheckKind
  productIds: string[]
  field?: string
  value?: string | number | null
  active?: string
  capMg?: number
}
