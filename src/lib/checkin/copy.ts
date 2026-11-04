/**
 * The words of Amp's check-ins (Option 2, a box that learns), for one-off
 * orders and plans alike. Scripted, one file, in the review pack
 * (`checkInCopyRows`).
 *
 * A check-in asks about the box, not the body: whether they're taking each
 * product, their training, whether the times fit, and how happy they are with
 * the box. No energy, sleep or mood ratings: a one-off buyer has given no
 * health-data consent, and the plan's in-hub check-in covers those under the
 * account's. What comes back is their own answers, played back, and changes
 * they can make; never a prediction of what a product will do.
 */
export const CHECKIN_COPY = {
  emailSubject: (first: string | null) => (first ? `${first}, how’s your box going?` : 'How’s your box going?'),
  emailPreheader: '30 seconds, and your box keeps itself right.',
  emailHeading: 'How’s your box going?',
  emailIntro: 'Amp here. Thirty seconds on how you’re using your box, and I’ll suggest changes if something isn’t right.',
  emailCta: 'Check in',
  emailStop: 'Stop these check-ins',

  heading: 'How’s your box going?',
  sub: 'Thirty seconds. Your answers stay with your box, and nothing changes unless you say so.',
  usingHeading: 'Are you taking each one?',
  using: { daily: 'Most days', some: 'Some days', notYet: 'Not yet', stopped: 'Stopped' },
  trainingHeading: 'Your training this fortnight',
  training: { same: 'Same as usual', more: 'More', less: 'Less', stopped: 'Not training' },
  timesHeading: 'Do the times on your day work?',
  times: { yes: 'Yes', no: 'Not really' },
  happyHeading: 'How happy are you with your box?',
  happyLow: 'Not happy',
  happyHigh: 'Love it',
  submit: 'Done',
  saving: 'Saving…',

  thanks: 'Thanks. Here’s what you told me.',
  historyHeading: 'Your answers so far',
  historyEmpty: 'This is your first check-in.',
  checkInOn: (date: string) => `Check-in, ${date}`,
  nextOn: (date: string) => `Next check-in: ${date}`,

  suggestionsHeading: 'What you could change',
  noSuggestions: 'Nothing to change: your box fits how you’re using it.',
  suggest: {
    dropOneOff: (product: string) => `You’ve stopped the ${product}. Leave it out of your next box?`,
    dropPlan: (product: string) => `You’ve stopped the ${product}. Skip it from your next box?`,
    notStarted: (product: string) => `Not started the ${product} yet? Its time on your day is in your guide.`,
    training: (product: string) => `You’re not training at the moment, and the ${product} is for training days. Leave it out until you’re back?`,
    times: 'If the times don’t fit, change them in your calendar: the reminders are yours to move.',
    unhappy: 'Not happy with your box? Reply to any email from us and a person will help you change it.',
  },
  reorderWithout: 'Reorder without it',
  reorderAll: 'Reorder my box',
  changeInAccount: 'Change it in your account',
  openGuide: 'Open your guide',

  stopHeading: 'Stop Amp’s check-ins?',
  stopBody: 'You won’t get any more check-in emails for this box. Your guide and reminders stay as they are.',
  stopConfirm: 'Stop check-ins',
  stopped: 'Done. No more check-ins for this box.',
  notFound: 'This check-in isn’t here. The link may be mistyped, or check-ins for this box have ended.',
} as const
