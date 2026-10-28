/**
 * Amp's hunch lines (Amp Consult and offer plan, Phase 6): the early teaser
 * after the Rest section and the invite to Pinpoint after the core scenes.
 * Scripted here, one file, in the review pack; never AI-written.
 *
 * Each names an area of their day, never a cause: "your afternoons", not
 * what might be behind them. No pressure: the invite's two buttons are equal,
 * and building the stack now is a full answer.
 */

import type { PatternId } from './pinpoint/types'

/** The area of their day each pattern sits in, as Amp says it after "your". */
export const HUNCH_AREA: Record<PatternId, string> = {
  crash: 'afternoons',
  wired: 'evenings',
  'short-sleep': 'nights',
  empty: 'training days',
  'protein-gap': 'meals',
  'not-recovering': 'recovery',
  'caffeine-train': 'sessions',
  sweat: 'long sessions',
  'plant-gap': 'plate',
  indoor: 'daylight',
  'weekend-warrior': 'weekends',
  'stiff-starter': 'mornings',
  'keeping-strong': 'strength',
  'staying-sharp': 'focus',
  'broken-nights': 'nights',
  'eating-less': 'meals',
}

/** After the Rest section, as Amp's reaction: a theory, held back. */
export function teaserLine(pattern: PatternId): string {
  return `I’ve got a theory about your ${HUNCH_AREA[pattern]}. Hold that thought.`
}

/** The invite. `n` is the questions Pinpoint expects to ask (`expectedQuestions`). */
export function inviteLine(pattern: PatternId, n: number): { heading: string; body: string } {
  return {
    heading: `I’ve got a hunch about your ${HUNCH_AREA[pattern]}.`,
    body: `About ${n} quick question${n === 1 ? '' : 's'} and I’ll know for sure.`,
  }
}

export const INVITE_COPY = {
  kicker: 'Before your stack',
  check: 'Check it',
  build: 'Build my stack now',
  /** Under the buttons: what each one does, plainly. */
  note: 'Either way, your stack is built from everything you’ve told me.',
} as const
