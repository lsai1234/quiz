/**
 * CHRGD LQD — the drinks package. Pure helpers for the "month of drinks"
 * framing: how many drinks the package pours per month, and the tailored
 * "pour guide" (when each drink fits best). The core promise stays loose —
 * drink whatever you want, whenever you want — so the guide is suggestions,
 * never a schedule.
 */
import type { SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import type { StackSlot } from '@/lib/catalogue/types'

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
  /** One-line why/when, in package voice. */
  note: string
}

/** Best-moment suggestion for a product, from its primary stack slot. */
export function pourMomentFor(slot: StackSlot | undefined, hasStimulants: boolean): PourMoment {
  switch (slot) {
    case 'energy':
      return hasStimulants
        ? { moment: 'Before training', note: '20–30 min before a session — skip it after mid-afternoon.' }
        : { moment: 'Before training', note: '20–30 min before a session — stim-free, so any hour works.' }
    case 'hydration':
      return { moment: 'During training & hot days', note: 'In your gym bottle, or any day you sweat more than usual.' }
    case 'protein':
    case 'vegan-support':
      return { moment: 'After training — or any time', note: 'Post-session shake, breakfast smoothie, or a snack swap.' }
    case 'performance':
      return { moment: 'Any time, most days', note: 'Consistency beats timing — drop it in whatever you’re already drinking.' }
    case 'gut':
      return { moment: 'With breakfast', note: 'Greens go down easiest as a morning habit.' }
    case 'recovery':
      return { moment: 'Evening wind-down', note: 'Stir into a warm or cold drink before bed.' }
    case 'sleep':
      return { moment: 'Before bed', note: 'Make it the last drink of the day.' }
    default:
      return { moment: 'Whenever suits you', note: 'No wrong time — it counts whenever you drink it.' }
  }
}
