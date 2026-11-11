/**
 * The words of the member hub on its own (£X a month, sold in the shop): the
 * shop's card, the join page, the membership card in the hub, the setup after
 * joining and the three emails. Scripted, one file, in the review pack
 * (`hubPlanCopyRows`).
 *
 * No pressure wording. Every "free" carries its condition beside it, and the
 * free 90 days a stack brings are never described as a trial that turns into
 * a payment: they end by themselves.
 */
const gbp = (n: number) => (Number.isInteger(n) ? `£${n}` : `£${n.toFixed(2)}`)

export const HUB_PLAN_COPY = {
  /* ── The shop ───────────────────────────────────────────────────────── */
  shopEyebrow: 'Member hub',
  shopTitle: 'The member hub, on its own',
  shopLine: 'Your training plan, a real fitness expert to ask, and member prices.',
  shopPrice: (monthly: number) => `${gbp(monthly)} a month`,
  shopCta: 'See what’s inside',
  shopFree: 'Free for 90 days with any stack',

  /* ── The join page (/shop/hub) ──────────────────────────────────────── */
  pageTitle: 'Member hub · CHRGD',
  eyebrow: 'Member hub',
  title: 'Train with a plan, and a real trainer to ask',
  intro: 'Everything in the member hub, without buying a stack. Answer a few questions and your hub opens with a training plan built from your answers.',
  price: (monthly: number) => `${gbp(monthly)} a month`,
  priceSub: 'Paid by card each month. Cancel any time in your hub.',
  includesTitle: 'What’s inside',
  includeTrainer: (name: string) => `Ask ${name}, our in-house fitness expert, and get answers from a real person, with videos where they help`,
  includeTrainerChecks: (name: string) => `Your plan checked by ${name}`,
  includeTraining: 'A weekly training plan built from your answers, and yours to change',
  includeWorkout: 'Workout mode: log your lifts and see what you did last time',
  includeDeals: 'Member prices on the products you buy, ready when each is due to run out',
  stepsTitle: 'How it works',
  step1: 'Join with your card.',
  step2: 'Answer a few questions about how you train.',
  step3: 'Your hub opens with your plan in it.',
  cta: (monthly: number) => `Join for ${gbp(monthly)} a month`,
  starting: 'Opening the payment page…',
  terms: 'By joining you agree to the member hub terms. Cancel within 14 days of joining and we refund your first payment.',
  termsLink: 'Read the terms',
  freeWithStackTitle: 'Or free with a stack',
  freeWithStack: (total: number) => `Any stack from the quiz comes with 90 days of the hub, ${gbp(total)} on its own. It ends by itself after 90 days: there’s no subscription and nothing to cancel.`,
  freeWithStackCta: 'Take the quiz',
  accountTitle: 'First, your account',
  accountBody: 'Your hub lives in your account. Use the email you’d like your hub under.',
  signedInAs: (email: string) => `Signed in as ${email}`,
  freeDays: (date: string) => `Your hub is free until ${date} from your last order. Join now and your first payment is on ${date}.`,
  included: 'Your monthly plan already includes your hub, every month it runs.',
  already: 'You’re already a member.',
  openHub: 'Open your hub',
  offSale: 'The member hub comes free for 90 days with any stack from the quiz.',
  failed: 'We couldn’t open the payment page. Nothing was taken. Please try again.',

  /* ── Setting up, after joining (the quiz, then the hub) ─────────────── */
  setupBanner: 'Your hub is ready. A few questions about how you train, and we’ll build your plan.',
  setupSaving: 'Building your hub…',
  setupFailed: 'We couldn’t save your answers. Your hub is open either way.',
  setupGoToHub: 'Go to your hub',
  welcome: 'Welcome. Your hub is open.',

  /* ── The membership card in the hub ─────────────────────────────────── */
  cardTitle: 'Your membership',
  cardActive: (monthly: number, date: string) => `${gbp(monthly)} a month · next payment ${date}`,
  cardActiveNoDate: (monthly: number) => `${gbp(monthly)} a month`,
  cardFreeDays: (date: string) => `Your stack’s free days run to ${date}, so your next payment waits until then.`,
  cardStackMoves: 'Any stack order gives you 90 days free, and your next payment waits until they’re used up.',
  cardPending: 'Waiting for your payment to go through.',
  cardCancelling: (date: string) => `Cancelled. Your hub stays open until ${date}, and nothing more is taken.`,
  cardPastDue: 'Your last payment didn’t go through. Update your card to keep your hub.',
  cardUpdateCard: 'Update card',
  cardCancel: 'Cancel membership',
  cardResume: 'Keep my membership',
  confirmTitle: 'Cancel your membership?',
  confirmBody: (date: string) => `Your hub stays open until ${date}, and nothing more is taken.`,
  confirmRefund: 'You joined in the last 14 days, so we’ll refund your first payment and end your membership now.',
  confirmYes: 'Cancel membership',
  confirmNo: 'Keep it',
  cancelled: 'Your membership is cancelled.',
  actionFailed: 'That didn’t go through. Please try again.',
  /** When the hub has closed or never opened, while it's on sale: an offer, never automatic. */
  joinOffer: (monthly: number) => `Keep your hub for ${gbp(monthly)} a month`,
  joinOfferLine: 'Your training plan, your trainer and member prices. Cancel any time.',
  joinOfferCta: 'See the member hub',

  /* ── Emails ─────────────────────────────────────────────────────────── */
  welcomeSubject: 'Your member hub is open',
  welcomePreheader: 'Your training plan and your trainer, in one place.',
  welcomeHeading: 'Your member hub is open',
  welcomeIntro: (firstName: string | null) => `${firstName ? `Hi ${firstName}, welcome` : 'Welcome'}. Your training plan, your trainer and your member prices are in your hub.`,
  welcomeTerms: (monthly: number, date: string) => `It’s ${gbp(monthly)} a month, and your next payment is on ${date}. Cancel any time in your hub.`,
  welcomeTermsFree: (monthly: number, date: string) => `Your hub is free until ${date} from your last order, then ${gbp(monthly)} a month. Cancel any time in your hub before then and nothing is taken.`,
  welcomeCta: 'Open your hub',
  movedSubject: 'Your next hub payment has moved',
  movedPreheader: 'Your stack comes with 90 days of your hub.',
  movedHeading: 'Your next payment has moved',
  movedIntro: (monthly: number, date: string) => `Your order comes with 90 days of your hub free, so your next ${gbp(monthly)} payment is now on ${date}.`,
  movedCta: 'Open your hub',
  cancelledSubject: 'Your membership is cancelled',
  cancelledPreheader: 'Nothing more will be taken.',
  cancelledHeading: 'Your membership is cancelled',
  cancelledIntro: (date: string) => `Your hub stays open until ${date}. Nothing more will be taken.`,
  refundedIntro: (monthly: number) => `We’ve refunded your first payment of ${gbp(monthly)} and ended your membership.`,
  cancelledCta: 'Open your hub',
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })
}
