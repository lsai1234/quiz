import type { AsNeededTrigger, SafetyFlag } from '@/lib/catalogue/types'
import type { DriverWeights } from '@/lib/quiz-v2/drivers'
export type { SafetyFlag } from '@/lib/catalogue/types'

/**
 * Bodyweight band (optional) — scales weight-sensitive dosing, chiefly protein
 * servings/day (heavier → more per day → tighter cadence). Asked as bands, never
 * an exact figure. Null when not provided.
 */
export type WeightBand = 'under-60' | '60-75' | '75-90' | '90-105' | '105-plus'

export type AgeBracket = '16-24' | '25-34' | '35-44' | '45+'
export type Gender = 'male' | 'female' | 'nonbinary' | 'not-specified'

export type Goal =
  | 'muscle'
  | 'energy'
  | 'performance'
  | 'hydration'
  | 'recovery'
  | 'health'
  | 'cutting'
  | 'bulking'
  // Everyday wellbeing goals
  | 'sleep-better'
  | 'less-stress'
  | 'focus'
  | 'immune'
  | 'skin-hair-nails'
  | 'menopause'
  | 'gut-health'

/** Goals that imply a training/performance context — used to decide whether
 *  protein/creatine slots are required in the stack. */
export const PERFORMANCE_GOALS: Goal[] = [
  'muscle', 'energy', 'performance', 'hydration', 'recovery', 'cutting', 'bulking',
]

/** Every goal the quiz can recommend — used for catalogue coverage checks. */
export const ALL_GOALS: Goal[] = [
  'muscle', 'energy', 'performance', 'hydration', 'recovery', 'health', 'cutting', 'bulking',
  'sleep-better', 'less-stress', 'focus', 'immune', 'skin-hair-nails', 'menopause', 'gut-health',
]

export type TrainingFrequency = '1-2x' | '3-4x' | '5-6x' | 'daily'
export type TrainingType = 'strength' | 'cardio' | 'hiit' | 'sport' | 'mixed'
export type DietLevel = 'clean' | 'mostly-good' | 'inconsistent' | 'poor'
export type CaffeineLevel = 'none' | 'low' | 'medium' | 'high'
export type Budget = 'under-30' | '30-50' | '50-80' | '80-plus'
export type StackPreference = 'simple' | 'balanced' | 'complete'
export type StackLevel = 'essentials' | 'performance' | 'complete'
export type TrainingExperience = 'new' | 'intermediate' | 'experienced'
export type StimPreference = 'yes' | 'no'

export type QuizTrack = 'performance' | 'wellbeing'

/**
 * How often an as-needed trigger applies to the customer — sets the monthly
 * allowance for as-needed products in the plan (often ≈ 4/wk, sometimes ≈ 2,
 * rarely ≈ 1).
 */
export type AsNeededFrequency = 'often' | 'sometimes' | 'rarely'

/** One answered AI deep-dive follow-up. Stores the display text alongside the
 *  engine signals so the Q&A can travel with the answers object into the AI
 *  prompts (personalise-stack / generate-identity) and the review screen. */
export interface DynamicAnswer {
  /** Chosen option id — selection state for re-rendering the step. */
  optionId: string
  /** The question as shown to the user. */
  question: string
  /** The chosen option's label as shown to the user. */
  answer: string
  /** Whitelisted lifestyle signal tags implied by the chosen option. */
  signals: string[]
}

/**
 * A member's explicit agreement to the health-data notice, as the browser
 * captured it.
 *
 * The version is echoed so the server can re-render and hash the exact document
 * that was displayed, the same way `lib/legal/consent.ts` handles the checkout
 * documents — the client says "yes, and this is what I was shown", never "yes,
 * to these terms which I will now describe".
 */
export interface HealthDataConsent {
  accepted: true
  version: string
  /** ISO timestamp of the tick, so the record reflects when it actually happened. */
  at: string
}

