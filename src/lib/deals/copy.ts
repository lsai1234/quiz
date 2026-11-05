/**
 * The words of member deals (the hub) and of the hub's preview on the results
 * page. Scripted, one file, in the review pack (`dealCopyRows`).
 *
 * No pressure wording: no countdown urgency, no "last chance". Every "free"
 * carries its condition beside it. A deal is described by what it is (a
 * percentage off, delivery), never by what the product does.
 */
import type { PublicOfferQuote } from '@/lib/last-chance/economics'

const gbp = (n: number) => `£${n.toFixed(2)}`

export const DEALS_COPY = {
  eyebrow: 'Member prices',
  heading: 'Your member prices',
  intro: 'A price on each product you’ve bought, here in your hub. Each opens about a week before that product is due to run out, so the next one arrives in time.',
  /** "15% off and free delivery". */
  dealLine: (q: Pick<PublicOfferQuote, 'discountPct' | 'deliveryDeal' | 'deliveryCharge' | 'standardDelivery'>) => {
    const parts: string[] = []
    if (q.discountPct > 0) parts.push(`${q.discountPct}% off`)
    if (q.deliveryDeal === 'free') parts.push('free delivery')
    if (q.deliveryDeal === 'reduced') parts.push(`delivery ${gbp(q.deliveryCharge)} (usually ${gbp(q.standardDelivery)})`)
    if (q.deliveryDeal === 'included' && parts.length === 0) parts.push('delivery included')
    const s = parts.join(' and ')
    return s.charAt(0).toUpperCase() + s.slice(1)
  },
  /** Beside every free delivery. */
  freeDeliveryCondition: 'Free delivery is to the UK mainland; the Highlands and Islands surcharge still applies.',
  price: (total: number, normal: number) => `${gbp(total)} delivered, instead of ${gbp(normal)}`,
  openUntil: (date: string) => `Open until ${date}`,
  opensIn: (days: number, date: string) => (days <= 1 ? `Opens tomorrow, ${date}` : `Opens in ${days} days, on ${date}`),
  runsOut: (date: string) => `Due to run out around ${date}`,
  runsOutEstimated: (date: string) => `Due to run out around ${date} (we’ve allowed about a month a pack)`,
  buy: (total: number) => `Buy for ${gbp(total)}`,
  buying: 'Taking you to checkout…',
  terms: 'One product on its own at this price, with no code needed. It can’t be combined with other codes or offers.',
  upcomingHeading: 'Coming up',
  empty: 'Your member prices appear here after your first order.',
  hubOpen: (date: string) => `Your hub is open until ${date}. Any order adds 90 days, and a new price for what it brings.`,
  changed: 'This price has changed since the page loaded. Here is the new one.',
  error: 'We couldn’t start your checkout. Please try again.',
} as const

export const HUB_PREVIEW_COPY = {
  eyebrow: 'Comes with your order',
  heading: 'Your hub, for 90 days',
  sub: 'Included with your first order, one-off or monthly. Sign in with the email you order with. Any order adds 90 days.',
  trainingTitle: 'Your training plan',
  trainingBody: 'A week built from your answers, and yours to change: days, focus, length, kit, classes and runs. Your first week could look like this:',
  trainingMore: 'Every exercise opens with how to do it, what to think about and easier or harder versions.',
  dealsTitle: 'Member prices on what you buy',
  dealsBody: 'Each product gets its own price in your hub, opening about a week before it’s due to run out:',
  dealRow: (short: string, line: string, total: number, normal: number, weeks: number) =>
    `${short}: ${line.charAt(0).toLowerCase()}${line.slice(1)}, ${gbp(total)} delivered instead of ${gbp(normal)}, from about week ${weeks}`,
  dealsMonthly: 'On a monthly plan your products come at your monthly price as they run out; member prices are for anything you add on top.',
  guideTitle: 'Your stack guide and reminders',
  guideBody: 'When to take each product on your day, as a page, an image and calendar reminders.',
  checkInsTitle: 'Amp checks in',
  checkInsBody: 'Every two weeks: thirty seconds on how it’s going, and one-tap changes to your box.',
  loading: 'Building your preview…',
} as const
