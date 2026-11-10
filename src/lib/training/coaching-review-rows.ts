/** The training plan's coaching tools: their words, for the review pack. */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { copyRows } from '@/lib/consult/copy-rows'
import { COACHING_COPY } from './coaching-copy'
import { TRAINING_EMAIL_COPY } from './email-copy'
import { MUSCLE_LABEL, PROGRAMME_COPY } from './programme-copy'

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

export function programmeCopyRows(): ReviewRow[] {
  const where = 'My Hub (/myhub/training and /myhub/training/progress), behind Settings → Training plan → Programmes and goals. "[Name]" stands for the trainer’s name set in Settings'
  return [
    ...copyRows('Programmes and goals wording', where, PROGRAMME_COPY, {
      programmeStart: [8],
      programmeChecked: ['[Name]'],
      programmeWeek: [4, 8],
      compareLine: ['Goblet squat', '16 kg × 8', '22 kg × 8'],
      goalDone: ['3 March'],
      milestoneOn: ['3 March'],
      missedTitle: ['Tuesday'],
      missedMove: ['Full body A', 'Thursday'],
      missedNoRoom: ['Full body A'],
      movedFrom: ['Tuesday'],
      rampLine: ['Goblet squat'],
      sessions: [9],
      bestsCount: [3],
      workedSets: [6],
      liveLine: ['[Name]'],
      liveWhen: ['Tuesday 2 December', '7pm', 60],
      liveRecordingUntil: ['2 March'],
    }),
    ...copyRows('Programmes and goals wording: milestones', where, PROGRAMME_COPY.milestone, { liftAt: ['Goblet squat', 24], runs: [5], weeks3: [4] }),
    ...copyRows('Programmes and goals wording: muscles', where, MUSCLE_LABEL, {}),
  ]
}
