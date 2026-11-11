/** The member hub's own words: rows for the review pack. */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { copyRows } from '@/lib/consult/copy-rows'
import { HUB_COPY } from './copy'

const line = '15% off and free UK delivery'

export function hubCopyRows(): ReviewRow[] {
  return copyRows('Member hub wording', 'My Hub (/myhub), the order confirmation and the hub emails', HUB_COPY, {
    readyLine: ['alex@example.com'],
    emailSubject: ['Alex'],
    greeting: [8, 'Alex'],
    memberFor: [63],
    todayNext: ['7:30am', 'Plant Protein'],
    todayProgress: [1, 3],
    todayTick: ['Plant Protein'],
    todayUntick: ['Plant Protein'],
    dealsOpen: [2],
    dealsNext: ['Creatine', line, 5],
    dealsBest: ['Creatine', line, 29.74],
    dealsOpensIn: ['Creatine', 5],
    trainingNext: ['Full body A', 'Wednesday'],
    trainingDone: [2, 3],
    checkInNext: ['20 November'],
    checkInHistory: [3],
    orderLine: ['CHRGD-9RMH597P', '6 Nov 2026', 55.37],
    linkSent: ['alex@example.com'],
    linkDone: [1],
    codeEmailIntro: ['482913'],
  })
}
