/**
 * Feedback + "keep vs change" recommendation engine.
 *
 * The core rule the brand cares about: some products are a NEED you won't feel
 * day to day (protein, creatine, vitamins) — never churn them on a mood. Others
 * are FELT (energy, sleep, recovery, digestion) — adjust those based on how the
 * member reports feeling over time. This is deterministic so it works offline;
 * an AI pass can later refine the wording via /api/personalise-stack.
 */

import type { CatalogueProduct, StackSlot, EffectOnset } from '@/lib/catalogue/types'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'

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

// ─── Effect onset — WHEN a benefit becomes noticeable ─────────────────────────
// This is what makes the check-in feel intelligent: a slow-build product (vitamin
// C, omega-3) is never judged "not working" before its onset window, and an
// immediate product (pre-workout) is reviewed straight away.

/** Default onset derived from a slot when a product doesn't set one explicitly. */
export function onsetForSlot(slot: StackSlot): EffectOnset {
  switch (slot) {
    case 'energy':
    case 'hydration':
      return 'immediate'
    case 'sleep':
    case 'recovery':
    case 'gut':
      return 'short'
    case 'health':
    case 'menopause':
      return 'long'
    case 'protein':
    case 'performance':
    case 'vegan-support':
      return 'none'
    default:
      return 'short'
  }
}

export function effectOnsetForProduct(product: CatalogueProduct): EffectOnset {
  if (product.effectOnset) return product.effectOnset
  return onsetForSlot(product.stackSlots[0])
}

/** How long before a product's benefit should be noticeable, in days. */
export function onsetWindowDays(onset: EffectOnset): number {
  switch (onset) {
    case 'immediate': return 0
    case 'short': return 21   // ~3 weeks
    case 'long': return 42    // ~6 weeks
    case 'none': return Infinity // never consciously felt
  }
}

