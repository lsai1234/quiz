/** The training plan's coaching tools: their words, for the review pack. */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { copyRows } from '@/lib/consult/copy-rows'
import { COACHING_COPY } from './coaching-copy'

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
