import {
  DIETARY_TAGS,
  SLOT_LABELS,
  STACK_SLOTS,
  SWAP_GROUPS,
  type CatalogueProduct,
  type DietaryTag,
  type StackSlot,
  type SwapGroup,
} from '@/lib/catalogue/types'
import { ALL_GOALS } from '@/lib/types'
import { GOAL_LABELS } from '@/lib/quiz-goals'

/**
 * What "Suggest tags" may offer for one product, and what applying it sends.
 *
 * Kept pure so the rules are tested rather than eyeballed — every one of them
 * is here because the old panel broke it:
 *
 *   One chip, one tag   a chip turns ONE suggested tag on or off. The old chip
 *                       switched the whole field, so unticking "Recovery" also
 *                       dropped "Protein" beside it.
 *   Labels, not keys    "Energy / Pre-Workout", not `energy`; "Whey protein",
 *                       not `protein-whey`.
 *   Blanks only         a field the product already has is not offered. This is
 *                       a pass for products nobody has tagged, not a second
 *                       opinion over someone's work.
 *   Never cost or       the classifier returns both, as guesses: a cost of
 *   servings            "price × ratio" and 30 servings. Stored, a guessed cost
 *                       reads as a known one in every margin, and a guessed
 *                       serving count sizes subscriptions. Neither is offered.
 *   Short name and      both were in the suggestion and silently dropped. A
 *   stimulants          short name fills a blank; "contains stimulants" is only
 *                       ever offered in the safe direction — turning it ON.
 *   Only what saves     a model can answer with a tag we do not have. The save
 *                       validates every value and refuses the whole edit for
 *                       one unknown tag, so a chip that cannot be saved is
 *                       never shown — it would only fail the ones beside it.
 */

export type OfferField =
  | 'stackSlots'
  | 'goals'
  | 'dietaryTags'
  | 'swapGroup'
  | 'shortName'
  | 'hasStimulants'
  | 'subscriptionEligible'
  | 'recommendationBasis'

export interface Offer {
  /** Unique within the product: the field, and the tag for a list field. */
  key: string
  field: OfferField
  value: string | boolean
  label: string
  /** Ticked until the founder unticks it. */
  defaultOn: boolean
}

/** Fields whose offers are separate tags, combined into one list on apply. */
const LIST_FIELDS: OfferField[] = ['stackSlots', 'goals', 'dietaryTags']

export const FIELD_TITLES: Record<OfferField, string> = {
  stackSlots: 'Stack slots',
  goals: 'Goals',
  dietaryTags: 'Dietary tags',
  swapGroup: 'Swap group',
  shortName: 'Short name',
  hasStimulants: 'Stimulants',
  subscriptionEligible: 'Subscription',
  recommendationBasis: 'Keep-or-change advice',
}

/** The order fields are shown in: what decides who is recommended it, first. */
export const FIELD_ORDER: OfferField[] = [
  'stackSlots',
  'goals',
  'swapGroup',
  'hasStimulants',
  'shortName',
  'recommendationBasis',
  'subscriptionEligible',
  'dietaryTags',
]

const SWAP_LABELS: Record<SwapGroup, string> = {
  'protein-whey': 'Whey protein',
  'protein-plant': 'Plant protein',
  'protein-mass': 'Mass gainer',
  'protein-clear': 'Clear protein',
  creatine: 'Creatine',
  'pre-workout-stim': 'Pre-workout (with stimulants)',
  'pre-workout-stim-free': 'Pre-workout (stimulant-free)',
  aminos: 'Amino acids',
  electrolytes: 'Electrolytes',
  'omega-3': 'Omega-3',
  magnesium: 'Magnesium',
  'vitamin-d': 'Vitamin D',
  multivitamin: 'Multivitamin',
  collagen: 'Collagen',
  'joint-support': 'Joint support',
  'sleep-support': 'Sleep support',
  'fat-burner': 'Fat burner',
  adaptogen: 'Adaptogen',
  probiotic: 'Probiotic',
  greens: 'Greens',
  fibre: 'Fibre',
  menopause: 'Menopause',
  'vitamin-c': 'Vitamin C',
  'protein-bar': 'Protein bar',
  nootropic: 'Nootropic',
  'vitamin-b': 'Vitamin B',
  zma: 'ZMA',
  'energy-gel': 'Energy gel',
  accessory: 'Accessory',
  general: 'General',
}

const DIETARY_LABELS: Record<DietaryTag, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  'gluten-free': 'Gluten-free',
  'dairy-free': 'Dairy-free',
  'nut-free': 'Nut-free',
  halal: 'Halal',
  'keto-friendly': 'Keto-friendly',
}

export function swapGroupLabel(group: string): string {
  return SWAP_LABELS[group as SwapGroup] ?? group
}

