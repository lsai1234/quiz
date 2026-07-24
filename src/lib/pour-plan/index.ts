/**
 * The Pour Plan sizing engine (Phase 2).
 *
 * Turns a set of selected drinkable products + the customer's answers into a
 * right-sized, bucketed plan: each drink is sized to HOW IT'S CONSUMED (its
 * rhythm), the box is tuned for the customer's pace + variety, and the result is
 * grouped by WHEN (every day / around training / when you need it) with a
 * protocol note per drink.
 *
 * Pure and side-effect free. Sizing is need-driven, appetite-tuned, and no drink
 * is ever oversupplied (each is capped at its own rhythm). See
 * docs/POUR_PLAN_SPEC.md. Pricing, the review UI and checkout wiring come later.
 */
import type { CatalogueProduct, ConsumptionCadence, PourAnchor } from '@/lib/catalogue/types'
import type { QuizAnswers, DrinkVariety, Goal } from '@/lib/types'
import { resolveConsumption, occasionsPerMonthFor, paceDailyFactor, PACE_DAILY_FLOOR } from '@/lib/stack-blueprint/pricing'

const WEEKS_PER_MONTH = 4.345
const DAYS_PER_MONTH = 30
const DEFAULT_PACE = 2
const MIN_KINDS = 3

export type PourWhen = 'everyday' | 'training' | 'asNeeded'

export interface PourLine {
  productId: string
  variantId: string
  title: string
  cadence: ConsumptionCadence
  when: PourWhen
  /** Occasions per month = drinks of this kind in the box. Capped at its rhythm. */
  monthlyCount: number
  /** Servings in one physical pack (for the one-off "lasts ~N weeks" maths). */
  servingsPerUnit: number
  /** How long one pack lasts at this cadence, in whole weeks (one-off framing). */
  oneOffLastsWeeks: number
  /** Guidance on when to drink it (not a rigid schedule). */
  protocolNote: string
  swapGroup: string
  /** Claim-safe reason it's in the plan, for trust. */
  goalReason: string
  /** True when it serves the customer's #1 goal (protected from trimming). */
  isPrimary: boolean
}

export interface PourBucket {
  when: PourWhen
  label: string
  lines: PourLine[]
  total: number
}

export interface PourPlan {
  totalDrinks: number
  /** ~drinks a day the customer chose. */
  dailyPace: number
  variety: DrinkVariety
  kinds: number
  buckets: PourBucket[]
}

const BUCKET_LABEL: Record<PourWhen, string> = {
  everyday: 'Every day',
  training: 'Around training',
  asNeeded: 'When you need it',
}

const ANCHOR_NOTE: Record<PourAnchor, string> = {
  morning: 'with breakfast',
  midday: 'around midday',
  evening: 'in the evening',
  'pre-workout': '20 min before you train',
  'post-workout': 'straight after training',
  'hot-days': 'on hot or heavy-sweat days',
  'wind-down': 'on the evenings you want to wind down',
  'run-down': 'when you feel run-down',
}

const CADENCE_FALLBACK_NOTE: Record<ConsumptionCadence, string> = {
  daily: 'most days',
  'per-workout': 'on training days',
  'as-needed': 'when you need it',
}

/** The daily pace: the new dailyDrinks answer, else legacy drinksPerDay, else default. */
export function resolvePace(answers?: Pick<QuizAnswers, 'dailyDrinks' | 'drinksPerDay'> | null): number {
  const v = answers?.dailyDrinks ?? answers?.drinksPerDay
  return v && v > 0 ? v : DEFAULT_PACE
}

/**
 * Monthly occasions for a product — the SAME rhythm sizing the priced box uses
 * (`occasionsPerMonthFor` in pricing), so the Pour Plan and the receipt agree.
 */
export function occasionsFor(product: CatalogueProduct, answers?: QuizAnswers | null): number {
  return occasionsPerMonthFor(product, answers)
}

function whenFor(cadence: ConsumptionCadence): PourWhen {
  return cadence === 'per-workout' ? 'training' : cadence === 'as-needed' ? 'asNeeded' : 'everyday'
}

function protocolNoteFor(product: CatalogueProduct, cadence: ConsumptionCadence): string {
  const anchor = product.consumption?.anchor
  return anchor ? ANCHOR_NOTE[anchor] : CADENCE_FALLBACK_NOTE[cadence]
}

/** The flavour shown by default: the product's chosen default, else the first
 *  available variant, else the first variant. */
export function defaultVariantId(product: CatalogueProduct): string {
  if (product.defaultVariantId && product.variants.some((v) => v.id === product.defaultVariantId)) {
    return product.defaultVariantId
  }
  return (product.variants.find((v) => v.available) ?? product.variants[0])?.id ?? product.id
}

