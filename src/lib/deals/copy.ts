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
  /** "15% off and free UK mainland delivery": the condition rides in the line, so no "free" goes out without it. */
  dealLine: (q: Pick<PublicOfferQuote, 'discountPct' | 'deliveryDeal' | 'deliveryCharge' | 'standardDelivery'>) => {
    const parts: string[] = []
    if (q.discountPct > 0) parts.push(`${q.discountPct}% off`)
    if (q.deliveryDeal === 'free') parts.push('free UK mainland delivery')
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
  terms: 'Yours only, one use each, with no code needed. Member prices can’t be combined with other codes or offers.',
  upcomingHeading: 'Coming up',
  addEarlyHeading: 'Due soon: add it to the same box',
  addEarlyBody: 'Due to run out in the next few weeks? Add it now at its member price, so one parcel covers everything.',
  inBox: 'In my box',
  addEarly: 'Add to my box early',
  boxTitle: (n: number) => `Your top-up box · ${n} product${n === 1 ? '' : 's'}`,
  boxSaving: (saving: number, normal: number) => `You save ${gbp(saving)} on ${gbp(normal)}, delivered`,
  boxFreeDelivery: 'Free UK mainland delivery',
  boxDelivery: (charge: number, freeOver: number) => `Delivery ${gbp(charge)}. A box of ${gbp(freeOver)} or more ships free to the UK mainland.`,
  boxFreeOver: (freeOver: number) => `A top-up box of ${gbp(freeOver)} or more ships free to the UK mainland; the Highlands and Islands surcharge still applies.`,
  boxQuoting: 'Working out your box…',
  boxNone: 'That box isn’t available at a member price right now.',
  boxEmpty: 'Tick an open price to build your box',
  /** Under the top-up box's total, while the hub is on sale on its own. */
  boxAddsHub: (total: number) => `This box adds 90 days to your hub, ${gbp(total)} on its own, included.`,
  termsLink: 'Member hub terms',
  howTitle: 'How member prices work',
  freeShort: 'Free delivery to the UK mainland; the Highlands and Islands surcharge still applies.',
  freeShortTail: 'The Highlands and Islands surcharge still applies.',
  empty: 'Your member prices appear here after your first order.',
  hubOpen: (date: string) => `Your hub is open until ${date}. Any order adds 90 days, and a new price for what it brings.`,
  changed: 'This price has changed since the page loaded. Here is the new one.',
  /* The email when a deal opens. */
  emailSubject: (short: string) => `Your ${short} member price is open`,
  emailPreheader: (short: string) => `Your member price on ${short} is open in your hub.`,
  emailHeading: (short: string) => `Your ${short} price is open`,
  emailIntro: (firstName: string | null) => `${firstName ? `Hi ${firstName}, your` : 'Your'} member price is open in your hub, about a week before your pack is due to run out.`,
  emailCta: 'Open my hub',
  emailStop: 'Stop these emails',
  stopTitle: 'Stop member price emails',
  stopBody: 'We’ll stop emailing you when a member price opens. Your prices stay in your hub, and order and account emails still arrive.',
  stopCta: 'Stop these emails',
  stopped: 'Done. We won’t email you about member prices. You can turn them back on in your hub.',
  stopUnknown: 'That link has expired. Sign in to your hub to change your emails.',
  emailsOn: 'Email me when a member price opens',
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
  /* The membership card at the top of the box: the hub, before anything else. */
  cardEyebrow: 'Included with every order',
  cardTitle: 'Your member hub',
  cardDays: '90 days',
  cardSub: 'Comes with your box, one-off or monthly. Sign in with the email you order with, and any order adds 90 days.',
  cardTrainer: (name: string) => `Ask ${name}`,
  cardTrainerLine: 'A real personal trainer, not a bot',
  cardTraining: 'Your training plan',
  cardTrainingLine: 'A week built from your answers',
  cardTrainingChecked: (name: string) => `Built from your answers, checked by ${name}`,
  cardDeals: 'Member prices',
  cardDealsLine: 'On what you buy, as each runs out',
  cardGuide: 'Your stack guide',
  cardGuideLine: 'When to take each one, with reminders',
  cardCheckIns: 'Amp check-ins',
  cardCheckInsLine: 'Every two weeks, changes in one tap',
  cardMore: 'See inside your hub',
  /* The hub's value, only while it's on sale on its own at that price (Settings → Member hub). */
  cardValue: (monthly: number) => `${gbp(monthly)} a month on its own. Yours free, with no hub subscription: nothing to cancel.`,
  cardIncluded: 'Free with your order',
  underCtaValue: (total: number) => `Includes 90 days of your member hub free, ${gbp(total)} on its own. No hub subscription, nothing to cancel.`,
  receiptHub: 'Member hub · 90 days',
  receiptHubMonthly: 'Member hub · every month of your plan',
  receiptHubLine: (monthly: number) => `${gbp(monthly)} a month on its own · included`,
  receiptHubSave: (total: number) => `Your member hub saves you ${gbp(total)}`,
  receiptHubSaveMonthly: (monthly: number) => `Your member hub saves you ${gbp(monthly)} a month`,
  /* The preview drawn as the hub's own screen. */
  screenTitle: 'Your member hub',
  screenDays: '90 days',
  sessionsCount: (n: number) => `${n} session${n === 1 ? '' : 's'}`,
  insteadOf: 'instead of',
  fromWeek: (weeks: number) => `From about week ${weeks}`,
  /** Under the box's button, whenever an order opens the hub. */
  underCta: 'Includes 90 days of your member hub.',
  checkInsTitle: 'Amp checks in',
  checkInsBody: 'Every two weeks: thirty seconds on how it’s going, and one-tap changes to your box.',
  loading: 'Building your preview…',
} as const
