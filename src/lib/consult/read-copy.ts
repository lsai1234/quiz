/**
 * The words around "Your read" (plan Phase 5), on Fully charged and on the
 * results page. Scripted, in the review pack. Labels only: nothing here says
 * what a product does or what anything will do for someone. The pattern
 * names and lines are the Pinpoint library's; the evidence is their own
 * answers.
 */
import { GOAL_LABEL } from './summary'
import type { ConsultGoal } from './types'

export const READ_COPY = {
  heading: 'Your read',
  pinpointed: 'Pinpointed',
  partly: 'Partly',
  youSaid: 'You said',
  seeMyStack: 'See my stack',
  tryThisWeek: 'Try this week',
  tryThisWeekNote: 'Free, and worked out from your answers.',
  gpCheck: 'Worth a GP check',
  whatWeChecked: 'What we checked',
  source: 'Source',
  /** An unmet goal, with a fix to try instead. */
  unmetWithFix: (goal: ConsultGoal) => `Nothing we stock is right for ${GOAL_LABEL[goal].toLowerCase()}, so here’s what to try instead.`,
  /** An unmet goal with no approved fix yet: said honestly, with no promise of one. */
  unmet: (goal: ConsultGoal) => `Nothing we stock is right for ${GOAL_LABEL[goal].toLowerCase()}.`,
} as const
