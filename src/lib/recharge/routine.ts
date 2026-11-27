/**
 * How someone uses their plan, and every product's rhythm worked out from it.
 *
 * How long a product lasts depends on how it's taken: a vitamin a day, a
 * pre-workout on each training day, protein by body weight, a sleep aid when
 * it's needed, and how much each time. `sizeConsumption` has always done that
 * sum; what it was missing was the person. A quiz plan had their answers at
 * checkout and lost them after; a shop plan never had any, so it was sized for
 * an imaginary three-days-a-week trainer and said nothing about it; and a
 * product added in the hub was sized the same way, even for someone who had
 * told the quiz they train six days a week.
 *
 * So a plan keeps a routine (`PlanRoutine`): the quiz's answers where there are
 * some, otherwise our estimate from the label, said as an estimate, which the
 * member can refine. Every product's rhythm is worked out from it, and a change
 * to it re-times every product that follows it (`applyRoutine`), in one change
 * the member confirms. Pure.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers, TrainingFrequency, WeightBand } from '@/lib/types'
import {
  getPricingConfig,
  proteinWeightFactor,
  resolveConsumption,
  sizeConsumption,
  USAGE_SERVINGS_PER_OCCASION,
  type LineSizing,
  type PricingConfig,
  type UsageLevel,
} from '@/lib/stack-blueprint/pricing'
import type { MemberSubscription, MemberSubscriptionLine, PlanRoutine } from './types'
import { nextBoxCycle, withInterval } from './clock'
import { everyLabel, rhythmLabel } from '@/lib/hub/line-facts'

const round = (n: number) => Math.round(n * 100) / 100

/** Our estimate, for a plan nobody has told us about: the label's serving, about three training days a week. */
export const ESTIMATED_ROUTINE: PlanRoutine = { trainingFrequency: null, weightBand: null, source: 'estimate' }

export const TRAINING_CHOICES: { value: TrainingFrequency; label: string }[] = [
  { value: '1-2x', label: '1–2 days' },
  { value: '3-4x', label: '3–4 days' },
  { value: '5-6x', label: '5–6 days' },
  { value: 'daily', label: 'Every day' },
]

export const WEIGHT_CHOICES: { value: WeightBand; label: string }[] = [
  { value: 'under-60', label: 'Under 60kg' },
  { value: '60-75', label: '60–75kg' },
  { value: '75-90', label: '75–90kg' },
  { value: '90-105', label: '90–105kg' },
  { value: '105-plus', label: '105kg+' },
]

/** A plan's routine from the quiz's answers, or null when they say nothing about it. */
export function routineFromAnswers(answers: Partial<QuizAnswers> | null | undefined): PlanRoutine | null {
  if (!answers) return null
  const trainingFrequency = answers.trainingFrequency ?? null
  const weightBand = answers.weightBand ?? null
  const asNeeded = answers.asNeeded && Object.keys(answers.asNeeded).length > 0 ? { ...answers.asNeeded } : undefined
  if (!trainingFrequency && !weightBand && !asNeeded) return null
  return { trainingFrequency, weightBand, ...(asNeeded ? { asNeeded } : {}), source: 'answers' }
}

/** The routine as the sizing reads it. */
export function answersFor(routine: PlanRoutine | null | undefined): QuizAnswers | null {
  if (!routine) return null
  return { trainingFrequency: routine.trainingFrequency, weightBand: routine.weightBand, asNeeded: routine.asNeeded ?? {} } as unknown as QuizAnswers
}

/** A routine the member set, checked: only the choices on offer get in. */
export function cleanRoutine(raw: unknown): PlanRoutine | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<PlanRoutine>
  const training = TRAINING_CHOICES.some((c) => c.value === r.trainingFrequency) ? (r.trainingFrequency as TrainingFrequency) : null
  const weight = WEIGHT_CHOICES.some((c) => c.value === r.weightBand) ? (r.weightBand as WeightBand) : null
  const source = r.source === 'answers' || r.source === 'member' ? r.source : 'estimate'
  const asNeeded =
    r.asNeeded && typeof r.asNeeded === 'object'
      ? Object.fromEntries(Object.entries(r.asNeeded).filter(([, v]) => v === 'often' || v === 'sometimes' || v === 'rarely'))
      : undefined
  return { trainingFrequency: training, weightBand: weight, ...(asNeeded && Object.keys(asNeeded).length ? { asNeeded } : {}), source }
}

