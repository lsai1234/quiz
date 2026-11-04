/** "Your day" rows for the review pack (`docs/consult-review-pack.csv`). */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { ROUTINE_COPY } from './copy'

export function routineCopyRows(): ReviewRow[] {
  const where = 'Results page: "Your day" in the box; the emailed stack guide; calendar reminders'
  const c = ROUTINE_COPY
  return [
    ['Routine wording', where, c.heading, 'Heading'],
    ['Routine wording', where, c.sub, 'Under the heading, with their own day (the consult)'],
    ['Routine wording', where, c.subAssumed, 'Under the heading, on the stated day (the original quiz)'],
    ...Object.entries(c.moment).map(([anchor, words]): ReviewRow => ['Routine wording', where, words, `A product's moment, from its "Best taken" setting (${anchor}). Never a reason`]),
    ['Routine wording', where, c.everyDay, 'How often'],
    ['Routine wording', where, c.mostDays, 'How often'],
    ['Routine wording', where, c.trainingDays, 'How often'],
    ['Routine wording', where, c.trainingDaysCount(3), 'How often. Example'],
    ['Routine wording', where, c.trainingWeekdays('Mon, Wed, Fri'), 'How often, from the days they train. Example'],
    ['Routine wording', where, c.whenYouChoose, 'How often'],
    ['Routine wording', where, c.servings(0.5), 'How much, from their usage setting'],
    ['Routine wording', where, c.servings(1), 'How much'],
    ['Routine wording', where, c.servings(2), 'How much'],
    ['Routine wording', where, c.noTimeTraining, 'A group with no time on the clock'],
    ['Routine wording', where, c.labelFirst, 'Under the list'],
  ]
}
