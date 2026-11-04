/** Amp's check-ins and reorder: rows for the review pack (`docs/consult-review-pack.csv`). */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { CHECKIN_COPY } from './copy'
import { REORDER_COPY } from './reorder-copy'

export function checkInCopyRows(): ReviewRow[] {
  const where = 'Amp’s check-ins: the email every two weeks after an order, and /checkin/…'
  const c = CHECKIN_COPY
  const ex = 'Example'
  const rows: ReviewRow[] = [
    ['Check-in wording', where, c.emailSubject('Alex'), `Email subject. ${ex}`],
    ['Check-in wording', where, c.emailPreheader, 'Email preheader'],
    ['Check-in wording', where, c.emailHeading, 'Email heading'],
    ['Check-in wording', where, c.emailIntro, 'Email intro'],
    ['Check-in wording', where, c.emailCta, 'Email button'],
    ['Check-in wording', where, c.emailStop, 'Email: the way out, in every check-in'],
    ['Check-in wording', where, c.sub, 'Under the heading'],
    ['Check-in wording', where, c.usingHeading, 'Question, per product'],
    ...Object.values(c.using).map((v): ReviewRow => ['Check-in wording', where, v, 'Answer']),
    ['Check-in wording', where, c.trainingHeading, 'Question'],
    ...Object.values(c.training).map((v): ReviewRow => ['Check-in wording', where, v, 'Answer']),
    ['Check-in wording', where, c.timesHeading, 'Question'],
    ['Check-in wording', where, c.happyHeading, 'Question: about the box, not their health'],
    ['Check-in wording', where, c.thanks, 'After answering'],
    ['Check-in wording', where, c.historyHeading, 'Their own answers, played back'],
    ['Check-in wording', where, c.suggestionsHeading, 'Section'],
    ['Check-in wording', where, c.noSuggestions, 'Nothing to change'],
    ['Check-in wording', where, c.suggest.dropOneOff('Creatine'), `A one-off box: a product they've stopped. ${ex}`],
    ['Check-in wording', where, c.suggest.dropPlan('Creatine'), `A plan: a product they've stopped. ${ex}`],
    ['Check-in wording', where, c.suggest.notStarted('Creatine'), `Not started yet. ${ex}`],
    ['Check-in wording', where, c.suggest.training('Pre-Workout'), `Not training, a training-day product. ${ex}`],
    ['Check-in wording', where, c.suggest.times, 'The times don’t fit'],
    ['Check-in wording', where, c.suggest.unhappy, 'Not happy (1 or 2 of 5)'],
    ['Check-in wording', where, c.reorderWithout, 'Button: a one-off box'],
    ['Check-in wording', where, c.reorderAll, 'Button: a one-off box'],
    ['Check-in wording', where, c.changeInAccount, 'Button: a plan'],
    ['Check-in wording', where, c.stopHeading, 'Stop page'],
    ['Check-in wording', where, c.stopBody, 'Stop page'],
    ['Check-in wording', where, c.stopped, 'After stopping'],
    ['Check-in wording', where, c.notFound, 'A wrong or ended link'],
  ]
  const r = REORDER_COPY
  const at = 'Reorder: /reorder/… from a check-in'
  return [
    ...rows,
    ['Reorder wording', at, r.heading, 'Heading'],
    ['Reorder wording', at, r.headingWithout, 'Heading, leaving products out'],
    ['Reorder wording', at, r.leftOut('Creatine'), `Under it. ${ex}`],
    ['Reorder wording', at, r.priceNote('£44.98'), `Under the list. ${ex}`],
    ['Reorder wording', at, r.cta, 'Button'],
    ['Reorder wording', at, r.failed, 'When the checkout can’t start'],
    ['Reorder wording', at, r.empty, 'Nothing left to reorder'],
  ]
}
