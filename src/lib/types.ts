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
 * CHRGD LQD — how many drinks a day the customer wants to sip. Not a dose or a
 * schedule: it's the pace they'll get through the month's box at, which the LQD
 * logic reconciles against a fixed monthly pool (see `buildLqdPlan`). '4' means
 * "4 or more". Only asked in drinks mode.
 */
export type DrinksPerDay = 1 | 2 | 3 | 4

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

export interface QuizAnswers {
  name: string
  /** Which quiz track the user chose on the goal step */
  track: QuizTrack | null
  /**
   * CHRGD LQD — the all-drinks package. When true the stack is built only from
   * drinkable products (powders/RTDs), framed as a monthly pool of drinks to
   * mix whenever, rather than a daily regimen. Chosen on the opening screen
   * alongside the track; the track still shapes goals and questions.
   * Optional so answers saved before the feature existed stay valid.
   */
  drinksMode?: boolean
  /**
   * CHRGD LQD — the pace the customer wants to drink at (drinks/day). Feeds the
   * "month of drinks, sipped at your rate" logic on the review, not the dose.
   * Optional so answers saved before the feature existed stay valid.
   */
  drinksPerDay?: DrinksPerDay | null
  ageBracket: AgeBracket | null
  exactAge: number | null
  gender: Gender | null
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
  preferredFormats: string[]
  /** Answers to wellbeing follow-up questions, keyed by question id
   *  (sleepQuality, stressPattern, immuneBaseline, collagenOk) */
  wellbeingAnswers: Record<string, string>
  /** Answers to the AI-generated deep-dive follow-ups, keyed by question id.
   *  Optional — older sessions and API payloads may not carry it. */
  dynamicAnswers?: Record<string, DynamicAnswer>
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
  id: string           // Shopify GID e.g. gid://shopify/ProductVariant/123
  title: string        // e.g. "Chocolate Fudge / 500g"
  price: number
  compareAtPrice: number | null
  availableForSale: boolean
  image: string | null
}

export interface Product {
  id: string                  // internal slug (Shopify handle)
  shopifyProductId: string    // Shopify GID
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
  shopifyVariantId: string    // default variant ID
  accentColor: string
  image: string | null
  variants: ProductVariant[]
}

export interface RecommendedStack {
  core: Product[]
  upgrades: Product[]
  excluded: Array<{ category: string; reason: string }>
}
