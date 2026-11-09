/** The member hub on its own: its words, for the review pack. */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { copyRows } from '@/lib/consult/copy-rows'
import { HUB_PLAN_COPY } from './copy'

export function hubPlanCopyRows(): ReviewRow[] {
  return copyRows(
    'Member hub on its own wording',
    'The shop’s hub card, the join page (/shop/hub), the quiz after joining, the membership card in My Hub, and its three emails. "[Name]" stands for the trainer’s name set in Settings',
    HUB_PLAN_COPY,
    {
      shopPrice: [10],
      price: [10],
      includeTrainer: ['[Name]'],
      includeTrainerChecks: ['[Name]'],
      cta: [10],
      freeWithStack: [30],
      signedInAs: ['alex@example.com'],
      freeDays: ['14 February'],
      cardActive: [10, '14 February'],
      cardActiveNoDate: [10],
      cardFreeDays: ['14 February'],
      cardCancelling: ['14 February'],
      confirmBody: ['14 February'],
      joinOffer: [10],
      welcomeIntro: ['Alex'],
      welcomeTerms: [10, '14 February'],
      welcomeTermsFree: [10, '14 February'],
      movedIntro: [10, '14 May'],
      cancelledIntro: ['14 February'],
      refundedIntro: [10],
    },
  )
}
