/**
 * Whether a product is SAFE to put in front of a particular member.
 *
 * When a subscribed product goes away we may swap another one in on the
 * member's behalf, without asking them first. That convenience is only
 * defensible if the replacement clears exactly the same hard exclusions the
 * original had to clear when the stack was first built — a vegan must never be
 * auto-sent whey, and someone who opted out of stimulants must never be
 * auto-sent a caffeinated pre-workout.
 *
 * The blueprint factory applies those exclusions inline while scoring
 * (`scoreProduct` returns -Infinity), which is the right shape there but not
 * reusable. This module lifts the same rules into a small, pure, shared pair:
 * derive the constraints once, then test any product against them.
 *
 * Constraints are snapshotted onto the subscription at checkout
 * (`MemberSubscription.safetyConstraints`) so a swap months later doesn't depend
 * on their quiz answers still being readable or unedited; `constraintsFor()`
 * falls back to deriving them from answers for subscriptions stored before that
 * field existed.
 */
import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import type { MemberSubscription, SafetyConstraints } from '@/lib/recharge/types'
import type { QuizAnswers } from '@/lib/types'

/** No exclusions — anything in the category is eligible. */
export const NO_CONSTRAINTS: SafetyConstraints = { dietaryTags: [], noStimulants: false }

/**
 * Quiz answers → the member's hard exclusions.
 *
 * Mirrors the gates in `stack-blueprint/factory.ts`:
 *   • `lifestyle: ['vegan']`                          → must be vegan
 *   • `dietary: ['gluten-free', …]` (optional field)  → must carry those tags
 *   • `wellbeingAnswers.collagenOk === 'veggie'`      → must be vegetarian
 *   • `stimPreference: 'no'` or `caffeineLevel: 'none'` → no stimulants
 *
 * Keep this in step with the factory: a rule that exists there but not here is a
 * product we'd recommend against but might still auto-swap in.
 */
export function safetyConstraintsFrom(answers?: QuizAnswers | null): SafetyConstraints {
  if (!answers) return NO_CONSTRAINTS

  const tags = new Set<DietaryTag>()
  if (answers.lifestyle?.includes('vegan')) tags.add('vegan')
  if (answers.wellbeingAnswers?.collagenOk === 'veggie') tags.add('vegetarian')

  // `dietary` is an optional extension the factory also reads off-type.
  const dietary = (answers as unknown as { dietary?: string[] }).dietary
  for (const d of dietary ?? []) {
    if (DIETARY_TAGS.includes(d as DietaryTag)) tags.add(d as DietaryTag)
  }

  return {
    dietaryTags: [...tags],
    noStimulants: answers.stimPreference === 'no' || answers.caffeineLevel === 'none',
  }
}

/** The tags we recognise, so an unknown string in `dietary` can't become a constraint
 *  no product satisfies (which would silently block every swap). */
const DIETARY_TAGS: DietaryTag[] = [
  'vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'nut-free', 'halal', 'keto-friendly',
]

/**
 * Vegan implies vegetarian, so a vegan product satisfies a vegetarian
 * constraint even when it isn't tagged with both.
 */
function satisfiesTag(product: CatalogueProduct, tag: DietaryTag): boolean {
  if (product.dietaryTags.includes(tag)) return true
  return tag === 'vegetarian' && product.dietaryTags.includes('vegan')
}

/** True when `product` clears every one of the member's hard exclusions. */
export function meetsSafetyConstraints(product: CatalogueProduct, constraints: SafetyConstraints): boolean {
  if (constraints.noStimulants && product.hasStimulants) return false
  return constraints.dietaryTags.every((t) => satisfiesTag(product, t))
}

/** True when the member has any exclusion at all (drives the "is this swap risky?" copy). */
export function hasConstraints(constraints: SafetyConstraints): boolean {
  return constraints.noStimulants || constraints.dietaryTags.length > 0
}

/**
 * The constraints to judge a replacement by: the snapshot taken at checkout,
 * falling back to deriving them from quiz answers for older subscriptions.
 */
export function constraintsFor(
  sub: Pick<MemberSubscription, 'safetyConstraints'>,
  answers?: QuizAnswers | null,
): SafetyConstraints {
  return sub.safetyConstraints ?? safetyConstraintsFrom(answers)
}

/**
 * The member's exclusions in their own words, e.g. "vegan and stimulant-free".
 * Null when they have none. Used to tell someone at checkout exactly what a swap
 * will and won't do for them — a vegan seeing "we'll only ever swap to another
 * vegan option" is what makes auto-swap a reasonable thing to opt into.
 */
export function describeConstraints(constraints: SafetyConstraints): string | null {
  const parts = [...constraints.dietaryTags.map((t) => String(t))]
  if (constraints.noStimulants) parts.push('stimulant-free')
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** Every constraint `product` fails, for founder-facing "why is this blocked?" copy. */
export function failedConstraints(product: CatalogueProduct, constraints: SafetyConstraints): string[] {
  const failures: string[] = []
  if (constraints.noStimulants && product.hasStimulants) failures.push('contains stimulants')
  for (const t of constraints.dietaryTags) {
    if (!satisfiesTag(product, t)) failures.push(`not ${t}`)
  }
  return failures
}
