/**
 * Feedback + "keep vs change" recommendation engine.
 *
 * The core rule the brand cares about: some products are a NEED you won't feel
 * day to day (protein, creatine, vitamins) — never churn them on a mood. Others
 * are FELT (energy, sleep, recovery, digestion) — adjust those based on how the
 * member reports feeling over time. This is deterministic so it works offline;
 * an AI pass can later refine the wording via /api/personalise-stack.
 */

import type { CatalogueProduct, StackSlot } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'

export type RecommendationBasis = 'objective' | 'subjective'

export type FeedbackDimension = 'energy' | 'sleep' | 'recovery' | 'digestion' | 'stress'

export interface FeedbackCheckIn {
  id: string
  date: string
  /** 1 (poor) – 5 (great) per dimension the member rated. */
  ratings: Partial<Record<FeedbackDimension, number>>
  noticedImprovements: boolean
  notes?: string
}

/** Dimensions always offered on the check-in form. */
export const FEEDBACK_DIMENSIONS: FeedbackDimension[] = ['energy', 'sleep', 'recovery', 'digestion', 'stress']

export const DIMENSION_LABEL: Record<FeedbackDimension, string> = {
  energy: 'energy',
  sleep: 'sleep',
  recovery: 'recovery',
  digestion: 'digestion',
  stress: 'stress & mood',
}

// Slots whose benefit the customer actually FEELS.
const SUBJECTIVE_SLOTS: StackSlot[] = ['energy', 'sleep', 'recovery', 'gut', 'menopause']

export function basisForSlot(slot: StackSlot): RecommendationBasis {
  return SUBJECTIVE_SLOTS.includes(slot) ? 'subjective' : 'objective'
}

export function basisForProduct(product: CatalogueProduct): RecommendationBasis {
  if (product.recommendationBasis) return product.recommendationBasis
  return product.stackSlots.some((s) => SUBJECTIVE_SLOTS.includes(s)) ? 'subjective' : 'objective'
}

/** The feedback dimension a slot maps to, if any. */
export function dimensionForSlot(slot: StackSlot): FeedbackDimension | null {
  switch (slot) {
    case 'energy': return 'energy'
    case 'sleep': return 'sleep'
    case 'recovery': return 'recovery'
    case 'gut': return 'digestion'
    default: return null
  }
}

export interface LineRecommendation {
  lineId: string
  productTitle: string
  slotTitle: string
  basis: RecommendationBasis
  action: 'keep' | 'consider-change'
  reason: string
}

function objectiveReason(slot: StackSlot, productTitle: string): string {
  switch (slot) {
    case 'protein':
    case 'vegan-support':
      return `Protein is about hitting your daily target, not how you feel day to day — keep ${productTitle}.`
    case 'performance':
      return `Creatine builds up over time and works whether or not you feel it — keep taking it daily.`
    case 'hydration':
      return `A training-day essential for hydration and cramp prevention — keep ${productTitle}.`
    case 'health':
      return `Covers daily nutritional gaps you won't necessarily feel — keep ${productTitle}.`
    default:
      return `A daily essential — keep ${productTitle}.`
  }
}

function ratingsFor(history: FeedbackCheckIn[], dim: FeedbackDimension): number[] {
  return history.map((c) => c.ratings[dim]).filter((r): r is number => typeof r === 'number')
}

/**
 * Per-line keep-vs-change advice. Objective products are always kept (with a
 * reason that explains why feelings don't apply). Subjective products are judged
 * on the trend of the relevant feedback dimension.
 */
export function recommendForSubscription(
  sub: MemberSubscription,
  history: FeedbackCheckIn[],
  catalogue: CatalogueProduct[],
): LineRecommendation[] {
  return sub.lines.map((line) => {
    const product = catalogue.find((p) => p.id === line.productId)
    const basis = product ? basisForProduct(product) : basisForSlot(line.stackSlot)
    const base = { lineId: line.id, productTitle: line.productTitle, slotTitle: line.slotTitle, basis }

    if (basis === 'objective') {
      return { ...base, action: 'keep' as const, reason: objectiveReason(line.stackSlot, line.productTitle) }
    }

    const dim = dimensionForSlot(line.stackSlot)
    const ratings = dim ? ratingsFor(history, dim) : []
    const label = dim ? DIMENSION_LABEL[dim] : 'how you feel'

    if (ratings.length === 0) {
      return { ...base, action: 'keep' as const, reason: `Log how your ${label} is going and we'll tell you whether to keep or change ${line.productTitle}.` }
    }

    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length
    const improving = ratings.length >= 2 && ratings[ratings.length - 1] > ratings[0]

    if (avg <= 2.5) {
      return { ...base, action: 'consider-change' as const, reason: `Your ${label} hasn't improved much — it could be worth trying a different ${line.slotTitle.toLowerCase()}.` }
    }
    if (improving) {
      return { ...base, action: 'keep' as const, reason: `Your ${label} is trending up — ${line.productTitle} is working. Keep it.` }
    }
    return { ...base, action: 'keep' as const, reason: `Your ${label} is in good shape — keep ${line.productTitle}.` }
  })
}
