/**
 * CHRGD LQD — the pre-made drinks package. Pure helpers for the "month of
 * drinks" framing: how many drinks the package pours per month, and the
 * tailored "pour guide" (when each drink fits best). Everything arrives ready
 * to drink — no powders, no pills, no mixing — and the promise stays loose:
 * drink what we send, whenever you want. The guide is suggestions, never a
 * schedule.
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
