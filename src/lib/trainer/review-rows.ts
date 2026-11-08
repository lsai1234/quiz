/** Ask your trainer's words: rows for the review pack. */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { copyRows } from '@/lib/consult/copy-rows'
import { TRAINER_COPY } from './copy'

export function trainerCopyRows(): ReviewRow[] {
  return copyRows(
    'Ask your trainer wording',
    'My Hub (/myhub/trainer and its card), each exercise, the results page’s hub, and the trainer emails. "[Name]" stands for the name set in Settings',
    TRAINER_COPY,
    {
      realLine: ['[Name]'],
      replyWithin: [48],
      intro: ['[Name]'],
      waiting: ['[Name]'],
      left: [3],
      tooLong: [1000],
      about: ['Barbell back squat'],
      askAbout: ['[Name]'],
      homeAnswered: ['[Name]'],
      homeWaiting: ['[Name]'],
      revealTitle: ['[Name]'],
      revealBody: ['[Name]'],
      replySubject: ['[Name]'],
      replyHeading: ['[Name]'],
      replyIntro: ['Alex', '[Name]'],
      questionSubject: ['Alex'],
      questionIntro: ['Alex', 'Barbell back squat'],
      planChecking: ['[Name]'],
      planCheckingLine: ['[Name]', 24],
      planChecked: ['[Name]'],
      planCheckedLine: ['[Name]'],
      askAboutPlan: ['[Name]'],
      revealChecked: ['[Name]'],
      planEmailSubject: ['[Name]'],
      planEmailIntro: ['Alex', '[Name]'],
    },
    { medical: 'Under the question box, and in the answer email', realPerson: 'Badge beside the trainer, everywhere they appear' },
  )
}