export interface QuizAnswers {
  name: string
  /** Which quiz track the user chose on the goal step */
  track: QuizTrack | null
  /**
   * The goal that matters MOST — a single pick on the goals step. Leans sizing
   * toward this goal's products (protected in sizing). Optional so older saved
   * answers stay valid; falls back to the first of `goals` when unset.
   */
  primaryGoal?: Goal | null
  /**
   * How often as-needed triggers apply (sweat, sleep, run-down…), used to size
   * the as-needed pool. Only `sweat` is asked directly; the rest
   * are inferred from goals + lifestyle. Optional/partial.
   */
  asNeeded?: Partial<Record<AsNeededTrigger, AsNeededFrequency>>
  ageBracket: AgeBracket | null
  exactAge: number | null
  gender: Gender | null
  /**
   * Safety-screen flags the user ticked (pregnancy/breastfeeding, medication).
   * Products contraindicated against any ticked flag are hard-removed from the
   * recommendation. Optional so answers saved before the screen existed stay valid.
   *
   * These are special category data under Article 9. They are only ever
   * collected once `healthDataConsent` has been given — the safety screen does
   * not render its options until then.
   */
  safetyFlags?: SafetyFlag[]
  /**
   * Explicit consent to process the safety-screen answers, captured on that
   * screen before a single flag is offered.
   *
   * Its own record rather than a bit on the checkout tick, because Article
   * 9(2)(a) consent must be specific and separable: bundled into a subscription
   * agreement, someone who wants the plan has no way to refuse the health
   * processing. Null or absent means no consent, which means `safetyFlags` must
   * be empty — `sanitiseHealthData` enforces that server-side rather than
   * trusting the client to have done it.
   */
  healthDataConsent?: HealthDataConsent | null
  /** Bodyweight band for weight-sensitive dosing (protein). Optional. */
  weightBand?: WeightBand | null
  /**
   * The protein check (quiz v2 only) — daily target and estimated intake, in
   * grams. See `docs/QUIZ_V2_PROTEIN.md`.
   *
   * Both optional, and absent for every v1 answer and everything saved before
   * the module existed. Absence is what keeps v1's output byte-identical, the
   * same property that made `drivers` safe to add.
   *
   * Both ends of the target are stored, and the distinction is load-bearing:
   * a gap is measured from the FLOOR (someone at the bottom of a 130–180g range
   * is not short), and "already over" is measured from the CEILING. Keying both
   * off one figure would have the engine removing protein from the box of
   * someone the same screen had just told was on the money.
   *
   * Storing the range rather than a profile also means the recap and the reveal
   * can show the same numbers the quiz showed, from `answers` alone.
   */
  proteinTargetG?: number | null
  proteinTargetHighG?: number | null
  proteinIntakeG?: number | null
  goals: Goal[]
  /**
   * "Already taking" items the user still wants in the stack — the follow-up
   * on the supps step ("keep my own" vs "include CHRGD's to try"). Items here
   * bypass the already-taking exclusion in scoreProduct. Optional so answers
   * saved before the feature existed stay valid (default: skip, as before).
   */
  tryOurs?: string[]
  trainingFrequency: TrainingFrequency | null
  /** Training styles — multi-select (Weights, Cardio, HIIT, Sport, Mixed). */
  trainingType: TrainingType[]
  lifestyle: string[]
  diet: DietLevel | null
  currentSupplements: string[]
  currentVitamins: string[]
  /** Answers to wellbeing follow-up questions, keyed by question id
   *  (sleepQuality, stressPattern, immuneBaseline, collagenOk) */
  wellbeingAnswers: Record<string, string>
  /** Answers to the AI-generated deep-dive follow-ups, keyed by question id.
   *  Optional — older sessions and API payloads may not carry it. */
  dynamicAnswers?: Record<string, DynamicAnswer>
  /**
   * Root causes the v2 adaptive interview settled on, with confidence 0–1.
   *
   * Optional and absent everywhere else: v1 answers, API payloads and anything
   * saved before v2 existed have no drivers, and `DRIVER_AFFINITY` contributes
   * exactly zero without them. That is deliberate — it is what lets both quizzes
   * run against one engine with byte-identical output for v1.
   */
  drivers?: DriverWeights
  caffeineLevel: CaffeineLevel | null
  budget: Budget | null
  stackPreference: StackPreference | null
  trainingExperience: TrainingExperience | null
  trainingFocus: string | null
  stimPreference: StimPreference | null
  trainingTime: 'morning' | 'lunchtime' | 'evening' | 'varies' | null
}

export interface StackIdentity {
  name: string
  archetype: string
  description: string
  focusAreas: string[]
  routineFitScore: number
}

export interface ProductVariant {
  id: string           // catalogue variant id
  title: string        // e.g. "Chocolate Fudge / 500g"
  price: number
  compareAtPrice: number | null
  availableForSale: boolean
  image: string | null
}

export interface Product {
  id: string                  // internal slug
  handle: string
  name: string
  category: string
  subcategory: string
  price: number               // default variant price
  description: string
  safeWording: string
  goalTags: Goal[]
  stimulant: boolean
  vegan: boolean
  beginner: boolean
  stackPriority: number
  stackLevels: StackLevel[]
  variantId: string    // default variant ID
  accentColor: string
  image: string | null
  variants: ProductVariant[]
}

export interface RecommendedStack {
  core: Product[]
  upgrades: Product[]
  excluded: Array<{ category: string; reason: string }>
}