function tagLabel(field: OfferField, value: string): string {
  if (field === 'stackSlots') return SLOT_LABELS[value as StackSlot] ?? value
  if (field === 'goals') return GOAL_LABELS[value] ?? value
  if (field === 'dietaryTags') return DIETARY_LABELS[value as DietaryTag] ?? value
  return value
}

/**
 * A product the pass is for: on sale, and missing what the quiz needs to
 * recommend it at all — a stack slot, a goal, or a swap group other than
 * "general" (which means "no alternatives"). The same three the readiness
 * check "Tagged correctly" asks about.
 */
export function needsTags(p: CatalogueProduct): boolean {
  return p.stackSlots.length === 0 || p.goals.length === 0 || !p.swapGroup || p.swapGroup === 'general'
}

/** The suggestion as `/api/portal/ai-classify` sends it — loosely, because it is a model's answer. */
export type Suggestion = Partial<Record<string, unknown>>

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])

/** The values `POST /api/portal/products` accepts for each tag field — the same lists it validates against. */
const KNOWN: Record<'stackSlots' | 'goals' | 'dietaryTags', ReadonlySet<string>> = {
  stackSlots: new Set<string>(STACK_SLOTS),
  goals: new Set<string>(ALL_GOALS),
  dietaryTags: new Set<string>(DIETARY_TAGS),
}
const KNOWN_SWAP_GROUPS: ReadonlySet<string> = new Set<string>(SWAP_GROUPS)

export function offersFor(product: CatalogueProduct, suggestion: Suggestion): Offer[] {
  const offers: Offer[] = []
  const tags = (field: 'stackSlots' | 'goals' | 'dietaryTags', current: readonly string[], defaultOn: boolean) => {
    if (current.length > 0) return
    for (const value of [...new Set(strings(suggestion[field]))].filter((v) => KNOWN[field].has(v))) {
      offers.push({ key: `${field}:${value}`, field, value, label: tagLabel(field, value), defaultOn })
    }
  }

  tags('stackSlots', product.stackSlots, true)
  tags('goals', product.goals, true)
  // Off until ticked: a wrong dietary tag sells somebody something they cannot
  // take, and a model reading a title is not the label on the tub.
  tags('dietaryTags', product.dietaryTags, false)

  const swap = suggestion.swapGroup
  if (
    (!product.swapGroup || product.swapGroup === 'general') &&
    typeof swap === 'string' &&
    swap !== 'general' &&
    KNOWN_SWAP_GROUPS.has(swap)
  ) {
    offers.push({ key: 'swapGroup', field: 'swapGroup', value: swap, label: swapGroupLabel(swap), defaultOn: true })
  }

  const short = suggestion.shortName
  if (!product.shortName?.trim() && typeof short === 'string' && short.trim()) {
    offers.push({ key: 'shortName', field: 'shortName', value: short.trim(), label: `“${short.trim()}”`, defaultOn: true })
  }

  // Only ever towards "yes": a stimulant warning that is missing is the
  // dangerous direction, and a model saying "no caffeine" is not evidence.
  if (suggestion.hasStimulants === true && !product.hasStimulants) {
    offers.push({ key: 'hasStimulants', field: 'hasStimulants', value: true, label: 'Contains stimulants', defaultOn: true })
  }

  const basis = suggestion.recommendationBasis
  if (!product.recommendationBasis && (basis === 'objective' || basis === 'subjective')) {
    offers.push({
      key: 'recommendationBasis',
      field: 'recommendationBasis',
      value: basis,
      label: basis === 'subjective' ? 'Judge it by how it feels' : 'Judge it by need, not feel',
      defaultOn: true,
    })
  }

  // Not a blank — the product has an answer already — so offered unticked:
  // whether something is sold monthly is a decision, not a gap.
  const sub = suggestion.subscriptionEligible
  if (typeof sub === 'boolean' && sub !== product.subscriptionEligible) {
    offers.push({
      key: 'subscriptionEligible',
      field: 'subscriptionEligible',
      value: sub,
      label: sub ? 'Offer it on subscription' : 'One-off only, not on subscription',
      defaultOn: false,
    })
  }

  return offers
}

/** The `set` for `POST /api/portal/products`, from the offers left ticked. */
export function setFor(offers: Offer[], on: (offer: Offer) => boolean): Record<string, unknown> {
  const set: Record<string, unknown> = {}
  for (const offer of offers) {
    if (!on(offer)) continue
    if (LIST_FIELDS.includes(offer.field)) {
      const list = (set[offer.field] as string[] | undefined) ?? []
      set[offer.field] = [...list, offer.value as string]
    } else {
      set[offer.field] = offer.value
    }
  }
  return set
}
