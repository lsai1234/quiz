/**
 * CHRGD LQD — the pre-made drinks package. Pure helpers for the "month of
 * drinks" framing.
 *
 * The LQD logic is deliberately different from the daily-regimen stack. You
 * don't need a drink of everything, every day, to hit exact daily doses.
 * Instead the whole month's drinks land in one box and you sip them at whatever
 * rate suits you — it's the MONTHLY total that keeps you covered, not a rigid
 * daily schedule. The only drinks tied to a moment are the timed ones (the
 * pre-workout, one per session).
 *
 * So the model splits into two kinds of drink:
 *   • timed   — pre-workout / energy: one per training session, a real moment.
 *   • anytime — vitamins, protein, greens, hydration, recovery, sleep, gut:
 *               a monthly pool with no daily obligation. Drink most days and
 *               you're covered; skip one and the month still adds up.
 *
 * The customer tells us their pace (drinks/day) and we reconcile it against the
 * fixed monthly pool: how many days the box lasts, and whether that pace lets
 * it stretch past a month or run it down early. Everything arrives ready to
 * drink — no powders, no pills, no mixing.
 */
import type { SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import type { StackSlot } from '@/lib/catalogue/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { DrinksPerDay, QuizAnswers } from '@/lib/types'

/**
 * Total drinks the package supports per month = each line's serving occasions
 * amortised over its ship cadence. `occasionsPerMonth` already accounts for
 * usage level and training frequency.
 */
export function monthlyDrinksOf(lines: SubscriptionLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + (l.occasionsPerMonth || 0), 0))
}

export interface PourMoment {
  /** Short moment label, e.g. "Before training". */
  moment: string
  /** One-line why/when, in package voice (everything arrives pre-made). */
  note: string
}

/** Best-moment suggestion for a product, from its primary stack slot. */
export function pourMomentFor(slot: StackSlot | undefined, hasStimulants: boolean): PourMoment {
  switch (slot) {
    case 'energy':
      return hasStimulants
        ? { moment: 'Before training', note: 'Crack one 20–30 min before a session — skip it after mid-afternoon.' }
        : { moment: 'Before training', note: 'Open one 20–30 min before a session — stim-free, so any hour works.' }
    case 'hydration':
      return { moment: 'During training & hot days', note: 'One in the gym bag, or any day you sweat more than usual.' }
    case 'protein':
    case 'vegan-support':
      return { moment: 'After training — or any time', note: 'Already made — post-session, with breakfast, or a snack swap.' }
    case 'performance':
      return { moment: 'Any time, most days', note: 'Consistency beats timing — a 10-second shot with any meal.' }
    case 'gut':
      return { moment: 'With breakfast', note: 'Already blended — open it with your morning routine.' }
    case 'recovery':
      return { moment: 'After training or evening', note: 'On the way out of the gym, or with dinner.' }
    case 'sleep':
      return { moment: 'Before bed', note: 'Open it in the last hour of the day — the sign-off drink.' }
    default:
      return { moment: 'Whenever suits you', note: 'No wrong time — it counts whenever you drink it.' }
  }
}

// ─── The month-of-drinks plan ─────────────────────────────────────────────────

const DAYS_PER_MONTH = 30
/** Pace we assume when the customer never picked one (a comfortable middle). */
export const DEFAULT_DRINKS_PER_DAY: DrinksPerDay = 2

/**
 * A drink is `timed` when it belongs to a moment (the pre-workout — one per
 * session). Everything else is `anytime`: part of the monthly pool with no
 * fixed slot in the day.
 */
export type LqdPacing = 'timed' | 'anytime'

export function pacingFor(slot: StackSlot | undefined): LqdPacing {
  return slot === 'energy' ? 'timed' : 'anytime'
}

/**
 * The "you're covered over the month" line for an anytime drink — reframing the
 * count as a monthly pool you sip at your pace, never a daily quota. `count` is
 * how many of that drink land in the box for the month.
 */
