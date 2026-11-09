/** The training plan's coaching tools: their words, for the review pack. */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { copyRows } from '@/lib/consult/copy-rows'
import { COACHING_COPY } from './coaching-copy'
import { TRAINING_EMAIL_COPY } from './email-copy'

export function coachingCopyRows(): ReviewRow[] {
  return copyRows(
    'Training plan coaching tools wording',
    'My Hub: workout mode, the week (busy and away, a lighter session, the live calendar, meeting the trainer, easing back in), the Today card. "[Name]" stands for the trainer’s name set in Settings',
    COACHING_COPY,
    {
      startToday: ['Full body A'],
      setOf: [2, 3],
      targetWeight: [20, 8],
      targetReps: [8, 10],
      targetSeconds: [30],
      less: ['Weight'],
      more: ['Weight'],
      restNext: [3],
      next: ['Goblet squat'],
      askSet: ['[Name]'],
      tipFrom: ['[Name]'],
      firstNote: ['[Name]'],
      finishBody: [12],
      best: ['Goblet squat', '24 kg × 8'],
      todaySession: ['6pm', 'Full body A', 45],
      changedBy: ['[Name]'],
      changedWhy: ['Fewer sets while your knee settles.'],
      metTitle: ['[Name]'],
      metLine: ['[Name]'],
      metFirst: ['Wednesday', '6pm'],
      metFirstNoTime: ['Wednesday'],
    },
  )
}

export function trainingEmailCopyRows(): ReviewRow[] {
  return copyRows(
    'Training emails wording',
    'Opt-in emails from the training plan: the switch on the week, the training-day email, the one-off recap after the first week, and the stop link’s page. "[Name]" stands for the trainer’s name set in Settings',
    TRAINING_EMAIL_COPY,
    {
      daySubject: ['Full body A'],
      dayPreheader: ['Full body A', 45],
      dayHeading: ['Full body A'],
      dayIntro: ['Alex'],
      dayAt: ['Full body A', '6pm', 45],
      dayNoTime: ['Full body A', 45],
      dayAlso: ['Yoga class', 60],
      recapIntro: ['Alex', '2 November'],
      recapDone: [3],
      recapWentUp: ['Goblet squat', '20 kg × 8', '22 kg × 8'],
      recapHeaviest: ['Romanian deadlift', '40 kg × 8'],
      recapChecked: ['[Name]'],
      recapChecking: ['[Name]'],
      recapAsk: ['[Name]'],
      recapNext: ['Full body B', 'Wednesday'],
      recapNextAt: ['Full body B', 'Wednesday', '6pm'],
    },
  )
}