/** A product sized to a routine, at a usage level. */
export function sizeFor(product: CatalogueProduct, routine: PlanRoutine | null | undefined, usage: UsageLevel = 'standard', config: PricingConfig = getPricingConfig()): LineSizing {
  return sizeConsumption(product, answersFor(routine), config, usage)
}

/** The rhythm a routine gives `quantity` at a time: about when they'd run out, never past the cap. */
export function rhythmFor(lastsMonths: number, quantity: number, config: PricingConfig = getPricingConfig()): number {
  // Rounded down, as `sizeConsumption` does: never later than the run-out.
  return Math.min(config.maxDeliveryMonths, Math.max(1, Math.floor(Math.max(1, quantity) * lastsMonths * 100 + 1e-6) / 100))
}

// ─── Words ──────────────────────────────────────────────────────────────────

function servingNoun(product: CatalogueProduct, count: number): string {
  const powder = (product.formats ?? []).some((f) => f.toLowerCase().includes('powder'))
  const noun = powder ? 'scoop' : 'serving'
  return count > 1 ? `${noun}s` : noun
}

/** "½", "1", "1½", "¾": an amount people say. */
function amount(n: number): string {
  const quarters = Math.max(1, Math.round(n * 4))
  const whole = Math.floor(quarters / 4)
  const part = ['', '¼', '½', '¾'][quarters % 4]
  return whole === 0 ? part : `${whole}${part}`
}

const TRAINING_WORDS: Record<TrainingFrequency, string> = {
  '1-2x': '1–2 days a week',
  '3-4x': '3–4 days a week',
  '5-6x': '5–6 days a week',
  daily: 'every day',
}

/** How much they take each time, for this product and routine. */
export function servingsPerTime(product: CatalogueProduct, routine: PlanRoutine | null | undefined, usage: UsageLevel = 'standard'): number {
  return (USAGE_SERVINGS_PER_OCCASION[usage] ?? 1) * proteinWeightFactor(product, answersFor(routine))
}

/**
 * The estimate behind a product's rhythm, in words: "1 scoop each training day,
 * about 3 days a week (our estimate)", "1 serving a day", "1 serving when you
 * need it, sometimes".
 */
export function usageWords(product: CatalogueProduct, routine: PlanRoutine | null | undefined, usage: UsageLevel = 'standard'): string {
  const per = servingsPerTime(product, routine, usage)
  const each = `${amount(per)} ${servingNoun(product, per > 1 ? 2 : 1)}`
  const { cadence } = resolveConsumption(product)
  const c = product.consumption?.cadence ?? cadence
  const forWeight = routine?.weightBand && proteinWeightFactor(product, answersFor(routine)) !== 1 ? ' for your weight' : ''
  if (c === 'per-workout') {
    const days = routine?.trainingFrequency ? TRAINING_WORDS[routine.trainingFrequency] : 'about 3 days a week (our estimate)'
    return `${each} each training day, ${days}${forWeight}`
  }
  if (c === 'as-needed') {
    const trigger = product.consumption?.asNeededTrigger
    const often = (trigger && routine?.asNeeded?.[trigger]) || null
    return `${each} when you need it${often ? `, ${often}` : ', sometimes (our estimate)'}`
  }
  const daysPerWeek = product.consumption?.daysPerWeek ?? 7
  return daysPerWeek >= 7 ? `${each} a day${forWeight}` : `${each} ${daysPerWeek} days a week${forWeight}`
}