export function coverageNoteFor(slot: StackSlot | undefined, count: number): string {
  const n = `${count}`
  switch (slot) {
    case 'health':
      return `${n} for the month — your vitamins & minerals sorted. Have them most days and you're covered; no need to nail one every single day.`
    case 'protein':
    case 'vegan-support':
      return `${n} protein drinks to hit the month's target. Lean on them on the days you need them — the monthly total is what counts.`
    case 'hydration':
      return `${n} to reach for whenever you run low — training, heat, a heavy day. A pool to dip into, not a daily tick-box.`
    case 'gut':
      return `${n} greens for the month. A few a week keeps you topped up — pace them however suits.`
    case 'recovery':
      return `${n} recovery drinks for the month — save them for after the hard sessions.`
    case 'sleep':
      return `${n} night drinks — open one on the evenings you want to wind down.`
    case 'performance':
      return `${n} for the month. It's the monthly total that does the work, so just keep them ticking over.`
    default:
      return `${n} for the month — drink them at whatever pace feels good. You're covered on the total.`
  }
}

export interface LqdDrinkLine {
  product: CatalogueProduct
  slot: StackSlot | undefined
  pacing: LqdPacing
  /** How many of this drink land in the box for the month. */
  monthlyCount: number
  /** Timed drinks get a moment; anytime drinks get the monthly-cover line. */
  moment: PourMoment
  coverageNote: string
}

/** How the chosen pace lines up with the fixed monthly pool. */
export type LqdFit = 'brisk' | 'balanced' | 'stretches'

export interface LqdPlan {
  lines: LqdDrinkLine[]
  /** Every drink in the box for the month. */
  totalDrinks: number
  /** Drinks tied to a moment (the pre-workout). */
  timedDrinks: number
  /** Free-to-pace drinks — the bulk you sip whenever. */
  anytimeDrinks: number
  /** The pace the customer chose (drinks/day). */
  drinksPerDay: number
  /** Roughly how many days the box lasts at that pace. */
  daysOfCover: number
  /** Whether that pace runs the box down early, lands on a month, or stretches past it. */
  fit: LqdFit
  fitNote: string
}

/** The pace the customer picked, or the sensible default when they didn't. */
export function resolveDrinksPerDay(answers?: Pick<QuizAnswers, 'drinksPerDay'> | null): number {
  const v = answers?.drinksPerDay
  return v && v > 0 ? v : DEFAULT_DRINKS_PER_DAY
}

/**
 * Build the month-of-drinks plan from a sized subscription plan: classify each
 * line as timed vs anytime, total the pool, and reconcile it with the chosen
 * pace. This is a presentation layer over the existing (already sized) plan — it
 * changes the *story*, not the quantities or pricing.
 */
export function buildLqdPlan(
  plan: SubscriptionLine[],
  answers?: Pick<QuizAnswers, 'drinksPerDay'> | null,
): LqdPlan {
  const drinksPerDay = resolveDrinksPerDay(answers)

  const lines: LqdDrinkLine[] = plan.map((line) => {
    const slot = line.product.stackSlots[0]
    const pacing = pacingFor(slot)
    const monthlyCount = Math.max(1, Math.round(line.occasionsPerMonth || 0))
    return {
      product: line.product,
      slot,
      pacing,
      monthlyCount,
      moment: pourMomentFor(slot, line.product.hasStimulants),
      coverageNote: coverageNoteFor(slot, monthlyCount),
    }
  })

  const timedDrinks = lines.filter((l) => l.pacing === 'timed').reduce((s, l) => s + l.monthlyCount, 0)
  const totalDrinks = lines.reduce((s, l) => s + l.monthlyCount, 0)
  const anytimeDrinks = totalDrinks - timedDrinks
  const daysOfCover = drinksPerDay > 0 ? Math.round(totalDrinks / drinksPerDay) : totalDrinks

  let fit: LqdFit
  let fitNote: string
  if (daysOfCover >= DAYS_PER_MONTH + 4) {
    fit = 'stretches'
    fitNote = `That's more than a month in the box — at ${drinksPerDay}/day it stretches to about ${daysOfCover} days. Sip slower, nothing goes to waste.`
  } else if (daysOfCover <= DAYS_PER_MONTH - 5) {
    fit = 'brisk'
    fitNote = `At ${drinksPerDay}/day you'll get through the box in about ${daysOfCover} days — add a booster or two and we'll keep it topped up so you never run dry.`
  } else {
    fit = 'balanced'
    fitNote = `At ${drinksPerDay}/day the box lasts about ${daysOfCover} days — lined up with your month, zero daily admin.`
  }

  return { lines, totalDrinks, timedDrinks, anytimeDrinks, drinksPerDay, daysOfCover, fit, fitNote }
}
