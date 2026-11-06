/** Ask your trainer's words: rows for the review pack. */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { copyRows } from '@/lib/consult/copy-rows'
import { TRAINER_COPY } from './copy'

export function trainerCopyRows(): ReviewRow[] {
  return copyRows(
    'Ask your trainer wording',
    'My Hub (/myhub/trainer and its card), each exercise, the results page’s hub, and the trainer emails. "Josh" stands for the name set in Settings',
    TRAINER_COPY,
    {
      realLine: ['Josh'],
      replyWithin: [48],
      intro: ['Josh'],
      waiting: ['Josh'],
      left: [3],
      tooLong: [1000],
      about: ['Barbell back squat'],
      askAbout: ['Josh'],
      homeAnswered: ['Josh'],
      homeWaiting: ['Josh'],
      revealTitle: ['Josh'],
      revealBody: ['Josh'],
      replySubject: ['Josh'],
      replyHeading: ['Josh'],
      replyIntro: ['Alex', 'Josh'],
      questionSubject: ['Alex'],
      questionIntro: ['Alex', 'Barbell back squat'],
    },
    { medical: 'Under the question box, and in the answer email', realPerson: 'Badge beside the trainer, everywhere they appear' },
  )
}