/** "about 3 training days a week (our estimate)": the routine in a line. */
export function routineWords(routine: PlanRoutine | null | undefined): string {
  const training = routine?.trainingFrequency ? `${TRAINING_WORDS[routine.trainingFrequency]} of training` : 'about 3 training days a week (our estimate)'
  const weight = routine?.weightBand ? WEIGHT_CHOICES.find((w) => w.value === routine.weightBand)?.label : null
  return weight ? `${training} · ${weight}` : training
}

/** Whether a plan has anything a routine changes: training-day, protein or when-needed products. */
export function routineMatters(products: readonly CatalogueProduct[]): boolean {
  return products.some((p) => {
    const c = p.consumption?.cadence ?? resolveConsumption(p).cadence
    return c !== 'daily' || p.stackSlots.includes('protein')
  })
}

// ─── Applying a routine ─────────────────────────────────────────────────────

/** One product's rhythm before and after a routine change. */
export interface RhythmChange {
  lineId: string
  title: string
  before: string
  after: string
}

/**
 * The plan re-timed to a routine: every product that follows the routine comes
 * as often, and as many at a time, as the routine says it's used, counted from
 * its last delivery (`withInterval`). Products the member chose a rhythm for
 * keep it (their "lasts" words still update). The price per delivery keeps each
 * line's own unit price, so a held price stays held; the plan saving is the
 * caller's (`withPlanRate`).
 */
export function applyRoutine(
  sub: MemberSubscription,
  routine: PlanRoutine,
  catalogue: readonly CatalogueProduct[],
  config: PricingConfig = getPricingConfig(),
  now: Date = new Date(),
): MemberSubscription {
  const next = nextBoxCycle(sub, now)
  const lines = sub.lines.map((line) => {
    const product = catalogue.find((p) => p.id === line.productId)
    if (!product) return line
    const sizing = sizeFor(product, routine, line.usageLevel ?? 'standard', config)
    if (line.rhythm === 'chosen') return { ...line, lastsMonths: sizing.monthsOneUnitLasts }
    const quantity = sizing.unitsPerShipment
    const unit = line.pricePerDelivery / Math.max(1, line.quantity)
    const timed = withInterval(line, sizing.shipEveryMonths, next)
    return { ...timed, quantity, pricePerDelivery: round(unit * quantity), lastsMonths: sizing.monthsOneUnitLasts, rhythm: 'routine' as const }
  })
  return {
    ...sub,
    routine: { ...routine, source: routine.source === 'answers' ? 'answers' : 'member' },
    lines,
    flatMonthly: round(lines.reduce((s, l) => s + l.pricePerDelivery / Math.max(1, l.deliveryIntervalMonths), 0)),
  }
}

/** What a routine change does to each product, for the review: only the ones that move. */
export function rhythmChanges(before: MemberSubscription, after: MemberSubscription): RhythmChange[] {
  return after.lines.flatMap((line) => {
    const was = before.lines.find((l) => l.id === line.id)
    if (!was) return []
    const from = rhythmLabel(was.quantity, was.deliveryIntervalMonths)
    const to = rhythmLabel(line.quantity, line.deliveryIntervalMonths)
    return from === to ? [] : [{ lineId: line.id, title: line.productTitle, before: from, after: to }]
  })
}

/** The rhythm a line would have following the routine, for the sheet's "matches how you use it" choice. */
export function routineRhythmFor(
  line: Pick<MemberSubscriptionLine, 'productId' | 'usageLevel'>,
  product: CatalogueProduct,
  routine: PlanRoutine | null | undefined,
  usage: UsageLevel = line.usageLevel ?? 'standard',
  config: PricingConfig = getPricingConfig(),
): { every: number; quantity: number; lastsMonths: number; label: string } {
  const sizing = sizeFor(product, routine, usage, config)
  return {
    every: sizing.shipEveryMonths,
    quantity: sizing.unitsPerShipment,
    lastsMonths: sizing.monthsOneUnitLasts,
    label: everyLabel(sizing.shipEveryMonths),
  }
}
