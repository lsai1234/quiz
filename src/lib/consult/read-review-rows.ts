/**
 * "Your read", "Try this week" and "Worth a GP check" in the review pack
 * (plan Phase 5). Habit fixes are worked out from someone's answers, so the
 * pack shows each one for an example person (in bed 11pm, up at 7am, two
 * coffees, last one at 4pm); the review is of the wording and the source, and
 * the Approved column is what turns a line on (`approved` in `habits.ts`,
 * `gp-check.ts`).
 */
import type { ReviewRow } from './review-pack'
import { GP_CHECKS } from './gp-check'
import { HABITS } from './habits'
import { READ_COPY } from './read-copy'
import { EMPTY_ANSWERS, type ConsultAnswers } from './types'

const EXAMPLE: ConsultAnswers = {
  ...EMPTY_ANSWERS,
  goals: ['energy'],
  sleep: { bed: 23 * 60, wake: 7 * 60, quality: 'restful' },
  caffeine: { coffee: 2, tea: 0, energy: 0 },
  pinpoint: { steps: [{ kind: 'probe', probe: 'last-caffeine', answer: {}, minutes: 16 * 60, stage: 'follow-fuel' }], stopped: false },
}

export function habitRows(): ReviewRow[] {
  return HABITS.map((h) => {
    const ring = h.ring(EXAMPLE)
    return [
      'Try this week',
      `habits.ts “${h.id}”: for ${[...h.patterns.map((p) => `pattern ${p}`), ...h.goals.map((g) => `unmet goal ${g}`)].join(', ')}`,
      h.applies(EXAMPLE) ? h.text(EXAMPLE) : '(needs answers the example doesn’t give)',
      `Source: ${h.source.label} (${h.source.url}). ${h.approved ? 'Approved: shown' : 'Not approved: not shown'}. Day ring: ${ring ? JSON.stringify(ring) : 'no change'}`,
    ]
  })
}

export function gpCheckRows(): ReviewRow[] {
  return GP_CHECKS.map((g) => [
    'Worth a GP check',
    `gp-check.ts “${g.id}”: ${g.when}`,
    g.text,
    `Source: ${g.source.label} (${g.source.url}). ${g.approved ? 'Approved: shown' : 'Not approved: not shown'}`,
  ])
}

export function readCopyRows(): ReviewRow[] {
  const where = 'Your read (Fully charged) and the results page (read-copy.ts)'
  return [
    ['Your read', where, READ_COPY.heading, 'Heading'],
    ['Your read', where, READ_COPY.pinpointed, 'Label on a confirmed pattern'],
    ['Your read', where, READ_COPY.partly, 'Label on a partly confirmed pattern'],
    ['Your read', where, READ_COPY.youSaid, 'Above their own answers, quoted'],
    ['Your read', where, READ_COPY.seeMyStack, 'Button'],
    ['Your read', where, READ_COPY.tryThisWeek, 'Heading'],
    ['Your read', where, READ_COPY.tryThisWeekNote, 'Under the heading'],
    ['Your read', where, READ_COPY.gpCheck, 'Heading'],
    ['Your read', where, READ_COPY.unmetWithFix('focus'), 'An unmet goal, with an approved fix after it. Example goal'],
    ['Your read', where, READ_COPY.unmet('focus'), 'An unmet goal with no approved fix yet. Example goal'],
  ]
}