interface Sized {
  line: PourLine
  score: number
}

function sizeProduct(product: CatalogueProduct, answers: QuizAnswers | null | undefined, primaryGoal: Goal | null): Sized {
  const cadence: ConsumptionCadence = product.consumption?.cadence ?? resolveConsumption(product).cadence
  const monthlyCount = occasionsFor(product, answers)
  const servingsPerUnit = product.consumption?.servingsPerUnit || product.servings || DAYS_PER_MONTH
  const perWeek = monthlyCount / WEEKS_PER_MONTH
  const oneOffLastsWeeks = perWeek > 0 ? Math.max(1, Math.round(servingsPerUnit / perWeek)) : 0
  const isPrimary = !!primaryGoal && product.goals.includes(primaryGoal)

  const cadenceWeight = cadence === 'daily' ? 100 : cadence === 'per-workout' ? 50 : 20
  const goalMatch = product.goals.length
  const score = (isPrimary ? 1000 : 0) + cadenceWeight + goalMatch * 10 + (product.recommendationPriority ?? 5)

  return {
    score,
    line: {
      productId: product.id,
      variantId: defaultVariantId(product),
      title: product.title,
      cadence,
      when: whenFor(cadence),
      monthlyCount,
      servingsPerUnit,
      oneOffLastsWeeks,
      protocolNote: protocolNoteFor(product, cadence),
      swapGroup: product.swapGroup,
      goalReason: product.shortReason || '',
      isPrimary,
    },
  }
}

/**
 * Build the Pour Plan from the selected drinkable products + answers.
 * `products` is the already-selected set (the blueprint does selection); this
 * sizes, tunes and buckets it.
 */
export function buildPourPlan(
  products: CatalogueProduct[],
  answers?: QuizAnswers | null,
  opts: { reconcile?: boolean } = {},
): PourPlan {
  const pace = resolvePace(answers)
  const variety: DrinkVariety = answers?.drinkVariety ?? 'staples'
  const primaryGoal = answers?.primaryGoal ?? answers?.goals?.[0] ?? null

  let sized = products.map((p) => sizeProduct(p, answers, primaryGoal))

  // Drinks-mode pace scaling — the everyday base totals ~pace × 30 across the
  // daily kinds (mirrors the box in pricing, so counts match the receipt).
  if (answers?.drinksMode) {
    const daily = sized.filter((x) => x.line.cadence === 'daily')
    const dailySum = daily.reduce((s, x) => s + x.line.monthlyCount, 0)
    const factor = paceDailyFactor(dailySum, answers)
    if (factor < 1) {
      for (const x of daily) {
        const scaled = Math.max(PACE_DAILY_FLOOR, Math.round(x.line.monthlyCount * factor))
        if (scaled >= x.line.monthlyCount) continue
        x.line.monthlyCount = scaled
        const perWeek = scaled / WEEKS_PER_MONTH
        x.line.oneOffLastsWeeks = perWeek > 0 ? Math.max(1, Math.round(x.line.servingsPerUnit / perWeek)) : 0
      }
    }
  }

  // Breadth vs depth. Counts are rhythm-fixed, so the lever is how many KINDS:
  //   staples → concentrate on the go-tos, trim the marginal extras toward pace;
  //   variety → keep the fuller spread of kinds.
  // Opt-in: only when reconciling a candidate pool (not when rendering an
  // already-selected plan, where the box + receipt must match exactly).
  if (opts.reconcile && variety === 'staples') {
    const target = pace * DAYS_PER_MONTH
    let total = sized.reduce((s, x) => s + x.line.monthlyCount, 0)
    // Trim lowest-scoring, non-primary lines first until we're near the target
    // (or hit the minimum kinds floor).
    const trimOrder = [...sized].sort((a, b) => a.score - b.score)
    for (const cand of trimOrder) {
      if (sized.length <= MIN_KINDS || total <= target) break
      if (cand.line.isPrimary) continue
      sized = sized.filter((x) => x.line.productId !== cand.line.productId)
      total -= cand.line.monthlyCount
    }
  }

  const order: PourWhen[] = ['everyday', 'training', 'asNeeded']
  const buckets: PourBucket[] = order
    .map((when) => {
      const lines = sized
        .filter((x) => x.line.when === when)
        .map((x) => x.line)
        .sort((a, b) => b.monthlyCount - a.monthlyCount)
      return { when, label: BUCKET_LABEL[when], lines, total: lines.reduce((s, l) => s + l.monthlyCount, 0) }
    })
    .filter((b) => b.lines.length > 0)

  const totalDrinks = buckets.reduce((s, b) => s + b.total, 0)
  const kinds = buckets.reduce((s, b) => s + b.lines.length, 0)

  return { totalDrinks, dailyPace: pace, variety, kinds, buckets }
}
