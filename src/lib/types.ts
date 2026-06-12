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

/** Goals that imply a training/performance context — used to decide whether
 *  protein/creatine slots are required in the stack. */
export const PERFORMANCE_GOALS: Goal[] = [
  'muscle', 'energy', 'performance', 'hydration', 'recovery', 'cutting', 'bulking',
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

export interface QuizAnswers {
  name: string
  /** Which quiz track the user chose on the goal step */
  track: QuizTrack | null
  ageBracket: AgeBracket | null
  exactAge: number | null
  gender: Gender | null
  goals: Goal[]
  trainingFrequency: TrainingFrequency | null
  trainingType: TrainingType | null
  lifestyle: string[]
  diet: DietLevel | null
  currentSupplements: string[]
  currentVitamins: string[]
  preferredFormats: string[]
  /** Answers to wellbeing follow-up questions, keyed by question id
   *  (sleepQuality, stressPattern, immuneBaseline, collagenOk) */
  wellbeingAnswers: Record<string, string>
  caffeineLevel: CaffeineLevel | null
  budget: Budget | null
  stackPreference: StackPreference | null
  trainingExperience: TrainingExperience | null
  trainingFocus: string | null
  stimPreference: StimPreference | null
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