/** Human label for an onset window, e.g. "a few weeks". */
export function onsetWindowLabel(onset: EffectOnset): string {
  switch (onset) {
    case 'immediate': return 'right away'
    case 'short': return 'within a few weeks'
    case 'long': return 'over the first couple of months'
    case 'none': return 'quietly in the background'
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** How long a line has been in the stack, in days. */
export function lineTenureDays(line: MemberSubscriptionLine, now: Date = new Date()): number {
  const added = new Date(line.addedAt)
  if (Number.isNaN(added.getTime())) return Infinity // legacy lines → treat as established
  return Math.max(0, Math.floor((now.getTime() - added.getTime()) / DAY_MS))
}

/**
 * Where a line sits in its feedback journey:
 * - `unfelt`    — a need you won't consciously feel (protein, creatine). Keep.
 * - `too-early` — still inside its onset window; set expectations, don't judge.
 * - `working`   — past its window and the member feels good / improving. Keep.
 * - `review`    — past its window and the relevant feeling stayed low. The ONLY
 *                 phase that suggests a change.
 * - `check`     — past its window but no feedback logged yet → prompt a check-in.
 */
export type LinePhase = 'unfelt' | 'too-early' | 'working' | 'review' | 'check'

/** Member-facing status tone — drives colour/grouping in the hub. */
export type StatusTone = 'good' | 'building' | 'essential' | 'review'

export interface LineStatus {
  /** Plain, benefit-led label, e.g. "Felt & working", "Building energy · wk 2 of 3". */
  statusLabel: string
  statusIcon: string
  statusTone: StatusTone
  /** Set for building items so the UI can show a progress ring. */
  progress?: { weeksElapsed: number; weeksTotal: number; pct: number }
}

export interface LineRecommendation extends LineStatus {
  lineId: string
  productTitle: string
  slotTitle: string
  basis: RecommendationBasis
  onset: EffectOnset
  phase: LinePhase
  /** Days until the benefit should become noticeable (0 once past the window). */
  daysUntilFelt: number
  reason: string
}

/** The plain-English benefit a slot delivers — used in status copy. */
export function benefitLabel(slot: StackSlot): string {
  switch (slot) {
    case 'energy': return 'energy'
    case 'sleep': return 'sleep quality'
    case 'recovery': return 'recovery'
    case 'gut': return 'digestion'
    case 'health': return 'long-term health'
    case 'performance': return 'strength'
    case 'protein': return 'muscle'
    case 'hydration': return 'hydration'
    case 'menopause': return 'balance'
    case 'vegan-support': return 'nutrition'
    default: return 'results'
  }
}

/** Turn a phase + timing into a clear, member-facing status (no jargon, no catch-alls). */
export function deriveStatus(
  phase: LinePhase,
  onset: EffectOnset,
  slot: StackSlot,
  tenureDays: number,
  windowDays: number,
): LineStatus {
  switch (phase) {
    case 'review':
      return { statusLabel: "Not landing — let's adjust", statusIcon: '⚠', statusTone: 'review' }
    case 'unfelt':
      return { statusLabel: 'Daily essential', statusIcon: '✓', statusTone: 'essential' }
    case 'too-early': {
      const weeksTotal = Math.max(1, Math.round(windowDays / 7))
      const weeksElapsed = Math.min(weeksTotal, Math.floor(tenureDays / 7))
      const pct = windowDays > 0 ? Math.min(1, tenureDays / windowDays) : 1
      return {
        statusLabel: `Building ${benefitLabel(slot)} · wk ${weeksElapsed} of ${weeksTotal}`,
        statusIcon: '↗',
        statusTone: 'building',
        progress: { weeksElapsed, weeksTotal, pct },
      }
    }
    case 'check':
      return { statusLabel: 'Tell us how it’s going', statusIcon: '◔', statusTone: 'building' }
    case 'working':
      // A long-onset product is felt only faintly — don't overclaim it.
      return onset === 'long'
        ? { statusLabel: 'Working quietly · long-term', statusIcon: '🌱', statusTone: 'essential' }
        : { statusLabel: 'Felt & working', statusIcon: '⚡', statusTone: 'good' }
  }
}

/** Back-compat helper: the only phase that prompts a product change. */
export function isReview(rec: LineRecommendation): boolean {
  return rec.phase === 'review'
}

// ─── Guided product change ───────────────────────────────────────────────────

export type ChangeReason = 'not-working' | 'side-effects' | 'vegan' | 'cheaper' | 'exploring'

export const CHANGE_REASONS: { id: ChangeReason; label: string }[] = [
  { id: 'not-working', label: "I'm not feeling the benefit" },
  { id: 'side-effects', label: 'Side effects / too strong' },
  { id: 'vegan', label: 'I want a vegan option' },
  { id: 'cheaper', label: 'I want lower cost' },
  { id: 'exploring', label: 'Just exploring options' },
]

/**
 * Expert-style replacement ranking: same-slot, subscribable products, ranked for
 * the member's stated reason. Returns the best matches first.
 */
export function recommendReplacements(
  line: MemberSubscriptionLine,
  reason: ChangeReason,
  catalogue: CatalogueProduct[],
): CatalogueProduct[] {
  const candidates = catalogue.filter(
    (p) => p.stackSlots.includes(line.stackSlot) && p.id !== line.productId && !p.isSubscriptionOnly && p.subscriptionEligible,
  )
  const byPriority = (a: CatalogueProduct, b: CatalogueProduct) => b.recommendationPriority - a.recommendationPriority

  switch (reason) {
    case 'vegan':
      return candidates.filter((p) => p.dietaryTags.includes('vegan')).sort(byPriority)
    case 'cheaper':
      return [...candidates].sort((a, b) => a.basePrice - b.basePrice || byPriority(a, b))
    case 'side-effects':
      // Gentler first: stim-free, fewer warnings.
      return [...candidates].sort(
        (a, b) =>
          Number(a.hasStimulants) - Number(b.hasStimulants) ||
          a.warnings.length - b.warnings.length ||
          byPriority(a, b),
      )
    case 'not-working':
      // A genuinely different option first: different mechanism (swap group), then strength.
      return [...candidates].sort(
        (a, b) =>
          Number(a.swapGroup === line.swapGroup) - Number(b.swapGroup === line.swapGroup) || byPriority(a, b),
      )
    default:
      return [...candidates].sort(byPriority)
  }
}

/** One-line rationale for why an alternative suits the stated reason. */
export function replacementRationale(product: CatalogueProduct, reason: ChangeReason): string {
  switch (reason) {
    case 'vegan':
      return 'Fully plant-based'
    case 'cheaper':
      return 'Lower cost option'
    case 'side-effects':
      return product.hasStimulants ? 'Similar formula' : 'Gentler, stimulant-free'
    case 'not-working':
      return 'A different approach to try'
    default:
      return product.recommendationPriority >= 9 ? 'Premium pick' : 'Popular choice'
  }
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

function tooEarlyReason(productTitle: string, onset: EffectOnset, daysUntilFelt: number): string {
  const weeks = Math.max(1, Math.round(daysUntilFelt / 7))
  if (onset === 'long') {
    return `${productTitle} works ${onsetWindowLabel(onset)} — you won't necessarily feel it, and that's normal. Give it ~${weeks} more ${weeks === 1 ? 'week' : 'weeks'} before judging.`
  }
  return `Give ${productTitle} ~${weeks} more ${weeks === 1 ? 'week' : 'weeks'} to kick in — we'll start checking how you feel then.`
}

/**
 * Per-line advice, now onset- and tenure-aware. A line is only ever flagged for
 * review once it's PAST its onset window AND the matching feeling has stayed low —
 * so slow-build products are never churned before they've had a fair chance.
 */
export function recommendForSubscription(
  sub: MemberSubscription,
  history: FeedbackCheckIn[],
  catalogue: CatalogueProduct[],
  now: Date = new Date(),
): LineRecommendation[] {
  return sub.lines.map((line) => {
    const product = catalogue.find((p) => p.id === line.productId)
    const basis = product ? basisForProduct(product) : basisForSlot(line.stackSlot)
    const onset = product ? effectOnsetForProduct(product) : onsetForSlot(line.stackSlot)
    const window = onsetWindowDays(onset)
    const tenure = lineTenureDays(line, now)
    const daysUntilFelt = Number.isFinite(window) ? Math.max(0, window - tenure) : 0
    const dim = dimensionForSlot(line.stackSlot)

    // Decide the phase + member-facing reason.
    let phase: LinePhase
    let reason: string
    if (onset === 'none') {
      phase = 'unfelt'
      reason = objectiveReason(line.stackSlot, line.productTitle)
    } else if (tenure < window) {
      phase = 'too-early'
      reason = tooEarlyReason(line.productTitle, onset, daysUntilFelt)
    } else if (!dim) {
      phase = 'working'
      reason = `${line.productTitle} is doing its job ${onsetWindowLabel(onset)} — keep it.`
    } else {
      const label = DIMENSION_LABEL[dim]
      const ratings = ratingsFor(history, dim)
      if (ratings.length === 0) {
        phase = 'check'
        reason = `${line.productTitle} has had time to kick in — tell us how your ${label} is and we'll know if it's working.`
      } else {
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length
        const improving = ratings.length >= 2 && ratings[ratings.length - 1] > ratings[0]
        if (avg <= 2.5) {
          phase = 'review'
          reason = `Your ${label} hasn't improved much — it could be worth trying a different ${line.slotTitle.toLowerCase()}.`
        } else {
          phase = 'working'
          reason = improving
            ? `Your ${label} is trending up — ${line.productTitle} is working. Keep it.`
            : `Your ${label} is in good shape — keep ${line.productTitle}.`
        }
      }
    }

    const status = deriveStatus(phase, onset, line.stackSlot, tenure, Number.isFinite(window) ? window : 0)
    return {
      lineId: line.id,
      productTitle: line.productTitle,
      slotTitle: line.slotTitle,
      basis,
      onset,
      daysUntilFelt,
      phase,
      reason,
      ...status,
    }
  })
}

// ─── Adaptive check-in builder ────────────────────────────────────────────────
// The check-in only asks about dimensions the CURRENT stack actually targets and
// that are PAST their onset window. Slow-build / unfelt lines become expectation
// cards instead of questions — so members are never asked to rate something that
// can't be felt yet.

export interface CheckInQuestion {
  dimension: FeedbackDimension
  label: string
  /** The question copy, framed for immediate vs sustained effects. */
  prompt: string
  /** True when at least one targeting product is felt the same session (e.g. pre-workout). */
  immediate: boolean
  /** Lines this question covers. */
  lineIds: string[]
}

export interface CheckInExpectation {
  lineId: string
  productTitle: string
  onset: EffectOnset
  daysUntilFelt: number
  message: string
}

export interface CheckInPlan {
  questions: CheckInQuestion[]
  /** Still-building / unfelt lines — shown as reassurance, not asked about. */
  expectations: CheckInExpectation[]
}

/** Build the adaptive check-in for a subscription's current stack. */
export function buildCheckInQuestions(
  sub: MemberSubscription,
  catalogue: CatalogueProduct[],
  now: Date = new Date(),
): CheckInPlan {
  const byDimension = new Map<FeedbackDimension, { lineIds: string[]; immediate: boolean }>()
  const expectations: CheckInExpectation[] = []

  for (const line of sub.lines) {
    const product = catalogue.find((p) => p.id === line.productId)
    const onset = product ? effectOnsetForProduct(product) : onsetForSlot(line.stackSlot)
    const window = onsetWindowDays(onset)
    const tenure = lineTenureDays(line, now)
    const dim = dimensionForSlot(line.stackSlot)

    // Past its window AND trackable → ask about it.
    if (dim && tenure >= window && onset !== 'none') {
      const entry = byDimension.get(dim) ?? { lineIds: [], immediate: false }
      entry.lineIds.push(line.id)
      if (onset === 'immediate') entry.immediate = true
      byDimension.set(dim, entry)
      continue
    }

    // Otherwise it's reassurance: still building, or works in the background.
    if (onset === 'none') {
      expectations.push({ lineId: line.id, productTitle: line.productTitle, onset, daysUntilFelt: 0, message: `${line.productTitle} works ${onsetWindowLabel(onset)} — no need to "feel" it.` })
    } else if (tenure < window) {
      const daysUntilFelt = Math.max(0, window - tenure)
      expectations.push({ lineId: line.id, productTitle: line.productTitle, onset, daysUntilFelt, message: tooEarlyReason(line.productTitle, onset, daysUntilFelt) })
    }
  }

  const questions: CheckInQuestion[] = [...byDimension.entries()].map(([dimension, { lineIds, immediate }]) => ({
    dimension,
    label: DIMENSION_LABEL[dimension],
    immediate,
    lineIds,
    prompt: immediate
      ? `How did your last few sessions feel for ${DIMENSION_LABEL[dimension]}?`
      : `How's your ${DIMENSION_LABEL[dimension]} been lately?`,
  }))

  return { questions, expectations }
}
