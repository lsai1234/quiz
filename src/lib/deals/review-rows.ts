/** Member deals and the hub's preview on the reveal: rows for the review pack. */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { copyRows } from '@/lib/consult/copy-rows'
import { DEALS_COPY as D, HUB_PREVIEW_COPY as H } from './copy'

export function dealCopyRows(): ReviewRow[] {
  const hub = 'My Hub: "Your member prices"'
  const reveal = 'Results page (both quizzes): "Your hub, for 90 days", under "Your box comes with"'
  const s = 'Member deals wording'
  const ex = 'Example'
  const free = { discountPct: 12, deliveryDeal: 'free' as const, deliveryCharge: 0, standardDelivery: 4.95 }
  const reduced = { discountPct: 0, deliveryDeal: 'reduced' as const, deliveryCharge: 0.99, standardDelivery: 4.95 }
  return [
    [s, hub, D.heading, 'Heading'],
    [s, hub, D.intro, 'Under the heading'],
    [s, hub, D.dealLine(free), `A deal with a percentage and free delivery. ${ex}`],
    [s, hub, D.dealLine(reduced), `A deal on delivery alone. ${ex}`],
    [s, hub, D.freeDeliveryCondition, 'Beside every free delivery'],
    [s, hub, D.price(28.49, 34.94), `Price line. ${ex}`],
    [s, hub, D.openUntil('3 February'), `${ex}`],
    [s, hub, D.opensIn(12, '17 November'), `A deal not open yet. ${ex}`],
    [s, hub, D.runsOut('24 November'), `${ex}`],
    [s, hub, D.runsOutEstimated('24 November'), `When the pack's servings aren't on record. ${ex}`],
    [s, hub, D.buy(28.49), `Button. ${ex}`],
    [s, hub, D.terms, 'Under the deals'],
    [s, hub, D.hubOpen('3 February'), `${ex}`],
    [s, hub, D.changed, 'When the price moved since the page loaded'],
    [s, reveal, H.eyebrow, 'Eyebrow'],
    [s, reveal, H.heading, 'Heading'],
    [s, reveal, H.sub, 'Under the heading'],
    [s, reveal, H.trainingTitle, 'While the training plan is on'],
    [s, reveal, H.trainingBody, 'Above their first week'],
    [s, reveal, H.trainingMore, 'Under it'],
    [s, reveal, H.dealsTitle, 'While member deals are on, one-off box'],
    [s, reveal, H.dealsBody, 'Above the list'],
    [s, reveal, H.dealRow('Creatine', D.dealLine(free), 29.74, 39.94, 7), `A product's deal. ${ex}`],
    [s, reveal, H.dealsMonthly, 'Monthly box, while member deals are on'],
    // The rest: the top-up box, the email when a price opens, stopping it, and the preview drawn as the hub.
    ...copyRows(
      s,
      'My Hub: the top-up box; the email when a member price opens; /myhub/emails',
      D,
      {
        boxTitle: [2],
        boxSaving: [6.4, 44.93],
        boxDelivery: [3.99, 40],
        boxFreeOver: [40],
        emailSubject: ['Creatine'],
        emailPreheader: ['Creatine'],
        emailHeading: ['Creatine'],
        emailIntro: ['Alex'],
        boxAddsHub: [30],
      },
      {},
      ['heading', 'intro', 'dealLine', 'freeDeliveryCondition', 'price', 'openUntil', 'opensIn', 'runsOut', 'runsOutEstimated', 'buy', 'terms', 'hubOpen', 'changed'],
    ),
    ...copyRows(s, reveal, H, {
      sessionsCount: [4],
      fromWeek: [3],
      cardTrainer: ['Josh'],
      cardTrainingChecked: ['Josh'],
      cardValue: [10],
      underCtaValue: [30],
      receiptHubLine: [10],
      receiptHubSave: [30],
      receiptHubSaveMonthly: [10],
    }, { underCta: 'Under the box’s button, with the member hub terms link' }, [
      'eyebrow',
      'heading',
      'sub',
      'trainingTitle',
      'trainingBody',
      'trainingMore',
      'dealsTitle',
      'dealsBody',
      'dealRow',
      'dealsMonthly',
    ]),
  ]
}
